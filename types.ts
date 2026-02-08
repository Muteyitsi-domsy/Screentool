
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

export interface TrayVariant {
  deviceType: DeviceType;
  renderedImageUrl: string;
  renderedBlob: Blob;
  filename: string;
}

export interface TrayItem {
  id: string;
  platform: Platform;
  exportMode: ExportMode;
  index: number;            // Sequential counter per platform/mode bucket
  timestamp: number;
  frameColor: string;
  variants: TrayVariant[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  tray: (TrayItem | null)[];
}

export interface ProcessingState {
  image: string | null;
  fitMode: FitMode;
  exportMode: ExportMode;
  selectedDevice: DeviceType;
  frameColor: string;       // Active editor hardware finish
  cropArea: CropArea;
  adjustments: ImageAdjustments;
  activeView: AppView;
  tray: (TrayItem | null)[];
}
