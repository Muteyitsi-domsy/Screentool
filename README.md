
# 📱 ScreenFrame — Screenshot Studio
> **Store-ready screenshots. Exactly as you see them.**

**ScreenFrame** is a deterministic screenshot framing and export tool designed for indie developers shipping to the Apple App Store and Google Play Store. It turns raw screenshots into store-compliant assets—across devices and platforms—without redesigning, guessing, or re-checking exports.

---

## 🎯 The Coherence Engine

ScreenFrame features a dual-module engine that harmonizes disparate hardware classes into a single visual "Vibe." 

### 🍏 The Apple Module (Sanitization)
Apple screenshots often contain system artifacts or inconsistent modal padding. 
- **Auto-Sanitization**: Upon import, Apple assets are analyzed for modal borders. 
- **Canonical Insets**: The engine applies a deterministic 4% "Breathing Room" inset for standard views and 8% for modals.
- **Hardware Integration**: Content is mapped to the exact corner radii of the iPhone 15/16 Pro and iPad Pro 12.9" chassis.

### 🤖 The Android Module (Harmonization)
Android screenshots vary wildly in aspect ratio (9:16 to 10:16). 
- **Height-Locked Scaling**: To prevent "naïve scaling" (where UI elements look huge on tablets), the engine anchors the height and centers the content. 
- **Scale Parity**: A button on a 7" tablet render will appear at the same visual scale as on a 6.7" phone render.
- **Class-Specific Chassis**: Tablets use sharper 4% corner radii and thinner bezel ratios (10%) compared to phones (8% radii / 12% bezel) to meet Play Store aesthetic standards.

---

## 💎 Core Principles

### 1. Front-Loaded Normalization
Normalization happens **once** at the `processFile` stage. This establishes the "Canonical Master." All subsequent user edits (Crop, Pan, Auto-Shine) are applied to this clean anchor. This prevents "logic drift" where an export might look different than the preview.

### 2. Deterministic WYSIWYG
ScreenFrame enforces a single visual source of truth. Every preview in the editor and every item in the tray is a direct render of the canonical viewport. No "helpful" re-fitting happens at export time.

### 3. Immutable Export Tray
Screenshots are "parked" in the tray as immutable snapshots. Further edits to the active editor state never affect already-captured assets. 

### 4. Deterministic Batch Export
Exports are grouped into **Platform Kits** (ZIP files) based on Platform and Mode. 
- `apple_mockup_screenshots.zip`
- `android_rect_screenshots.zip`

---

## ⚖️ Guiding Invariant (Non-Negotiable)

**All exports must be pure renders of user-approved state.**
No logic may alter pixels or re-normalize assets after the user clicks "Add to Tray."

---

## 📜 The Naming Contract

ScreenFrame enforces a strict, machine-readable naming system:
`{platform}_{device}_{size}_{mode}_{index}.png`

| Segment | Values | Description |
| :--- | :--- | :--- |
| **Platform** | `apple`, `android` | Targeted store platform. |
| **Device** | `phone`, `tablet` | Generic device category. |
| **Size** | `6.7`, `6.1`, `12.9`, `7in`, `10in` | Specific display identity. |
| **Mode** | `rect`, `mockup` | Composition style (`rect` = Full, `mockup` = Framed). |
| **Index** | `01`, `02`, `03`... | Sequential counter per device/mode bucket. |

---

## 🛠 Supported Modules

### Apple Ecosystem
- **iPhone 6.7" / 6.1"**: Precision dynamic island and bezel mapping.
- **iPad Pro 12.9"**: Canonical 3:4 aspect ratio with slate-radius framing.

### Android Ecosystem
- **9:16 Phone**: Standard high-density phone standard.
- **7" & 10" Tablets**: 10:16 aspect ratio with height-locked content parity.
- **Chromebook**: 16:9 landscape standard.

---

## 💡 Workflow

1.  **Initialize**: Drop your master screenshot. The engine auto-detects borders and normalizes for the active module.
2.  **Harmonize**: Switch between device classes (e.g., Phone to Tablet) to verify content scale parity.
3.  **Refine**: Use **Crop Area** for precision framing or **Auto-Shine** for instant contrast/saturation "pop."
4.  **Capture**: Click **"Add Snapshot to Tray"** to lock the asset into the export queue.
5.  **Batch**: Switch to **Tray View** to download your multi-device Platform Kits.

---

*Developed with precision for world-class app developers.*
