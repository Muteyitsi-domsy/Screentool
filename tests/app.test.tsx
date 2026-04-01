/**
 * Reliability tests — App component (App.tsx)
 * Smoke-tests rendering, navigation, licensing display, and file validation.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../App';
import * as imageUtilsModule from '../imageUtils';
import { DeviceType } from '../types';

// ─── Module mocks ──────────────────────────────────────────────────────────
// Mock Supabase auth + realtime so tests run without a live project
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    isPro: false,
    loading: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock Lemon Squeezy so no external script is loaded in tests
vi.mock('../lib/lemonsqueezy', () => ({
  initLemonSqueezy: vi.fn(),
  openLemonSqueezyCheckout: vi.fn(),
}));

// Silence console.error for expected React warnings in test environment
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── Render ───────────────────────────────────────────────────────────────
describe('App — render', () => {
  it('mounts without crashing', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('displays the ScreenFrame brand name', () => {
    render(<App />);
    expect(screen.getByText('ScreenFrame')).toBeInTheDocument();
  });

  it('shows the EDITOR navigation tab', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /editor/i })).toBeInTheDocument();
  });

  it('shows the TRAY navigation tab', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /^tray \(\d+\)/i })).toBeInTheDocument();
  });

  it('shows the PRICING & FAQ navigation tab', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /pricing/i })).toBeInTheDocument();
  });

  it('APPLE STUDIO is the active view on first load', () => {
    render(<App />);
    // APPLE STUDIO is the primary tab — it carries the blue active class
    const appleBtn = screen.getByRole('button', { name: /apple studio/i });
    expect(appleBtn.className).toContain('bg-blue-600');
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────
describe('App — navigation', () => {
  it('switches to TRAY view when TRAY tab is clicked', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^tray \(\d+\)/i }));
    });
    // Tray view shows export kit buttons
    expect(screen.getByRole('button', { name: /export apple kit/i })).toBeInTheDocument();
  });

  it('switches to FAQ view when PRICING & FAQ tab is clicked', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pricing/i }));
    });
    expect(screen.getByText(/licensing status/i)).toBeInTheDocument();
  });

  it('shows Free Tier status on FAQ view when not unlocked', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pricing/i }));
    });
    expect(screen.getByText(/free tier/i)).toBeInTheDocument();
  });

  it('navigates back to EDITOR from TRAY', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^tray \(\d+\)/i }));
      fireEvent.click(screen.getByRole('button', { name: /^editor$/i }));
    });
    // Add Snapshot button should be visible in editor
    expect(screen.getByRole('button', { name: /add snapshot/i })).toBeInTheDocument();
  });
});

// ─── Licensing / TOGGLE SIM removed ───────────────────────────────────────
describe('App — licensing', () => {
  it('does NOT render a visible TOGGLE SIM button (security fix)', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /toggle sim/i })).toBeNull();
  });

  it('Add Snapshot button is present after navigating to Editor view', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^editor$/i }));
    });
    expect(screen.getByRole('button', { name: /add snapshot/i })).toBeInTheDocument();
  });
});

// ─── Tray count display ───────────────────────────────────────────────────
describe('App — tray counter', () => {
  it('tray button shows (0) when tray is empty', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /tray \(0\)/i })).toBeInTheDocument();
  });
});

// ─── Footer links ─────────────────────────────────────────────────────────
describe('App — footer', () => {
  it('renders Terms link', () => {
    render(<App />);
    const termsLink = screen.getByRole('link', { name: /terms/i });
    expect(termsLink).toBeInTheDocument();
    expect(termsLink).toHaveAttribute('href', '/terms');
  });

  it('renders Privacy link', () => {
    render(<App />);
    const privacyLink = screen.getByRole('link', { name: /privacy/i });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href', '/privacy');
  });

  it('renders Contact link pointing to support email', () => {
    render(<App />);
    const contactLink = screen.getByRole('link', { name: /contact/i });
    expect(contactLink).toHaveAttribute('href', expect.stringContaining('mailto:'));
  });
});

// ─── Apple Studio UI ──────────────────────────────────────────────────────
// Guards the APPLE STUDIO view structure — device picker, category,
// drop zone, and the iPad auto-generate note.
describe('App — Apple Studio UI', () => {
  it('shows iPhone 6.5" as a selectable device button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /6\.5/i })).toBeInTheDocument();
  });

  it('shows iPhone 6.9" as a selectable device button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /6\.9/i })).toBeInTheDocument();
  });

  it('does NOT show iPad Pro as a standalone selectable device button', () => {
    render(<App />);
    // iPad is auto-generated, not a user-selectable device in the picker
    expect(screen.queryByRole('button', { name: /ipad pro/i })).not.toBeInTheDocument();
  });

  it('shows the iPad auto-generate note', () => {
    render(<App />);
    expect(screen.getByText(/ipad pro 12\.9.*always generated/i)).toBeInTheDocument();
  });

  it('shows the App Category select element', () => {
    render(<App />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('App Category select includes a journaling option', () => {
    render(<App />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const options = Array.from(select.options).map(o => o.text.toLowerCase());
    expect(options.some(o => o.includes('journal'))).toBe(true);
  });

  it('shows the process button in APPLE STUDIO view', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /process screenshots/i })).toBeInTheDocument();
  });

  it('process button is disabled when no files are loaded', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /process/i })).toBeDisabled();
  });

  it('shows a file drop zone in APPLE STUDIO view', () => {
    render(<App />);
    expect(screen.getByText(/drop screenshots here/i)).toBeInTheDocument();
  });
});

// ─── Tray preview toggle ──────────────────────────────────────────────────
// Guards the iPhone / iPad preview toggle that switches all tray slot
// previews between the two generated variants.
describe('App — Tray preview toggle', () => {
  const goToTray = async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^tray \(\d+\)/i }));
    });
  };

  it('shows an iPhone preview toggle button in TRAY view', async () => {
    await goToTray();
    expect(screen.getByRole('button', { name: /^iphone$/i })).toBeInTheDocument();
  });

  it('shows an iPad preview toggle button in TRAY view', async () => {
    await goToTray();
    expect(screen.getByRole('button', { name: /^ipad$/i })).toBeInTheDocument();
  });

  it('iPhone toggle is the default active preview (has bg-zinc-800 class)', async () => {
    await goToTray();
    const iphoneBtn = screen.getByRole('button', { name: /^iphone$/i });
    expect(iphoneBtn.className).toContain('bg-zinc-800');
  });

  it('iPad toggle is inactive by default', async () => {
    await goToTray();
    const ipadBtn = screen.getByRole('button', { name: /^ipad$/i });
    expect(ipadBtn.className).not.toContain('bg-zinc-800');
  });

  it('clicking iPad toggle makes it active', async () => {
    await goToTray();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ipad$/i }));
    });
    expect(screen.getByRole('button', { name: /^ipad$/i }).className).toContain('bg-zinc-800');
    expect(screen.getByRole('button', { name: /^iphone$/i }).className).not.toContain('bg-zinc-800');
  });

  it('clicking iPhone toggle after iPad restores iPhone as active', async () => {
    await goToTray();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ipad$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^iphone$/i }));
    });
    expect(screen.getByRole('button', { name: /^iphone$/i }).className).toContain('bg-zinc-800');
  });

  it('TRAY view shows an Android export button (disabled when tray has no Android items)', async () => {
    await goToTray();
    expect(screen.getByRole('button', { name: /export android kit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export android kit/i })).toBeDisabled();
  });
});

// ─── Apple Quick Process — dual-variant ───────────────────────────────────
// Guards the core behaviour: one uploaded screenshot → two store-ready
// outputs (iPhone + iPad) → one tray slot with two variants.
//
// processAppleQuick is spied on (returns a dummy Blob instantly) so we
// exercise the orchestration logic without real Canvas rendering.
describe('App — Apple Quick Process (dual variant)', () => {
  let processAppleQuickSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on processAppleQuick so it resolves instantly without Canvas
    processAppleQuickSpy = vi
      .spyOn(imageUtilsModule, 'processAppleQuick')
      .mockResolvedValue(new Blob(['img'], { type: 'image/png' }));

    // Spy on URL helpers used in handleAppleQuickProcess
    createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Mock FileReader so fileToDataUrl resolves immediately
    class MockFileReader {
      result: string | null = 'data:image/png;base64,abc';
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        Promise.resolve().then(() =>
          this.onload?.({ target: this } as ProgressEvent<FileReader>)
        );
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
  });

  afterEach(() => {
    processAppleQuickSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Helper: render app, add one file to the apple input, click Process
  const uploadAndProcess = async () => {
    render(<App />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const file = new File(['fake'], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { fireEvent.change(input); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /process/i }));
    });
    // Flush remaining async microtasks
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
  };

  it('calls processAppleQuick exactly twice for a single uploaded file', async () => {
    await uploadAndProcess();
    expect(processAppleQuickSpy).toHaveBeenCalledTimes(2);
  });

  it('one call targets a phone spec and one targets the iPad spec', async () => {
    await uploadAndProcess();
    const specIds = processAppleQuickSpy.mock.calls.map(([, spec]) => spec.id);
    expect(specIds).toContain(DeviceType.IPAD);
    expect(specIds.some(id => id !== DeviceType.IPAD)).toBe(true);
  });

  it('creates two object URLs per file — one for the phone blob, one for iPad', async () => {
    await uploadAndProcess();
    expect(createObjectURLSpy).toHaveBeenCalledTimes(2);
  });

  it('adds exactly one tray slot after processing one screenshot', async () => {
    await uploadAndProcess();
    expect(screen.getByRole('button', { name: /tray \(1\)/i })).toBeInTheDocument();
  });

  it('navigates to TRAY view automatically after processing completes', async () => {
    await uploadAndProcess();
    expect(screen.getByRole('button', { name: /export apple kit/i })).toBeInTheDocument();
  });

  it('process button label includes iPhone + iPad when files are staged', async () => {
    render(<App />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const file = new File(['fake'], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { fireEvent.change(input); });
    // Label should now indicate dual output
    expect(screen.getByRole('button', { name: /→.*iphone.*ipad/i })).toBeInTheDocument();
  });
});

// ─── Output type toggle ───────────────────────────────────────────────────────
// Guards the Full Resolution / Copy Design toggle in APPLE STUDIO sidebar.
describe('App — Output type toggle', () => {
  it('shows the Output Type toggle in APPLE STUDIO view', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /full resolution/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy design/i })).toBeInTheDocument();
  });

  it('Full Resolution is the default active output mode', () => {
    render(<App />);
    const fullResBtn = screen.getByRole('button', { name: /full resolution/i });
    expect(fullResBtn.className).toContain('bg-zinc-800');
  });

  it('Copy Design button is inactive by default', () => {
    render(<App />);
    const copyBtn = screen.getByRole('button', { name: /copy design/i });
    expect(copyBtn.className).not.toContain('bg-zinc-800');
  });

  it('clicking Copy Design makes it active', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy design/i }));
    });
    expect(screen.getByRole('button', { name: /copy design/i }).className).toContain('bg-zinc-800');
    expect(screen.getByRole('button', { name: /full resolution/i }).className).not.toContain('bg-zinc-800');
  });

  it('does NOT show app detail inputs in Full Resolution mode', () => {
    render(<App />);
    expect(screen.queryByPlaceholderText(/app name/i)).not.toBeInTheDocument();
  });

  it('shows App Name input when Copy Design mode is selected', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy design/i }));
    });
    expect(screen.getByPlaceholderText(/app name/i)).toBeInTheDocument();
  });

  it('shows app description textarea when Copy Design mode is selected', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy design/i }));
    });
    expect(screen.getByPlaceholderText(/describe what your app does/i)).toBeInTheDocument();
  });

  it('shows target segment input when Copy Design mode is selected', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy design/i }));
    });
    expect(screen.getByPlaceholderText(/target segment/i)).toBeInTheDocument();
  });

  it('shows Claude API key input when Copy Design mode is selected', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy design/i }));
    });
    const keyInput = screen.getByPlaceholderText(/sk-ant/i) as HTMLInputElement;
    expect(keyInput).toBeInTheDocument();
    expect(keyInput.type).toBe('password');
  });

  it('switching back to Full Resolution hides the Copy Design inputs', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy design/i }));
    });
    expect(screen.getByPlaceholderText(/app name/i)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /full resolution/i }));
    });
    expect(screen.queryByPlaceholderText(/app name/i)).not.toBeInTheDocument();
  });

  it('shows feature description per-file input when Copy Design mode is active and a file is staged', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy design/i }));
    });
    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const file = new File(['fake'], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { fireEvent.change(input); });
    expect(screen.getByPlaceholderText(/what does this screen show/i)).toBeInTheDocument();
  });

  it('does NOT show feature description per-file input in Full Resolution mode', async () => {
    render(<App />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const file = new File(['fake'], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { fireEvent.change(input); });
    expect(screen.queryByPlaceholderText(/what does this screen show/i)).not.toBeInTheDocument();
  });

  it('process button label changes to "Generate" in Copy Design mode when files are staged', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy design/i }));
    });
    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const file = new File(['fake'], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { fireEvent.change(input); });
    expect(screen.getByRole('button', { name: /generate.*iphone.*ipad/i })).toBeInTheDocument();
  });
});

// ─── Android Studio UI ────────────────────────────────────────────────────
// Guards that the Android Studio view renders correctly: nav button,
// drop zone, output size info cards, and process button state.
describe('App — Android Studio UI', () => {
  const goToAndroid = async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /android studio/i }));
    });
  };

  it('shows an ANDROID STUDIO nav button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /android studio/i })).toBeInTheDocument();
  });

  it('clicking ANDROID STUDIO shows the Android Screenshot Studio heading', async () => {
    await goToAndroid();
    expect(screen.getByText(/android screenshot studio/i)).toBeInTheDocument();
  });

  it('shows all 3 Play Store output sizes in the sidebar', async () => {
    await goToAndroid();
    expect(screen.getByText(/1080.*1920/i)).toBeInTheDocument();
    expect(screen.getByText(/800.*1280/i)).toBeInTheDocument();
    expect(screen.getByText(/600.*1024/i)).toBeInTheDocument();
  });

  it('shows a file drop zone in ANDROID STUDIO view', async () => {
    await goToAndroid();
    expect(screen.getByText(/drop screenshots here/i)).toBeInTheDocument();
  });

  it('drop zone accepts both Android and Apple source screenshots', async () => {
    await goToAndroid();
    expect(screen.getByText(/android or apple source accepted/i)).toBeInTheDocument();
  });

  it('shows the process button in ANDROID STUDIO view', async () => {
    await goToAndroid();
    expect(screen.getByRole('button', { name: /process screenshots/i })).toBeInTheDocument();
  });

  it('process button is disabled when no files are loaded', async () => {
    await goToAndroid();
    expect(screen.getByRole('button', { name: /process screenshots/i })).toBeDisabled();
  });
});

// ─── Android Quick Process — 3-variant ───────────────────────────────────
// Guards the Android orchestration: one upload → phone + 10" tablet + 7" tablet
// → one tray slot with three variants.
describe('App — Android Quick Process (3-variant)', () => {
  let processAndroidQuickSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    processAndroidQuickSpy = vi
      .spyOn(imageUtilsModule, 'processAndroidQuick')
      .mockResolvedValue(new Blob(['img'], { type: 'image/png' }));

    createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    class MockFileReader {
      result: string | null = 'data:image/png;base64,abc';
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        Promise.resolve().then(() =>
          this.onload?.({ target: this } as ProgressEvent<FileReader>)
        );
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
  });

  afterEach(() => {
    processAndroidQuickSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const goToAndroidAndProcess = async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /android studio/i }));
    });
    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const file = new File(['fake'], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { fireEvent.change(input); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /process/i }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
  };

  it('calls processAndroidQuick exactly 3 times for a single uploaded file', async () => {
    await goToAndroidAndProcess();
    expect(processAndroidQuickSpy).toHaveBeenCalledTimes(3);
  });

  it('generates a phone variant, a 10" tablet variant, and a 7" tablet variant', async () => {
    await goToAndroidAndProcess();
    const specIds = processAndroidQuickSpy.mock.calls.map(([, spec]) => spec.id);
    expect(specIds).toContain(DeviceType.PHONE);
    expect(specIds).toContain(DeviceType.TABLET_10);
    expect(specIds).toContain(DeviceType.TABLET_7);
  });

  it('adds exactly one tray slot after processing one screenshot', async () => {
    await goToAndroidAndProcess();
    expect(screen.getByRole('button', { name: /tray \(1\)/i })).toBeInTheDocument();
  });

  it('navigates to TRAY view automatically after processing completes', async () => {
    await goToAndroidAndProcess();
    expect(screen.getByRole('button', { name: /export android kit/i })).toBeInTheDocument();
  });

  it('process button label says Phone + Tablets when a file is staged', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /android studio/i }));
    });
    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const file = new File(['fake'], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { fireEvent.change(input); });
    expect(screen.getByRole('button', { name: /phone.*tablets/i })).toBeInTheDocument();
  });

  it('ANDROID STUDIO is active (green) after clicking it', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /android studio/i }));
    });
    const androidBtn = screen.getByRole('button', { name: /android studio/i });
    expect(androidBtn.className).toContain('bg-green-700');
  });
});

// ─── Free-tier gating ─────────────────────────────────────────────────────
// Guards that anonymous / free users are blocked at 1 tray slot and that
// a second process attempt triggers the upgrade modal.
describe('App — Free-tier gating', () => {
  let processAppleQuickSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    processAppleQuickSpy = vi
      .spyOn(imageUtilsModule, 'processAppleQuick')
      .mockResolvedValue(new Blob(['img'], { type: 'image/png' }));
    createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    class MockFileReader {
      result: string | null = 'data:image/png;base64,abc';
      onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL(_file: File) {
        Promise.resolve().then(() =>
          this.onload?.({ target: this } as ProgressEvent<FileReader>)
        );
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows upgrade modal when a free user tries to process a 2nd screenshot', async () => {
    render(<App />);

    // First upload+process succeeds (tray goes to 1)
    const input1 = document.querySelector('input[multiple]') as HTMLInputElement;
    Object.defineProperty(input1, 'files', {
      value: [new File(['f'], 'a.png', { type: 'image/png' })],
      configurable: true,
    });
    await act(async () => { fireEvent.change(input1); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /process/i }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    // Navigate back to Apple Studio and try a 2nd file
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apple studio/i }));
    });
    const input2 = document.querySelector('input[multiple]') as HTMLInputElement;
    Object.defineProperty(input2, 'files', {
      value: [new File(['f2'], 'b.png', { type: 'image/png' })],
      configurable: true,
    });
    await act(async () => { fireEvent.change(input2); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /process/i }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    // Upgrade modal should be visible
    expect(screen.getByText(/upgrade/i)).toBeInTheDocument();
  });

  it('when a free user uploads 3 files, only 1 is processed and 2 appear locked in the tray', async () => {
    render(<App />);

    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const files = [
      new File(['f1'], 'a.png', { type: 'image/png' }),
      new File(['f2'], 'b.png', { type: 'image/png' }),
      new File(['f3'], 'c.png', { type: 'image/png' }),
    ];
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    await act(async () => { fireEvent.change(input); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /process/i }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    // Only 2 processAppleQuick calls (phone + iPad for the 1 allowed file)
    expect(processAppleQuickSpy).toHaveBeenCalledTimes(2);
    // Tray has exactly 1 slot filled
    expect(screen.getByRole('button', { name: /tray \(1\)/i })).toBeInTheDocument();
    // Locked slots render upgrade CTAs — 2 files locked so 2 buttons
    const lockBtns = screen.getAllByRole('button', { name: /upgrade to unlock/i });
    expect(lockBtns).toHaveLength(2);
  });
});
