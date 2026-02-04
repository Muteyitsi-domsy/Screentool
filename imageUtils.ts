
import { DeviceSpec, FitMode, ExportMode, CropArea, ImageAdjustments, Platform, DeviceType } from './types';

/**
 * Detects solid color borders in an image.
 */
export const detectBorders = (img: HTMLImageElement): CropArea => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, width: 100, height: 100 };

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const getPixel = (x: number, y: number) => {
    const i = (y * canvas.width + x) * 4;
    return [data[i], data[i+1], data[i+2]];
  };

  const isSameColor = (c1: number[], c2: number[]) => 
    Math.abs(c1[0] - c2[0]) < 5 && Math.abs(c1[1] - c2[1]) < 5 && Math.abs(c1[2] - c2[2]) < 5;

  let top = 0, bottom = img.height - 1, left = 0, right = img.width - 1;

  const edgeColor = getPixel(0, 0);
  while (top < bottom) {
    let rowUniform = true;
    for (let x = 0; x < img.width; x++) {
      if (!isSameColor(getPixel(x, top), edgeColor)) { rowUniform = false; break; }
    }
    if (!rowUniform) break;
    top++;
  }
  while (bottom > top) {
    let rowUniform = true;
    for (let x = 0; x < img.width; x++) {
      if (!isSameColor(getPixel(x, bottom), edgeColor)) { rowUniform = false; break; }
    }
    if (!rowUniform) break;
    bottom--;
  }

  return {
    x: (left / img.width) * 100,
    y: (top / img.height) * 100,
    width: ((right - left + 1) / img.width) * 100,
    height: ((bottom - top + 1) / img.height) * 100
  };
};

/**
 * Applies unsharp mask convolution for sharpness.
 */
const applySharpness = (ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) => {
  if (amount <= 0) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const output = new Uint8ClampedArray(data.length);
  
  const a = amount / 300; 
  const kernel = [
    0, -a, 0,
    -a, 1 + 4 * a, -a,
    0, -a, 0
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        output[(y * width + x) * 4 + c] = sum;
      }
      output[(y * width + x) * 4 + 3] = data[(y * width + x) * 4 + 3];
    }
  }
  ctx.putImageData(new ImageData(output, width, height), 0, 0);
};

export const processImage = async (
  imageSrc: string,
  spec: DeviceSpec,
  fitMode: FitMode,
  exportMode: ExportMode,
  adjustments: ImageAdjustments,
  cropArea: CropArea,
  frameColor: string = '#1a1a1a'
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    if (!ctx) return reject('No context');

    img.onload = () => {
      canvas.width = spec.width;
      canvas.height = spec.height;

      const isApple = spec.platform === Platform.APPLE;
      const isAndroid = spec.platform === Platform.ANDROID;
      const bgColor = "#050505";
      
      if (exportMode === ExportMode.FRAME) {
        const bgGrad = ctx.createLinearGradient(0, 0, spec.width, spec.height);
        bgGrad.addColorStop(0, "#0a0a0a");
        bgGrad.addColorStop(1, "#000");
        ctx.fillStyle = bgGrad;
      } else {
        ctx.fillStyle = bgColor;
      }
      ctx.fillRect(0, 0, spec.width, spec.height);

      let targetX = 0;
      let targetY = 0;
      let targetW = spec.width;
      let targetH = spec.height;

      // Apple-specific fit padding (Breathing Room)
      if (isApple && fitMode === FitMode.FIT) {
        const appleBreathingRoom = spec.width * 0.04; 
        targetX += appleBreathingRoom;
        targetY += appleBreathingRoom;
        targetW -= appleBreathingRoom * 2;
        targetH -= appleBreathingRoom * 2;
      }

      if (exportMode === ExportMode.FRAME) {
        const isTablet = spec.isTablet;
        const framePadding = isAndroid && isTablet 
          ? spec.width * 0.10 // Tablet bezel (10%)
          : spec.width * 0.12; // Standard/Phone bezel (12%)
          
        targetX = framePadding;
        targetY = framePadding;
        targetW = spec.width - framePadding * 2;
        targetH = spec.height - framePadding * 2;

        const bezelWidth = spec.width * 0.04;
        const bodyX = targetX - bezelWidth;
        const bodyY = targetY - bezelWidth;
        const bodyW = targetW + bezelWidth * 2;
        const bodyH = targetH + bezelWidth * 2;
        
        const bodyRadius = isTablet ? spec.width * 0.04 : spec.width * 0.1;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = spec.width * 0.1;
        ctx.shadowOffsetY = spec.width * 0.04;
        ctx.beginPath();
        ctx.roundRect(bodyX, bodyY, bodyW, bodyH, bodyRadius);
        ctx.fill();
        ctx.restore();

        const chassisGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY);
        chassisGrad.addColorStop(0, frameColor);
        chassisGrad.addColorStop(0.5, isApple ? '#ffffff22' : '#00000011'); 
        chassisGrad.addColorStop(1, frameColor);
        
        ctx.fillStyle = chassisGrad;
        ctx.beginPath();
        ctx.roundRect(bodyX, bodyY, bodyW, bodyH, bodyRadius);
        ctx.fill();

        ctx.strokeStyle = isApple ? '#ffffff11' : '#00000011';
        ctx.lineWidth = spec.width * 0.004;
        ctx.stroke();

        if (!isTablet && spec.width < spec.height) {
          if (isApple) {
             const islandW = bodyW * 0.22;
             const islandH = bodyH * 0.016;
             const islandX = bodyX + (bodyW - islandW) / 2;
             const islandY = bodyY + (bodyH * 0.024);
             ctx.fillStyle = '#000';
             ctx.beginPath();
             ctx.roundRect(islandX, islandY, islandW, islandH, islandH / 2);
             ctx.fill();
          } else {
             const notchW = bodyW * 0.05;
             const notchH = notchW;
             const notchX = bodyX + (bodyW - notchW) / 2;
             const notchY = bodyY + (bodyH * 0.024);
             ctx.fillStyle = '#080808';
             ctx.beginPath();
             ctx.arc(notchX + notchW/2, notchY + notchH/2, notchW/2, 0, Math.PI * 2);
             ctx.fill();
          }
        }
      }

      const sx = (cropArea.x / 100) * img.width;
      const sy = (cropArea.y / 100) * img.height;
      const sw = (cropArea.width / 100) * img.width;
      const sh = (cropArea.height / 100) * img.height;

      const imgRatio = sw / sh;
      const targetRatio = targetW / targetH;

      let drawW = targetW;
      let drawH = targetH;
      let drawX = targetX;
      let drawY = targetY;

      if (fitMode === FitMode.FIT) {
        if (imgRatio > targetRatio) {
          drawH = targetW / imgRatio;
          drawY = targetY + (targetH - drawH) / 2;
        } else {
          drawW = targetH * imgRatio;
          drawX = targetX + (targetW - drawW) / 2;
        }
      } else if (fitMode === FitMode.AUTOFIT) {
        // HARMONIZED ANDROID TRANSITION
        // We match Height instead of Width to prevent UI stretching when moving
        // from Phone (9:16) to Tablet (10:16).
        if (isAndroid && spec.isTablet && imgRatio < targetRatio) {
           drawH = targetH;
           drawW = targetH * imgRatio;
           drawX = targetX + (targetW - drawW) / 2;
        } else if (imgRatio > targetRatio) {
          drawW = targetH * imgRatio;
          drawX = targetX + (targetW - drawW) / 2;
        } else {
          drawH = targetW / imgRatio;
          drawY = targetY + (targetH - drawH) / 2;
        }
      }

      ctx.save();
      if (exportMode === ExportMode.FRAME) {
        const isTablet = spec.isTablet;
        const screenRadius = isTablet ? spec.width * 0.03 : spec.width * 0.08;
        ctx.beginPath();
        ctx.roundRect(targetX, targetY, targetW, targetH, screenRadius);
        ctx.clip();
      }
      
      ctx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;
      ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, drawW, drawH);
      
      if (adjustments.sharpness > 0) {
        applySharpness(ctx, canvas.width, canvas.height, adjustments.sharpness);
      }
      ctx.restore();

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject('Processing failed');
      }, 'image/png');
    };

    img.onerror = () => reject('Load error');
    img.src = imageSrc;
  });
};
