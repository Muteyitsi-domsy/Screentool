import React, { useState } from 'react';
import type { AuthState } from '../hooks/useAuth';

interface AuthModalProps {
  auth: AuthState;
  onSuccess: () => void;
  onClose: () => void;
}

type AuthTab = 'signin' | 'signup';

const AuthModal: React.FC<AuthModalProps> = ({ auth, onSuccess, onClose }) => {
  const [tab, setTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    if (tab === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: authError } = tab === 'signin'
      ? await auth.signIn(email, password)
      : await auth.signUp(email, password);
    setSubmitting(false);

    if (authError) {
      setError(authError);
      return;
    }
    onSuccess();
  };

  const handleGoogle = async () => {
    await auth.signInWithGoogle();
    // Supabase redirects; onAuthStateChange handles session on return
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_0_100px_rgba(0,0,0,0.8)]">
        <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-2">
          {tab === 'signin' ? 'Sign In' : 'Create Account'}
        </h3>
        <p className="text-zinc-500 text-[10px] font-black leading-relaxed uppercase tracking-wider mb-6">
          {tab === 'signin'
            ? 'Sign in to access your license.'
            : 'Create a free account to get started.'}
        </p>

        {/* Tab switcher */}
        <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 mb-6">
          <button
            onClick={() => { setTab('signin'); setError(null); }}
            className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${tab === 'signin' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            SIGN IN
          </button>
          <button
            onClick={() => { setTab('signup'); setError(null); }}
            className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${tab === 'signup' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            CREATE ACCOUNT
          </button>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogle}
          className="w-full py-3 mb-4 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-zinc-900 px-3 text-[8px] font-black text-zinc-600 uppercase tracking-widest">or</span>
          </div>
        </div>

        {/* Email + password fields */}
        <div className="space-y-3 mb-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-blue-500 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !submitting && handleSubmit()}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-blue-500 transition-colors"
          />
          {tab === 'signup' && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !submitting && handleSubmit()}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-blue-500 transition-colors"
            />
          )}
        </div>

        {error && (
          <p className="text-[10px] font-black text-red-400 uppercase tracking-wider mb-4">{error}</p>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 text-[10px] font-black text-white uppercase tracking-widest bg-blue-600 hover:bg-blue-500 rounded-2xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
            ) : tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-800/50 hover:bg-zinc-800 rounded-2xl transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
