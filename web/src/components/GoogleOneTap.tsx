'use client';

import React, { useEffect } from 'react';
import Script from 'next/script';
import { createClient } from '../lib/supabase/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (momentListener?: (notification: any) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

export interface GoogleOneTapProps {
  clientId?: string;
  disabled?: boolean;
}

// Generate raw and SHA-256 hashed nonce required by Supabase & Google Identity Services
async function generateNonce(): Promise<{ rawNonce: string; hashedNonce: string }> {
  const rawNonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const encoder = new TextEncoder();
  const encodedNonce = encoder.encode(rawNonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return { rawNonce, hashedNonce };
}

export const GoogleOneTap: React.FC<GoogleOneTapProps> = ({
  clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  disabled = false,
}) => {
  useEffect(() => {
    if (!clientId || disabled) return;

    let isMounted = true;

    const initializeOneTap = async () => {
      if (!window.google?.accounts?.id || !isMounted) return;

      const supabase = createClient();
      const { rawNonce, hashedNonce } = await generateNonce();

      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;

          try {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
              nonce: rawNonce,
            });

            if (error) {
              console.error('Google One Tap Supabase error:', error.message);
            }
          } catch (err) {
            console.error('Google One Tap sign-in failed:', err);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Show Google One Tap prompt
      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed()) {
          // One Tap suppressed (e.g. cooldown or dismissed recently)
        }
      });
    };

    if (window.google?.accounts?.id) {
      initializeOneTap();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          initializeOneTap();
        }
      }, 300);

      const timeout = setTimeout(() => clearInterval(interval), 5000);
      return () => {
        isMounted = false;
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    return () => {
      isMounted = false;
      window.google?.accounts?.id?.cancel();
    };
  }, [clientId, disabled]);

  if (!clientId || disabled) return null;

  return (
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
    />
  );
};
