
import { DeviceType, Platform, DeviceSpec } from './types';

export const DEVICE_SPECS: Record<DeviceType, DeviceSpec> = {
  [DeviceType.PHONE]: {
    id: DeviceType.PHONE,
    name: 'Android Phone (9:16)',
    width: 1080,
    height: 1920,
    platform: Platform.ANDROID,
    aspectRatio: '9:16'
  },
  [DeviceType.TABLET_7]: {
    id: DeviceType.TABLET_7,
    name: '7" Android Tablet',
    width: 1200,
    height: 1920,
    platform: Platform.ANDROID,
    aspectRatio: '10:16',
    isTablet: true
  },
  [DeviceType.TABLET_10]: {
    id: DeviceType.TABLET_10,
    name: '10" Android Tablet',
    width: 1600,
    height: 2560,
    platform: Platform.ANDROID,
    aspectRatio: '10:16',
    isTablet: true
  },
  [DeviceType.CHROMEBOOK]: {
    id: DeviceType.CHROMEBOOK,
    name: 'Chromebook (16:9)',
    width: 1920,
    height: 1080,
    platform: Platform.ANDROID,
    aspectRatio: '16:9'
  },
  [DeviceType.IPHONE]: {
    id: DeviceType.IPHONE,
    name: 'iPhone 6.7" Display',
    width: 1290,
    height: 2796,
    platform: Platform.APPLE,
    aspectRatio: '9:19.5'
  },
  [DeviceType.IPHONE_61]: {
    id: DeviceType.IPHONE_61,
    name: 'iPhone 6.1" Standard',
    width: 1179,
    height: 2556,
    platform: Platform.APPLE,
    aspectRatio: '9:19.5'
  },
  [DeviceType.IPAD]: {
    id: DeviceType.IPAD,
    name: 'iPad Pro 12.9"',
    width: 2048,
    height: 2732,
    platform: Platform.APPLE,
    aspectRatio: '3:4',
    isTablet: true
  }
};

export const FRAME_COLORS = {
  [Platform.APPLE]: [
    { name: 'Black Titanium', hex: '#1a1a1a' },
    { name: 'Natural Titanium', hex: '#beb8af' },
    { name: 'White Titanium', hex: '#f2f1ed' },
    { name: 'Desert Titanium', hex: '#c8b19a' },
  ],
  [Platform.ANDROID]: [
    { name: 'Phantom Black', hex: '#1a1a1a' },
    { name: 'Titanium Gray', hex: '#7a7a7a' },
    { name: 'Titanium Violet', hex: '#5b546a' },
    { name: 'Titanium Yellow', hex: '#f2e8cf' },
  ]
};