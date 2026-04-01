/**
 * Reliability tests — Copy Design renderer (lib/copyScreenshot.ts)
 * Exercises renderCopyDesign for phone and iPad specs; guards the core
 * pipeline contract (resolves to a non-empty PNG Blob).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderCopyDesign } from '../lib/copyScreenshot';
import { DEVICE_SPECS } from '../constants';
import { DeviceType } from '../types';

// ─── Stub HTMLImageElement ────────────────────────────────────────────────────
// jsdom Image never fires onload; replace with one that fires it async when
// src is set, matching real browser behaviour.
class MockImage {
  width = 400;
  height = 800;
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  private _src = '';
  get src() { return this._src; }
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

const FAKE_SRC = 'data:image/png;base64,abc';

const COPY: import('../lib/copyScreenshot').CopyData = {
  eyebrow: 'Level Up Daily',
  headline: 'Build habits that [em]actually[/em] stick',
  subhead: 'Track streaks, stay motivated, and win',
  pills: ['Smart Reminders', 'Daily Streaks', 'Progress Charts'],
  appName: 'HabitFlow',
};

// ─── renderCopyDesign ─────────────────────────────────────────────────────────
describe('renderCopyDesign', () => {
  it('is a function that returns a Promise', () => {
    expect(typeof renderCopyDesign).toBe('function');
    const result = renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE_65], COPY);
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  it('resolves to a Blob for iPhone 6.5" spec', async () => {
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE_65], COPY);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('resolves to a Blob for iPhone 6.9" spec', async () => {
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE], COPY);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('resolves to a Blob for iPad Pro 12.9" spec (blur-bg path)', async () => {
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPAD], COPY);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles a headline with no [em] tags', async () => {
    const copy = { ...COPY, headline: 'Every habit starts with one step' };
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE_65], copy);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('handles a headline with multiple [em] segments', async () => {
    const copy = { ...COPY, headline: '[em]Build[/em] real [em]momentum[/em] every day' };
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE_65], copy);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('handles a long headline that requires wrapping', async () => {
    const copy = { ...COPY, headline: 'The only [em]habit tracker[/em] that keeps you accountable every single day' };
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE_65], copy);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('resolves to a Blob for Android 7" tablet spec (isTablet blur path)', async () => {
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.TABLET_7], COPY);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('resolves to a Blob for Android 10" tablet spec (isTablet blur path)', async () => {
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.TABLET_10], COPY);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('resolves to a Blob for Android phone spec (non-blur flat path)', async () => {
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.PHONE], COPY);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('handles pill text that would overflow the canvas width', async () => {
    const wideCopy = {
      ...COPY,
      pills: ['Very long pill text here', 'Another long pill entry', 'Third pill label text'] as [string, string, string],
    };
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.TABLET_7], wideCopy);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('handles a multi-line subhead without throwing', async () => {
    const copy = { ...COPY, subhead: 'A very long subhead that will definitely wrap across multiple lines on a narrow canvas layout' };
    const blob = await renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.TABLET_7], copy);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('rejects when image fails to load', async () => {
    class ErrorImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_: string) { Promise.resolve().then(() => this.onerror?.(new Error('load fail'))); }
    }
    vi.stubGlobal('Image', ErrorImage);
    await expect(
      renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE_65], COPY)
    ).rejects.toBe('Image load error');
  });

  it('rejects when toBlob returns null', async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: vi.fn((cb: BlobCallback) => cb(null)),
      configurable: true,
      writable: true,
    });
    await expect(
      renderCopyDesign(FAKE_SRC, DEVICE_SPECS[DeviceType.IPHONE_65], COPY)
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
