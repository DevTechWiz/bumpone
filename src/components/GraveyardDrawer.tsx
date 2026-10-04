import React from 'react';
import { Archive, RefreshCw } from 'lucide-react';
import { Modal, Button } from './ui';
import { SlotItem } from '../lib/slotTypes';

export interface GraveyardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bumpedHistory: SlotItem[];
  onReclaimTurf: (item: SlotItem) => void;
  hasBackdrop?: boolean;
}

export const GraveyardDrawer: React.FC<GraveyardDrawerProps> = ({
  isOpen,
  onClose,
  bumpedHistory,
  onReclaimTurf,
  hasBackdrop = true,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasBackdrop={hasBackdrop}
      title="Billboard Archive (#101+)"
      subtitle="Listings ranked beyond the top 100 (#101+) are preserved here. Top up anytime to restore active billboard placement."
      maxWidth="lg"
    >
      <div className="space-y-4">
        {bumpedHistory.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] mx-auto flex items-center justify-center text-slate-400">
              <Archive className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">No Archived Billboard Spots Yet</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              All 100 spots on the billboard are live and active. When rank changes move a listing beyond Rank #100, it lands here (#101+) — preserved, ready to restore anytime.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {bumpedHistory.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.18] flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-12 h-12 rounded-lg object-cover bg-slate-900 border border-white/[0.08] shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h5 className="text-xs font-semibold text-white truncate">
                        {item.title}
                      </h5>
                      <span className="text-[10px] text-rose-300 font-mono bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-500/30">
                        Rank #{item.rank || 101 + index}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {item.owner_name || item.bidderName} &bull; Active Value: ${item.amountPaid}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<RefreshCw className="w-3 h-3" />}
                    onClick={() => {
                      onClose();
                      onReclaimTurf(item);
                    }}
                  >
                    Re-list on Billboard
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
