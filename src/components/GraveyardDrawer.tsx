import React, { useState } from 'react';
import { Archive, RefreshCw, ExternalLink } from 'lucide-react';
import { Modal, Button } from './ui';
import { SlotItem } from '../lib/slotTypes';

export interface GraveyardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bumpedHistory: SlotItem[];
  onReclaimTurf: (item: SlotItem) => void;
  onViewProject?: (projectId: string) => void;
  isOwner?: (item: SlotItem) => boolean;
  hasBackdrop?: boolean;
}

interface GraveyardCardProps {
  item: SlotItem;
  index: number;
  isOwned: boolean;
  onReclaim: () => void;
  onViewProject?: (projectId: string) => void;
}

const GraveyardCard: React.FC<GraveyardCardProps> = ({
  item,
  index,
  isOwned,
  onReclaim,
  onViewProject,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div
      className={`p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.18] flex items-center justify-between gap-3 transition-all ${
        onViewProject ? 'cursor-pointer hover:bg-white/[0.05]' : ''
      }`}
      onClick={() => {
        if (onViewProject) {
          onViewProject(item.id);
        }
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-12 h-12 rounded-lg bg-slate-900 border border-white/[0.08] shrink-0 overflow-hidden flex items-center justify-center">
          {item.imageUrl && !imageFailed ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              onError={() => setImageFailed(true)}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black/40 text-slate-500">
              <Archive className="w-5 h-5 stroke-1" />
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <h5 className="text-xs font-semibold text-white truncate">
              {item.title}
            </h5>
            <span className="text-[10px] text-rose-300 font-mono bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-500/30 shrink-0">
              Rank #{item.rank || 101 + index}
            </span>
            {isOwned && (
              <span className="text-[9px] text-amber-300 font-mono bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0 font-bold">
                You
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {item.owner_name || item.bidderName} &bull; Active Value: ${item.activeValue}
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {isOwned ? (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<RefreshCw className="w-3 h-3" />}
            onClick={onReclaim}
          >
            Top Up to Reclaim
          </Button>
        ) : item.linkUrl ? (
          <a
            href={item.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] hover:text-white border border-white/[0.08] transition-colors"
          >
            Visit
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        ) : null}
      </div>
    </div>
  );
};

export const GraveyardDrawer: React.FC<GraveyardDrawerProps> = ({
  isOpen,
  onClose,
  bumpedHistory,
  onReclaimTurf,
  onViewProject,
  isOwner,
  hasBackdrop = true,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasBackdrop={hasBackdrop}
      title="Billboard Graveyard (#101+)"
      subtitle="Listings displaced beyond the top 100 (#101+) reside in the Graveyard. Owners can top up anytime to restore active billboard placement."
      maxWidth="lg"
    >
      <div className="space-y-4">
        {bumpedHistory.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] mx-auto flex items-center justify-center text-slate-400">
              <Archive className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">No Projects in Graveyard</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              All 100 spots on the billboard are live and active. When incoming bumps move a listing beyond Rank #100, it lands here in the Graveyard (#101+) — preserved with active value intact, ready to restore anytime.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {bumpedHistory.map((item, index) => (
              <GraveyardCard
                key={`${item.id}-${index}`}
                item={item}
                index={index}
                isOwned={Boolean(isOwner?.(item))}
                onReclaim={() => {
                  onClose();
                  onReclaimTurf(item);
                }}
                onViewProject={onViewProject}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
