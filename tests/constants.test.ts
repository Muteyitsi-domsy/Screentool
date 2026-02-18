/**
 * Reliability tests — Device specs (constants.ts)
 * Verifies that every device spec is complete and meets app-store minimums.
 */
import { describe, it, expect } from 'vitest';
import { DEVICE_SPECS, FRAME_COLORS } from '../constants';
import { DeviceType, Platform } from '../types';

// ─── DEVICE_SPECS coverage ────────────────────────────────────────────────
describe('DEVICE_SPECS', () => {
  it('defines a spec for every DeviceType enum value', () => {
    for (const dt of Object.values(DeviceType)) {
      expect(DEVICE_SPECS[dt], `Missing spec for DeviceType.${dt}`).toBeDefined();
    }
  });

  it('every spec has positive integer dimensions', () => {
    for (const [key, spec] of Object.entries(DEVICE_SPECS)) {
      expect(spec.width, `${key}.width must be > 0`).toBeGreaterThan(0);
      expect(spec.height, `${key}.height must be > 0`).toBeGreaterThan(0);
      expect(Number.isInteger(spec.width), `${key}.width must be integer`).toBe(true);
      expect(Number.isInteger(spec.height), `${key}.height must be integer`).toBe(true);
    }
  });

  it('every spec has a valid Platform', () => {
    const validPlatforms = new Set(Object.values(Platform));
    for (const [key, spec] of Object.entries(DEVICE_SPECS)) {
      expect(validPlatforms.has(spec.platform), `${key}.platform "${spec.platform}" is invalid`).toBe(true);
    }
  });

  it('every spec has a non-empty name and aspectRatio', () => {
    for (const [key, spec] of Object.entries(DEVICE_SPECS)) {
      expect(spec.name.trim(), `${key}.name must not be empty`).not.toBe('');
      expect(spec.aspectRatio.trim(), `${key}.aspectRatio must not be empty`).not.toBe('');
    }
  });

  it('every spec id matches its key in DEVICE_SPECS', () => {
    for (const [key, spec] of Object.entries(DEVICE_SPECS)) {
      expect(spec.id, `${key}.id should equal its map key`).toBe(key);
    }
  });
});

// ─── Apple specs (App Store minimums) ────────────────────────────────────
describe('Apple device specs', () => {
  it('iPhone 6.7" meets App Store minimum resolution', () => {
    const spec = DEVICE_SPECS[DeviceType.IPHONE];
    expect(spec.platform).toBe(Platform.APPLE);
    expect(spec.width).toBe(1290);
    expect(spec.height).toBe(2796);
  });

  it('iPhone 6.1" meets App Store minimum resolution', () => {
    const spec = DEVICE_SPECS[DeviceType.IPHONE_61];
    expect(spec.platform).toBe(Platform.APPLE);
    expect(spec.width).toBe(1179);
    expect(spec.height).toBe(2556);
  });

  it('iPad Pro 12.9" meets App Store minimum resolution', () => {
    const spec = DEVICE_SPECS[DeviceType.IPAD];
    expect(spec.platform).toBe(Platform.APPLE);
    expect(spec.isTablet).toBe(true);
    expect(spec.width).toBe(2048);
    expect(spec.height).toBe(2732);
  });
});

// ─── Android specs (Play Store minimums) ─────────────────────────────────
describe('Android device specs', () => {
  it('Android Phone meets Play Store minimum (1080×1920)', () => {
    const spec = DEVICE_SPECS[DeviceType.PHONE];
    expect(spec.platform).toBe(Platform.ANDROID);
    expect(spec.width).toBeGreaterThanOrEqual(1080);
    expect(spec.height).toBeGreaterThanOrEqual(1920);
  });

  it('7" Tablet has correct dimensions and isTablet flag', () => {
    const spec = DEVICE_SPECS[DeviceType.TABLET_7];
    expect(spec.platform).toBe(Platform.ANDROID);
    expect(spec.isTablet).toBe(true);
    expect(spec.width).toBe(1200);
    expect(spec.height).toBe(1920);
  });

  it('10" Tablet has correct dimensions and isTablet flag', () => {
    const spec = DEVICE_SPECS[DeviceType.TABLET_10];
    expect(spec.platform).toBe(Platform.ANDROID);
    expect(spec.isTablet).toBe(true);
    expect(spec.width).toBe(1600);
    expect(spec.height).toBe(2560);
  });

  it('Chromebook is landscape (width > height)', () => {
    const spec = DEVICE_SPECS[DeviceType.CHROMEBOOK];
    expect(spec.platform).toBe(Platform.ANDROID);
    expect(spec.width).toBeGreaterThan(spec.height);
  });
});

// ─── FRAME_COLORS ────────────────────────────────────────────────────────
describe('FRAME_COLORS', () => {
  it('defines colors for both platforms', () => {
    expect(FRAME_COLORS[Platform.APPLE]).toBeDefined();
    expect(FRAME_COLORS[Platform.ANDROID]).toBeDefined();
  });

  it('each platform has at least one color', () => {
    expect(FRAME_COLORS[Platform.APPLE].length).toBeGreaterThan(0);
    expect(FRAME_COLORS[Platform.ANDROID].length).toBeGreaterThan(0);
  });

  it('every color entry has a name and a valid hex code', () => {
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    for (const platform of Object.values(Platform)) {
      for (const color of FRAME_COLORS[platform]) {
        expect(color.name.trim()).not.toBe('');
        expect(color.hex, `Invalid hex "${color.hex}" for "${color.name}"`).toMatch(hexRe);
      }
    }
  });
});
