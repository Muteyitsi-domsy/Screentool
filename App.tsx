
import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { 
  Platform, 
  DeviceType, 
  FitMode, 
  ExportMode, 
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
import { processImage, detectBorders } from './imageUtils';
import { saveProjectToDB, getAllProjectsFromDB, deleteProjectFromDB } from './db';

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
  type?: 'confirm' | 'save' | 'load' | 'alert' | 'upgrade' | 'early-access';
  title: string;
  message: string;
  onConfirm: (data?: any) => void;
  confirmLabel?: string;
  secondaryLabel?: string;
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
  const [state, setState] = useState<ProcessingState>({
    image: null,
    fitMode: FitMode.FIT,
    exportMode: ExportMode.RECTANGLE,
    selectedDevice: DeviceType.IPHONE,
    frameColor: '#1a1a1a',
    cropArea: { x: 0, y: 0, width: 100, height: 100 },
    adjustments: { ...NEUTRAL_BASELINE },
    activeView: AppView.EDITOR,
    tray: Array(8).fill(null),
    isPro: false // Simulated licensing state
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Non-UI Admin Check
  const isAdmin = useCallback(() => {
    try {
      return localStorage.getItem('SF_ADMIN_BYPASS') === 'true';
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  useEffect(() => {
    setState(prev => ({ ...prev, frameColor: '#1a1a1a' }));
  }, [state.selectedDevice]);

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

  const showEarlyAccessModal = () => {
    setModal({
      isOpen: true,
      type: 'early-access',
      title: 'Payments opening soon',
      message: 'We’re finishing payment setup. If you’d like early access or want to be notified when upgrades open, get in touch and we’ll help you get started.',
      onConfirm: () => {
        window.location.href = "mailto:support@screenframe.app?subject=Early Access Inquiry";
      },
      confirmLabel: "Contact for early access",
      secondaryLabel: "Close"
    });
  };

  const showUpgradeModal = () => {
    setModal({
      isOpen: true,
      type: 'upgrade',
      title: 'Ready to build a full screenshot set?',
      message: 'Free includes 1 screenshot so you can try ScreenFrame. Upgrade to prepare a complete App Store or Play Store listing with up to 8 screenshots, proper ordering, and reusable projects.',
      onConfirm: () => {
        // Instead of directly upgrading, show the coming soon modal
        showEarlyAccessModal();
      },
      confirmLabel: "Upgrade – Individual",
      secondaryLabel: "Continue with 1 screenshot"
    });
  };

  const showSaveModal = () => {
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
        // ADMIN BYPASS CHECK
        if (!state.isPro && !isAdmin() && occupiedCount > 1) {
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
    if (state.image) {
      showAlert(
        "Editor Occupied",
        "Finish or discard your current edit before revising a tray screenshot."
      );
      return;
    }

    const item = state.tray.find(i => i?.id === id);
    if (!item) return;

    // Use primary variant as base for revision
    const primaryVariant = item.variants[0];
    
    setState(prev => ({
      ...prev,
      image: primaryVariant.renderedImageUrl,
      cropArea: { x: 0, y: 0, width: 100, height: 100 },
      adjustments: { ...NEUTRAL_BASELINE },
      activeView: AppView.EDITOR
    }));
    setIsRevision(true);
  };

  const getExportFilename = (spec: DeviceSpec, mode: ExportMode, index: number): string => {
    const platform = spec.platform.toLowerCase();
    const modeLabel = mode === ExportMode.RECTANGLE ? 'rect' : 'mockup';
    const idx = index.toString().padStart(2, '0');
    let device = '';
    let size = '';

    switch (spec.id) {
      case DeviceType.PHONE: device = 'phone'; break;
      case DeviceType.TABLET_7: device = 'tablet'; size = '7in'; break;
      case DeviceType.TABLET_10: device = 'tablet'; size = '10in'; break;
      case DeviceType.CHROMEBOOK: device = 'chromebook'; break;
      case DeviceType.IPHONE: device = 'phone'; size = '6.7'; break;
      case DeviceType.IPHONE_61: device = 'phone'; size = '6.1'; break;
      case DeviceType.IPAD: device = 'tablet'; size = '12.9'; break;
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
      alert("File size exceeds 8MB limit.");
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert("Please upload a valid image file.");
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
    // HARD DATA GUARD: Final tier-check inside mutation logic. 
    // This must precede all processing or UI state changes.
    const currentTrayCount = state.tray.filter(x => x !== null).length;
    // ADMIN BYPASS CHECK
    if (!state.isPro && !isAdmin() && currentTrayCount >= 1) {
      showUpgradeModal();
      return;
    }

    if (!state.image || isAddingToTray) return;

    const emptySlotIndex = state.tray.findIndex(slot => slot === null);
    if (emptySlotIndex === -1) {
      alert("Export Tray is full. Please remove an item first.");
      return;
    }

    setIsAddingToTray(true);

    try {
      const activeSpec = DEVICE_SPECS[state.selectedDevice];
      const targetPlatform = activeSpec.platform;
      
      const bucketItems = state.tray.filter(item => 
        item !== null && 
        item.platform === targetPlatform && 
        item.exportMode === state.exportMode
      );
      const maxIndexInBucket = bucketItems.reduce((max, item) => Math.max(max, item!.index), 0);
      const calculatedIndex = maxIndexInBucket + 1;

      const targetSpecs = Object.values(DEVICE_SPECS).filter(s => s.platform === targetPlatform);
      
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
        newTray[emptySlotIndex] = newItem;
        return { ...prev, tray: newTray };
      });
      setIsRevision(false);
    } catch (err) {
      console.error("Capture fan-out failure:", err);
      alert("System Error: Failed to generate multi-device kit variants.");
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
      const platformLabel = targetPlatform.toLowerCase();
      const finalZipName = `${platformLabel}_platform_kit.zip`;
      const zip = new JSZip();

      const rectFolder = zip.folder("full_resolution");
      const mockupFolder = zip.folder("mockups");

      trayItems.forEach(item => {
        const targetFolder = item.exportMode === ExportMode.RECTANGLE ? rectFolder : mockupFolder;
        
        item.variants.forEach(variant => {
          targetFolder?.file(variant.filename, variant.renderedBlob);
        });
      });
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalZipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setShowSuccess(true);
    } catch (err) {
      console.error("Batch crash:", err);
      alert("Batch engine failed to build platform kit ZIP.");
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0a0a0a]">
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

      <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/20 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 scrollbar-hide">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-sm">SF</div>
            <h1 className="text-xl font-bold tracking-tight text-white italic">ScreenFrame</h1>
          </div>
          <div className="flex items-center">
            <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">Asset Studio</p>
            <InfoTooltip />
          </div>
        </header>

        <nav className="flex flex-col bg-zinc-950 p-1 rounded-2xl border border-zinc-800 gap-1">
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
          <div className="flex gap-1">
            <button 
              onClick={() => setState(prev => ({ ...prev, activeView: AppView.FAQ }))}
              className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${state.activeView === AppView.FAQ ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              PRICING & FAQ
            </button>
            <button 
              onClick={() => setState(prev => ({ ...prev, activeView: AppView.TERMS }))}
              className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${state.activeView === AppView.TERMS ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              TERMS
            </button>
          </div>
        </nav>

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
                  Free: 1 Snapshot Allowed • {state.tray.filter(x => x !== null).length}/1 Active
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
          </>
        )}

        {state.activeView === AppView.TRAY && (
          <div className="space-y-6">
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
                {isExporting === Platform.APPLE ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>}
                EXPORT APPLE KIT
              </button>
              <button 
                disabled={!hasAndroid || !!isExporting}
                onClick={() => handleBatchExport(Platform.ANDROID)}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black transition-all ${!hasAndroid ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed opacity-50' : 'bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 shadow-md shadow-black/50'}`}
              >
                {isExporting === Platform.ANDROID ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>}
                EXPORT ANDROID KIT
              </button>
            </div>
          </div>
        )}

        {state.activeView === AppView.FAQ && (
           <div className="space-y-4">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Licensing Status</label>
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-between">
                 <span className="text-[10px] font-black text-white uppercase tracking-widest">{state.isPro ? 'Individual – Active' : 'Free Tier'}</span>
                 <button 
                  onClick={() => setState(prev => ({ ...prev, isPro: !prev.isPro }))}
                  className="px-3 py-1 bg-zinc-800 text-[8px] font-black text-zinc-400 rounded-lg hover:text-white"
                 >
                   TOGGLE SIM
                 </button>
              </div>
           </div>
        )}

        <footer className="mt-auto pt-4 border-t border-zinc-800">
           <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.4em] leading-relaxed text-center">
              Batch Process Engine v3.1 • ScreenFrame
           </p>
        </footer>
      </aside>

      <main className={`flex-1 relative flex flex-col items-center justify-center ${isCropMode ? 'p-0' : 'p-4 md:p-8'} bg-[#0d0d0d] overflow-hidden`}>
        {state.activeView === AppView.EDITOR && (
          <>
            {!state.image && (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer group transition-all"
              >
                <div className={`bg-zinc-900/50 border-2 border-dashed rounded-[4rem] p-16 text-center max-w-sm w-full mx-4 backdrop-blur-3xl transition-all ${isDraggingOver ? 'border-blue-500 bg-blue-500/10 scale-[1.05]' : 'border-zinc-800 hover:border-zinc-700'} shadow-[0_0_100px_rgba(0,0,0,0.5)]`}>
                  <div className="w-20 h-20 rounded-3xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-8 text-zinc-600 group-hover:text-blue-500 transition-all">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-4">Initialize Studio</h3>
                  <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] leading-loose text-center">Drop master asset to establish the canonical viewport.</p>
                </div>
              </div>
            )}

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

            <div className="w-full h-full flex items-center justify-center relative">
              {isCropMode && state.image ? (
                <div className="w-full h-full">
                   <CropEditor 
                    image={state.image}
                    cropArea={state.cropArea}
                    fitMode={state.fitMode}
                    onFitChange={(mode) => setState(prev => ({ ...prev, fitMode: mode }))}
                    onCropChange={(cropArea) => setState(prev => ({ ...prev, cropArea }))}
                    onClose={() => setIsCropMode(false)}
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
                  {state.image && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        showConfirm(
                          "Discard Master",
                          "Are you sure you want to discard the current master screenshot and all edits? This will empty the studio.",
                          () => {
                            setState(prev => ({ ...prev, image: null }));
                            setIsRevision(false);
                          },
                          "Discard"
                        );
                      }}
                      className="absolute -top-6 -right-6 w-12 h-12 bg-zinc-900 hover:bg-red-600 rounded-full flex items-center justify-center text-zinc-600 hover:text-white border border-zinc-800 shadow-2xl transition-all group active:scale-90"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  )}
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
               {!state.isPro && !isAdmin() && (
                 <div className="px-6 py-2 bg-blue-600/10 border border-blue-500/20 rounded-full">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Free Mode: 1 Slot Max</span>
                 </div>
               )}
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {state.tray.map((item, idx) => {
                const primaryVariant = item?.variants[0];
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-[2rem] flex flex-col items-start gap-4">
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Solo Developer</span>
                      <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">Individual</h4>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">Lifetime license for single app production. One-time payment.</p>
                      <div className="mt-auto pt-6 w-full">
                         <div className="text-3xl font-black text-white mb-4 italic">$39<span className="text-[10px] text-zinc-600 uppercase tracking-widest not-italic ml-2">Lifetime</span></div>
                         <button onClick={showEarlyAccessModal} className="w-full py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-zinc-200 transition-all">Get Individual</button>
                      </div>
                   </div>

                   <div className="p-8 bg-zinc-950 border border-blue-600/30 rounded-[2rem] flex flex-col items-start gap-4 relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-black uppercase px-4 py-1 rounded-bl-xl tracking-widest">Most Popular</div>
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Agencies</span>
                      <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">Studio</h4>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">Unlimited projects for agencies and multi-app teams. Priority specs.</p>
                      <div className="mt-auto pt-6 w-full">
                         <div className="text-3xl font-black text-white mb-1 italic">$19<span className="text-[10px] text-zinc-600 uppercase tracking-widest not-italic ml-2">/ month</span></div>
                         <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mb-4">Or $180 / year</div>
                         <button onClick={showEarlyAccessModal} className="w-full py-3 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20">Start Subscription</button>
                      </div>
                   </div>

                   <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-[2rem] flex flex-col items-start gap-4">
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Enterprise</span>
                      <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">Large Teams</h4>
                      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">Custom invoicing, priority support, and team-wide seat management.</p>
                      <div className="mt-auto pt-6 w-full">
                         <div className="text-3xl font-black text-white mb-4 italic">Custom</div>
                         <button onClick={showEarlyAccessModal} className="w-full py-3 bg-zinc-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-all">Contact us</button>
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
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">ScreenFrame lets you design your app screenshots once, then automatically prepares them for all required App Store and Play Store sizes. ScreenFrame focuses on preparing screenshots that align with current store guidelines, while final approval always depends on each store’s review process. You start by editing a single screenshot in the studio. When you add it to the tray, ScreenFrame generates all required device versions (for example, phone and tablet sizes) using the same layout and framing. Each screenshot added to the tray is treated as final and won’t change unless you deliberately revise it. You can reorder screenshots, export them as a complete set, or reopen saved projects later. The goal is simple: design once, export correctly, without manual resizing or guesswork.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Is ScreenFrame free to use?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Yes. Free lets you generate one screenshot so you can see exactly how ScreenFrame works. This includes full device fan-out (e.g. phone, tablet) at production quality with no watermarks.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">What does upgrading unlock?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Upgrading to an Individual or Studio license unlocks all 8 tray slots, enabling you to build a complete App Store or Play Store set in one batch. It also enables project saving/loading for future revisions.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Do I need a subscription?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">No. The Individual license is a one-time lifetime payment. Studio and Enterprise plans are available for those who need ongoing team management or higher scale.</p>
                      </div>
                      <div>
                         <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2 italic">Individual vs Studio vs Enterprise?</h4>
                         <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Individual is a one-time license for solo devs. Studio is a monthly subscription for agencies managing dozens of apps. Enterprise is for large organizations needing invoicing, multi-seat management, and dedicated support.</p>
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

        {state.activeView === AppView.TERMS && (
          <div className="w-full h-full max-w-4xl p-8 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
             <header className="mb-16">
                <h2 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none mb-4">Terms of Service</h2>
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] max-w-lg leading-loose">
                   Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
             </header>

             <div className="space-y-16 pb-32">
                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">1. Introduction</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    Welcome to ScreenFrame. These Terms of Service ("Terms") govern your use of the ScreenFrame web application and related services (the "Service"). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, please do not use the Service.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">2. Description of the Service</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    ScreenFrame is a web-based screenshot formatting tool that allows users to upload screenshots and automatically frame, resize, and format them for professional presentation in app store listings. ScreenFrame utilizes a "local-first" architecture; all image processing and project storage occur locally within your browser's IndexedDB. We do not permanently store your screenshots on our servers unless you explicitly choose to enable optional cloud features.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">3. User Accounts</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    While basic features are available without an account, certain premium features (such as multiple tray slots or project syncing) may require the purchase of a license or subscription. You are responsible for maintaining the confidentiality of any license keys or account credentials and for all activities that occur under your account.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">4. Acceptable Use</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    You agree not to use the Service for any unlawful purpose or in any way that violates these Terms. Prohibited activities include, but are not limited to: uploading content that infringes on intellectual property rights, distributing malware, attempting to reverse engineer the Service, or interfering with the Service's integrity.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">5. Intellectual Property</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    You retain full ownership of all images you upload to the Service. ScreenFrame does not claim any rights to your assets. ScreenFrame and its original content, features, and functionality are and will remain the exclusive property of ScreenFrame and its licensors.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">6. Payment Terms</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    All payments for ScreenFrame are processed by **Paddle** as our Merchant of Record. Paddle handles all customer service inquiries and returns related to payments. By making a purchase, you agree to Paddle's terms and conditions in addition to these Terms.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">7. Refund Policy</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    We offer a 14-day refund policy for our digital goods. If you are unsatisfied with your purchase, you may request a refund within 14 days of the original transaction date, provided the license has not been excessively utilized. All refund requests are handled via Paddle.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">8. Subscription Terms</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    Subscriptions are billed on a recurring monthly or annual basis as selected during checkout. Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period. You can manage and cancel your subscriptions through the billing portal provided by Paddle.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">9. Termination</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    We may terminate or suspend your access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will cease immediately.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">10. Disclaimer of Warranties</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium italic">
                    The Service is provided on an "AS IS" and "AS AVAILABLE" basis. ScreenFrame makes no representations or warranties of any kind, express or implied, as to the operation of the Service. ScreenFrame focuses on preparing screenshots that align with store guidelines; however, final approval always depends on each store’s review process. We do not guarantee store acceptance.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">11. Limitation of Liability</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    In no event shall ScreenFrame, its directors, employees, or partners be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">12. Privacy Policy</h3>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2">Data Collection</h4>
                      <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">We collect minimal data: your email address for licensing purposes, payment details (processed securely by Paddle), and basic technical logs. We do not track the content of your screenshots.</p>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2">Usage & Cookies</h4>
                      <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">We use essential cookies to maintain your session and licensing status. We utilize third-party services like Vercel for hosting and Paddle for payments.</p>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2">User Rights</h4>
                      <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">Under GDPR guidelines, you have the right to access, correct, or delete your personal data. To exercise these rights, please contact us at support@screenframe.app.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">13. Changes to Terms</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    We reserve the right to modify these Terms at any time. We will notify you of any changes by updating the "Last Updated" date at the top of this page. Your continued use of the Service after changes are posted constitutes your acceptance of the new Terms.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em]">14. Governing Law</h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                    These Terms shall be governed and construed in accordance with the laws of Kenya, without regard to its conflict of law provisions.
                  </p>
                </section>

                <div className="pt-10 border-t border-zinc-800">
                  <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest text-center">
                    Questions regarding these terms? <a href="mailto:support@screenframe.app" className="text-blue-500 hover:text-blue-400">Contact Support</a>
                  </p>
                </div>
             </div>
          </div>
        )}

        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 transform ${showSuccess ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
           <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-3 flex items-center gap-3 shadow-2xl backdrop-blur-3xl">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                 <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
                Process updated. Licensing state synchronized.
              </p>
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
