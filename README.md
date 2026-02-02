# 📱 ScreenFrame — Screenshot Studio
> **Store-ready screenshots. Exactly as you see them.**

**ScreenFrame** is a deterministic screenshot framing and export tool designed for indie developers shipping to the Apple App Store and Google Play Store. It turns raw screenshots into store-compliant assets—across devices and platforms—without redesigning, guessing, or re-checking exports.

---

## 🎯 Why ScreenFrame Exists

App stores require multiple screenshots per device, strict aspect ratios, consistent framing, and separate exports per platform. Most tools either silently change your screenshots or make batch export painful and error-prone. 

**ScreenFrame is built around trust.** If it looks right in the editor, it is right in the export.

---

## 💎 Core Principles

### 1. What You See Is What You Get (WYSIWYG)
ScreenFrame enforces a single visual source of truth. There is exactly one canonical content viewport per device. Every preview and every export is a direct render of that viewport. No post-processing or "helpful" re-fitting at export time.

### 2. Framing, Not Altering
The studio establishes safe framing and adds platform-specific chrome (like Dynamic Islands or camera pinholes). It will **never** remove app UI, redraw content, or change pixels after you finish editing. Your screenshots remain your screenshots.

### 3. Immutable Export Tray
Screenshots are edited one at a time and "parked" in the tray as immutable snapshots. Further edits to the active editor state never affect already-captured assets. Think of it as a staging table for final assets.

### 4. Deterministic Batch Export
Exports are grouped by tray metadata and named using a strict, predictable contract. They are never re-rendered or modified at download time.

---

## ⚖️ Guiding Invariant (Non-Negotiable)

**All exports must be pure renders of user-approved state.**
No logic may alter pixels after the user finishes editing.

*   **Stable Indexing**: If the same device + mode appears twice in the tray, the index increments and filenames remain stable.
*   **Locked Metadata**: Filenames, device identity, and ordering are locked at capture time.

---

## 📜 The Naming Contract

ScreenFrame enforces a strict, machine-readable naming system:

`{platform}_{device}_{size}_{mode}_{index}.png`

| Segment | Values | Description |
| :--- | :--- | :--- |
| **Platform** | `apple`, `android` | Targeted store platform. |
| **Device** | `phone`, `tablet`, `chromebook` | Generic device category. |
| **Size** | `6.7`, `6.1`, `12.9`, `7in`, `10in` | Specific display identity. |
| **Mode** | `rect`, `mockup` | Composition style (`rect` = Full, `mockup` = Framed). |
| **Index** | `01`, `02`, `03`... | Sequential counter per device/mode bucket. |

**Example Output**: `apple_phone_6.7_mockup_01.png`
**Example ZIP**: `apple_phone_6.7_mockup_screenshots.zip`

---

## 🛠 Supported Platforms & Outputs

### Platforms
*   **Apple**: iPhone 6.1", 6.7", iPad Pro 12.9"
*   **Android**: Phone (9:16), Tablet 7", Tablet 10", Chromebook (16:9)

### Output Modes
*   **Rectangle**: Clean, store-upload ready assets.
*   **Device Mockups**: Hardware-chassis renders derived from the same canonical viewport.

---

## 💡 Workflow

1.  **Initialize**: Drop your master screenshot into the studio.
2.  **Configure**: Select your target device module.
3.  **Refine**: Use the **Crop Area** or **Adjustment Matrix** to tune the visual.
4.  **Capture**: Click **"Add Snapshot to Tray"** to lock in the asset.
5.  **Batch**: Switch to the **Tray View** and export your platform kits.

---

## 🚫 What ScreenFrame Is Not
*   Not a design tool.
*   Not a creative editor.
*   Not a generic mockup generator.

ScreenFrame is a **precision utility** for getting screenshots accepted on the first try.

---

*Developed with precision for world-class app developers.*