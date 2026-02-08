
import React, { useState } from 'react';
import { DeviceType, ExportMode, FitMode, CropArea, ImageAdjustments, Platform } from '../types';
import { DEVICE_SPECS, FRAME_COLORS } from '../constants';

interface DeviceMockupProps {
  deviceType: DeviceType;
  image: string | null;
  exportMode: ExportMode;
  fitMode: FitMode;
  cropArea: CropArea;
  adjustments: ImageAdjustments;
  frameColor: string;
  onColorChange?: (hex: string) => void;
}

const DeviceMockup: React.FC<DeviceMockupProps> = ({
  deviceType,
  image,
  exportMode,
  fitMode,
  cropArea,
  adjustments,
  frameColor,
  onColorChange,
}) => {
  const spec = DEVICE_SPECS[deviceType];
  const isLandscape = spec.width > spec.height;
  const isTablet = spec.isTablet;
  const [showPicker, setShowPicker] = useState(false);
  
  const maxW = 320;
  const maxH = 500;
  let previewW: number, previewH: number;

  if (isLandscape) {
    previewW = maxW;
    previewH = (spec.height / spec.width) * maxW;
  } else {
    previewH = maxH;
    previewW = (spec.width / spec.height) * maxH;
  }

  const VIEWPORT_PADDING_FACTOR = 0.12;
  const paddingX = previewW * VIEWPORT_PADDING_FACTOR;
  const paddingY = previewH * VIEWPORT_PADDING_FACTOR;

  const containerStyle = {
    width: `${previewW}px`,
    height: `${previewH}px`,
    padding: `${paddingY}px ${paddingX}px`,
  };

  const isMockup = exportMode === ExportMode.FRAME;

  const getObjectFit = () => {
    switch (fitMode) {
      case FitMode.AUTOFIT: return 'cover';
      case FitMode.FIT: return 'contain';
      case FitMode.STRETCH: return 'fill';
      default: return 'cover';
    }
  };

  const filterString = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;
  const availableColors = FRAME_COLORS[spec.platform];

  return (
    <div className="flex flex-col items-center justify-center p-10 bg-zinc-900/30 rounded-[3rem] border border-zinc-800/50 backdrop-blur-xl group/mockup">
      <div 
        style={{
          ...containerStyle,
          backgroundColor: isMockup ? frameColor : '#050505'
        }} 
        className={`transition-all duration-500 ease-out flex items-center justify-center relative overflow-hidden bg-[#0a0a0a] shadow-2xl ${isMockup ? (isTablet ? 'rounded-[1.4rem]' : 'rounded-[2.4rem]') : 'rounded shadow-lg'} ${isMockup ? 'ring-[12px] ring-zinc-800/30 ring-inset cursor-pointer hover:ring-blue-500/20' : ''}`}
        onClick={() => isMockup && setShowPicker(!showPicker)}
      >
        {isMockup && (
          <div 
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 transition-all duration-300 z-50 ${showPicker ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'}`}
            onClick={(e) => e.stopPropagation()}
          >
             {availableColors.map(c => (
               <button
                 key={c.hex}
                 onClick={() => { onColorChange?.(c.hex); setShowPicker(false); }}
                 className={`w-4 h-4 rounded-full border border-white/20 transition-all hover:scale-125 hover:shadow-[0_0_100px_rgba(255,255,255,0.2)] ${frameColor === c.hex ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-black' : ''}`}
                 style={{ backgroundColor: c.hex }}
                 title={c.name}
               />
             ))}
          </div>
        )}

        {image ? (
          <div 
            className={`w-full h-full relative overflow-hidden transition-all duration-500 ${isTablet ? 'rounded-[0.8rem]' : 'rounded-[1.8rem]'}`}
            style={spec.id === DeviceType.IPAD ? { transform: 'scale(0.92)', transformOrigin: 'center' } : {}}
          >
            <img 
              src={image} 
              alt="Screenshot" 
              className="absolute max-w-none transition-all"
              style={{
                objectFit: getObjectFit(),
                width: `${100 / (cropArea.width / 100)}%`,
                height: `${100 / (cropArea.height / 100)}%`,
                left: `-${cropArea.x * (100 / cropArea.width)}%`,
                top: `-${cropArea.y * (100 / cropArea.height)}%`,
                filter: filterString,
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-zinc-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      
      <div className="mt-8 flex flex-col items-center gap-1.5">
         <div className="flex items-center gap-2">
            <span className="text-white text-[10px] font-black uppercase tracking-widest opacity-80 italic">
              {spec.name}
            </span>
            {isMockup && (
              <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest">• {availableColors.find(c => c.hex === frameColor)?.name} Finish</span>
            )}
         </div>
         <span className="text-zinc-600 text-[9px] font-mono tracking-tighter uppercase">
           {isMockup ? 'Click Frame to Switch Hardware Finish' : 'Canonical Standards Enabled'}
         </span>
      </div>
    </div>
  );
};

export default DeviceMockup;
