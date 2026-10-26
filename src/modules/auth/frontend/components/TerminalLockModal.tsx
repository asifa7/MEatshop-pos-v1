import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, AlertCircle, Shield } from 'lucide-react';
import { UserSession } from '../hooks/useAuth';

interface TerminalLockModalProps {
  isOpen: boolean;
  session: UserSession | null;
  shopName?: string;
  onUnlock: () => void;
}

export const TerminalLockModal: React.FC<TerminalLockModalProps> = ({
  isOpen,
  session,
  shopName = 'Meat Shop POS',
  onUnlock,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = async (submittedPin?: string) => {
    const value = (submittedPin !== undefined ? submittedPin : pin).trim();
    if (!value) {
      setError('Please enter your password or PIN.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const res = await window.api.invoke('auth:verify-password', { password: value });
      if (res?.success && res.data === true) {
        setPin('');
        setError(null);
        onUnlock();
      } else {
        // Fallback check: try auth:login to verify credentials
        if (session?.username) {
          const loginRes = await window.api.invoke('auth:login', {
            username: session.username,
            password: value,
          });
          if (loginRes?.success) {
            setPin('');
            setError(null);
            onUnlock();
            return;
          }
        }
        setError('Incorrect PIN or password. Please try again.');
        setPin('');
        inputRef.current?.focus();
      }
    } catch (err: any) {
      setError(err?.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyPress = (char: string) => {
    setError(null);
    if (char === 'CLEAR') {
      setPin('');
    } else if (char === 'BACK') {
      setPin(prev => prev.slice(0, -1));
    } else {
      const updated = pin + char;
      setPin(updated);
      if (updated.length >= 8 && (session?.role === 'CASHIER' || updated === 'admin123')) {
        handleVerify(updated);
      }
    }
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-surface-panel border border-border-subtle rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center space-y-4">
        {/* Lock Icon Header */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-500 shadow-inner">
            <Lock size={32} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow">
            <Shield size={12} />
          </div>
        </div>

        <div>
          <h2 className="text-base font-black font-outfit text-text-primary tracking-tight">
            Terminal Locked
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            {shopName} · Cashier: <strong className="text-text-primary">{session?.username || 'Active User'}</strong>
          </p>
          <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-card border border-border-subtle text-[10px] font-bold text-text-secondary">
            <span>Shift Active · Cart & Bills Preserved</span>
          </div>
        </div>

        {/* PIN / Password Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVerify();
          }}
          className="w-full space-y-3"
        >
          <div className="relative w-full">
            <input
              ref={inputRef}
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN or Password"
              className="w-full text-center text-lg tracking-widest font-mono bg-surface-card border-2 border-border-subtle focus:border-brand-500 rounded-2xl py-3 px-4 outline-none font-bold text-text-primary transition-all shadow-inner"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-rose-500 font-bold bg-rose-500/10 border border-rose-500/20 py-2 px-3 rounded-xl">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Touch Numpad */}
          <div className="grid grid-cols-3 gap-2 w-full pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (k === 'C') handleKeyPress('CLEAR');
                  else if (k === '⌫') handleKeyPress('BACK');
                  else handleKeyPress(k);
                }}
                className="h-11 rounded-xl bg-surface-card hover:bg-surface-hover active:bg-brand-500/20 border border-border-subtle font-black text-sm text-text-primary transition-all shadow-xs cursor-pointer flex items-center justify-center"
              >
                {k}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={isVerifying || !pin.trim()}
            className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-40 text-white rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 transition-all cursor-pointer mt-2"
          >
            {isVerifying ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                <Unlock size={15} />
                <span>Unlock Terminal</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
