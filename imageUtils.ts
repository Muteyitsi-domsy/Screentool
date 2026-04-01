
import { DeviceSpec, FitMode, ExportMode, CropArea, ImageAdjustments, Platform, DeviceType } from './types';

/**
 * Detects whether a system bar (status bar or nav bar) is present in a given
 * horizontal band of the image.
 *
 * Approach: scale the source down to 80 px wide for fast pixel access, then
 * sample the row at the midpoint of the expected crop band.  If ≥ 70 % of
 * sampled pixels are within ±30 RGB of the first pixel the band is considered
 * a uniform system bar and the crop should be applied.  If the band contains
 * varied app content the crop is skipped.
 *
 * Returns true  → bar detected, apply the crop.
 * Returns false → no bar (clean screenshot / already processed), skip crop.
 */
export const hasSystemBar = (img: HTMLImageElement, cropPx: number, fromBottom: boolean): boolean => {
  const SW = 80; // sample width — enough columns for reliable detection
  const SH = Math.max(1, Math.round(img.height * SW / img.width));
  const sc = document.createElement('canvas');
  sc.width  = SW;
  sc.height = SH;
  const sCtx = sc.getContext('2d', { willReadFrequently: true });
  if (!sCtx) return true; // can't sample → assume bar present (safe default)
  sCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, SW, SH);

  // Row at 12 % into the expected bar band (from the relevant edge).
  // Sampling at the midpoint (50 %) was overshooting: for a 280 px top band
  // the midpoint lands at ~135 px, well past the ~40-60 px status bar and
  // into the browser chrome, which has varied content and breaks detection.
  // 12 % ≈ 33 px from the edge — squarely within the status/nav bar itself.
  const scaledCrop = Math.round(cropPx * SH / img.height);
  const checkY = fromBottom
    ? SH - Math.max(1, Math.round(scaledCrop * 0.12))
    : Math.max(0, Math.round(scaledCrop * 0.12));
  const y = Math.max(0, Math.min(checkY, SH - 1));

  const row = sCtx.getImageData(0, y, SW, 1).data;
  const r0 = row[0], g0 = row[1], b0 = row[2];
  const TOLERANCE = 30;
  let similar = 0;
  for (let x = 0; x < SW; x++) {
    const i = x * 4;
    if (Math.abs(row[i]   - r0) < TOLERANCE &&
        Math.abs(row[i+1] - g0) < TOLERANCE &&
        Math.abs(row[i+2] - b0) < TOLERANCE) similar++;
  }
  // 70 %+ uniform pixels → system bar; otherwise app content → skip crop
  return similar / SW >= 0.70;
};

/**
 * Automatic Apple App Store screenshot pipeline.
 *
 * Given a raw Android screenshot, this function:
 *   1. Crops bars: 280 px top (status bar / Dynamic Island) + 160 px bottom (nav bar) at 1080 px ref.
 *   2. Phone targets: fills canvas completely — no padding bars ever.
 *      If source is wider than target AR → scale to fill height, crop sides symmetrically.
 *      If source is more portrait than target AR → scale to fill width, crop height from top.
 *   3. iPad target: uses the blurred-background technique —
 *      background is the same image scaled to fill canvas width, blurred at
 *      28 px and darkened to 55 % brightness with a 25 % black overlay,
 *      then the phone-height-fitted image is composited centred on top.
 */
export const processAppleQuick = (
  imageSrc: string,
  spec: DeviceSpec
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // ── Step 1: proportional bar crop ─────────────────────────────────────
      // Reference values calibrated at 1080 px width, scaled to source density.
      // 280 px top / 120 px bottom is the empirically derived crop that fully
      // removes the notification bar + Dynamic Island on modern devices.
      // (Equivalent to two sequential 140/60 px crops, which was found to work
      // in practice — applied directly here to avoid chaining image passes.)
      const scale = img.width / 1080;
      const TOP_REF    = Math.round(280 * scale);
      const BOTTOM_REF = Math.round(160 * scale);
      // Only crop if the band actually looks like a system bar.
      // Clean screenshots (design exports, already-processed images) are left untouched.
      const topCrop    = hasSystemBar(img, TOP_REF,    false) ? TOP_REF    : 0;
      const bottomCrop = hasSystemBar(img, BOTTOM_REF, true)  ? BOTTOM_REF : 0;
      const croppedH   = img.height - topCrop - bottomCrop;

      if (croppedH <= 0) { reject('Crop exceeds image height'); return; }

      const croppedAR = img.width / croppedH;
      const targetW   = spec.width;
      const targetH   = spec.height;
      const targetAR  = targetW / targetH;

      const canvas = document.createElement('canvas');
      canvas.width  = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject('No canvas context'); return; }

      if (spec.id === DeviceType.IPAD) {
        // ── iPad: blurred-background technique ────────────────────────────
        // Background layer: scale to fill canvas width, blur 28 px,
        // brightness 55 %, then 25 % black overlay.
        const bgW  = targetW;
        const bgH  = croppedH * (targetW / img.width);
        const bgY  = (targetH - bgH) / 2;
        const blurPad = 60; // extra draw margin so blur edges are clean

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, targetW, targetH);
        ctx.clip();
        ctx.filter = 'blur(28px) brightness(55%)';
        ctx.drawImage(
          img,
          0, topCrop, img.width, croppedH,
          -blurPad, bgY - blurPad, bgW + blurPad * 2, bgH + blurPad * 2
        );
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();

        // Foreground: scale cropped image to fill full canvas height.
        const fgH = targetH;
        const fgW = croppedAR * fgH;
        const fgX = (targetW - fgW) / 2;
        ctx.drawImage(img, 0, topCrop, img.width, croppedH, fgX, 0, fgW, fgH);

      } else {
        // ── Phone: fill canvas completely — no padding bars ───────────────
        // Compare source AR to target AR to decide which axis to fill:
        //   source wider than target  → scale to fill height, crop width symmetrically
        //   source more portrait      → scale to fill width,  crop height from top
        if (croppedAR >= targetAR) {
          // Source is wider: fill full canvas height, trim sides symmetrically
          const srcWForTarget = Math.round((targetAR / croppedAR) * img.width);
          const srcXStart     = Math.round((img.width - srcWForTarget) / 2);
          ctx.drawImage(
            img,
            srcXStart, topCrop, srcWForTarget, croppedH,
            0, 0, targetW, targetH
          );
        } else {
          // Source is more portrait: fill full canvas width, crop height from top
          // (when croppedAR < targetAR, scaling to width always produces scaledH > targetH)
          const srcHForTarget = Math.round(img.width * targetH / targetW);
          ctx.drawImage(
            img,
            0, topCrop, img.width, srcHForTarget,
            0, 0, targetW, targetH
          );
        }
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject('toBlob returned null');
      }, 'image/png');
    };

    img.onerror = () => reject('Image load error');
    img.src = imageSrc;
  });
};

/**
 * Google Play screenshot pipeline.
 *
 * Accepts any input (Android, Apple, or designed screenshot) and outputs a
 * PNG that meets Google Play aspect-ratio and dimension requirements.
 *
 *   1. Crops status bar / Dynamic Island (140 px ref) and nav bar / home indicator (60 px ref),
 *      proportionally scaled to source density (calibrated at 1080 px reference width).
 *
 * Phone (1080×1920):
 *   Scale cropped image to 1080 wide. If scaled height > 1920, crop from the
 *   top (keeps top content — headline/UI). If scaled height < 1920, pad
 *   vertically using the source's top-left pixel colour.
 *
 * Tablets (isTablet = true):
 *   Blurred-background technique — cropped source is scaled to fill canvas
 *   width, blurred 24 px and darkened to 55 % brightness, then the cropped
 *   source scaled to fit is composited centred on top.
 */
export const processAndroidQuick = (
  imageSrc: string,
  spec: DeviceSpec
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const targetW = spec.width;
      const targetH = spec.height;

      // ── Step 1: proportional bar crop (detection-gated) ──────────────────
      // Reference values calibrated at 1080 px width, scaled to source density.
      // Each crop is only applied if the band actually looks like a uniform
      // system bar — clean / already-processed screenshots are left untouched.
      const densityScale = img.width / 1080;
      const TOP_REF    = Math.round(280 * densityScale);
      const BOTTOM_REF = Math.round((spec.isTablet ? 140 : 120) * densityScale);
      const topCrop    = hasSystemBar(img, TOP_REF,    false) ? TOP_REF    : 0;
      const bottomCrop = hasSystemBar(img, BOTTOM_REF, true)  ? BOTTOM_REF : 0;
      const croppedH   = img.height - topCrop - bottomCrop;

      if (croppedH <= 0) { reject('Crop exceeds image height'); return; }

      const canvas = document.createElement('canvas');
      canvas.width  = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject('No canvas context'); return; }

      if (spec.isTablet) {
        // ── Tablet: blurred-background technique ──────────────────────────
        const bgW  = targetW;
        const bgH  = croppedH * (targetW / img.width);
        const bgY  = (targetH - bgH) / 2;
        const blurPad = 40;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, targetW, targetH);
        ctx.clip();
        ctx.filter = 'blur(24px) brightness(55%)';
        ctx.drawImage(
          img,
          0, topCrop, img.width, croppedH,
          -blurPad, bgY - blurPad, bgW + blurPad * 2, bgH + blurPad * 2
        );
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();

        // Foreground: scale cropped source to fit within canvas, centred
        const fgScale = Math.min(targetW / img.width, targetH / croppedH);
        const fgW = img.width  * fgScale;
        const fgH = croppedH   * fgScale;
        const fgX = (targetW - fgW) / 2;
        const fgY = (targetH - fgH) / 2;
        ctx.drawImage(img, 0, topCrop, img.width, croppedH, fgX, fgY, fgW, fgH);

      } else {
        // ── Phone: scale to target width, crop or pad to target height ─────
        const scaledH = croppedH * (targetW / img.width);

        if (scaledH > targetH) {
          // Too tall → keep top portion (preserve headline / main content)
          const srcHForTarget = (targetH / scaledH) * croppedH;
          ctx.drawImage(
            img,
            0, topCrop, img.width, srcHForTarget,
            0, 0, targetW, targetH
          );
        } else {
          // Too short → pad vertically, centred, with sampled background colour
          const sampleCanvas = document.createElement('canvas');
          sampleCanvas.width  = 1;
          sampleCanvas.height = 1;
          const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
          if (sampleCtx) {
            sampleCtx.drawImage(img, 0, topCrop, 1, 1, 0, 0, 1, 1);
            const px = sampleCtx.getImageData(0, 0, 1, 1).data;
            ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
            ctx.fillRect(0, 0, targetW, targetH);
          }
          const yOffset = (targetH - scaledH) / 2;
          ctx.drawImage(img, 0, topCrop, img.width, croppedH, 0, yOffset, targetW, scaledH);
        }
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject('toBlob returned null');
      }, 'image/png');
    };

    img.onerror = () => reject('Image load error');
    img.src = imageSrc;
  });
};

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

      // Apple-specific fit padding (Breathing Room) — FRAME mode only
      if (isApple && fitMode === FitMode.FIT && exportMode === ExportMode.FRAME) {
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

      if (fitMode === FitMode.FIT) {
        if (imgRatio > targetRatio) {
          drawH = targetW / imgRatio;
        } else {
          drawW = targetH * imgRatio;
        }
      } else if (fitMode === FitMode.AUTOFIT) {
        if (spec.isTablet && imgRatio < targetRatio) {
           drawH = targetH;
           drawW = targetH * imgRatio;
        } else if (imgRatio > targetRatio) {
          drawW = targetH * imgRatio;
        } else {
          drawH = targetW / imgRatio;
        }
      }

      // Apply iPad presentation scale adjustment (0.92) — FRAME mode only
      if (spec.id === DeviceType.IPAD && exportMode === ExportMode.FRAME) {
        drawW *= 0.92;
        drawH *= 0.92;
      }

      // Final Unified Centering calculation
      const drawX = targetX + (targetW - drawW) / 2;
      const drawY = targetY + (targetH - drawH) / 2;

      // Ambient blurred fill — tablets in AUTOFIT when screenshot is narrower than the canvas.
      // Scales the screenshot to fill width, blurs it heavily, and darkens it to create an
      // ambient colour extension. The sharp screenshot is then drawn centered on top.
      // This produces App Store-ready iPad screenshots from phone assets with no user effort.
      if (spec.isTablet && fitMode === FitMode.AUTOFIT && imgRatio < targetRatio) {
        const bgDrawW = targetW;
        const bgDrawH = targetW / imgRatio;
        const bgDrawX = targetX;
        const bgDrawY = targetY + (targetH - bgDrawH) / 2;
        const blurPx = Math.round(spec.width * 0.025); // ~51px on iPad 2048

        ctx.save();
        ctx.beginPath();
        ctx.rect(targetX, targetY, targetW, targetH);
        ctx.clip();
        ctx.filter = `blur(${blurPx}px) brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;
        ctx.drawImage(img, sx, sy, sw, sh, bgDrawX, bgDrawY, bgDrawW, bgDrawH);
        ctx.filter = 'none';
        // Dark veil so the background reads as ambient colour, not blurred content
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(targetX, targetY, targetW, targetH);
        ctx.restore();
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
