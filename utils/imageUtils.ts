
import { DeviceSpec, FitMode, ExportMode, CropArea, ImageAdjustments } from '../types';

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

const applySharpness = (ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) => {
  if (amount <= 0) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const output = new Uint8ClampedArray(data.length);
  const a = amount / 300; 
  const kernel = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];

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
  cropArea: CropArea
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    if (!ctx) return reject('No context');

    img.onload = () => {
      canvas.width = spec.width;
      canvas.height = spec.height;
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, spec.width, spec.height);

      // --- INVARIANT: Shared Viewport Logic ---
      // Both RECT and FRAME share the same canonical content bounds.
      // The only difference is the visual shell drawn around it.
      const framePadding = spec.width * 0.12;
      const targetX = framePadding;
      const targetY = framePadding;
      const targetW = spec.width - framePadding * 2;
      const targetH = spec.height - framePadding * 2;

      // Draw Device Shell if requested
      if (exportMode === ExportMode.FRAME) {
        const bezel = spec.width * 0.04;
        const bodyX = targetX - bezel, bodyY = targetY - bezel, bodyW = targetW + bezel * 2, bodyH = targetH + bezel * 2;
        const bodyRadius = spec.isTablet ? spec.width * 0.05 : spec.width * 0.1;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = spec.width * 0.1;
        ctx.shadowOffsetY = spec.width * 0.05;
        
        const chassisGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
        chassisGrad.addColorStop(0, '#1a1a1a');
        chassisGrad.addColorStop(1, '#050505');
        ctx.fillStyle = chassisGrad;

        ctx.beginPath();
        ctx.roundRect(bodyX, bodyY, bodyW, bodyH, bodyRadius);
        ctx.fill();
        ctx.restore();
      }

      // Draw Canonical Viewport Content
      const sx = (cropArea.x / 100) * img.width;
      const sy = (cropArea.y / 100) * img.height;
      const sw = (cropArea.width / 100) * img.width;
      const sh = (cropArea.height / 100) * img.height;

      const imgRatio = sw / sh;
      const targetRatio = targetW / targetH;

      let drawW = targetW, drawH = targetH, drawX = targetX, drawY = targetY;

      if (fitMode === FitMode.FIT) {
        if (imgRatio > targetRatio) {
          drawH = targetW / imgRatio;
          drawY = targetY + (targetH - drawH) / 2;
        } else {
          drawW = targetH * imgRatio;
          drawX = targetX + (targetW - drawW) / 2;
        }
      } else if (fitMode === FitMode.AUTOFIT) {
        if (imgRatio > targetRatio) {
          drawW = targetH * imgRatio;
          drawX = targetX + (targetW - drawW) / 2;
        } else {
          drawH = targetW / imgRatio;
          drawY = targetY + (targetH - drawH) / 2;
        }
      }

      ctx.save();
      const screenRadius = spec.isTablet ? spec.width * 0.04 : spec.width * 0.08;
      ctx.beginPath();
      ctx.roundRect(targetX, targetY, targetW, targetH, screenRadius);
      ctx.clip();
      
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
