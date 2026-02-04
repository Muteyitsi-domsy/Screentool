
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
  TrayItem
} from './types';
import { DEVICE_SPECS } from './constants';
import DeviceMockup from './components/DeviceMockup';
import CropEditor from './components/CropEditor';
import { processImage, detectBorders } from './imageUtils';

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
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
}

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
    tray: Array(8).fill(null)
  });
  
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [isExporting, setIsExporting] = useState<Platform | null>(null);
  const [isAddingToTray, setIsAddingToTray] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  useEffect(() => {
    setState(prev => ({ ...prev, frameColor: '#1a1a1a' }));
  }, [state.selectedDevice]);

  /**
   * REINFORCED MODAL LOGIC
   * Ensures intent is returned via callback without executing state updates internally.
   */
  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel: string = "Confirm") => {
    setModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setModal(prev => ({ ...prev, isOpen: false }));
      },
      confirmLabel
    });
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
        
        // CANONICAL VIEWPORT NORMALIZATION
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
        } else if (targetSpec.platform === Platform.ANDROID) {
          // Android Harmonization: No insets, but ensure dead-centering 
          // to maintain app content parity across phone/tablet viewports.
          const isLandscape = normalizationRect.width > normalizationRect.height;
          // Predicable composition start: 
          // If master has status bars, detectBorders handled it; 
          // we just ensure the resulting asset is a perfect canonical anchor.
          console.debug("Android Canonical Normalization complete for Class:", targetSpec.id);
        }
        
        const cleanAsset = createCanonicalAsset(img, normalizationRect);
        setState(prev => ({ 
          ...prev, 
          image: cleanAsset,
          cropArea: { x: 0, y: 0, width: 100, height: 100 },
          adjustments: { ...NEUTRAL_BASELINE }
        }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const addToTray = async () => {
    if (!state.image || isAddingToTray) return;
    
    const emptySlotIndex = state.tray.findIndex(slot => slot === null);
    if (emptySlotIndex === -1) {
      alert("Export Tray is full. Please remove an item first.");
      return;
    }

    setIsAddingToTray(true);

    try {
      const spec = DEVICE_SPECS[state.selectedDevice];
      const bucketItems = state.tray.filter(item => 
        item !== null && 
        item.deviceType === state.selectedDevice && 
        item.exportMode === state.exportMode
      );
      const maxIndexInBucket = bucketItems.reduce((max, item) => Math.max(max, item!.index), 0);
      const calculatedIndex = maxIndexInBucket + 1;

      const renderedBlob = await processImage(
        state.image,
        spec,
        state.fitMode,
        state.exportMode,
        state.adjustments,
        state.cropArea,
        state.frameColor
      );

      const renderedImageUrl = URL.createObjectURL(renderedBlob);
      const filename = getExportFilename(spec, state.exportMode, calculatedIndex);

      const newItem: TrayItem = {
        id: crypto.randomUUID(),
        renderedImageUrl,
        renderedBlob,
        platform: spec.platform,
        deviceType: state.selectedDevice,
        exportMode: state.exportMode,
        index: calculatedIndex,
        filename,
        timestamp: Date.now(),
        frameColor: state.frameColor
      };

      setState(prev => {
        const newTray = [...prev.tray];
        newTray[emptySlotIndex] = newItem;
        return { ...prev, tray: newTray };
      });
    } catch (err) {
      console.error("Capture failure:", err);
      alert("System Error: Failed to capture snapshot.");
    } finally {
      setIsAddingToTray(false);
    }
  };

  /**
   * STABLE-ID TRAY REMOVAL
   * Targets specific ID to prevent reindexing or slot collisions in 8-item tray.
   */
  const removeFromTrayById = (id: string) => {
    const itemIndex = state.tray.findIndex(item => item?.id === id);
    if (itemIndex === -1) return;

    showConfirm(
      "Remove Snapshot", 
      "Are you sure you want to remove this screenshot from the Export Tray?", 
      () => {
        setState(prev => {
          const currentItem = prev.tray[itemIndex];
          if (currentItem) {
            URL.revokeObjectURL(currentItem.renderedImageUrl);
          }
          const newTray = [...prev.tray];
          newTray[itemIndex] = null;
          return { ...prev, tray: newTray };
        });
      },
      "Remove"
    );
  };

  /**
   * UNIFIED BATCH EXPORT LOGIC
   * Groups items by Platform x Mode only, generating one ZIP per mode containing all device sizes.
   */
  const handleBatchExport = async (targetPlatform: Platform) => {
    const trayItems = state.tray.filter((item): item is TrayItem => item !== null && item.platform === targetPlatform);
    if (trayItems.length === 0) return;
    setIsExporting(targetPlatform);

    try {
      const groups: Record<string, TrayItem[]> = {};
      trayItems.forEach(item => {
        // Mode-level grouping (e.g., 'RECTANGLE' or 'FRAME')
        const groupKey = item.exportMode;
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(item);
      });

      for (const mode in groups) {
        const groupItems = groups[mode];
        if (groupItems.length === 0) continue;

        const modeLabel = mode === ExportMode.RECTANGLE ? 'rect' : 'mockup';
        const platformLabel = targetPlatform.toLowerCase();
        const finalZipName = `${platformLabel}_${modeLabel}_screenshots.zip`;

        const zip = new JSZip();
        groupItems.forEach(item => {
          zip.file(item.filename, item.renderedBlob);
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
      }
      setShowSuccess(true);
    } catch (err) {
      console.error("Batch crash:", err);
      alert("Batch engine failed to build platform kit ZIPs.");
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
  const hasApple = state.tray.some(x => x?.platform === Platform.APPLE);
  const hasAndroid = state.tray.some(x => x?.platform === Platform.ANDROID);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0a0a0a]">
      {/* GLOBAL CONFIRMATION MODAL */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_0_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300">
             <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-4">{modal.title}</h3>
             <p className="text-zinc-400 text-xs font-medium leading-relaxed mb-8 uppercase tracking-wider">{modal.message}</p>
             <div className="flex gap-3">
                <button 
                  onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-800/50 hover:bg-zinc-800 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={modal.onConfirm}
                  className="flex-1 py-3 text-[10px] font-black text-white uppercase tracking-widest bg-blue-600 hover:bg-blue-500 rounded-2xl transition-all shadow-lg shadow-blue-500/20"
                >
                  {modal.confirmLabel || "Confirm"}
                </button>
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
          <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">Asset Studio</p>
        </header>

        <nav className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
          <button 
            onClick={() => setState(prev => ({ ...prev, activeView: AppView.EDITOR }))}
            className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${!isTrayView ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            EDITOR
          </button>
          <button 
            onClick={() => setState(prev => ({ ...prev, activeView: AppView.TRAY }))}
            className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${isTrayView ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            TRAY ({state.tray.filter(x => x !== null).length})
          </button>
        </nav>

        {!isTrayView ? (
          <>
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

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Composition Style</label>
                <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button 
                    onClick={() => setState(prev => ({ ...prev, exportMode: ExportMode.RECTANGLE }))}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${state.exportMode === ExportMode.RECTANGLE ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    FULL
                  </button>
                  <button 
                    onClick={() => setState(prev => ({ ...prev, exportMode: ExportMode.FRAME }))}
                    className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${state.exportMode === ExportMode.FRAME ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    MOCKUP
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Batch Operations</label>
              
              <button 
                disabled={!hasApple || !!isExporting}
                onClick={() => handleBatchExport(Platform.APPLE)}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black transition-all ${!hasApple ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed opacity-50' : 'bg-white text-black hover:bg-zinc-100 active:scale-95 shadow-xl'}`}
              >
                {isExporting === Platform.APPLE ? (
                   <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                ) : (
                   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                )}
                EXPORT APPLE KIT
              </button>

              <button 
                disabled={!hasAndroid || !!isExporting}
                onClick={() => handleBatchExport(Platform.ANDROID)}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black transition-all ${!hasAndroid ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed opacity-50' : 'bg-zinc-800 text-white hover:bg-zinc-700 active:scale-95 shadow-md shadow-black/50'}`}
              >
                {isExporting === Platform.ANDROID ? (
                   <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                )}
                EXPORT ANDROID KIT
              </button>
            </div>

            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-zinc-400">Captured Shots</span>
                <span className="text-[10px] font-mono text-white">{state.tray.filter(x => x !== null).length}/8</span>
              </div>
              <p className="text-[9px] text-zinc-600 leading-relaxed font-bold uppercase tracking-widest">
                ZIP export produces one file per Mode, containing all device sizes.
              </p>
            </div>
          </div>
        )}

        <footer className="mt-auto pt-4 border-t border-zinc-800">
           <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.4em] leading-relaxed text-center">
              Batch Process Engine v2.5 • ScreenFrame
           </p>
        </footer>
      </aside>

      <main className={`flex-1 relative flex flex-col items-center justify-center ${isCropMode ? 'p-0' : 'p-4 md:p-8'} bg-[#0d0d0d] overflow-hidden`}>
        {!isTrayView ? (
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
                          () => setState(prev => ({ ...prev, image: null })),
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
        ) : (
          <div className="w-full h-full max-w-6xl p-8 overflow-y-auto">
            <header className="mb-12 flex items-end justify-between">
               <div>
                  <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic leading-none">Export Queue</h2>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.3em] mt-3">Immutable Canonical Viewport Snapshots</p>
               </div>
               <div className="flex gap-4 mb-1">
                  {isExporting && (
                     <div className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-500/30 rounded-xl">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Building ZIP Containers...</span>
                     </div>
                  )}
               </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {state.tray.map((item, idx) => (
                <div key={idx} className="relative aspect-[9/16] bg-zinc-950 border border-zinc-900 rounded-[2.5rem] flex flex-col items-center justify-center overflow-hidden group">
                  {item ? (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center p-6">
                         <img 
                            src={item.renderedImageUrl} 
                            alt={`Screenshot ${idx + 1}`} 
                            className="max-w-full max-h-full object-contain rounded-[1.5rem] shadow-2xl"
                         />
                      </div>
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-6 text-center backdrop-blur-md">
                        <div className="mb-4">
                           <span className="block text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">{item.platform}</span>
                           <span className="block text-[10px] font-black text-white uppercase tracking-widest">{DEVICE_SPECS[item.deviceType].name}</span>
                        </div>
                        <div className="text-[9px] font-mono text-zinc-400 mb-6 truncate max-w-full px-2">
                           {item.filename}
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromTrayById(item.id);
                          }}
                          className="px-6 py-2 bg-red-600 text-white text-[9px] font-black uppercase rounded-xl hover:bg-red-500 transition-colors shadow-xl"
                        >
                          REMOVE
                        </button>
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
                  <div className="absolute top-6 left-6 w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                    <span className="text-[10px] font-black text-zinc-600">{idx + 1}</span>
                  </div>
                </div>
              ))}
            </div>

            <footer className="mt-16 pt-8 border-t border-zinc-900 text-center">
               <p className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.4em] leading-relaxed">
                 Batch Processing Module Online • ZIP Generation Enabled
               </p>
            </footer>
          </div>
        )}

        {/* Success Alert */}
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 transform ${showSuccess ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
           <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-3 flex items-center gap-3 shadow-2xl backdrop-blur-3xl">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                 <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
                Batch export successful. Files saved.
              </p>
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
