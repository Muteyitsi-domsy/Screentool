import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { vi } from 'vitest';

// ─── Canvas 2D context mock ────────────────────────────────────────────────
// jsdom does not implement canvas — we provide a full stub so any code that
// calls getContext('2d') gets a working (no-op) mock back.

const makeCtx = () => ({
  drawImage: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  beginPath: vi.fn(),
  clip: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  putImageData: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createImageData: vi.fn((w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  })),
  getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4), // all-zero (transparent black)
    width: w,
    height: h,
  })),
  // writable properties used by imageUtils
  filter: '',
  shadowColor: '',
  shadowBlur: 0,
  shadowOffsetY: 0,
  strokeStyle: '',
  lineWidth: 0,
  fillStyle: '' as string | object,
  globalAlpha: 1,
  globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => makeCtx()),
  configurable: true,
  writable: true,
});

Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  value: vi.fn(
    () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII='
  ),
  configurable: true,
  writable: true,
});

// ─── ImageData polyfill ────────────────────────────────────────────────────
// jsdom does not implement ImageData — needed by applySharpness in imageUtils.
if (typeof ImageData === 'undefined') {
  (globalThis as any).ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace: string = 'srgb';

    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? dataOrWidth.length / (4 * widthOrHeight);
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight ?? 0;
        this.data = new Uint8ClampedArray(dataOrWidth * (widthOrHeight ?? 0) * 4);
      }
    }
  };
}

Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
  value: vi.fn((cb: BlobCallback) => {
    cb(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }));
  }),
  configurable: true,
  writable: true,
});
