import React, { useState } from 'react';
import { Bell, Check, Mail, ShieldAlert, Sparkles } from 'lucide-react';
import { Modal, Button } from './ui';
import { soundEngine } from '../lib/sound';

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

  const handleSave = () => {
    soundEngine.playClick();
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

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-white">Email Rank Drop Notifications</div>
              <div className="text-[11px] text-slate-400">
                Receive an immediate email to <span className="text-slate-200">{userEmail}</span> if another project bumps your billboard rank.
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
                Show real-time desktop popups while you have the billboard open in your browser.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={browserAlerts}
            onChange={(e) => setBrowserAlerts(e.target.checked)}
            className="w-4 h-4 rounded accent-amber-400 cursor-pointer"
          />
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-white">Archive Alert (#101+ Drop)</div>
              <div className="text-[11px] text-slate-400">
                High-priority alert if a higher placement moves your project past Rank #100 into the Billboard Archive.
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
