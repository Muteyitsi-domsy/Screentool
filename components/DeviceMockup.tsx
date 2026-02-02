
import React from 'react';
import { DeviceType, ExportMode, FitMode, CropArea, ImageAdjustments } from '../types';
import { DEVICE_SPECS } from '../constants';

interface DeviceMockupProps {
  deviceType: DeviceType;
  image: string | null;
  exportMode: ExportMode;
  fitMode: FitMode;
  cropArea: CropArea;
  adjustments: ImageAdjustments;
}

const DeviceMockup: React.FC<DeviceMockupProps> = ({
  deviceType,
  image,
  exportMode,
  fitMode,
  cropArea,
  adjustments,
}) => {
  const spec = DEVICE_SPECS[deviceType];
  const isLandscape = spec.width > spec.height;
  const isTablet = spec.isTablet;
  
  const maxW = 320;
  const maxH = 500;
  let previewW, previewH;

  if (isLandscape) {
    previewW = maxW;
    previewH = (spec.height / spec.width) * maxW;
  } else {
    previewH = maxH;
    previewW = (spec.width / spec.height) * maxH;
  }

  // Viewport Padding Scale (Must match imageUtils.ts framePadding)
  const VIEWPORT_PADDING_FACTOR = 0.12;
  const paddingX = previewW * VIEWPORT_PADDING_FACTOR;
  const paddingY = previewH * VIEWPORT_PADDING_FACTOR;

  const containerStyle = {
    width: `${previewW}px`,
    height: `${previewH}px`,
    backgroundColor: '#050505',
    padding: `${paddingY}px ${paddingX}px`,
  };

  const frameBorderClass = exportMode === ExportMode.FRAME 
    ? `ring-[12px] ring-zinc-800 ring-inset ${isTablet ? 'rounded-[1.4rem]' : 'rounded-[2.4rem]'}`
    : "rounded shadow-lg";

  const getObjectFit = () => {
    switch (fitMode) {
      case FitMode.AUTOFIT: return 'cover';
      case FitMode.FIT: return 'contain';
      case FitMode.STRETCH: return 'fill';
      default: return 'cover';
    }
  };

  const filterString = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;

  return (
    <div className="flex flex-col items-center justify-center p-10 bg-zinc-900/30 rounded-[3rem] border border-zinc-800/50 backdrop-blur-xl">
      <div 
        style={containerStyle} 
        className={`${frameBorderClass} transition-all duration-300 ease-out flex items-center justify-center relative overflow-hidden bg-[#0a0a0a] shadow-2xl`}
      >
        {image ? (
          <div className={`w-full h-full relative overflow-hidden transition-all duration-500 ${isTablet ? 'rounded-[0.8rem]' : 'rounded-[1.8rem]'}`}>
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
         </div>
         <span className="text-zinc-600 text-[9px] font-mono tracking-tighter uppercase">
           Canonical Standards Enabled
         </span>
      </div>
    </div>
  );
};

export default DeviceMockup;
