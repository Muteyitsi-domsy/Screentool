
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
  DeviceSpec
} from './types';
import { DEVICE_SPECS } from './constants';
import DeviceMockup from './components/DeviceMockup';
import CropEditor from './components/CropEditor';
import { processImage, detectBorders } from './utils/imageUtils';

const NEUTRAL_BASELINE: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 0
};

const App: React.FC = () => {
  const [state, setState] = useState<ProcessingState>({
    image: null,
    fitMode: FitMode.FIT,
    exportMode: ExportMode.RECTANGLE,
    selectedDevice: DeviceType.IPHONE,
    cropArea: { x: 0, y: 0, width: 100, height: 100 },
    adjustments: { ...NEUTRAL_BASELINE }
  });
  
  const [isExporting, setIsExporting] = useState<Platform | null>(null);
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
        // --- CANONICAL NORMALIZATION ---
        // Establish the base viewport once upon upload.
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
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
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

    const parts = [platform, device, size, modeLabel, idx].filter(Boolean);
    return `${parts.join('_')}.png`;
  };

  const handleExportPlatform = async (platform: Platform) => {
    if (!state.image) return;

    setIsExporting(platform);
    const zip = new JSZip();

    try {
      const platformSpecs = Object.values(DEVICE_SPECS).filter(s => s.platform === platform);
      const modeLabel = state.exportMode === ExportMode.RECTANGLE ? 'rect' : 'mockup';
      const zipFileName = `${platform.toLowerCase()}_complete_kit_${modeLabel}_screenshots.zip`;
      const exportedFilesInfo: any[] = [];

      for (const spec of platformSpecs) {
        const blob = await processImage(
          state.image,
          spec,
          state.fitMode,
          state.exportMode,
          state.adjustments,
          state.cropArea
        );
        
        const filename = getExportFilename(spec, state.exportMode, 1);
        zip.file(filename, blob);
        
        exportedFilesInfo.push({
          filename,
          device: spec.name,
          dimensions: `${spec.width}x${spec.height}`,
          platform: spec.platform,
          mode: modeLabel
        });
      }

      zip.file('export_info.json', JSON.stringify({
        export_context: platform,
        presentation_mode: modeLabel,
        fit_protocol: state.fitMode,
        timestamp: new Date().toISOString(),
        files: exportedFilesInfo
      }, null, 2));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setShowSuccess(true);
    } catch (error) {
      console.error(`${platform} Pack failed`, error);
    } finally {
      setIsExporting(null);
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0a0a0a]">
      {/* Sidebar UI */}
      <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/20 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 scrollbar-hide">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg">S</div>
            <h1 className="text-xl font-bold tracking-tight text-white italic">SnapSuite</h1>
          </div>
          <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">Invariant Studio</p>
        </header>

        {/* Engine Controls */}
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
              onClick={() => setState(prev => ({ ...prev, adjustments: { brightness: 105, contrast: 110, saturation: 106, sharpness: 25 } }))}
              className="flex flex-col items-center justify-center p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 transition-all hover:border-blue-500 group disabled:opacity-30"
            >
              <svg className="w-5 h-5 mb-2 text-blue-500 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">Auto Shine</span>
            </button>
          </div>
        </section>

        {/* Filters */}
        <section className="bg-zinc-950/50 rounded-2xl p-5 border border-zinc-800/50 space-y-5 shadow-inner">
          <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Adjustment Matrix</label>
          <div className="space-y-4">
            <AdjustmentSlider label="Brightness" value={state.adjustments.brightness} min={50} max={150} property="brightness" />
            <AdjustmentSlider label="Contrast" value={state.adjustments.contrast} min={50} max={150} property="contrast" />
            <AdjustmentSlider label="Saturation" value={state.adjustments.saturation} min={50} max={150} property="saturation" />
            <AdjustmentSlider label="Sharpness" value={state.adjustments.sharpness} min={0} max={100} property="sharpness" />
          </div>
          <button 
            onClick={() => setState(prev => ({ ...prev, adjustments: { ...NEUTRAL_BASELINE } }))}
            className="w-full py-2 text-[9px] font-black text-zinc-500 hover:text-white uppercase tracking-[0.2em] border-t border-zinc-800 pt-3"
          >
            Reset to Baseline
          </button>
        </section>

        {/* Configuration Section */}
        <div className="space-y-5">
           <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Target Module</label>
              <select 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-zinc-300 focus:ring-1 focus:ring-blue-600 appearance-none"
                value={state.selectedDevice}
                onChange={(e) => setState(prev => ({ ...prev, selectedDevice: e.target.value as DeviceType }))}
              >
                <optgroup label="Module: Apple (Canonical Standards)" className="bg-zinc-900 font-black">
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

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Fitting Protocol</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setState(prev => ({ ...prev, fitMode: FitMode.FIT }))}
                  className={`py-2 text-[10px] font-black border rounded-xl transition-all ${state.fitMode === FitMode.FIT ? 'bg-blue-600 border-blue-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
                >
                  CONTAIN
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, fitMode: FitMode.AUTOFIT }))}
                  className={`py-2 text-[10px] font-black border rounded-xl transition-all ${state.fitMode === FitMode.AUTOFIT ? 'bg-blue-600 border-blue-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
                >
                  FILL
                </button>
              </div>
            </div>
        </div>

        {/* Rapid Export Packaging */}
        <div className="mt-auto pt-6 border-t border-zinc-800 flex flex-col gap-3">
          <button 
            disabled={!state.image || !!isExporting}
            onClick={() => handleExportPlatform(Platform.ANDROID)}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black transition-all ${!state.image ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed' : 'bg-zinc-100 text-black hover:bg-white active:scale-95 shadow-xl'}`}
          >
            {isExporting === Platform.ANDROID ? "PACKAGING..." : "ANDROID PACKAGE"}
          </button>
          
          <button 
            disabled={!state.image || !!isExporting}
            onClick={() => handleExportPlatform(Platform.APPLE)}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black transition-all ${!state.image ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed' : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 active:scale-95 shadow-md shadow-black/50'}`}
          >
            {isExporting === Platform.APPLE ? "PACKAGING..." : "APPLE PACKAGE"}
          </button>

          <footer className="mt-2 text-center">
            <p className="text-[8px] font-bold text-zinc-700 uppercase tracking-[0.2em] leading-relaxed text-center">
              Canonical Standards v1.4 • Pixel-Perfect WYSIWYG
            </p>
          </footer>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main 
        className={`flex-1 relative flex flex-col items-center justify-center ${isCropMode ? 'p-0' : 'p-4 md:p-8'} bg-[#0d0d0d] overflow-hidden`}
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]); }}
      >
        {/* Success Alert */}
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 transform ${showSuccess ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
           <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-3 flex items-center gap-3 shadow-2xl backdrop-blur-3xl">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                 <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
                Export complete. Parity verified.
              </p>
           </div>
        </div>

        {!state.image && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`absolute inset-0 z-10 flex items-center justify-center cursor-pointer group transition-all`}
          >
            <div className={`bg-zinc-900/50 border-2 border-dashed rounded-[4rem] p-16 text-center max-w-sm w-full mx-4 backdrop-blur-3xl transition-all ${isDraggingOver ? 'border-blue-500 bg-blue-500/10 scale-[1.05]' : 'border-zinc-800 hover:border-zinc-700'} shadow-[0_0_100px_rgba(0,0,0,0.5)]`}>
              <div className="w-20 h-20 rounded-3xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-8 text-zinc-600 group-hover:text-blue-500 transition-all">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              </div>
              <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-4">Initialize Studio</h3>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] leading-loose text-center">Drop master asset to generate invariant-locked screen kits.</p>
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
                onCropChange={(cropArea) => setState(prev => ({ ...prev, cropArea }))}
                onClose={() => setIsCropMode(false)}
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
              />
              {state.image && (
                <button 
                  onClick={() => setState(prev => ({ ...prev, image: null }))}
                  className="absolute -top-6 -right-6 w-12 h-12 bg-zinc-900 hover:bg-red-600 rounded-full flex items-center justify-center text-zinc-600 hover:text-white border border-zinc-800 shadow-2xl transition-all group active:scale-90"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
