'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from './ui';
import { createClient } from '../lib/supabase/client';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess: _onSuccess,
}) => {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'x' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClose = () => {
    setLoadingProvider(null);
    setErrorMessage(null);
    onClose();
  };

  const handleOAuthSignIn = async (provider: 'google' | 'x') => {
    setErrorMessage(null);
    setLoadingProvider(provider);

    try {
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider === 'x' ? 'twitter' : provider,
        options: {
          redirectTo: redirectUrl,
          queryParams: provider === 'google' ? {
            access_type: 'offline',
            prompt: 'select_account',
          } : undefined,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setLoadingProvider(null);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to initialize sign-in.');
      setLoadingProvider(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="sm"
    >
      <div className="pt-3 pb-2 px-1">
        {/* Header Emblem & Title */}
        <div className="text-center pb-6">
          <div className="relative inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-b from-white/[0.12] to-white/[0.04] border border-white/[0.16] shadow-lg mb-3 p-2">
            <Image
              src="/bumpone-logo.png"
              alt="BumpOne Logo"
              width={40}
              height={40}
              className="w-full h-full object-contain"
              priority
            />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-[#18191d]" />
          </div>
          
          <h3 className="text-lg font-bold tracking-tight text-white">
            Sign in to <span className="text-white">BumpOne</span><span className="text-amber-400">.lol</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Claim, promote, and showcase your project on the billboard
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* High-Contrast SSO Buttons */}
        <div className="space-y-3">
          {/* Google Button */}
          <button
            type="button"
            onClick={() => handleOAuthSignIn('google')}
            disabled={loadingProvider !== null}
            className="w-full h-11 flex items-center justify-center gap-3 px-4 rounded-xl bg-white text-neutral-900 font-semibold text-xs tracking-wide hover:bg-neutral-100 active:bg-neutral-200 transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-lg shadow-black/20"
          >
            {loadingProvider === 'google' ? (
              <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.1-2 .4-2.7L1.6 6.4C.6 8.3 0 10.1 0 12s.6 3.7 1.6 5.6l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          {/* X / Twitter Button */}
          <button
            type="button"
            onClick={() => handleOAuthSignIn('x')}
            disabled={loadingProvider !== null}
            className="w-full h-11 flex items-center justify-center gap-3 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] active:bg-white/[0.05] border border-white/[0.14] hover:border-white/[0.25] text-xs font-semibold text-white transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]"
          >
            {loadingProvider === 'x' ? (
              <Loader2 className="w-4 h-4 animate-spin text-neutral-300" />
            ) : (
              <svg className="w-3.5 h-3.5 fill-current text-white" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            )}
            <span>Continue with X</span>
          </button>
        </div>

        {/* WCAG AA compliant footer */}
        <p className="text-[11px] text-center text-neutral-400 mt-6">
          By signing in, you agree to the Billboard Advertising Rules & Guidelines.
        </p>
      </div>
    </Modal>
  );
};
