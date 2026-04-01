/**
 * Reliability tests — Image processing (imageUtils.ts)
 * Canvas is mocked in vitest.setup.ts; Image load is stubbed below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectBorders, processImage, processAppleQuick, processAndroidQuick, hasSystemBar } from '../imageUtils';
import { DEVICE_SPECS } from '../constants';
import { DeviceType, FitMode, ExportMode, Platform } from '../types';

// ─── Stub for HTMLImageElement ────────────────────────────────────────────
// jsdom's Image never fires onload; we replace it with a class that fires
// onload asynchronously as soon as src is set, matching real browser behaviour.
class MockImage {
  width = 400;
  height = 800;
  onload: (() => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private _src = '';

  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    Promise.resolve().then(() => this.onload?.());
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', MockImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const NEUTRAL = { brightness: 100, contrast: 100, saturation: 100, sharpness: 0 };
const FULL_CROP = { x: 0, y: 0, width: 100, height: 100 };
const FAKE_SRC = 'data:image/png;base64,abc';

// ─── detectBorders ────────────────────────────────────────────────────────
describe('detectBorders', () => {
  it('returns an object with x, y, width, height fields', () => {
    const img = { width: 100, height: 100 } as HTMLImageElement;
    const result = detectBorders(img);
    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('y');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
  });

  it('all fields are finite numbers', () => {
    const img = { width: 200, height: 300 } as HTMLImageElement;
    const result = detectBorders(img);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Number.isFinite(result[key]), `${key} must be finite`).toBe(true);
    }
  });

  it('x and y are >= 0', () => {
    const img = { width: 200, height: 300 } as HTMLImageElement;
    const { x, y } = detectBorders(img);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it('width and height are <= 100', () => {
    const img = { width: 200, height: 300 } as HTMLImageElement;
    const { width, height } = detectBorders(img);
    expect(width).toBeLessThanOrEqual(100);
    expect(height).toBeLessThanOrEqual(100);
  });

  it('falls back gracefully when getContext returns null', () => {
    // Temporarily override to return null
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => null),
      configurable: true,
      writable: true,
    });
    const img = { width: 100, height: 100 } as HTMLImageElement;
    const result = detectBorders(img);
    // Fallback returns full crop
    expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  it('does not throw for minimum (1×1) image dimensions', () => {
    const img = { width: 1, height: 1 } as HTMLImageElement;
    expect(() => detectBorders(img)).not.toThrow();
  });

  it('does not throw for large image dimensions', () => {
    const img = { width: 1290, height: 2796 } as HTMLImageElement;
    expect(() => detectBorders(img)).not.toThrow();
  });
});

// ─── processImage ─────────────────────────────────────────────────────────
describe('processImage', () => {
  it('resolves with a Blob', async () => {
    const spec = DEVICE_SPECS[DeviceType.IPHONE];
    const blob = await processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.RECTANGLE, NEUTRAL, FULL_CROP);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('the returned Blob has image/png MIME type', async () => {
    const spec = DEVICE_SPECS[DeviceType.IPHONE];
    const blob = await processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.RECTANGLE, NEUTRAL, FULL_CROP);
    expect(blob.type).toBe('image/png');
  });

  it('the returned Blob is non-empty', async () => {
    const spec = DEVICE_SPECS[DeviceType.IPHONE];
    const blob = await processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.RECTANGLE, NEUTRAL, FULL_CROP);
    expect(blob.size).toBeGreaterThan(0);
  });

  // Run for every device spec to confirm no spec-specific crashes
  for (const [deviceKey, spec] of Object.entries(DEVICE_SPECS)) {
    it(`resolves for DeviceType.${deviceKey} in RECTANGLE mode`, async () => {
      const blob = await processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.RECTANGLE, NEUTRAL, FULL_CROP);
      expect(blob).toBeInstanceOf(Blob);
    });

    it(`resolves for DeviceType.${deviceKey} in FRAME mode`, async () => {
      const blob = await processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.FRAME, NEUTRAL, FULL_CROP);
      expect(blob).toBeInstanceOf(Blob);
    });
  }

  it('resolves with FitMode.STRETCH', async () => {
    const spec = DEVICE_SPECS[DeviceType.PHONE];
    await expect(
      processImage(FAKE_SRC, spec, FitMode.STRETCH, ExportMode.RECTANGLE, NEUTRAL, FULL_CROP)
    ).resolves.toBeInstanceOf(Blob);
  });

  it('resolves with FitMode.AUTOFIT', async () => {
    const spec = DEVICE_SPECS[DeviceType.TABLET_10];
    await expect(
      processImage(FAKE_SRC, spec, FitMode.AUTOFIT, ExportMode.RECTANGLE, NEUTRAL, FULL_CROP)
    ).resolves.toBeInstanceOf(Blob);
  });

  it('resolves with non-default adjustments (brightness, sharpness)', async () => {
    const spec = DEVICE_SPECS[DeviceType.IPHONE];
    const adj = { brightness: 120, contrast: 110, saturation: 106, sharpness: 25 };
    await expect(
      processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.RECTANGLE, adj, FULL_CROP)
    ).resolves.toBeInstanceOf(Blob);
  });

  it('resolves with a partial crop area', async () => {
    const spec = DEVICE_SPECS[DeviceType.IPHONE];
    const crop = { x: 10, y: 10, width: 80, height: 80 };
    await expect(
      processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.RECTANGLE, NEUTRAL, crop)
    ).resolves.toBeInstanceOf(Blob);
  });

  it('resolves for the iPad spec (has 0.92 scale adjustment)', async () => {
    const spec = DEVICE_SPECS[DeviceType.IPAD];
    await expect(
      processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.FRAME, NEUTRAL, FULL_CROP)
    ).resolves.toBeInstanceOf(Blob);
  });

  it('resolves for Android tablet in FRAME mode (10% bezel path)', async () => {
    const spec = DEVICE_SPECS[DeviceType.TABLET_10];
    expect(spec.platform).toBe(Platform.ANDROID);
    expect(spec.isTablet).toBe(true);
    await expect(
      processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.FRAME, NEUTRAL, FULL_CROP)
    ).resolves.toBeInstanceOf(Blob);
  });

  it('rejects when toBlob returns null', async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: vi.fn((cb: BlobCallback) => cb(null)),
      configurable: true,
      writable: true,
    });
    const spec = DEVICE_SPECS[DeviceType.IPHONE];
    await expect(
      processImage(FAKE_SRC, spec, FitMode.FIT, ExportMode.RECTANGLE, NEUTRAL, FULL_CROP)
    ).rejects.toBe('Processing failed');
    // Restore
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: vi.fn((cb: BlobCallback) => {
        cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
      }),
      configurable: true,
      writable: true,
    });
  });
});

// ─── processAppleQuick ────────────────────────────────────────────────────
// Regression guards for the Apple auto-processing pipeline.
// MockImage is 400 × 800 — portrait, narrower than all Apple targets,
// so the phone path exercises the "pad with bg colour" branch and the
// iPad path exercises the blurred-background branch.
describe('processAppleQuick', () => {
  it('is a function that returns a Promise', () => {
    expect(typeof processAppleQuick).toBe('function');
    const result = processAppleQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE]);
    expect(result).toBeInstanceOf(Promise);
    // Consume the promise so we don't get an unhandled rejection warning
    return result.catch(() => {});
  });

  it('resolves to a Blob for iPhone 6.9" (1260 × 2736)', async () => {
    const blob = await processAppleQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('resolves to a Blob for iPhone 6.5" (1284 × 2778)', async () => {
    const blob = await processAppleQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE_65]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('resolves to a Blob for iPad Pro 12.9" (2048 × 2732) — blur bg path', async () => {
    const blob = await processAppleQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.IPAD]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('rejects when image fails to load', async () => {
    // Override MockImage to fire onerror instead of onload
    class ErrorImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_: string) { Promise.resolve().then(() => this.onerror?.(new Error('load fail'))); }
    }
    vi.stubGlobal('Image', ErrorImage);
    await expect(processAppleQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE])).rejects.toBe('Image load error');
  });
});

// ─── processAndroidQuick ──────────────────────────────────────────────────
// MockImage is 400 × 800 (portrait).
// Phone path (1080×1920): scaled height = 800*(1080/400) = 2160 > 1920 → crop-from-bottom branch.
// Tablet paths (800×1280, 600×1024): isTablet=true → blurred-background branch.
describe('processAndroidQuick', () => {
  it('is a function that returns a Promise', () => {
    expect(typeof processAndroidQuick).toBe('function');
    const result = processAndroidQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.PHONE]);
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  it('resolves to a Blob for Phone spec (1080 × 1920) — crop-from-bottom path', async () => {
    const blob = await processAndroidQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.PHONE]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('resolves to a Blob for 10" Tablet spec (800 × 1280) — blur-bg path', async () => {
    const blob = await processAndroidQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.TABLET_10]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('resolves to a Blob for 7" Tablet spec (600 × 1024) — blur-bg path', async () => {
    const blob = await processAndroidQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.TABLET_7]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles input shorter than target — pad-with-background path', async () => {
    // 1080×800 scaled to phone width 1080 → scaledH = 800 < 1920 → padding branch
    class ShortImage {
      width = 1080; height = 800;
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_: string) { Promise.resolve().then(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', ShortImage);
    const blob = await processAndroidQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.PHONE]);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('rejects when image fails to load', async () => {
    class ErrorImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_: string) { Promise.resolve().then(() => this.onerror?.(new Error('fail'))); }
    }
    vi.stubGlobal('Image', ErrorImage);
    await expect(
      processAndroidQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.PHONE])
    ).rejects.toBe('Image load error');
  });

  it('rejects when toBlob returns null', async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: vi.fn((cb: BlobCallback) => cb(null)),
      configurable: true,
      writable: true,
    });
    await expect(
      processAndroidQuick(FAKE_SRC, DEVICE_SPECS[DeviceType.PHONE])
    ).rejects.toBe('toBlob returned null');
    // Restore
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: vi.fn((cb: BlobCallback) => {
        cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
      }),
      configurable: true,
      writable: true,
    });
  });
});

// ─── hasSystemBar ─────────────────────────────────────────────────────────────
describe('hasSystemBar', () => {
  it('is exported and callable without throwing', () => {
    const img = { width: 100, height: 100 } as HTMLImageElement;
    expect(() => hasSystemBar(img, 50, false)).not.toThrow();
  });

  it('returns a boolean', () => {
    const img = { width: 100, height: 100 } as HTMLImageElement;
    const result = hasSystemBar(img, 50, false);
    expect(typeof result).toBe('boolean');
  });

  it('returns true when crop band pixels are uniform (solid black — bar present)', () => {
    // Default canvas mock fills pixels as 0,0,0,0 (transparent black) — all uniform → bar
    const img = { width: 100, height: 200 } as HTMLImageElement;
    expect(hasSystemBar(img, 60, false)).toBe(true);
  });

  it('returns true when sampling from bottom on a uniform canvas', () => {
    const img = { width: 100, height: 200 } as HTMLImageElement;
    expect(hasSystemBar(img, 60, true)).toBe(true);
  });

  it('does not throw for minimum crop value (1px)', () => {
    const img = { width: 100, height: 100 } as HTMLImageElement;
    expect(() => hasSystemBar(img, 1, false)).not.toThrow();
  });

  it('does not throw for a large crop relative to image height', () => {
    const img = { width: 1080, height: 1920 } as HTMLImageElement;
    expect(() => hasSystemBar(img, 280, false)).not.toThrow();
  });

  it('returns false (or does not throw) when getContext returns null', () => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => null),
      configurable: true,
      writable: true,
    });
    const img = { width: 100, height: 100 } as HTMLImageElement;
    expect(() => hasSystemBar(img, 50, false)).not.toThrow();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: original,
      configurable: true,
      writable: true,
    });
  });
});
