
export enum Platform {
  ANDROID = 'ANDROID',
  APPLE = 'APPLE'
}

export enum DeviceType {
  PHONE = 'PHONE',
  TABLET_7 = 'TABLET_7',
  TABLET_10 = 'TABLET_10',
  CHROMEBOOK = 'CHROMEBOOK',
  IPHONE = 'IPHONE',
  IPHONE_61 = 'IPHONE_61',
  IPAD = 'IPAD'
}

export enum FitMode {
  FIT = 'FIT',
  STRETCH = 'STRETCH',
  AUTOFIT = 'AUTOFIT'
}

export enum ExportMode {
  RECTANGLE = 'RECTANGLE',
  FRAME = 'FRAME'
}

export enum AppView {
  EDITOR = 'EDITOR',
  TRAY = 'TRAY'
}

export interface CropArea {
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  width: number; // Percentage 0-100
  height: number; // Percentage 0-100
}

export interface ImageAdjustments {
  brightness: number; // 0-200, default 100
  contrast: number;   // 0-200, default 100
  saturation: number; // 0-200, default 100
  sharpness: number;  // 0-100, default 0
}

export interface DeviceSpec {
  id: DeviceType;
  name: string;
  width: number;
  height: number;
  platform: Platform;
  aspectRatio: string;
  isTablet?: boolean;
}

export interface TrayItem {
  id: string;
  renderedImageUrl: string; // Pre-rendered immutable preview
  renderedBlob: Blob;       // High-res immutable export asset
  platform: Platform;
  deviceType: DeviceType;
  exportMode: ExportMode;
  index: number;            // 1-8 slot assignment
  filename: string;         // Precomputed naming convention
  timestamp: number;
}

export interface ProcessingState {
  image: string | null;
  fitMode: FitMode;
  exportMode: ExportMode;
  selectedDevice: DeviceType;
  cropArea: CropArea;
  adjustments: ImageAdjustments;
  activeView: AppView;
  tray: (TrayItem | null)[];
}