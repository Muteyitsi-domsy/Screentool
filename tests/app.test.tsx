/**
 * Reliability tests — App component (App.tsx)
 * Smoke-tests rendering, navigation, licensing display, and file validation.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../App';

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

// Mock Paddle so no external script is loaded in tests
vi.mock('../lib/paddle', () => ({
  initPaddle: vi.fn().mockResolvedValue(undefined),
  openPaddleCheckout: vi.fn(),
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

  it('EDITOR is the active view on first load', () => {
    render(<App />);
    // The EDITOR button should have the active style class
    const editorBtn = screen.getByRole('button', { name: /editor/i });
    expect(editorBtn.className).toContain('bg-zinc-800');
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

  it('Add Snapshot button is present in Editor view', () => {
    render(<App />);
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
