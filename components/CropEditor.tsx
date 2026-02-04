
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CropArea, FitMode } from '../types';

interface CropEditorProps {
  image: string;
  cropArea: CropArea;
  fitMode: FitMode;
  onFitChange: (mode: FitMode) => void;
  onCropChange: (crop: CropArea) => void;
  onClose: () => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, confirmLabel?: string) => void;
}

const CropEditor: React.FC<CropEditorProps> = ({ 
  image, 
  cropArea, 
  fitMode, 
  onFitChange, 
  onCropChange, 
  onClose,
  showConfirm
}) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  
  const [workspaceSize, setWorkspaceSize] = useState({ w: 0, h: 0 });
  const [localCrop, setLocalCrop] = useState<CropArea>(cropArea);
  
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  const [isDragging, setIsDragging] = useState<{ 
    handle: string | null; 
    startX: number; 
    startY: number; 
    initialCrop: CropArea;
    initialPan?: { x: number; y: number };
  }>({
    handle: null,
    startX: 0,
    startY: 0,
    initialCrop: cropArea
  });

  const BASE_WIDTH = 380;
  const VIEWPORT_ASPECT = 9 / 19.5;
  const BASE_HEIGHT = BASE_WIDTH / VIEWPORT_ASPECT;

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWorkspaceSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    if (workspaceRef.current) observer.observe(workspaceRef.current);
    return () => observer.disconnect();
  }, []);

  const autoFitScale = useMemo(() => {
    if (workspaceSize.w === 0 || workspaceSize.h === 0) return 1;
    const safety = 140; 
    const scaleX = (workspaceSize.w - safety) / BASE_WIDTH;
    const scaleY = (workspaceSize.h - safety) / BASE_HEIGHT;
    return Math.max(0.2, Math.min(scaleX, scaleY, 2.5));
  }, [workspaceSize, BASE_WIDTH, BASE_HEIGHT]);

  const visualScale = manualZoom !== null ? manualZoom : autoFitScale;

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    setIsDragging({
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...localCrop },
      initialPan: { ...pan }
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.handle) return;
      const screenDeltaX = e.clientX - isDragging.startX;
      const screenDeltaY = e.clientY - isDragging.startY;

      if (isDragging.handle === 'canvas-pan') {
        setPan({
          x: (isDragging.initialPan?.x || 0) + screenDeltaX,
          y: (isDragging.initialPan?.y || 0) + screenDeltaY
        });
        return;
      }

      const logicalDeltaX = screenDeltaX / visualScale;
      const logicalDeltaY = screenDeltaY / visualScale;
      const deltaXPercent = (logicalDeltaX / BASE_WIDTH) * isDragging.initialCrop.width;
      const deltaYPercent = (logicalDeltaY / BASE_HEIGHT) * isDragging.initialCrop.height;

      setLocalCrop(prev => {
        const next = { ...isDragging.initialCrop };
        const minSize = 5;

        switch (isDragging.handle) {
          case 'move':
            next.x = Math.max(0, Math.min(100 - next.width, isDragging.initialCrop.x + deltaXPercent));
            next.y = Math.max(0, Math.min(100 - next.height, isDragging.initialCrop.y + deltaYPercent));
            break;
          case 'top':
            next.y = Math.max(0, Math.min(isDragging.initialCrop.y + isDragging.initialCrop.height - minSize, isDragging.initialCrop.y + deltaYPercent));
            next.height = isDragging.initialCrop.height - (next.y - isDragging.initialCrop.y);
            break;
          case 'bottom':
            next.height = Math.max(minSize, Math.min(100 - isDragging.initialCrop.y, isDragging.initialCrop.height + deltaYPercent));
            break;
          case 'left':
            next.x = Math.max(0, Math.min(isDragging.initialCrop.x + isDragging.initialCrop.width - minSize, isDragging.initialCrop.x + deltaXPercent));
            next.width = isDragging.initialCrop.width - (next.x - isDragging.initialCrop.x);
            break;
          case 'right':
            next.width = Math.max(minSize, Math.min(100 - isDragging.initialCrop.x, isDragging.initialCrop.width + deltaXPercent));
            break;
        }
        return next;
      });
    };

    const handleMouseUp = () => setIsDragging(prev => ({ ...prev, handle: null }));
    if (isDragging.handle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, visualScale, BASE_WIDTH, BASE_HEIGHT]);

  const hasChanges = useMemo(() => {
    return localCrop.x !== 0 || localCrop.y !== 0 || localCrop.width !== 100 || localCrop.height !== 100;
  }, [localCrop]);

  const handleExit = () => {
    if (hasChanges) {
      showConfirm(
        "Discard Changes",
        "You have unsaved crop adjustments. Exit anyway and lose these changes?",
        onClose,
        "Exit"
      );
    } else {
      onClose();
    }
  };

  const handleReset = () => {
    if (!hasChanges) return;
    showConfirm(
      "Reset Crop",
      "Reset all crop adjustments? This will discard your current framing.",
      () => {
        setLocalCrop({ x: 0, y: 0, width: 100, height: 100 }); 
        setManualZoom(null); 
        setPan({x:0, y:0}); 
      },
      "Reset"
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] overflow-hidden select-none">
      <div className="px-6 py-4 md:px-10 md:py-6 border-b border-zinc-800/50 flex flex-col lg:flex-row items-center justify-between gap-6 bg-zinc-900/20 backdrop-blur-3xl shrink-0 z-50">
        <div className="hidden sm:block">
          <h3 className="text-xl md:text-2xl font-black tracking-tighter text-white uppercase italic leading-none">Canonical Precision</h3>
          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.2em] mt-2">WYSIWYG Asset Editor</p>
        </div>

        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800 w-full lg:w-auto">
          <button onClick={() => onFitChange(FitMode.FIT)} className={`flex-1 lg:flex-none px-6 py-2 text-[9px] font-black rounded-xl transition-all ${fitMode === FitMode.FIT ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>FIT</button>
          <button onClick={() => onFitChange(FitMode.AUTOFIT)} className={`flex-1 lg:flex-none px-6 py-2 text-[9px] font-black rounded-xl transition-all ${fitMode === FitMode.AUTOFIT ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>FILL</button>
          <button onClick={() => onFitChange(FitMode.STRETCH)} className={`flex-1 lg:flex-none px-6 py-2 text-[9px] font-black rounded-xl transition-all ${fitMode === FitMode.STRETCH ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>STRETCH</button>
        </div>

        <div className="flex gap-2 w-full lg:w-auto">
          <button 
            onClick={handleExit} 
            className="flex-1 lg:flex-none px-5 py-2.5 text-[10px] font-black text-zinc-400 hover:text-white transition-all bg-zinc-900 border border-zinc-800 rounded-2xl"
          >
            EXIT
          </button>
          <button 
            onClick={handleReset} 
            disabled={!hasChanges}
            className={`flex-1 lg:flex-none px-5 py-2.5 text-[10px] font-black rounded-2xl transition-all border ${hasChanges ? 'text-zinc-300 bg-zinc-800 border-zinc-700 hover:bg-zinc-700' : 'text-zinc-700 bg-zinc-900 border-zinc-800 cursor-not-allowed opacity-50'}`}
          >
            RESET
          </button>
          <button 
            onClick={() => { onCropChange(localCrop); onClose(); }} 
            className="flex-1 lg:flex-none px-8 py-2.5 text-[10px] font-black bg-white text-black rounded-2xl transition-all shadow-2xl active:scale-95 hover:bg-blue-50"
          >
            APPLY
          </button>
        </div>
      </div>

      <div ref={workspaceRef} className="flex-1 relative flex items-center justify-center p-4 overflow-hidden bg-black/40">
        <div 
          className="relative z-10 transition-transform duration-500"
          style={{ width: `${BASE_WIDTH}px`, height: `${BASE_HEIGHT}px`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${visualScale})` }}
        >
          <div ref={viewportRef} className="absolute inset-0 shadow-2xl ring-1 ring-zinc-800 bg-[#0a0a0a] rounded-[3.5rem] flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-0 bg-[#050505] cursor-move" onMouseDown={(e) => handleMouseDown(e, 'move')}>
              <img src={image} alt="Crop Content" className="absolute pointer-events-none max-w-none origin-top-left transition-all" style={{ width: `${100 / (localCrop.width / 100)}%`, height: `${100 / (localCrop.height / 100)}%`, left: `-${localCrop.x * (100 / localCrop.width)}%`, top: `-${localCrop.y * (100 / localCrop.height)}%`, objectFit: fitMode === FitMode.FIT ? 'contain' : fitMode === FitMode.STRETCH ? 'fill' : 'cover' }} />
            </div>
            <div className="absolute inset-0 pointer-events-none z-10 ring-[24px] ring-black/80 rounded-[3.5rem]"></div>
            <div className="absolute inset-0 z-30 pointer-events-none">
              <div onMouseDown={(e) => handleMouseDown(e, 'top')} className="absolute top-0 left-12 right-12 h-16 pointer-events-auto cursor-n-resize group flex justify-center pt-3"><div className="w-32 h-2 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div></div>
              <div onMouseDown={(e) => handleMouseDown(e, 'bottom')} className="absolute bottom-0 left-12 right-12 h-16 pointer-events-auto cursor-s-resize group flex justify-center pb-3"><div className="w-32 h-2 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div></div>
              <div onMouseDown={(e) => handleMouseDown(e, 'left')} className="absolute left-0 top-12 bottom-12 w-16 pointer-events-auto cursor-w-resize group flex items-center pl-3"><div className="h-32 w-2 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div></div>
              <div onMouseDown={(e) => handleMouseDown(e, 'right')} className="absolute right-0 top-12 bottom-12 w-16 pointer-events-auto cursor-e-resize group flex items-center pr-3"><div className="h-32 w-2 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div></div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-10 py-4 bg-[#080808] border-t border-zinc-900 flex justify-between">
        <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Viewport Precision Mode Active</span>
      </div>
    </div>
  );
};

export default CropEditor;
