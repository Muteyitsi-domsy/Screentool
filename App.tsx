
import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Platform,
  DeviceType,
  FitMode,
  ExportMode,
  OutputMode,
  ProcessingState,
  CropArea,
  ImageAdjustments,
  DeviceSpec,
  AppView,
  TrayItem,
  TrayVariant,
  Project
} from './types';
import { DEVICE_SPECS } from './constants';
import DeviceMockup from './components/DeviceMockup';
import CropEditor from './components/CropEditor';
import AuthModal from './components/AuthModal';
import { processImage, detectBorders, processAppleQuick, processAndroidQuick } from './imageUtils';
import { saveProjectToDB, getAllProjectsFromDB, deleteProjectFromDB } from './db';
import { useAuth } from './hooks/useAuth';
import { initLemonSqueezy, openLemonSqueezyCheckout } from './lib/lemonsqueezy';
import { generateScreenshotCopy, generateCopy, AiProvider } from './lib/claudeApi';
import { renderCopyDesign, CopyData } from './lib/copyScreenshot';

// ─── Apple category → ordered slot names for screenshot naming ────────────────
const APPLE_CATEGORIES = {
  journaling: {
    label: 'Journaling / Self-Development',
    slots: ['hero_explainer', 'daily_home', 'free_feature', 'unique_feature', 'ai_insights', 'progress_tracking', 'paywall', 'full_menu']
  },
  productivity: {
    label: 'Productivity / Task Manager',
    slots: ['hero_overview', 'task_creation', 'calendar_view', 'focus_mode', 'reminders', 'progress', 'paywall', 'settings']
  },
  health: {
    label: 'Health & Fitness',
    slots: ['hero_dashboard', 'workout_tracker', 'nutrition_log', 'progress_charts', 'streaks', 'community', 'paywall', 'overview']
  },
  finance: {
    label: 'Finance / Budgeting',
    slots: ['portfolio_overview', 'transaction_log', 'budgets', 'analytics', 'goals', 'insights', 'paywall', 'settings']
  },
  social: {
    label: 'Social / Communication',
    slots: ['feed_home', 'messaging', 'profile', 'discovery', 'notifications', 'groups', 'paywall', 'settings']
  },
  general: {
    label: 'General App',
    slots: ['hero', 'feature_one', 'feature_two', 'feature_three', 'feature_four', 'feature_five', 'paywall', 'overview']
  }
} as const;

type AppleCategory = keyof typeof APPLE_CATEGORIES;

// Pro launch date — countdown shown in UI until this passes
const LAUNCH_DATE = new Date('2026-03-27T09:00:00').getTime();
const computeCountdown = () => {
  const diff = Math.max(0, LAUNCH_DATE - Date.now());
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
};

const NEUTRAL_BASELINE: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 0
};

const AUTO_SHINE_PRESET: ImageAdjustments = {
  brightness: 105,
  contrast: 110,
  saturation: 106,
  sharpness: 25
};

interface ModalState {
  isOpen: boolean;
  type?: 'confirm' | 'save' | 'load' | 'alert' | 'upgrade';
  title: string;
  message: string;
  onConfirm: (data?: any) => void;
  confirmLabel?: string;
  secondaryLabel?: string;
  onSecondaryConfirm?: () => void;
  secondaryConfirmLabel?: string;
}

const InfoTooltip: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`group relative inline-flex items-center ml-1.5 align-middle ${className}`}>
    <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 flex items-center justify-center text-[8px] font-black text-zinc-500 cursor-help group-hover:border-zinc-500 group-hover:text-zinc-300 transition-colors">
      i
    </div>
    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-3 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-[110]">
      <p className="text-[9px] font-bold text-zinc-300 leading-relaxed uppercase tracking-wider text-center">
        ScreenFrame is designed to help you prepare screenshots that align with current App Store and Play Store guidelines.
        Final approval always depends on the store review process.
      </p>
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900"></div>
    </div>
  </div>
);

const App: React.FC = () => {
  const auth = useAuth();

  const [state, setState] = useState<ProcessingState>({
    image: null,
    fitMode: FitMode.FIT,
    exportMode: ExportMode.RECTANGLE,
    selectedDevice: DeviceType.IPHONE,
    frameColor: '#1a1a1a',
    cropArea: { x: 0, y: 0, width: 100, height: 100 },
    adjustments: { ...NEUTRAL_BASELINE },
    activeView: AppView.APPLE,
    tray: Array(8).fill(null),
    isPro: false
  });

  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [isExporting, setIsExporting] = useState<Platform | null>(null);
  const [isAddingToTray, setIsAddingToTray] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [draggedSlotIdx, setDraggedSlotIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const [isRevision, setIsRevision] = useState(false);
  const [revisionSourceSlotIndex, setRevisionSourceSlotIndex] = useState<number | null>(null);
  const [revisionSourceItemId, setRevisionSourceItemId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [countdown, setCountdown] = useState(computeCountdown);

  const [pendingUpgrade, setPendingUpgrade] = useState<'subscription' | 'lifetime' | null>(null);

  // Apple Quick Process state
  const [appleFiles, setAppleFiles] = useState<File[]>([]);
  const [appleDevice, setAppleDevice] = useState<DeviceType>(DeviceType.IPHONE_65);
  const [appleCategory, setAppleCategory] = useState<AppleCategory>('journaling');
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  // Tray preview toggle — switches between iPhone and iPad preview across all slots
  const [trayPreview, setTrayPreview] = useState<'phone' | 'ipad'>('phone');

  // Copy Design mode state
  const [outputMode, setOutputMode] = useState<OutputMode>(OutputMode.FULL_RES);
  const [copyAppName, setCopyAppName] = useState('');
  const [copyDescription, setCopyDescription] = useState('');
  const [copySegment, setCopySegment] = useState('');
  const [copyFeatures, setCopyFeatures] = useState<string[]>([]);
  // API key is persisted in localStorage so Pro users don't re-enter it each session
  const [claudeApiKey, setClaudeApiKey] = useState<string>(
    () => localStorage.getItem('sf_claude_api_key') ?? ''
  );
  const [openaiApiKey, setOpenaiApiKey] = useState<string>(
    () => localStorage.getItem('sf_openai_api_key') ?? ''
  );
  const [aiProvider, setAiProvider] = useState<'claude' | 'openai'>(
    () => (localStorage.getItem('sf_ai_provider') as 'claude' | 'openai') ?? 'claude'
  );

  // Free-tier locked screenshot slots — files that exceeded the 1-slot free limit
  const [trayLockedFiles, setTrayLockedFiles] = useState<Array<{
    name: string;
    seq: string;
    slotName: string;
  }>>([]);

  // Android Studio state
  const [androidFiles, setAndroidFiles] = useState<File[]>([]);
  const [androidCategory, setAndroidCategory] = useState<AppleCategory>('general');
  // Tray preview toggle for Android items — phone / 7-inch / 10-inch
  const [androidTrayPreview, setAndroidTrayPreview] = useState<'phone' | '7in' | '10in'>('phone');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const appleFileInputRef = useRef<HTMLInputElement>(null);
  const androidFileInputRef = useRef<HTMLInputElement>(null);
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // Initialise Lemon Squeezy overlay once on mount
  useEffect(() => {
    initLemonSqueezy();
  }, []);

  // Countdown to Pro launch
  useEffect(() => {
    const id = setInterval(() => setCountdown(computeCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  // Sync server-authoritative isPro into local state
  useEffect(() => {
    if (!auth.loading) {
      setState(prev => ({ ...prev, isPro: auth.isPro }));
    }
  }, [auth.isPro, auth.loading]);

  // Handle post-OAuth redirect: open Lemon Squeezy checkout if upgrade was pending
  useEffect(() => {
    if (!auth.loading && auth.user) {
      const pending = sessionStorage.getItem('pendingUpgrade') as 'subscription' | 'lifetime' | null;
      if (pending) {
        sessionStorage.removeItem('pendingUpgrade');
        setPendingUpgrade(null);
        const variantId = pending === 'lifetime'
          ? import.meta.env.VITE_LS_VARIANT_LIFETIME
          : import.meta.env.VITE_LS_VARIANT_SUBSCRIPTION;
        openLemonSqueezyCheckout(variantId, auth.user.email ?? undefined, auth.user.id);
      }
    }
  }, [auth.user?.id, auth.loading]);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  useEffect(() => {
    setState(prev => ({ ...prev, frameColor: '#1a1a1a' }));
  }, [state.selectedDevice]);

  // Persist API key to localStorage whenever it changes
  useEffect(() => {
    if (claudeApiKey) {
      localStorage.setItem('sf_claude_api_key', claudeApiKey);
    } else {
      localStorage.removeItem('sf_claude_api_key');
    }
  }, [claudeApiKey]);

  useEffect(() => {
    if (openaiApiKey) localStorage.setItem('sf_openai_api_key', openaiApiKey);
    else localStorage.removeItem('sf_openai_api_key');
  }, [openaiApiKey]);

  useEffect(() => {
    localStorage.setItem('sf_ai_provider', aiProvider);
  }, [aiProvider]);

  // Clear locked slots when user upgrades to Pro
  useEffect(() => {
    if (state.isPro) setTrayLockedFiles([]);
  }, [state.isPro]);

  // Keep copyFeatures array in sync with appleFiles count
  useEffect(() => {
    setCopyFeatures(prev => {
      if (prev.length === appleFiles.length) return prev;
      const next = [...prev];
      while (next.length < appleFiles.length) next.push('');
      return next.slice(0, appleFiles.length);
    });
  }, [appleFiles.length]);

  const checkSettingsScroll = () => {
    const el = settingsScrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 8);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  };

  useEffect(() => {
    // seed scroll indicators once the settings panel mounts
    const id = requestAnimationFrame(checkSettingsScroll);
    return () => cancelAnimationFrame(id);
  }, [state.activeView]);

  const showAlert = (title: string, message: string) => {
    setModal({
      isOpen: true,
      type: 'alert',
      title,
      message,
      onConfirm: () => setModal(prev => ({ ...prev, isOpen: false })),
      confirmLabel: "Got it"
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel: string = "Confirm") => {
    setModal({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setModal(prev => ({ ...prev, isOpen: false }));
      },
      confirmLabel
    });
  };

  // Handles auth gating + Lemon Squeezy checkout for a given plan
  const handleUpgradeClick = (planType: 'subscription' | 'lifetime') => {
    if (!auth.user) {
      setPendingUpgrade(planType);
      sessionStorage.setItem('pendingUpgrade', planType);
      setShowAuthModal(true);
    } else {
      const variantId = planType === 'lifetime'
        ? import.meta.env.VITE_LS_VARIANT_LIFETIME
        : import.meta.env.VITE_LS_VARIANT_SUBSCRIPTION;
      openLemonSqueezyCheckout(variantId, auth.user.email ?? undefined, auth.user.id);
    }
  };

  const showUpgradeModal = () => {
    setModal({
      isOpen: true,
      type: 'upgrade',
      title: 'Ready to build a full screenshot set?',
      message: 'Free includes 1 screenshot so you can try ScreenFrame. Upgrade to prepare a complete App Store or Play Store listing with up to 8 screenshots, proper ordering, and reusable projects.',
      onConfirm: () => {
        setModal(prev => ({ ...prev, isOpen: false }));
        handleUpgradeClick('subscription');
      },
      confirmLabel: "Monthly – Agencies & Teams",
      onSecondaryConfirm: () => {
        setModal(prev => ({ ...prev, isOpen: false }));
        handleUpgradeClick('lifetime');
      },
      secondaryConfirmLabel: "Lifetime – Solo Developers",
      secondaryLabel: "Continue with 1 screenshot"
    });
  };

  const showSaveModal = async () => {
    // Free users cannot save projects
    if (!state.isPro) {
      showUpgradeModal();
      return;
    }

    // Studio users are capped at 5 saved projects
    const planType = auth.profile?.plan_type;
    if (planType === 'subscription') {
      const existing = await getAllProjectsFromDB();
      if (existing.length >= 5) {
        showAlert('Project limit reached', 'Studio plans can save up to 5 projects. Delete an existing project to save a new one, or upgrade to Indie for unlimited saves.');
        return;
      }
    }

    setModal({
      isOpen: true,
      type: 'save',
      title: 'Save Project',
      message: 'Enter a name for this screenshot kit snapshot.',
      onConfirm: async (name: string) => {
        const project: Project = {
          id: crypto.randomUUID(),
          name: name || `Project ${new Date().toLocaleDateString()}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
          tray: state.tray
        };
        await saveProjectToDB(project);
        setModal(prev => ({ ...prev, isOpen: false }));
        setShowSuccess(true);
      },
      confirmLabel: 'Save'
    });
  };

  const showLoadModal = async () => {
    const projects = await getAllProjectsFromDB();
    setSavedProjects(projects.sort((a, b) => b.updatedAt - a.updatedAt));
    setModal({
      isOpen: true,
      type: 'load',
      title: 'Open Project',
      message: 'Loading a project will replace your current tray. The editor will remain blank.',
      onConfirm: (project: Project) => {
        // HARD DATA GUARD: Prevent loading projects that exceed tier limits
        const occupiedCount = project.tray.filter(x => x !== null).length;
        if (!state.isPro && occupiedCount > 1) {
          showUpgradeModal();
          return;
        }

        state.tray.forEach(item => {
          item?.variants.forEach(v => URL.revokeObjectURL(v.renderedImageUrl));
        });

        const rehydratedTray = project.tray.map(item => {
          if (!item) return null;
          return {
            ...item,
            variants: item.variants.map(v => ({
              ...v,
              renderedImageUrl: URL.createObjectURL(v.renderedBlob)
            }))
          };
        });

        setState(prev => ({
          ...prev,
          image: null,
          tray: rehydratedTray,
          activeView: AppView.TRAY
        }));
        setIsRevision(false);
        setModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const deleteProject = async (id: string) => {
    await deleteProjectFromDB(id);
    const projects = await getAllProjectsFromDB();
    setSavedProjects(projects.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const editCopyFromTray = (id: string) => {
    const doLoad = () => {
      const slotIndex = state.tray.findIndex(i => i?.id === id);
      const item = slotIndex !== -1 ? state.tray[slotIndex] : null;
      if (!item) return;

      // Load the phone variant for manual revision (iPad/tablet variants are re-generated on re-process)
      const primaryVariant = item.variants.find(v => v.deviceType !== DeviceType.IPAD) ?? item.variants[0];

      setState(prev => ({
        ...prev,
        image: primaryVariant.renderedImageUrl,
        cropArea: { x: 0, y: 0, width: 100, height: 100 },
        adjustments: { ...NEUTRAL_BASELINE },
        activeView: AppView.EDITOR
      }));
      setRevisionSourceSlotIndex(slotIndex);
      setRevisionSourceItemId(id);
      setIsRevision(true);
    };

    if (state.image) {
      showConfirm(
        'Replace Editor Content?',
        'The editor already has an image loaded. Replace it with this processed screenshot?',
        doLoad
      );
      return;
    }
    doLoad();
  };

  const getExportFilename = (spec: DeviceSpec, mode: ExportMode, index: number): string => {
    const platform = spec.platform.toLowerCase();
    const modeLabel = mode === ExportMode.RECTANGLE ? 'rect' : 'mockup';
    const idx = index.toString().padStart(2, '0');
    let device = '';
    let size = '';

    switch (spec.id) {
      case DeviceType.PHONE:      device = 'phone'; break;
      case DeviceType.TABLET_7:   device = 'tablet'; size = '7in'; break;
      case DeviceType.TABLET_10:  device = 'tablet'; size = '10in'; break;
      case DeviceType.CHROMEBOOK: device = 'chromebook'; break;
      case DeviceType.IPHONE:     device = 'phone'; size = '6.9'; break;
      case DeviceType.IPHONE_65:  device = 'phone'; size = '6.5'; break;
      case DeviceType.IPAD:       device = 'tablet'; size = '12.9'; break;
    }

    const segments = [platform, device, size, modeLabel, idx].filter(s => s !== '');
    return `${segments.join('_')}.png`;
  };

  const createCanonicalAsset = (img: HTMLImageElement, rect: CropArea): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const x = (rect.x / 100) * img.width;
    const y = (rect.y / 100) * img.height;
    const w = (rect.width / 100) * img.width;
    const h = (rect.height / 100) * img.height;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  };

  const processFile = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      showAlert("Upload Error", "File size exceeds 8MB limit.");
      return;
    }
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      showAlert("Upload Error", "Please upload a PNG, JPEG, or WebP screenshot.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        let normalizationRect = detectBorders(img);
        const targetSpec = DEVICE_SPECS[state.selectedDevice];

        if (targetSpec.platform === Platform.APPLE) {
          const isModal = normalizationRect.width < 95 || normalizationRect.height < 95;
          const insetFactor = isModal ? 0.08 : 0.04;
          const insetW = normalizationRect.width * insetFactor;
          const insetH = normalizationRect.height * insetFactor;
          normalizationRect = {
            x: normalizationRect.x + insetW,
            y: normalizationRect.y + insetH,
            width: normalizationRect.width - (insetW * 2),
            height: normalizationRect.height - (insetH * 2)
          };
        }

        const cleanAsset = createCanonicalAsset(img, normalizationRect);
        setState(prev => ({
          ...prev,
          image: cleanAsset,
          cropArea: { x: 0, y: 0, width: 100, height: 100 },
          adjustments: { ...NEUTRAL_BASELINE }
        }));
        setIsRevision(false);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const addToTray = async () => {
    if (!state.image || isAddingToTray) return;

    // Revisions replace their original slot — skip the tier upgrade check
    // (the tray count doesn't increase when replacing an existing slot).
    const isReplacingSlot =
      isRevision &&
      revisionSourceSlotIndex !== null &&
      revisionSourceItemId !== null &&
      state.tray[revisionSourceSlotIndex]?.id === revisionSourceItemId;

    if (!isReplacingSlot) {
      const currentTrayCount = state.tray.filter(x => x !== null).length;
      // Anonymous or free user hits 1-slot limit → prompt upgrade
      if (!auth.user && currentTrayCount >= 1) {
        showUpgradeModal();
        return;
      }
      if (!state.isPro && currentTrayCount >= 1) {
        showUpgradeModal();
        return;
      }
    }

    // Determine target slot:
    //   - Revision replacing its original slot → use that slot index
    //   - Everything else (new item, or revision whose slot was reordered) → first empty slot
    const targetSlotIndex = isReplacingSlot
      ? revisionSourceSlotIndex!
      : state.tray.findIndex(slot => slot === null);

    if (targetSlotIndex === -1) {
      showAlert("Tray Full", "Export tray is full. Please remove an item first.");
      return;
    }

    setIsAddingToTray(true);

    try {
      const activeSpec = DEVICE_SPECS[state.selectedDevice];
      const targetPlatform = activeSpec.platform;

      // Preserve the original item's index when replacing, so filenames don't change.
      const existingItem = isReplacingSlot ? state.tray[targetSlotIndex] : null;
      const bucketItems = state.tray.filter(item =>
        item !== null &&
        item.platform === targetPlatform &&
        item.exportMode === state.exportMode
      );
      const maxIndexInBucket = bucketItems.reduce((max, item) => Math.max(max, item!.index), 0);
      const calculatedIndex = existingItem ? existingItem.index : maxIndexInBucket + 1;

      // Single-device variant — user has chosen the target device explicitly.
      const targetSpecs = [DEVICE_SPECS[state.selectedDevice]];

      const variantPromises = targetSpecs.map(async (spec): Promise<TrayVariant> => {
        const renderedBlob = await processImage(
          state.image!,
          spec,
          state.fitMode,
          state.exportMode,
          state.adjustments,
          state.cropArea,
          state.frameColor
        );
        const renderedImageUrl = URL.createObjectURL(renderedBlob);
        const filename = getExportFilename(spec, state.exportMode, calculatedIndex);

        return {
          deviceType: spec.id,
          renderedImageUrl,
          renderedBlob,
          filename
        };
      });

      const variants = await Promise.all(variantPromises);

      const newItem: TrayItem = {
        id: crypto.randomUUID(),
        platform: targetPlatform,
        exportMode: state.exportMode,
        index: calculatedIndex,
        timestamp: Date.now(),
        frameColor: state.frameColor,
        variants
      };

      setState(prev => {
        const newTray = [...prev.tray];
        newTray[targetSlotIndex] = newItem;
        return { ...prev, tray: newTray };
      });
      setIsRevision(false);
      setRevisionSourceSlotIndex(null);
      setRevisionSourceItemId(null);
    } catch (err) {
      console.error("Capture fan-out failure:", err);
      showAlert("System Error", "Failed to generate multi-device kit variants.");
    } finally {
      setIsAddingToTray(false);
    }
  };

  const removeFromTrayById = (id: string) => {
    const itemIndex = state.tray.findIndex(item => item?.id === id);
    if (itemIndex === -1) return;

    showConfirm(
      "Remove Screenshot",
      "Are you sure you want to remove this screenshot (and all its device variants) from the Export Tray?",
      () => {
        setState(prev => {
          const currentItem = prev.tray[itemIndex];
          if (currentItem) {
            currentItem.variants.forEach(v => URL.revokeObjectURL(v.renderedImageUrl));
          }
          const newTray = [...prev.tray];
          newTray[itemIndex] = null;
          return { ...prev, tray: newTray };
        });
      },
      "Remove"
    );
  };

  const handleTrayDragStart = (idx: number) => {
    if (modal.isOpen || state.tray[idx] === null) return;
    setDraggedSlotIdx(idx);
  };

  const handleTrayDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (modal.isOpen) return;
    if (idx !== dropTargetIdx) setDropTargetIdx(idx);
  };

  const handleTrayDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (modal.isOpen || draggedSlotIdx === null || draggedSlotIdx === targetIdx) {
      setDraggedSlotIdx(null);
      setDropTargetIdx(null);
      return;
    }

    setState(prev => {
      const newTray = [...prev.tray];
      const sourceItem = newTray[draggedSlotIdx];
      newTray[draggedSlotIdx] = newTray[targetIdx];
      newTray[targetIdx] = sourceItem;
      return { ...prev, tray: newTray };
    });

    setDraggedSlotIdx(null);
    setDropTargetIdx(null);
  };

  const handleBatchExport = async (targetPlatform: Platform) => {
    const trayItems = state.tray.filter((item): item is TrayItem => item !== null && item.platform === targetPlatform);
    if (trayItems.length === 0) return;
    setIsExporting(targetPlatform);

    try {
      const zip = new JSZip();

      if (targetPlatform === Platform.APPLE) {
        // Subfolders group all screenshots of the same device together.
        // File explorer sorts within each folder by sequence number (01–08).
        const phoneFolder = zip.folder('phone')!;
        const ipadFolder  = zip.folder('ipad')!;
        trayItems.forEach(item => {
          const v = item.variants.find(v => v.deviceType !== DeviceType.IPAD) ?? item.variants[0];
          if (v) phoneFolder.file(v.filename, v.renderedBlob);
        });
        trayItems.forEach(item => {
          const v = item.variants.find(v => v.deviceType === DeviceType.IPAD);
          if (v) ipadFolder.file(v.filename, v.renderedBlob);
        });
      } else {
        // Android: phone → 7" tablet → 10" tablet (one subfolder per device)
        const phoneFolder   = zip.folder('phone')!;
        const tablet7Folder = zip.folder('tablet_7in')!;
        const tablet10Folder = zip.folder('tablet_10in')!;
        trayItems.forEach(item => {
          const v = item.variants.find(v => v.deviceType === DeviceType.PHONE);
          if (v) phoneFolder.file(v.filename, v.renderedBlob);
        });
        trayItems.forEach(item => {
          const v = item.variants.find(v => v.deviceType === DeviceType.TABLET_7);
          if (v) tablet7Folder.file(v.filename, v.renderedBlob);
        });
        trayItems.forEach(item => {
          const v = item.variants.find(v => v.deviceType === DeviceType.TABLET_10);
          if (v) tablet10Folder.file(v.filename, v.renderedBlob);
        });
      }

      const zipName = targetPlatform === Platform.APPLE ? 'apple_screenshots.zip' : 'android_screenshots.zip';
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowSuccess(true);
    } catch (err) {
      console.error("Export error:", err);
      showAlert("Export Error", "Batch engine failed to build screenshot ZIP.");
    } finally {
      setIsExporting(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const applyAutoShine = () => {
    if (!state.image) return;
    setState(prev => ({
      ...prev,
      adjustments: { ...AUTO_SHINE_PRESET }
    }));
  };

  // Called by AuthModal after successful email/password auth
  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    // The useEffect watching auth.user will open Lemon Squeezy checkout if pendingUpgrade is set
  };

  const getPreviewVariant = (item: TrayItem) => {
    if (item.platform === Platform.ANDROID) {
      if (androidTrayPreview === '7in')  return item.variants.find(v => v.deviceType === DeviceType.TABLET_7)  ?? item.variants[0];
      if (androidTrayPreview === '10in') return item.variants.find(v => v.deviceType === DeviceType.TABLET_10) ?? item.variants[0];
      return item.variants.find(v => v.deviceType === DeviceType.PHONE) ?? item.variants[0];
    }
    if (trayPreview === 'ipad') {
      return item.variants.find(v => v.deviceType === DeviceType.IPAD) ?? item.variants[0];
    }
    return item.variants.find(v => v.deviceType !== DeviceType.IPAD) ?? item.variants[0];
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleCopyDesignProcess = async () => {
    const activeKey = aiProvider === 'claude' ? claudeApiKey.trim() : openaiApiKey.trim();
    if (!activeKey) {
      showAlert('Missing API Key', 'Please enter your API key in the sidebar to use Copy Design mode.');
      return;
    }
    if (!copyAppName.trim()) {
      showAlert('Missing App Name', 'Please enter your app name in the sidebar.');
      return;
    }
    if (!copyDescription.trim()) {
      showAlert('Missing Description', 'Please describe your app in the sidebar.');
      return;
    }

    const currentTrayCount = state.tray.filter(x => x !== null).length;
    const emptySlots       = state.tray.filter(s => s === null).length;
    const isFree           = !auth.user || !state.isPro;
    const FREE_LIMIT       = 1;
    // How many new screenshots a free user can still add
    const canProcess       = isFree ? Math.max(0, FREE_LIMIT - currentTrayCount) : emptySlots;

    if (emptySlots === 0) {
      showAlert('Tray Full', 'All 8 slots are occupied. Remove an item from the tray first.');
      return;
    }

    // Free user already at limit — nothing to process, show upgrade immediately
    if (canProcess === 0) { showUpgradeModal(); return; }

    const filesToProcess = appleFiles.slice(0, canProcess);
    const filesToLock    = isFree ? appleFiles.slice(canProcess) : [];

    setIsProcessingBatch(true);
    setBatchProgress(0);

    const phoneSpec    = DEVICE_SPECS[appleDevice];
    const ipadSpec     = DEVICE_SPECS[DeviceType.IPAD];
    const category     = APPLE_CATEGORIES[appleCategory];
    const processedItems: TrayItem[] = [];

    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file      = filesToProcess[i];
        const slotName  = category.slots[i] ?? `screenshot_${i + 1}`;
        const seq       = String(currentTrayCount + i + 1).padStart(2, '0');
        const phoneFilename = `${seq}_${slotName}_designed.png`;
        const ipadFilename  = `${seq}_${slotName}_designed_ipad.png`;
        const dataUrl   = await fileToDataUrl(file);

        // Generate copy via AI provider
        const featureText = copyFeatures[i]?.trim() || slotName.replace(/_/g, ' ');
        const generated = await generateCopy(
          aiProvider,
          aiProvider === 'claude' ? claudeApiKey.trim() : openaiApiKey.trim(),
          copyAppName.trim(),
          copyDescription.trim(),
          featureText,
          copySegment.trim() || 'app users'
        );

        const copyData: CopyData = { ...generated, appName: copyAppName.trim() };

        // Render phone + iPad variants simultaneously
        const [phoneBlob, ipadBlob] = await Promise.all([
          renderCopyDesign(dataUrl, phoneSpec, copyData),
          renderCopyDesign(dataUrl, ipadSpec, copyData),
        ]);

        processedItems.push({
          id: crypto.randomUUID(),
          platform: Platform.APPLE,
          exportMode: ExportMode.RECTANGLE,
          index: currentTrayCount + i + 1,
          timestamp: Date.now(),
          frameColor: '#F5EDE0',
          variants: [
            { deviceType: appleDevice,     renderedImageUrl: URL.createObjectURL(phoneBlob), renderedBlob: phoneBlob, filename: phoneFilename },
            { deviceType: DeviceType.IPAD, renderedImageUrl: URL.createObjectURL(ipadBlob),  renderedBlob: ipadBlob,  filename: ipadFilename  },
          ],
        });

        setBatchProgress(i + 1);
      }

      setState(prev => {
        const newTray = [...prev.tray];
        for (const item of processedItems) {
          const slot = newTray.findIndex(s => s === null);
          if (slot !== -1) newTray[slot] = item;
        }
        return { ...prev, tray: newTray, activeView: AppView.TRAY };
      });

      if (filesToLock.length > 0) {
        const nextSeq = currentTrayCount + filesToProcess.length;
        setTrayLockedFiles(filesToLock.map((f, i) => ({
          name: f.name,
          seq: String(nextSeq + i + 1).padStart(2, '0'),
          slotName: category.slots[filesToProcess.length + i] ?? `screenshot_${filesToProcess.length + i + 1}`,
        })));
      }

      setAppleFiles([]);
    } catch (err) {
      console.error('Copy design process error:', err);
      showAlert('Processing Error', err instanceof Error ? err.message : 'Failed to generate designed screenshots. Check your API key and try again.');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleAppleQuickProcess = async () => {
    if (appleFiles.length === 0 || isProcessingBatch) return;

    if (outputMode === OutputMode.COPY_DESIGN) {
      return handleCopyDesignProcess();
    }

    const currentTrayCount = state.tray.filter(x => x !== null).length;
    const emptySlots       = state.tray.filter(s => s === null).length;
    const isFree           = !auth.user || !state.isPro;
    const FREE_LIMIT       = 1;
    const canProcess       = isFree ? Math.max(0, FREE_LIMIT - currentTrayCount) : emptySlots;

    if (emptySlots === 0) {
      showAlert('Tray Full', 'All 8 slots are occupied. Remove an item from the tray first.');
      return;
    }

    if (canProcess === 0) { showUpgradeModal(); return; }

    const filesToProcess = appleFiles.slice(0, canProcess);
    const filesToLock    = isFree ? appleFiles.slice(canProcess) : [];

    setIsProcessingBatch(true);
    setBatchProgress(0);

    const phoneSpec = DEVICE_SPECS[appleDevice];
    const ipadSpec  = DEVICE_SPECS[DeviceType.IPAD];
    const category  = APPLE_CATEGORIES[appleCategory];
    const processedItems: TrayItem[] = [];

    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const slotName = category.slots[i] ?? `screenshot_${i + 1}`;
        const seq = String(currentTrayCount + i + 1).padStart(2, '0');
        const phoneFilename = `${seq}_${slotName}.png`;
        const ipadFilename  = `${seq}_${slotName}_ipad.png`;

        const dataUrl = await fileToDataUrl(file);

        // Process for iPhone (selected size) and iPad (always generated)
        const [phoneBlob, ipadBlob] = await Promise.all([
          processAppleQuick(dataUrl, phoneSpec),
          processAppleQuick(dataUrl, ipadSpec)
        ]);

        processedItems.push({
          id: crypto.randomUUID(),
          platform: Platform.APPLE,
          exportMode: ExportMode.RECTANGLE,
          index: currentTrayCount + i + 1,
          timestamp: Date.now(),
          frameColor: '#1a1a1a',
          variants: [
            { deviceType: appleDevice,      renderedImageUrl: URL.createObjectURL(phoneBlob), renderedBlob: phoneBlob, filename: phoneFilename },
            { deviceType: DeviceType.IPAD,  renderedImageUrl: URL.createObjectURL(ipadBlob),  renderedBlob: ipadBlob,  filename: ipadFilename  }
          ]
        });

        setBatchProgress(i + 1);
      }

      setState(prev => {
        const newTray = [...prev.tray];
        for (const item of processedItems) {
          const slot = newTray.findIndex(s => s === null);
          if (slot !== -1) newTray[slot] = item;
        }
        return { ...prev, tray: newTray, activeView: AppView.TRAY };
      });

      if (filesToLock.length > 0) {
        const nextSeq = currentTrayCount + filesToProcess.length;
        setTrayLockedFiles(filesToLock.map((f, i) => ({
          name: f.name,
          seq: String(nextSeq + i + 1).padStart(2, '0'),
          slotName: category.slots[filesToProcess.length + i] ?? `screenshot_${filesToProcess.length + i + 1}`,
        })));
      }

      setAppleFiles([]);
    } catch (err) {
      console.error('Apple quick-process error:', err);
      showAlert('Processing Error', 'One or more screenshots could not be processed. Check the files and try again.');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleAndroidProcess = async () => {
    if (androidFiles.length === 0 || isProcessingBatch) return;

    const currentTrayCount = state.tray.filter(x => x !== null).length;
    const emptySlots       = state.tray.filter(s => s === null).length;
    const isFree           = !auth.user || !state.isPro;
    const FREE_LIMIT       = 1;
    const canProcess       = isFree ? Math.max(0, FREE_LIMIT - currentTrayCount) : emptySlots;

    if (emptySlots === 0) {
      showAlert('Tray Full', 'All 8 slots are occupied. Remove an item from the tray first.');
      return;
    }

    if (canProcess === 0) { showUpgradeModal(); return; }

    const filesToProcess = androidFiles.slice(0, canProcess);
    const filesToLock    = isFree ? androidFiles.slice(canProcess) : [];

    setIsProcessingBatch(true);
    setBatchProgress(0);

    const phoneSpec   = DEVICE_SPECS[DeviceType.PHONE];
    const tablet10Spec = DEVICE_SPECS[DeviceType.TABLET_10];
    const tablet7Spec  = DEVICE_SPECS[DeviceType.TABLET_7];
    const category    = APPLE_CATEGORIES[androidCategory];
    const processedItems: TrayItem[] = [];

    if (outputMode === OutputMode.COPY_DESIGN) {
      const activeKey = aiProvider === 'claude' ? claudeApiKey.trim() : openaiApiKey.trim();
      if (!activeKey) {
        showAlert('Missing API Key', 'Please enter your API key to use Copy Design mode.');
        setIsProcessingBatch(false);
        return;
      }
      if (!copyAppName.trim()) {
        showAlert('Missing App Name', 'Please enter your app name.');
        setIsProcessingBatch(false);
        return;
      }
      if (!copyDescription.trim()) {
        showAlert('Missing Description', 'Please describe your app.');
        setIsProcessingBatch(false);
        return;
      }
    }

    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file     = filesToProcess[i];
        const slotName = category.slots[i] ?? `screenshot_${i + 1}`;
        const seq      = String(currentTrayCount + i + 1).padStart(2, '0');
        const dataUrl  = await fileToDataUrl(file);

        let phoneBlob: Blob;
        let tablet10Blob: Blob;
        let tablet7Blob: Blob;

        if (outputMode === OutputMode.COPY_DESIGN) {
          // Generate copy via AI provider, render designed screenshot for each spec independently.
          // All three render from the same original dataUrl so no double-crop occurs.
          const featureText = copyFeatures[i]?.trim() || slotName.replace(/_/g, ' ');
          const generated = await generateCopy(
            aiProvider,
            aiProvider === 'claude' ? claudeApiKey.trim() : openaiApiKey.trim(),
            copyAppName.trim(),
            copyDescription.trim(),
            featureText,
            copySegment.trim() || 'app users'
          );
          const copyData: CopyData = { ...generated, appName: copyAppName.trim() };
          [phoneBlob, tablet10Blob, tablet7Blob] = await Promise.all([
            renderCopyDesign(dataUrl, phoneSpec, copyData),
            renderCopyDesign(dataUrl, tablet10Spec, copyData),
            renderCopyDesign(dataUrl, tablet7Spec, copyData),
          ]);
        } else {
          // Full Resolution: all three specs process directly from the original source.
          // Do NOT chain tablets off the phone blob — that causes a double bar-crop which
          // removes app content on the phone and leaves residual bars.
          [phoneBlob, tablet10Blob, tablet7Blob] = await Promise.all([
            processAndroidQuick(dataUrl, phoneSpec),
            processAndroidQuick(dataUrl, tablet10Spec),
            processAndroidQuick(dataUrl, tablet7Spec),
          ]);
        }

        const suffix = outputMode === OutputMode.COPY_DESIGN ? '_designed' : '';
        processedItems.push({
          id: crypto.randomUUID(),
          platform: Platform.ANDROID,
          exportMode: ExportMode.RECTANGLE,
          index: currentTrayCount + i + 1,
          timestamp: Date.now(),
          frameColor: outputMode === OutputMode.COPY_DESIGN ? '#F5EDE0' : '#1a1a1a',
          variants: [
            { deviceType: DeviceType.PHONE,     renderedImageUrl: URL.createObjectURL(phoneBlob),    renderedBlob: phoneBlob,    filename: `${seq}_${slotName}_android_phone${suffix}.png`  },
            { deviceType: DeviceType.TABLET_10, renderedImageUrl: URL.createObjectURL(tablet10Blob), renderedBlob: tablet10Blob, filename: `${seq}_${slotName}_android_tablet${suffix}.png`  },
            { deviceType: DeviceType.TABLET_7,  renderedImageUrl: URL.createObjectURL(tablet7Blob),  renderedBlob: tablet7Blob,  filename: `${seq}_${slotName}_android_7in${suffix}.png`     },
          ],
        });

        setBatchProgress(i + 1);
      }

      setState(prev => {
        const newTray = [...prev.tray];
        for (const item of processedItems) {
          const slot = newTray.findIndex(s => s === null);
          if (slot !== -1) newTray[slot] = item;
        }
        return { ...prev, tray: newTray, activeView: AppView.TRAY };
      });

      if (filesToLock.length > 0) {
        const nextSeq = currentTrayCount + filesToProcess.length;
        setTrayLockedFiles(filesToLock.map((f, i) => ({
          name: f.name,
          seq: String(nextSeq + i + 1).padStart(2, '0'),
          slotName: category.slots[filesToProcess.length + i] ?? `screenshot_${filesToProcess.length + i + 1}`,
        })));
      }

      setAndroidFiles([]);
    } catch (err) {
      console.error('Android process error:', err);
      showAlert('Processing Error', 'One or more screenshots could not be processed. Check the files and try again.');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const AdjustmentSlider = ({ label, value, min, max, property }: { label: string, value: number, min: number, max: number, property: keyof ImageAdjustments }) => (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{label}</label>
        <span className="text-[10px] font-mono text-zinc-400">{value > 100 ? `+${value - 100}%` : value < 100 ? `-${100 - value}%` : '0%'}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setState(prev => ({ ...prev, adjustments: { ...prev.adjustments, [property]: parseInt(e.target.value) } }))}
        className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  );

  const isTrayView = state.activeView === AppView.TRAY;
  const isFAQView = state.activeView === AppView.FAQ;
  const hasItems = state.tray.some(x => x !== null);
  const hasApple = state.tray.some(x => x?.platform === Platform.APPLE);
  const hasAndroid = state.tray.some(x => x?.platform === Platform.ANDROID);

  const planLabel = () => {
    if (!auth.profile) return state.isPro ? 'Individual – Active' : 'Free Tier';
    if (auth.profile.plan_type === 'lifetime') return 'Lifetime – Active';
    if (auth.profile.plan_type === 'subscription') {
      if (auth.profile.subscription_status === 'active') return 'Individual – Active';
      if (auth.profile.subscription_status === 'canceled') return 'Canceled';
      if (auth.profile.subscription_status === 'paused') return 'Paused';
    }
    return 'Free Tier';
  };

  return (
    <div className="h-screen flex flex-col md:flex-row bg-[#0a0a0a] overflow-hidden">
      {/* AuthModal — rendered outside the main modal to avoid z-index conflicts */}
      {showAuthModal && (
        <AuthModal
          auth={auth}
          onSuccess={handleAuthSuccess}
          onClose={() => {
            setShowAuthModal(false);
            setPendingUpgrade(null);
            sessionStorage.removeItem('pendingUpgrade');
          }}
        />
      )}

      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col max-h-[80vh]">
             <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-4 shrink-0">{modal.title}</h3>
             <p className="text-zinc-400 text-[10px] font-black leading-relaxed mb-6 uppercase tracking-wider shrink-0">{modal.message}</p>

             {modal.type === 'save' && (
               <div className="mb-8">
                  <input
                    type="text"
                    placeholder="Project Name..."
                    autoFocus
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-blue-500 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') modal.onConfirm((e.target as HTMLInputElement).value);
                    }}
                    id="project-name-input"
                  />
               </div>
             )}

             {modal.type === 'load' && (
               <div className="flex-1 overflow-y-auto mb-8 pr-2 space-y-3 scrollbar-hide">
                 {savedProjects.length > 0 ? savedProjects.map(project => (
                   <div
                    key={project.id}
                    className="group relative flex items-center justify-between p-4 bg-zinc-950/50 border border-zinc-800 rounded-2xl hover:bg-zinc-800/50 transition-all cursor-pointer"
                    onClick={() => modal.onConfirm(project)}
                   >
                     <div>
                        <span className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">{project.name}</span>
                        <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest">{new Date(project.createdAt).toLocaleDateString()} • {project.tray.filter(x => x !== null).length} Items</span>
                     </div>
                     <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProject(project.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-500 transition-all"
                      >
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                   </div>
                 )) : (
                   <div className="py-12 text-center">
                     <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">No Projects Found</p>
                   </div>
                 )}
               </div>
             )}

             <div className="flex flex-col gap-3 shrink-0">
                <button
                  onClick={() => {
                    if (modal.type === 'save') {
                      const input = document.getElementById('project-name-input') as HTMLInputElement;
                      modal.onConfirm(input?.value);
                    } else {
                      modal.onConfirm();
                    }
                  }}
                  className="w-full py-3 text-[10px] font-black text-white uppercase tracking-widest bg-blue-600 hover:bg-blue-500 rounded-2xl transition-all shadow-lg shadow-blue-500/20"
                >
                  {modal.confirmLabel || "Confirm"}
                </button>
                {/* Upgrade modal: second action button (Lifetime Access) */}
                {modal.type === 'upgrade' && modal.onSecondaryConfirm && (
                  <button
                    onClick={modal.onSecondaryConfirm}
                    className="w-full py-3 text-[10px] font-black text-white uppercase tracking-widest bg-zinc-700 hover:bg-zinc-600 rounded-2xl transition-all"
                  >
                    {modal.secondaryConfirmLabel || "Lifetime Access"}
                  </button>
                )}
                {modal.type !== 'alert' && (
                  <button
                    onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
                    className="w-full py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-800/50 hover:bg-zinc-800 rounded-2xl transition-all"
                  >
                    {modal.secondaryLabel || "Cancel"}
                  </button>
                )}
             </div>
          </div>
        </div>
      )}

      <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/20 flex flex-col shrink-0">
        {/* ── Fixed top: logo + nav ── */}
        <div className="px-6 pt-6 pb-4 flex flex-col gap-6 shrink-0 border-b border-zinc-800/60">
        <header>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-sm">SF</div>
              <h1 className="text-xl font-bold tracking-tight text-white italic">ScreenFrame</h1>
            </div>
            {/* Auth controls */}
            {auth.loading ? (
              <div className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin"></div>
            ) : auth.user ? (
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest truncate max-w-[80px]" title={auth.user.email ?? ''}>
                  {auth.user.email?.split('@')[0]}
                </span>
                <button
                  onClick={() => auth.signOut()}
                  className="text-[8px] font-black text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors"
                  title="Sign out"
                >
                  OUT
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-[8px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
          <div className="flex items-center">
            <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">Asset Studio</p>
            <InfoTooltip />
          </div>
        </header>

        <nav className="flex flex-col bg-zinc-950 p-1 rounded-2xl border border-zinc-800 gap-1">
          <button
            onClick={() => setState(prev => ({ ...prev, activeView: AppView.APPLE }))}
            className={`w-full py-2 text-[10px] font-black rounded-xl transition-all ${state.activeView === AppView.APPLE ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            APPLE STUDIO
          </button>
          <button
            onClick={() => setState(prev => ({ ...prev, activeView: AppView.ANDROID }))}
            className={`w-full py-2 text-[10px] font-black rounded-xl transition-all ${state.activeView === AppView.ANDROID ? 'bg-green-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            ANDROID STUDIO
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => setState(prev => ({ ...prev, activeView: AppView.EDITOR }))}
              className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${state.activeView === AppView.EDITOR ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              EDITOR
            </button>
            <button
              onClick={() => setState(prev => ({ ...prev, activeView: AppView.TRAY }))}
              className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${state.activeView === AppView.TRAY ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              TRAY ({state.tray.filter(x => x !== null).length})
            </button>
          </div>
          <button
            onClick={() => setState(prev => ({ ...prev, activeView: AppView.FAQ }))}
            className={`w-full py-2 text-[10px] font-black rounded-xl transition-all ${state.activeView === AppView.FAQ ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            PRICING & FAQ
          </button>
        </nav>

        {/* Launch countdown — hidden once launch date passes */}
        {(countdown.d + countdown.h + countdown.m + countdown.s) > 0 && (
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Pro Launches Friday</span>
            <div className="flex items-baseline gap-2">
              {([['d', countdown.d], ['h', countdown.h], ['m', countdown.m], ['s', countdown.s]] as [string, number][]).map(([label, val]) => (
                <div key={label} className="flex items-baseline gap-0.5">
                  <span className="text-[11px] font-black text-red-400 tabular-nums">{String(val).padStart(2, '0')}</span>
                  <span className="text-[7px] font-black text-red-800 uppercase">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>{/* end fixed top */}

        {/* ── Scrollable settings zone ── */}
        <div className="relative flex-1 min-h-0">
          {canScrollUp && (
            <button
              onClick={() => settingsScrollRef.current?.scrollBy({ top: -140, behavior: 'smooth' })}
              className="absolute top-0 left-0 right-0 z-10 flex justify-center pt-1.5 pb-3 bg-gradient-to-b from-zinc-900 to-transparent pointer-events-auto"
              aria-label="Scroll up"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7"/></svg>
            </button>
          )}

          <div
            ref={settingsScrollRef}
            onScroll={checkSettingsScroll}
            className="h-full overflow-y-auto px-6 py-5 flex flex-col gap-6 scrollbar-hide"
          >

        {state.activeView === AppView.APPLE && (
          <>
            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">iPhone Size</label>
              <div className="flex flex-col gap-2">
                {([
                  { type: DeviceType.IPHONE_65, label: 'iPhone 6.5"', sub: '1284 × 2778' },
                  { type: DeviceType.IPHONE,    label: 'iPhone 6.9"', sub: '1260 × 2736' },
                ] as const).map(({ type, label, sub }) => (
                  <button
                    key={type}
                    onClick={() => setAppleDevice(type)}
                    className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${
                      appleDevice === type
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                    <span className="text-[9px] font-mono text-zinc-500">{sub}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60 shrink-0"></div>
                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                  iPad Pro 12.9" always generated alongside iPhone
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">App Category</label>
              <select
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 appearance-none"
                value={appleCategory}
                onChange={(e) => setAppleCategory(e.target.value as AppleCategory)}
              >
                {(Object.entries(APPLE_CATEGORIES) as [AppleCategory, typeof APPLE_CATEGORIES[AppleCategory]][]).map(([key, cat]) => (
                  <option key={key} value={key}>{cat.label}</option>
                ))}
              </select>
              <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest leading-relaxed">
                Sets screenshot order and store-ready file names
              </p>
            </section>

            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Output Type</label>
              <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setOutputMode(OutputMode.FULL_RES)}
                  className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${outputMode === OutputMode.FULL_RES ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Full Resolution
                </button>
                <button
                  onClick={() => setOutputMode(OutputMode.COPY_DESIGN)}
                  className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${outputMode === OutputMode.COPY_DESIGN ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Copy Design
                </button>
              </div>
            </section>

            {outputMode === OutputMode.COPY_DESIGN && (
              <>
                <section className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">App Details</label>
                  <input
                    type="text"
                    placeholder="App Name"
                    value={copyAppName}
                    maxLength={80}
                    onChange={e => setCopyAppName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-blue-500 transition-colors"
                  />
                  <textarea
                    placeholder="Describe what your app does..."
                    value={copyDescription}
                    maxLength={400}
                    onChange={e => setCopyDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-blue-500 transition-colors resize-none"
                  />
                  <input
                    type="text"
                    placeholder="Target segment (e.g. busy professionals)"
                    value={copySegment}
                    maxLength={80}
                    onChange={e => setCopySegment(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-blue-500 transition-colors"
                  />
                </section>

                <section className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">AI Provider</label>
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    <button
                      onClick={() => setAiProvider('claude')}
                      className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${aiProvider === 'claude' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      Claude
                    </button>
                    <button
                      onClick={() => setAiProvider('openai')}
                      className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${aiProvider === 'openai' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      OpenAI
                    </button>
                  </div>
                  {aiProvider === 'claude' ? (
                    <input
                      type="password"
                      placeholder="sk-ant-..."
                      value={claudeApiKey}
                      onChange={e => setClaudeApiKey(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-blue-500 transition-colors"
                    />
                  ) : (
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={openaiApiKey}
                      onChange={e => setOpenaiApiKey(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-green-500 transition-colors"
                    />
                  )}
                  <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest leading-relaxed">
                    Key stays in your browser — never sent to ScreenFrame servers
                  </p>
                </section>
              </>
            )}

            <button
              disabled={appleFiles.length === 0 || isProcessingBatch}
              onClick={handleAppleQuickProcess}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-blue-500/40 bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 transition-all disabled:opacity-30 shadow-lg shadow-blue-500/5 ${isProcessingBatch ? 'animate-pulse' : ''}`}
            >
              {isProcessingBatch ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {batchProgress} / {appleFiles.length}
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {appleFiles.length > 0
                      ? outputMode === OutputMode.COPY_DESIGN
                        ? `Generate ${appleFiles.length} → iPhone + iPad`
                        : `Process ${appleFiles.length} → iPhone + iPad`
                      : 'Process Screenshots'}
                  </span>
                </>
              )}
            </button>

            {!state.isPro && (
              <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest text-center">
                {`Free Tier • ${state.tray.filter(x => x !== null).length}/1 Used`}
              </p>
            )}
          </>
        )}

        {state.activeView === AppView.ANDROID && (
          <>
            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Output Sizes</label>
              <div className="space-y-2">
                {([
                  { label: 'Phone',       sub: '1080 × 1920' },
                  { label: '10″ Tablet',  sub: '800 × 1280' },
                  { label: '7″ Tablet',   sub: '600 × 1024' },
                ] as const).map(({ label, sub }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/50">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
                    <span className="text-[9px] font-mono text-zinc-500">{sub}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500/60 shrink-0"></div>
                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                  All 3 sizes generated from each upload
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">App Category</label>
              <select
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 appearance-none"
                value={androidCategory}
                onChange={(e) => setAndroidCategory(e.target.value as AppleCategory)}
              >
                {(Object.entries(APPLE_CATEGORIES) as [AppleCategory, typeof APPLE_CATEGORIES[AppleCategory]][]).map(([key, cat]) => (
                  <option key={key} value={key}>{cat.label}</option>
                ))}
              </select>
              <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest leading-relaxed">
                Sets screenshot order and store-ready file names
              </p>
            </section>

            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Output Type</label>
              <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setOutputMode(OutputMode.FULL_RES)}
                  className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${outputMode === OutputMode.FULL_RES ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Full Resolution
                </button>
                <button
                  onClick={() => setOutputMode(OutputMode.COPY_DESIGN)}
                  className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${outputMode === OutputMode.COPY_DESIGN ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Copy Design
                </button>
              </div>
            </section>

            {outputMode === OutputMode.COPY_DESIGN && (
              <>
                <section className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">App Details</label>
                  <input
                    type="text"
                    placeholder="App Name"
                    value={copyAppName}
                    maxLength={80}
                    onChange={e => setCopyAppName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-green-500 transition-colors"
                  />
                  <textarea
                    placeholder="Describe what your app does..."
                    value={copyDescription}
                    maxLength={400}
                    onChange={e => setCopyDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-green-500 transition-colors resize-none"
                  />
                  <input
                    type="text"
                    placeholder="Target segment (e.g. busy professionals)"
                    value={copySegment}
                    maxLength={80}
                    onChange={e => setCopySegment(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-green-500 transition-colors"
                  />
                </section>

                <section className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">AI Provider</label>
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    <button
                      onClick={() => setAiProvider('claude')}
                      className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${aiProvider === 'claude' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      Claude
                    </button>
                    <button
                      onClick={() => setAiProvider('openai')}
                      className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${aiProvider === 'openai' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      OpenAI
                    </button>
                  </div>
                  {aiProvider === 'claude' ? (
                    <input
                      type="password"
                      placeholder="sk-ant-..."
                      value={claudeApiKey}
                      onChange={e => setClaudeApiKey(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-green-500 transition-colors"
                    />
                  ) : (
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={openaiApiKey}
                      onChange={e => setOpenaiApiKey(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 outline-none focus:border-green-500 transition-colors"
                    />
                  )}
                  <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest leading-relaxed">
                    Key stays in your browser — never sent to ScreenFrame servers
                  </p>
                </section>
              </>
            )}

            <button
              disabled={androidFiles.length === 0 || isProcessingBatch}
              onClick={handleAndroidProcess}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-green-600/40 bg-green-700/10 text-green-500 hover:bg-green-700/20 transition-all disabled:opacity-30 shadow-lg shadow-green-500/5 ${isProcessingBatch ? 'animate-pulse' : ''}`}
            >
              {isProcessingBatch ? (
                <>
                  <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {batchProgress} / {androidFiles.length}
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {androidFiles.length > 0
                      ? outputMode === OutputMode.COPY_DESIGN
                        ? `Generate ${androidFiles.length} → Phone + Tablets`
                        : `Process ${androidFiles.length} → Phone + Tablets`
                      : 'Process Screenshots'}
                  </span>
                </>
              )}
            </button>

            {!state.isPro && (
              <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest text-center">
                {`Free Tier • ${state.tray.filter(x => x !== null).length}/1 Used`}
              </p>
            )}
          </>
        )}

        {state.activeView === AppView.EDITOR && (
          <>
            {isRevision && (
              <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl space-y-2 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                   <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Revision Workflow Active</span>
                </div>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">
                  Refining an existing capture. Adding to tray will create a new version.
                </p>
              </div>
            )}

            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Precision Tools</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={!state.image}
                  onClick={() => setIsCropMode(!isCropMode)}
                  className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${isCropMode ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800'} disabled:opacity-30`}
                >
                  <svg className="w-5 h-5 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Crop Area</span>
                </button>
                <button
                  disabled={!state.image}
                  onClick={applyAutoShine}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 transition-all hover:border-blue-500 group disabled:opacity-30"
                >
                  <svg className="w-5 h-5 mb-2 text-blue-500 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Auto Shine</span>
                </button>
              </div>
              <button
                disabled={!state.image || isAddingToTray}
                onClick={addToTray}
                className={`w-full flex items-center justify-center gap-2 py-4 mt-1 rounded-2xl border border-blue-500/40 bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 transition-all disabled:opacity-30 shadow-lg shadow-blue-500/5 ${isAddingToTray ? 'animate-pulse' : ''}`}
              >
                {isAddingToTray ? (
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                )}
                <span className="text-[10px] font-black uppercase tracking-widest leading-none">Add Snapshot to Tray</span>
              </button>
              {!state.isPro && (
                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest text-center mt-2">
                  {`Free Tier • ${state.tray.filter(x => x !== null).length}/1 Used`}
                </p>
              )}
            </section>

            <section className="bg-zinc-950/50 rounded-2xl p-5 border border-zinc-800/50 space-y-5 shadow-inner">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Adjustment Matrix</label>
              <div className="space-y-4">
                <AdjustmentSlider label="Brightness" value={state.adjustments.brightness} min={50} max={150} property="brightness" />
                <AdjustmentSlider label="Contrast" value={state.adjustments.contrast} min={50} max={150} property="contrast" />
                <AdjustmentSlider label="Saturation" value={state.adjustments.saturation} min={50} max={150} property="saturation" />
                <AdjustmentSlider label="Sharpness" value={state.adjustments.sharpness} min={0} max={100} property="sharpness" />
              </div>
            </section>

            <div className="space-y-5">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Target Module</label>
                <select
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 appearance-none"
                  value={state.selectedDevice}
                  onChange={(e) => setState(prev => ({ ...prev, selectedDevice: e.target.value as DeviceType }))}
                >
                  <optgroup label="Module: Apple" className="bg-zinc-900 font-black">
                    {Object.values(DEVICE_SPECS).filter(s => s.platform === Platform.APPLE).map(spec => (
                      <option key={spec.id} value={spec.id}>{spec.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Module: Android" className="bg-zinc-900 font-black">
                    {Object.values(DEVICE_SPECS).filter(s => s.platform === Platform.ANDROID).map(spec => (
                      <option key={spec.id} value={spec.id}>{spec.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Output Mode</label>
                <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setState(prev => ({ ...prev, exportMode: ExportMode.RECTANGLE }))}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${state.exportMode === ExportMode.RECTANGLE ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    RECT
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, exportMode: ExportMode.FRAME }))}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${state.exportMode === ExportMode.FRAME ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    FRAME
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Scaling Logic</label>
                <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => setState(prev => ({ ...prev, fitMode: FitMode.FIT }))}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${state.fitMode === FitMode.FIT ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    FIT
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, fitMode: FitMode.AUTOFIT }))}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${state.fitMode === FitMode.AUTOFIT ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    FILL
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, fitMode: FitMode.STRETCH }))}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${state.fitMode === FitMode.STRETCH ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    STRETCH
                  </button>
                </div>
              </div>
            </div>

            <button
              disabled={!state.image}
              onClick={() => showConfirm(
                "Discard Master",
                "Are you sure you want to discard the current master screenshot and all edits? This will empty the studio.",
                () => { setState(prev => ({ ...prev, image: null })); setIsRevision(false); },
                "Discard"
              )}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-red-500/20 bg-red-600/5 text-red-500/60 hover:bg-red-600/15 hover:text-red-400 hover:border-red-500/40 transition-all disabled:opacity-20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">Discard Master</span>
            </button>
          </>
        )}

        {state.activeView === AppView.TRAY && (
          <div className="space-y-6">
            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Apple Preview</label>
              <div className="flex gap-1 bg-zinc-900 rounded-xl p-1">
                <button
                  onClick={() => setTrayPreview('phone')}
                  className={`flex-1 py-2.5 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest ${trayPreview === 'phone' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  iPhone
                </button>
                <button
                  onClick={() => setTrayPreview('ipad')}
                  className={`flex-1 py-2.5 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest ${trayPreview === 'ipad' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  iPad
                </button>
              </div>
            </section>

            {hasAndroid && (
              <section className="space-y-3">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Android Preview</label>
                <div className="flex gap-1 bg-zinc-900 rounded-xl p-1">
                  <button
                    onClick={() => setAndroidTrayPreview('phone')}
                    className={`flex-1 py-2 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest ${androidTrayPreview === 'phone' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Phone
                  </button>
                  <button
                    onClick={() => setAndroidTrayPreview('10in')}
                    className={`flex-1 py-2 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest ${androidTrayPreview === '10in' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    10″
                  </button>
                  <button
                    onClick={() => setAndroidTrayPreview('7in')}
                    className={`flex-1 py-2 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest ${androidTrayPreview === '7in' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    7″
                  </button>
                </div>
              </section>
            )}

            <section className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Project Management</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={!hasItems}
                  onClick={showSaveModal}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 transition-all hover:border-blue-500 disabled:opacity-30"
                >
                  <svg className="w-5 h-5 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Save Kit</span>
                </button>
                <button
                  onClick={showLoadModal}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 transition-all hover:border-blue-500"
                >
                  <svg className="w-5 h-5 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Open Kit</span>
                </button>
              </div>
            </section>

            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Batch Operations</label>
              <button
                disabled={!hasApple || !!isExporting}
                onClick={() => handleBatchExport(Platform.APPLE)}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black transition-all ${!hasApple ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed opacity-50' : 'bg-white text-black hover:bg-zinc-100 active:scale-95 shadow-xl'}`}
              >
                {isExporting === Platform.APPLE
                  ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>}
                EXPORT APPLE KIT
              </button>
              <button
                disabled={!hasAndroid || !!isExporting}
                onClick={() => handleBatchExport(Platform.ANDROID)}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black transition-all ${!hasAndroid ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed opacity-50' : 'bg-green-700 text-white hover:bg-green-600 active:scale-95 shadow-xl'}`}
              >
                {isExporting === Platform.ANDROID
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>}
                EXPORT ANDROID KIT
              </button>
              <button
                disabled={state.tray.every(s => s === null) || !!isExporting}
                onClick={() => showConfirm(
                  'Clear Tray',
                  'Remove all screenshots from the tray? This cannot be undone.',
                  () => { setState(prev => ({ ...prev, tray: Array(8).fill(null) })); setTrayLockedFiles([]); }
                )}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black transition-all text-[10px] uppercase tracking-widest border border-red-500/30 bg-red-600/10 text-red-500 hover:bg-red-600/20 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                CLEAR TRAY
              </button>
            </div>
          </div>
        )}

        {state.activeView === AppView.FAQ && (
           <div className="space-y-4">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Licensing Status</label>
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-between gap-3">
                 <span className="text-[10px] font-black text-white uppercase tracking-widest">{planLabel()}</span>
                 {!auth.user && (
                   <button
                     onClick={() => setShowAuthModal(true)}
                     className="text-[8px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest transition-colors shrink-0"
                   >
                     Sign In
                   </button>
                 )}
                 {auth.user && !state.isPro && (
                   <button
                     onClick={() => showUpgradeModal()}
                     className="text-[8px] font-black text-blue-500 hover:text-blue-400 uppercase tracking-widest transition-colors shrink-0"
                   >
                     Upgrade
                   </button>
                 )}
              </div>
           </div>
        )}

          </div>{/* end scrollable content */}

          {canScrollDown && (
            <button
              onClick={() => settingsScrollRef.current?.scrollBy({ top: 140, behavior: 'smooth' })}
              className="absolute bottom-0 left-0 right-0 z-10 flex justify-center pb-1.5 pt-3 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-auto"
              aria-label="Scroll down"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
            </button>
          )}
        </div>{/* end scrollable zone */}

        {/* ── Fixed footer ── */}
        <footer className="px-6 py-4 border-t border-zinc-800 shrink-0">
           <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.4em] leading-relaxed text-center">
              Batch Process Engine v3.1 • ScreenFrame
           </p>
           <p className="text-[8px] text-zinc-600 font-medium text-center mt-2">
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Terms</a>
              {' • '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Privacy</a>
              {' • '}
              <a href="/app-store-screenshot-sizes" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Screenshot Sizes</a>
              {' • '}
              <a href="mailto:support@screenframe.app" className="hover:text-zinc-400 transition-colors">Contact</a>
           </p>
        </footer>
      </aside>

      <main className={`flex-1 relative flex flex-col items-center justify-center ${isCropMode ? 'p-0 overflow-hidden' : 'p-4 md:p-8 overflow-y-auto'} bg-[#0d0d0d]`}>

        {state.activeView === AppView.APPLE && (
          <div className="w-full h-full max-w-2xl flex flex-col items-center justify-start pt-10 px-4 md:px-8 overflow-y-auto scrollbar-hide">
            <div className="w-full mb-6">
              <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic leading-none mb-2">
                Apple Screenshot Studio
              </h2>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.3em]">
                Upload → Auto-process → Tray → Export
              </p>
            </div>

            {/* Drop zone */}
            <div
              className={`w-full border-2 border-dashed rounded-[2rem] p-10 text-center transition-all cursor-pointer ${
                appleFiles.length > 0
                  ? 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-600'
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/20'
              }`}
              onClick={() => appleFileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                setAppleFiles(prev => [...prev, ...files].slice(0, 8));
              }}
            >
              <input
                type="file"
                ref={appleFileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'));
                  setAppleFiles(prev => [...prev, ...files].slice(0, 8));
                  e.target.value = '';
                }}
              />
              {appleFiles.length === 0 ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-6 text-zinc-600">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                  </div>
                  <p className="text-white text-sm font-black uppercase italic tracking-tight mb-2">Drop Screenshots Here</p>
                  <p className="text-zinc-600 text-[9px] font-black uppercase tracking-widest">Up to 8 · PNG or JPG · Max 8 MB each</p>
                </>
              ) : (
                <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">+ Add More (click or drop)</p>
              )}
            </div>

            {/* File list with preview names */}
            {appleFiles.length > 0 && (
              <div className="w-full mt-4 space-y-2">
                {appleFiles.map((file, i) => {
                  const cat = APPLE_CATEGORIES[appleCategory];
                  const slotName = cat.slots[i] ?? `screenshot_${i + 1}`;
                  const seq = String(state.tray.filter(x => x !== null).length + i + 1).padStart(2, '0');
                  const isIpad = appleDevice === DeviceType.IPAD;
                  const outputName = `${seq}_${slotName}${isIpad ? '_ipad' : ''}.png`;

                  return (
                    <div key={i} className="flex flex-col px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-2xl gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-[10px] font-mono text-blue-400 shrink-0">{seq}</span>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-white uppercase tracking-widest truncate">{outputName}</p>
                            <p className="text-[9px] text-zinc-600 font-bold truncate">{file.name}</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setAppleFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                          className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                      {outputMode === OutputMode.COPY_DESIGN && (
                        <input
                          type="text"
                          placeholder={`What does this screen show? (e.g. ${slotName.replace(/_/g, ' ')})`}
                          value={copyFeatures[i] ?? ''}
                          onChange={e => {
                            const val = e.target.value;
                            setCopyFeatures(prev => {
                              const next = [...prev];
                              next[i] = val;
                              return next;
                            });
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-[9px] font-bold text-zinc-300 outline-none focus:border-blue-500 transition-colors"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {state.activeView === AppView.ANDROID && (
          <div className="w-full h-full max-w-2xl flex flex-col items-center justify-start pt-10 px-4 md:px-8 overflow-y-auto scrollbar-hide">
            <div className="w-full mb-6">
              <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic leading-none mb-2">
                Android Screenshot Studio
              </h2>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.3em]">
                Upload → Auto-process → Tray → Export
              </p>
            </div>

            {/* Drop zone */}
            <div
              className={`w-full border-2 border-dashed rounded-[2rem] p-10 text-center transition-all cursor-pointer ${
                androidFiles.length > 0
                  ? 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-600'
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/20'
              }`}
              onClick={() => androidFileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                setAndroidFiles(prev => [...prev, ...files].slice(0, 8));
              }}
            >
              <input
                type="file"
                ref={androidFileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'));
                  setAndroidFiles(prev => [...prev, ...files].slice(0, 8));
                  e.target.value = '';
                }}
              />
              {androidFiles.length === 0 ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-6 text-zinc-600">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                  </div>
                  <p className="text-white text-sm font-black uppercase italic tracking-tight mb-2">Drop Screenshots Here</p>
                  <p className="text-zinc-600 text-[9px] font-black uppercase tracking-widest">Up to 8 · PNG or JPG · Android or Apple source accepted</p>
                </>
              ) : (
                <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">+ Add More (click or drop)</p>
              )}
            </div>

            {/* File list */}
            {androidFiles.length > 0 && (
              <div className="w-full mt-4 space-y-2">
                {androidFiles.map((file, i) => {
                  const cat = APPLE_CATEGORIES[androidCategory];
                  const slotName = cat.slots[i] ?? `screenshot_${i + 1}`;
                  const seq = String(state.tray.filter(x => x !== null).length + i + 1).padStart(2, '0');

                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-2xl gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[10px] font-mono text-green-400 shrink-0">{seq}</span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-white uppercase tracking-widest truncate">{seq}_{slotName}_android_*.png</p>
                          <p className="text-[9px] text-zinc-600 font-bold truncate">{file.name}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAndroidFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                        className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {state.activeView === AppView.EDITOR && (
          <>
            {!state.image && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center group transition-all"
              >
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer bg-zinc-900/50 border-2 border-dashed rounded-[4rem] p-16 text-center max-w-sm w-full mx-4 backdrop-blur-3xl transition-all ${isDraggingOver ? 'border-blue-500 bg-blue-500/10 scale-[1.05]' : 'border-zinc-800 hover:border-zinc-700'} shadow-[0_0_100px_rgba(0,0,0,0.5)]`}>
                  <div className="w-20 h-20 rounded-3xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-8 text-zinc-600 group-hover:text-blue-500 transition-all">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-4">Initialize Studio</h3>
                  <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] leading-loose text-center">Drop master asset to establish the canonical viewport.</p>
                </div>
              </div>
            )}

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

            <div className="w-full h-full flex flex-col items-center justify-center relative">
              {isCropMode && state.image ? (
                <div className="w-full h-full">
                   <CropEditor
                    image={state.image}
                    cropArea={state.cropArea}
                    fitMode={state.fitMode}
                    onFitChange={(mode) => setState(prev => ({ ...prev, fitMode: mode }))}
                    onCropChange={(cropArea) => setState(prev => ({ ...prev, cropArea }))}
                    onClose={() => setIsCropMode(false)}
                    onDiscardMaster={() => { setState(prev => ({ ...prev, image: null })); setIsRevision(false); setIsCropMode(false); }}
                    showConfirm={showConfirm}
                  />
                </div>
              ) : (
                <div className="relative scale-90 sm:scale-100 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]">
                  <DeviceMockup
                    deviceType={state.selectedDevice}
                    image={state.image}
                    exportMode={state.exportMode}
                    fitMode={state.fitMode}
                    cropArea={state.cropArea}
                    adjustments={state.adjustments}
                    frameColor={state.frameColor}
                    onColorChange={(hex) => setState(prev => ({ ...prev, frameColor: hex }))}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {state.activeView === AppView.TRAY && (
          <div className="w-full h-full max-w-6xl p-8 overflow-y-auto scrollbar-hide">
            <header className="mb-12 flex items-end justify-between">
               <div>
                  <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic leading-none">Export Queue</h2>
                  <div className="flex items-center mt-3">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.3em]">Manual Reordering Active • Arrangement Sync Enabled</p>
                    <InfoTooltip />
                  </div>
               </div>
               {!state.isPro && (
                 <div className="px-6 py-2 bg-blue-600/10 border border-blue-500/20 rounded-full">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                    {'Free Tier — 1 Slot'}
                  </span>
                 </div>
               )}
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {state.tray.map((item, idx) => {
                const primaryVariant = item ? getPreviewVariant(item) : undefined;
                const isBeingDragged = draggedSlotIdx === idx;
                const isDropTarget = dropTargetIdx === idx && draggedSlotIdx !== idx;

                return (
                  <div
                    key={item?.id || `empty-${idx}`}
                    draggable={item !== null && !modal.isOpen}
                    onDragStart={() => handleTrayDragStart(idx)}
                    onDragOver={(e) => handleTrayDragOver(e, idx)}
                    onDrop={(e) => handleTrayDrop(e, idx)}
                    className={`relative aspect-[9/16] bg-zinc-950 border rounded-[2.5rem] flex flex-col items-center justify-center overflow-hidden transition-all duration-300 select-none ${isBeingDragged ? 'opacity-30 scale-95 border-blue-500/50 grayscale' : 'border-zinc-900'} ${isDropTarget ? 'border-blue-500 scale-[1.02] shadow-[0_0_40px_rgba(59,130,246,0.2)]' : ''} ${item ? 'cursor-grab active:cursor-grabbing hover:border-zinc-700' : ''}`}
                  >
                    {item ? (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
                           <img
                              src={primaryVariant?.renderedImageUrl}
                              alt={`Slot ${idx + 1}`}
                              className="max-w-full max-h-full object-contain rounded-[1.5rem] shadow-2xl"
                           />
                        </div>
                        <div className="absolute inset-0 bg-black/80 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-6 text-center backdrop-blur-md">
                          <div className="mb-2">
                             <span className="block text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">{item.platform}</span>
                             <span className="block text-[10px] font-black text-white uppercase tracking-widest">{item.exportMode === ExportMode.RECTANGLE ? 'Full Resolution' : 'Mockup Kit'}</span>
                          </div>
                          <div className="flex flex-col gap-2 w-full px-4">
                            <button onClick={(e) => { e.stopPropagation(); editCopyFromTray(item.id); }} className="w-full py-2 bg-white text-black text-[9px] font-black uppercase rounded-xl hover:bg-zinc-200 transition-colors shadow-lg">EDIT REVISION</button>
                            <button onClick={(e) => { e.stopPropagation(); removeFromTrayById(item.id); }} className="w-full py-2 bg-red-600/20 text-red-500 border border-red-500/30 text-[9px] font-black uppercase rounded-xl hover:bg-red-600 hover:text-white transition-all">REMOVE</button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-4 text-zinc-800">
                         <div className="w-16 h-16 rounded-3xl border-2 border-dashed border-zinc-800 flex items-center justify-center">
                            <span className="text-xl font-black opacity-20">{idx + 1}</span>
                         </div>
                         <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Awaiting Snapshot</span>
                      </div>
                    )}
                    <div className={`absolute top-6 left-6 w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${isDropTarget ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-600'}`}>
                      <span className="text-[10px] font-black">{idx + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Locked slots (free-tier overflow) ── */}
            {trayLockedFiles.length > 0 && (
              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Locked — Upgrade to Process</span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {trayLockedFiles.map((locked) => (
                    <div
                      key={locked.seq}
                      className="relative aspect-[9/16] bg-zinc-950 border border-zinc-800/50 rounded-[2.5rem] flex flex-col items-center justify-center overflow-hidden"
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 gap-3">
                        <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                          <svg className="w-7 h-7 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <div className="text-center space-y-1 px-2">
                          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest truncate max-w-full">{locked.seq} · {locked.slotName.replace(/_/g, ' ')}</p>
                          <p className="text-[8px] text-zinc-700 font-medium truncate max-w-full">{locked.name}</p>
                        </div>
                        <button
                          onClick={() => showUpgradeModal()}
                          className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[8px] font-black uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-blue-500/20"
                        >
                          Upgrade to Unlock
                        </button>
                      </div>
                      <div className="absolute top-6 left-6 w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                        <svg className="w-3 h-3 text-zinc-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {state.activeView === AppView.FAQ && (
          <div className="w-full h-full max-w-4xl p-8 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
             <header className="mb-16">
                <h2 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none mb-4">Pricing & FAQ</h2>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] max-w-lg">
                   Transparent plans for developers and teams. No forced subscriptions.
                </p>
             </header>

             <section className="mb-20">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

                   {/* Free */}
                   <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-[2rem] flex flex-col items-start gap-4">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Starter</span>
                      <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">Free</h4>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">Try ScreenFrame — no account or card needed.</p>
                      <ul className="w-full grid gap-2">
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>1 active project</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>3 screenshots per set</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>iOS + Android export</li>
                         <li className="text-[11px] text-zinc-600 flex gap-2"><span className="flex-shrink-0">–</span>Watermarked output</li>
                         <li className="text-[11px] text-zinc-600 flex gap-2"><span className="flex-shrink-0">–</span>No AI copy</li>
                      </ul>
                      <div className="mt-auto pt-6 w-full">
                         <div className="text-3xl font-black text-white mb-4 italic">$0<span className="text-[10px] text-zinc-600 uppercase tracking-widest not-italic ml-2">Forever</span></div>
                         <div className="w-full py-3 bg-zinc-900 text-zinc-500 text-[10px] font-black uppercase tracking-widest rounded-xl text-center">Current Plan</div>
                      </div>
                   </div>

                   {/* Indie */}
                   <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-[2rem] flex flex-col items-start gap-4">
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Solo Developer</span>
                      <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">Indie</h4>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">Lifetime license. One-time payment, no subscription.</p>
                      <ul className="w-full grid gap-2">
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>Unlimited projects</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>All device exports</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>BYOA (Claude or OpenAI)</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>AI copy generation</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>1 user seat</li>
                      </ul>
                      <div className="mt-auto pt-6 w-full">
                         <div className="text-3xl font-black text-white mb-4 italic">$119<span className="text-[10px] text-zinc-600 uppercase tracking-widest not-italic ml-2">Lifetime</span></div>
                         <button onClick={() => handleUpgradeClick('lifetime')} className="w-full py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-zinc-200 transition-all">Get Indie</button>
                      </div>
                   </div>

                   {/* Studio */}
                   <div className="p-8 bg-zinc-950 border border-blue-600/30 rounded-[2rem] flex flex-col items-start gap-4 relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-black uppercase px-4 py-1 rounded-bl-xl tracking-widest">Most Popular</div>
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Teams</span>
                      <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">Studio</h4>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">Up to 5 apps, 3 seats. For growing teams.</p>
                      <ul className="w-full grid gap-2">
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>Up to 5 apps / projects</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>3 seats</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>BYOA included</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>Priority export queue</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>Team project sharing</li>
                      </ul>
                      <div className="mt-auto pt-6 w-full">
                         <div className="text-3xl font-black text-white mb-1 italic">$49<span className="text-[10px] text-zinc-600 uppercase tracking-widest not-italic ml-2">/ month</span></div>
                         <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mb-4">Or $399 / year — save 32%</div>
                         <button onClick={() => handleUpgradeClick('subscription')} className="w-full py-3 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20">Start Studio</button>
                      </div>
                   </div>

                   {/* Agency */}
                   <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-[2rem] flex flex-col items-start gap-4">
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Agency</span>
                      <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">Agency</h4>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">Unlimited apps, 10 seats, white-label and invoicing.</p>
                      <ul className="w-full grid gap-2">
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>Unlimited apps</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>10 seats</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>White-label exports</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>Client project folders</li>
                         <li className="text-[11px] text-zinc-400 flex gap-2"><span className="text-green-500 flex-shrink-0">✓</span>Invoice / PO billing</li>
                      </ul>
                      <div className="mt-auto pt-6 w-full">
                         <div className="text-3xl font-black text-white mb-4 italic">Custom</div>
                         <a href="mailto:support@screenframe.app?subject=Agency Inquiry" className="block w-full py-3 bg-zinc-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-all text-center">Contact us</a>
                      </div>
                   </div>

                </div>
             </section>

             <div className="grid gap-12 pb-32">
                <section className="space-y-4">
                   <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest">Frequently Asked Questions</h3>
                   <div className="grid gap-8">
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">How does ScreenFrame work?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">ScreenFrame lets you design your app screenshots once, then automatically prepares them for all required App Store and Play Store sizes. ScreenFrame focuses on preparing screenshots that align with current store guidelines, while final approval always depends on each store's review process. You start by editing a single screenshot in the studio. When you add it to the tray, ScreenFrame generates all required device versions (for example, phone and tablet sizes) using the same layout and framing. Each screenshot added to the tray is treated as final and won't change unless you deliberately revise it. You can reorder screenshots, export them as a complete set, or reopen saved projects later. The goal is simple: design once, export correctly, without manual resizing or guesswork.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Is ScreenFrame free to use?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Yes. Free lets you generate one screenshot so you can see exactly how ScreenFrame works. This includes full device fan-out (e.g. phone, tablet) at production quality with no watermarks.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">What does upgrading unlock?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Upgrading to Indie or Studio unlocks all 8 tray slots, enabling you to build a complete App Store or Play Store set in one batch. It also enables project saving/loading for future revisions.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Do I need a subscription?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">No. The Indie license is a one-time $119 lifetime payment. Studio ($49/month) and Agency (custom) plans are available for teams who need seats, project sharing, or white-label workflows.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Free vs Indie vs Studio vs Agency?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Free gives you 1 project with watermarked output — no card needed. Indie is a $119 one-time lifetime license for solo developers (1 seat, BYOA, AI copy). Studio is $49/month for teams up to 3 seats managing 5 apps. Agency is custom-priced for unlimited apps, 10 seats, white-label exports, and invoice billing.</p>
                      </div>
                   </div>
                </section>

                <section className="space-y-4">
                   <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest">Privacy & Determinism</h3>
                   <div className="grid gap-8">
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Are my screenshots stored online?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">No. ScreenFrame is local-first. Your images and projects are stored in your browser's IndexedDB. We never see your assets unless you explicitly choose to sync to our optional cloud backup (Studio/Enterprise only).</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Will my exports change later?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">No. Exports are deterministic renders of your approved state. Once a capture is in the tray, its pixels are frozen. We don't apply "auto-adjustments" at export time.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Is ScreenFrame affiliated with Apple or Google?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">No. ScreenFrame is an independent tool built by developers for developers. We track store requirement changes and update our device specs to ensure your kits remain compliant.</p>
                      </div>
                   </div>
                </section>
             </div>
          </div>
        )}

        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 transform ${showSuccess ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
           <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-3 flex items-center gap-3 shadow-2xl backdrop-blur-3xl">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                 <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
                Exported successfully.
              </p>
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
