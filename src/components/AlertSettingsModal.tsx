import React, { useState, useEffect } from 'react';
import { Bell, Check, Mail, ShieldAlert, AlertCircle } from 'lucide-react';
import { Modal, Button } from './ui';
import { soundEngine } from '../lib/sound';
import {
  getStoredAlertPreferences,
  saveStoredAlertPreferences,
  requestBrowserNotificationPermission,
} from '../lib/browserNotifications';

export interface AlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export const AlertSettingsModal: React.FC<AlertSettingsModalProps> = ({
  isOpen,
  onClose,
  userEmail,
}) => {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [browserAlerts, setBrowserAlerts] = useState(false);
  const [instantKingAlert, setInstantKingAlert] = useState(true);
  const [saved, setSaved] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // Load stored preferences on modal open
  useEffect(() => {
    if (!isOpen) return;

    const localPrefs = getStoredAlertPreferences();
    setEmailAlerts(localPrefs.emailAlerts);
    setInstantKingAlert(localPrefs.instantKingAlert);

    // Sync browser alerts toggle with actual browser permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted' && localPrefs.browserAlerts) {
        setBrowserAlerts(true);
      } else {
        setBrowserAlerts(false);
      }
    }

    // If authenticated, sync with server
    if (userEmail) {
      fetch('/api/profile/alerts')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.preferences) {
            setEmailAlerts(data.preferences.emailAlerts ?? true);
            setInstantKingAlert(data.preferences.instantKingAlert ?? true);
            if (data.preferences.browserAlerts && Notification?.permission === 'granted') {
              setBrowserAlerts(true);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen, userEmail]);

  const handleToggleBrowserAlerts = async (checked: boolean) => {
    setPermissionNotice(null);

    if (!checked) {
      setBrowserAlerts(false);
      return;
    }

    const { granted, permission } = await requestBrowserNotificationPermission();
    if (granted) {
      setBrowserAlerts(true);
      soundEngine.playClick();
    } else {
      setBrowserAlerts(false);
      if (permission === 'unsupported') {
        setPermissionNotice('Desktop notifications are not supported in this browser.');
      } else if (permission === 'denied') {
        setPermissionNotice(
          'Notifications are blocked in your browser settings. Please enable notifications for bumpone.lol to receive desktop alerts.'
        );
      }
    }
  };

  const handleSave = async () => {
    soundEngine.playClick();
    const prefs = { emailAlerts, browserAlerts, instantKingAlert };

    // 1. Save locally
    saveStoredAlertPreferences(prefs);

    // 2. Sync to server if authenticated
    if (userEmail) {
      try {
        await fetch('/api/profile/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefs),
        });
      } catch (err) {
        console.warn('Failed to sync alert preferences to profile:', err);
      }
    }

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Billboard Rank Alerts"
      subtitle="Control how BumpOne notifies you when your billboard rank changes"
      maxWidth="md"
    >
      <div className="space-y-4 text-xs">
        {saved && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-emerald-300">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Alert preferences saved successfully!</span>
          </div>
        )}

        {permissionNotice && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{permissionNotice}</span>
          </div>
        )}

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-white">Email Rank Drop Notifications</div>
              <div className="text-[11px] text-slate-400">
                {userEmail ? (
                  <>
                    Receive transactional outbid emails to <span className="text-slate-200 font-mono">{userEmail}</span> when another project bumps your slot.
                  </>
                ) : (
                  <>Receive immediate emails when another project bumps your billboard slot (requires sign-in).</>
                )}
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={emailAlerts}
            onChange={(e) => setEmailAlerts(e.target.checked)}
            className="w-4 h-4 rounded accent-amber-400 cursor-pointer"
          />
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-white">Browser Push Alerts</div>
              <div className="text-[11px] text-slate-400">
                Show native OS desktop notifications when your slot is bumped, even while viewing other tabs.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={browserAlerts}
            onChange={(e) => handleToggleBrowserAlerts(e.target.checked)}
            className="w-4 h-4 rounded accent-amber-400 cursor-pointer"
          />
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-white">Graveyard &amp; King Alerts</div>
              <div className="text-[11px] text-slate-400">
                High-priority alerts if an incoming bump knocks you out of Rank #1 or into Rank #101 Graveyard.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={instantKingAlert}
            onChange={(e) => setInstantKingAlert(e.target.checked)}
            className="w-4 h-4 rounded accent-amber-400 cursor-pointer"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleSave}>
            Save Preferences
          </Button>
        </div>
      </div>
    </Modal>
  );
};
