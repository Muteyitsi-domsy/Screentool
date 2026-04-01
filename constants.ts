
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
    width: 600,
    height: 1024,
    platform: Platform.ANDROID,
    aspectRatio: '3:5',
    isTablet: true
  },
  [DeviceType.TABLET_10]: {
    id: DeviceType.TABLET_10,
    name: '10" Android Tablet',
    width: 800,
    height: 1280,
    platform: Platform.ANDROID,
    aspectRatio: '5:8',
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
    name: 'iPhone 6.9" Display',
    width: 1260,
    height: 2736,
    platform: Platform.APPLE,
    aspectRatio: '9:19.5'
  },
  [DeviceType.IPHONE_65]: {
    id: DeviceType.IPHONE_65,
    name: 'iPhone 6.5" Display',
    width: 1284,
    height: 2778,
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