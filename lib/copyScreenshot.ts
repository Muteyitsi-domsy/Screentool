
import { DeviceSpec, DeviceType } from '../types';

export interface CopyData {
  eyebrow: string;
  headline: string;  // may contain [em]...[/em] markup for italic gold words
  subhead: string;
  pills: [string, string, string];
  appName: string;
}

// Warm earthy palette for pill dots
const PILL_COLORS: [string, string, string] = ['#C49A5E', '#8B6F5C', '#A08060'];

// ─── Background palette from screenshot ───────────────────────────────────────

/**
 * Samples a 16×16 thumbnail of the canvas, averages all pixels, then blends
 * 22% of that colour into a warm cream base.  This gives a background that
 * subtly reflects the app's colour palette rather than a fixed pink/cream.
 */
function samplePaletteColor(canvas: HTMLCanvasElement): { top: string; bottom: string } {
  const sc = document.createElement('canvas');
  sc.width = 16; sc.height = 16;
  const sCtx = sc.getContext('2d', { willReadFrequently: true });
  if (!sCtx) return { top: '#F9F2E9', bottom: '#EDE4D6' };
  sCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 16, 16);
  const d = sCtx.getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0;
  const n = 256; // 16×16
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const ar = r / n, ag = g / n, ab = b / n;
  // Cream base: rgb(249,242,233) → rgb(237,228,214)
  // Blend 22 % screenshot avg into cream to complement not overpower
  const mix = (src: number, base: number) => Math.round(base * 0.78 + src * 0.22);
  const tr = mix(ar, 249), tg = mix(ag, 242), tb = mix(ab, 233);
  const br = Math.round(tr * 0.94), bg = Math.round(tg * 0.94), bb = Math.round(tb * 0.94);
  return { top: `rgb(${tr},${tg},${tb})`, bottom: `rgb(${br},${bg},${bb})` };
}

// ─── Headline parsing ─────────────────────────────────────────────────────────

function parseHeadline(text: string): Array<{ word: string; italic: boolean }> {
  const tokens: Array<{ word: string; italic: boolean }> = [];
  const parts = text.split(/(\[em\]|\[\/em\])/);
  let italic = false;
  for (const part of parts) {
    if (part === '[em]') { italic = true; continue; }
    if (part === '[/em]') { italic = false; continue; }
    const words = part.split(/\s+/).filter(w => w.length > 0);
    for (const word of words) tokens.push({ word, italic });
  }
  return tokens;
}

function headlineFont(italic: boolean, size: number): string {
  return `${italic ? 'italic ' : ''}400 ${size}px "Cormorant Garamond", Georgia, serif`;
}

function measureWordRun(
  ctx: CanvasRenderingContext2D,
  words: Array<{ word: string; italic: boolean }>,
  size: number
): number {
  let total = 0;
  let run = '';
  let runItalic: boolean | null = null;
  const flush = () => {
    if (!run) return;
    ctx.font = headlineFont(runItalic!, size);
    total += ctx.measureText(run).width;
    run = '';
  };
  for (const { word, italic } of words) {
    if (runItalic !== null && italic !== runItalic) flush();
    runItalic = italic;
    run += (run ? ' ' : '') + word;
  }
  flush();
  return total;
}

/**
 * Greedy word-wrap that respects [em] italic boundaries.
 * Returns lines, where each line is an array of {text, italic} segments.
 */
function wrapHeadline(
  ctx: CanvasRenderingContext2D,
  tokens: Array<{ word: string; italic: boolean }>,
  size: number,
  maxW: number
): Array<Array<{ text: string; italic: boolean }>> {
  const lines: Array<Array<{ word: string; italic: boolean }>> = [[]];

  for (const token of tokens) {
    const current = lines[lines.length - 1];
    const candidate = [...current, token];
    if (current.length > 0 && measureWordRun(ctx, candidate, size) > maxW) {
      lines.push([token]);
    } else {
      current.push(token);
    }
  }

  // Convert word-token lines into segment-text lines
  return lines.map(lineWords => {
    const segs: Array<{ text: string; italic: boolean }> = [];
    for (const { word, italic } of lineWords) {
      const last = segs[segs.length - 1];
      if (last && last.italic === italic) {
        last.text += ' ' + word;
      } else {
        segs.push({ text: word, italic });
      }
    }
    return segs;
  });
}

function drawHeadlineLines(
  ctx: CanvasRenderingContext2D,
  lines: Array<Array<{ text: string; italic: boolean }>>,
  centerX: number,
  firstBaseline: number,
  size: number,
  lineH: number
): void {
  lines.forEach((line, i) => {
    const y = firstBaseline + i * lineH;
    let totalW = 0;
    for (const seg of line) {
      ctx.font = headlineFont(seg.italic, size);
      totalW += ctx.measureText(seg.text).width;
    }
    let x = centerX - totalW / 2;
    for (const seg of line) {
      ctx.font = headlineFont(seg.italic, size);
      ctx.fillStyle = seg.italic ? '#C49A5E' : '#1C1410';
      ctx.textAlign = 'left';
      ctx.fillText(seg.text, x, y);
      x += ctx.measureText(seg.text).width;
    }
  });
}

// ─── Subhead word-wrap ────────────────────────────────────────────────────────

/**
 * Simple greedy word-wrap for plain subhead text.
 * Returns array of lines that each fit within maxW at the current ctx.font.
 */
function wrapSubhead(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number
): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ─── Pills ────────────────────────────────────────────────────────────────────

function drawPills(
  ctx: CanvasRenderingContext2D,
  pills: [string, string, string],
  centerX: number,
  centerY: number,
  fontSize: number,
  maxTotalW: number   // hard width budget — auto-shrinks font until pills fit
): void {
  // Reduce fontSize until all three pills fit within maxTotalW (min 8 px).
  let fz = fontSize;
  let dotR = 0, padH = 0, padV = 0, pillH = 0, pillR = 0, gap = 0;
  let pillWidths: number[] = [];
  let totalW = 0;

  for (let attempt = 0; attempt < 10; attempt++) {
    dotR  = Math.round(fz * 0.22);
    padH  = Math.round(fz * 0.55);
    padV  = Math.round(fz * 0.5);
    pillH = fz + padV * 2;
    pillR = pillH / 2;
    gap   = Math.round(fz * 0.9);
    ctx.font = `500 ${fz}px "DM Sans", system-ui, sans-serif`;
    pillWidths = pills.map(p => dotR * 2 + Math.round(padH * 0.5) + ctx.measureText(p).width + padH);
    totalW = pillWidths.reduce((a, b) => a + b, 0) + gap * (pills.length - 1);
    if (totalW <= maxTotalW || fz <= 8) break;
    fz = Math.max(8, Math.floor(fz * 0.88));
  }

  let px = centerX - totalW / 2;

  pills.forEach((text, i) => {
    const pw = pillWidths[i];
    const pillTopY = centerY - pillH / 2;

    // Pill background
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.strokeStyle = 'rgba(180,150,110,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px, pillTopY, pw, pillH, pillR);
    ctx.fill();
    ctx.stroke();

    // Dot
    const dotX = px + Math.round(padH * 0.4) + dotR;
    ctx.fillStyle = PILL_COLORS[i];
    ctx.beginPath();
    ctx.arc(dotX, centerY, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.font = `500 ${fz}px "DM Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#4A3728';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, dotX + dotR + Math.round(padH * 0.3), centerY);

    px += pw + gap;
  });

  ctx.textBaseline = 'alphabetic';
}

// ─── App name label (with flanking lines) ─────────────────────────────────────

function drawAppName(
  ctx: CanvasRenderingContext2D,
  appName: string,
  centerX: number,
  baselineY: number,
  fontSize: number
): void {
  ctx.font = `400 ${fontSize}px "DM Sans", system-ui, sans-serif`;
  ctx.fillStyle = '#9A8570';
  ctx.textAlign = 'left';
  const textW = ctx.measureText(appName).width;
  const gap = Math.round(fontSize * 0.7);
  const lineLen = Math.max(60, Math.round(centerX * 0.22));

  // Left line
  ctx.strokeStyle = 'rgba(180,150,110,0.35)';
  ctx.lineWidth = 1;
  const lineY = baselineY - Math.round(fontSize * 0.32);
  ctx.beginPath();
  ctx.moveTo(centerX - textW / 2 - gap - lineLen, lineY);
  ctx.lineTo(centerX - textW / 2 - gap, lineY);
  ctx.stroke();

  // Text
  ctx.fillText(appName, centerX - textW / 2, baselineY);

  // Right line
  ctx.beginPath();
  ctx.moveTo(centerX + textW / 2 + gap, lineY);
  ctx.lineTo(centerX + textW / 2 + gap + lineLen, lineY);
  ctx.stroke();
}

// ─── Phone mockup ─────────────────────────────────────────────────────────────

function drawPhoneMockup(
  ctx: CanvasRenderingContext2D,
  screenshotImg: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const bodyR = Math.round(w * 0.09);

  // Drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(50, 30, 10, 0.30)';
  ctx.shadowBlur = Math.round(w * 0.09);
  ctx.shadowOffsetY = Math.round(w * 0.035);

  // Body — warm champagne gradient
  const bodyGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  bodyGrad.addColorStop(0, '#D9CAB6');
  bodyGrad.addColorStop(0.45, '#C6B49E');
  bodyGrad.addColorStop(1, '#A8916F');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, bodyR);
  ctx.fill();
  ctx.restore();

  // Subtle rim highlight
  ctx.save();
  ctx.strokeStyle = 'rgba(255,245,228,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, bodyR - 1);
  ctx.stroke();
  ctx.restore();

  // Screen area
  const sideBezel  = Math.round(w * 0.038);
  const topBezel   = Math.round(w * 0.052);
  const botBezel   = Math.round(w * 0.042);
  const screenX    = x + sideBezel;
  const screenY    = y + topBezel;
  const screenW    = w - sideBezel * 2;
  const screenH    = h - topBezel - botBezel;
  const screenR    = Math.round(bodyR * 0.72);

  // Clip + fill screen
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(screenX, screenY, screenW, screenH, screenR);
  ctx.clip();

  ctx.fillStyle = '#080808';
  ctx.fillRect(screenX, screenY, screenW, screenH);

  // Screenshot fill (cover) — bars already stripped from screenshotImg
  const imgAR    = screenshotImg.width / screenshotImg.height;
  const screenAR = screenW / screenH;
  let dw = screenW, dh = screenH, dx = screenX, dy = screenY;
  if (imgAR > screenAR) {
    dw = screenH * imgAR;
    dx = screenX - (dw - screenW) / 2;
  } else {
    dh = screenW / imgAR;
    dy = screenY - (dh - screenH) / 2;
  }
  ctx.drawImage(screenshotImg as CanvasImageSource, dx, dy, dw, dh);

  // Subtle top-left glare
  const glare = ctx.createLinearGradient(screenX, screenY, screenX + screenW * 0.5, screenY + screenH * 0.25);
  glare.addColorStop(0, 'rgba(255,255,255,0.07)');
  glare.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(screenX, screenY, screenW, screenH);
  ctx.restore();

  // Dynamic Island
  const diW = Math.round(w * 0.285);
  const diH = Math.round(w * 0.033);
  const diX = x + Math.round((w - diW) / 2);
  const diY = y + Math.round(topBezel * 0.35);
  ctx.fillStyle = '#080808';
  ctx.beginPath();
  ctx.roundRect(diX, diY, diW, diH, Math.round(diH / 2));
  ctx.fill();
}

// ─── Bar stripping helper ─────────────────────────────────────────────────────

/**
 * Returns an offscreen canvas with the status bar (top) and nav bar (bottom)
 * always cropped out — no detection, hard rule.
 *
 * Detection was intentionally removed: the status bar background often matches
 * the app's own background colour (e.g. a web app with a dark theme), making
 * pixel-uniformity tests unreliable.  For the Copy Design path the crop values
 * are well-calibrated (280 px top / 160 px bottom at 1080 px reference) and
 * the strip is invisible once the screenshot is scaled into the phone mockup.
 */
function stripBars(img: HTMLImageElement): HTMLCanvasElement {
  const scale      = img.width / 1080;
  // Always apply — hard rule: Android system UI must never appear in Apple output.
  const topCrop    = Math.round(280 * scale);
  const bottomCrop = Math.round(160 * scale);
  const croppedH   = Math.max(1, img.height - topCrop - bottomCrop);

  const sc = document.createElement('canvas');
  sc.width  = img.width;
  sc.height = croppedH;
  const sCtx = sc.getContext('2d');
  if (sCtx) {
    sCtx.drawImage(img, 0, topCrop, img.width, croppedH, 0, 0, img.width, croppedH);
  }
  return sc;
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export const renderCopyDesign = (
  screenshotSrc: string,
  spec: DeviceSpec,
  copy: CopyData
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = async () => {
      const isIpad    = spec.id === DeviceType.IPAD;
      const canvasW   = spec.width;
      const canvasH   = spec.height;
      const centerX   = Math.round(canvasW / 2);

      // ── Strip system bars (hard rule for Apple output) ───────────────────
      const stripped = stripBars(img);

      // ── Sample palette colour from stripped screenshot ───────────────────
      const palette = samplePaletteColor(stripped);

      // ── Responsive sizing — scale to canvas so Android/small canvases fit ──
      // Derive a size scale from canvas width relative to the iPhone 6.9" reference (1284px).
      // This shrinks fonts and mockup proportionally on smaller Android canvases.
      const sizeScale = Math.min(1, canvasW / 1284);

      // Font sizes — subhead increased for legibility
      const hlSize  = Math.round((isIpad ? 130 : 88) * sizeScale);
      const shSize  = Math.round((isIpad ? 48  : 34) * sizeScale);
      const ewSize  = Math.round((isIpad ? 30  : 22) * sizeScale);
      const plSize  = Math.round((isIpad ? 36  : 24) * sizeScale);
      const anSize  = Math.round((isIpad ? 30  : 24) * sizeScale);

      // Mockup dimensions — cap by canvas height so it always fits
      // Allow at most 62 % of canvas height for the mockup (leaves room for text + app name).
      const mockupMaxByH = Math.round(canvasH * 0.62 * 9 / 19); // width that gives 62 % canvas height
      const mockupMaxByW = Math.round(canvasW * 0.72);
      const mockupW = Math.min(mockupMaxByH, mockupMaxByW, 880); // 880 is the iPhone ceiling
      const mockupH = Math.round(mockupW * (19 / 9));

      const canvas  = document.createElement('canvas');
      canvas.width  = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject('No canvas context'); return; }

      // Wait for fonts (best-effort — silent fail in test environments)
      try {
        await Promise.all([
          document.fonts.load(`400 ${hlSize}px "Cormorant Garamond"`),
          document.fonts.load(`italic 400 ${hlSize}px "Cormorant Garamond"`),
          document.fonts.load(`600 ${ewSize}px "DM Sans"`),
          document.fonts.load(`300 ${shSize}px "DM Sans"`),
          document.fonts.load(`500 ${plSize}px "DM Sans"`),
        ]);
      } catch (_) { /* continue */ }

      // ── Background — palette-tinted, not fixed cream ─────────────────────
      // iPad AND Android tablets both use the blurred-screenshot background.
      const useBlurBg = isIpad || (spec.isTablet ?? false);
      if (useBlurBg) {
        // Dark base
        ctx.fillStyle = '#18120A';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Blurred stripped screenshot as ambient background
        const blurPad = 90;
        const bgNaturalH = Math.round((stripped.height / stripped.width) * canvasW);
        const bgY = Math.round((canvasH - bgNaturalH) / 2);

        ctx.save();
        ctx.filter = 'blur(36px) brightness(42%) saturate(75%)';
        ctx.drawImage(
          stripped,
          -blurPad, bgY - blurPad,
          canvasW + blurPad * 2, bgNaturalH + blurPad * 2
        );
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.restore();

        // Palette-tinted cream center band.
        // Gradient is expressed as fractions of canvasW so the blur ALWAYS
        // shows at the edges regardless of canvas width (fixes tablets where
        // the old mockupW+720 band was wider than the canvas, making 100%
        // of the canvas opaque and burying the blur entirely).
        const solidC = palette.top.replace('rgb(', 'rgba(').replace(')', ',0.97)');
        const creamGrad = ctx.createLinearGradient(0, 0, canvasW, 0);
        creamGrad.addColorStop(0,    'rgba(0,0,0,0)');
        creamGrad.addColorStop(0.10, solidC);
        creamGrad.addColorStop(0.90, solidC);
        creamGrad.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = creamGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);

      } else {
        // Palette-tinted warm gradient
        const bgGrad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
        bgGrad.addColorStop(0, palette.top);
        bgGrad.addColorStop(1, palette.bottom);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      // Radial glows (work on both variants)
      const addGlow = (cx: number, cy: number, r: number, color: string) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvasW, canvasH);
      };
      addGlow(canvasW * 0.18, canvasH * 0.11, canvasW * 0.75, 'rgba(210,155,80,0.20)');
      addGlow(canvasW * 0.88, canvasH * 0.38, canvasW * 0.50, 'rgba(195,135,100,0.13)');

      // ── Text block ──────────────────────────────────────────────────────────
      // All gap / spacing values scale with sizeScale so that on narrow
      // Android tablet canvases (600/800 px) the text block stays compact
      // and never pushes past the mockup top boundary.
      const sp = sizeScale; // shorthand
      const textMaxW = isIpad
        ? Math.min(Math.round(canvasW * 0.68), 1450)
        : Math.min(Math.round(canvasW * 0.82), 1100);

      let curY = Math.round(110 * sp);

      // Eyebrow
      ctx.font = `600 ${ewSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = '#B8925A';
      ctx.textAlign = 'center';
      try { (ctx as any).letterSpacing = `${Math.round(ewSize * 0.22)}px`; } catch (_) {}
      ctx.fillText(copy.eyebrow.toUpperCase(), centerX, curY + ewSize);
      try { (ctx as any).letterSpacing = '0px'; } catch (_) {}
      curY += ewSize + Math.round((isIpad ? 38 : 35) * sp);

      // Headline
      const hlTokens   = parseHeadline(copy.headline);
      const hlLines    = wrapHeadline(ctx, hlTokens, hlSize, textMaxW);
      const hlLineH    = Math.round(hlSize * 1.08);
      const hlBaseline = curY + hlSize;
      drawHeadlineLines(ctx, hlLines, centerX, hlBaseline, hlSize, hlLineH);
      curY = hlBaseline + (hlLines.length - 1) * hlLineH + Math.round((isIpad ? 32 : 28) * sp);

      // Subhead — wrapped, multi-line
      ctx.font = `300 ${shSize}px "DM Sans", system-ui, sans-serif`;
      ctx.fillStyle = '#7A6A5A';
      ctx.textAlign = 'center';
      const shLines = wrapSubhead(ctx, copy.subhead, textMaxW);
      const shLineH = Math.round(shSize * 1.45);
      for (let li = 0; li < shLines.length; li++) {
        ctx.fillText(shLines[li], centerX, curY + shSize + li * shLineH);
      }
      curY += shSize + (shLines.length - 1) * shLineH + Math.round((isIpad ? 44 : 42) * sp);

      // Connector line
      const connLen = Math.round((isIpad ? 58 : 44) * sp);
      ctx.strokeStyle = 'rgba(196,154,94,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, curY);
      ctx.lineTo(centerX, curY + connLen);
      ctx.stroke();
      curY += connLen + Math.round((isIpad ? 22 : 18) * sp);

      // Pills — pass textMaxW as hard width budget so they never overflow narrow canvases
      const pillH = Math.round(plSize * 1.8);
      drawPills(ctx, copy.pills, centerX, curY + Math.round(pillH / 2), plSize, textMaxW);
      curY += pillH + Math.round((isIpad ? 32 : 28) * sp);

      // ── Phone mockup — positioned dynamically below the text block ──────────
      // Gap also scales so small canvases don't waste vertical space
      const mockupGap  = Math.round((isIpad ? 80 : 60) * sp);
      // Hard floor to prevent overflow at bottom of canvas (app name must fit)
      const appNameRoom = Math.round(anSize * 2.5);
      const mockupYMax  = canvasH - mockupH - appNameRoom;
      const mockupY     = Math.min(Math.round(curY + mockupGap), mockupYMax);
      const mockupX     = Math.round((canvasW - mockupW) / 2);

      drawPhoneMockup(ctx, stripped, mockupX, mockupY, mockupW, mockupH);

      // ── App name ────────────────────────────────────────────────────────────
      const appNameBaseline = mockupY + mockupH + Math.round(anSize * 2.0);
      drawAppName(ctx, copy.appName, centerX, appNameBaseline, anSize);

      // ── Export ──────────────────────────────────────────────────────────────
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject('toBlob returned null');
      }, 'image/png');
    };

    img.onerror = () => reject('Image load error');
    img.src = screenshotSrc;
  });
};
