import React, { useEffect } from 'react';
import { Zap, X, ShieldAlert, ArrowDownRight } from 'lucide-react';
import { BumpEvent } from '../lib/slotTypes';
import { Badge } from './ui';
import { soundEngine } from '../lib/sound';

export interface BumpNotificationProps {
  event: BumpEvent | null;
  onDismiss: () => void;
  onSelectSlot?: (slotId: string) => void;
}

export const BumpNotification: React.FC<BumpNotificationProps> = ({
  event,
  onDismiss,
  onSelectSlot,
}) => {
  useEffect(() => {
    if (!event) return;
    // Play subtle high-priority ping when toast appears
    soundEngine.playAlert();

    const timer = setTimeout(() => {
      onDismiss();
    }, 7000);
    return () => clearTimeout(timer);
  }, [event, onDismiss]);

  if (!event) return null;

  const dropped = event.droppedItem;
  const isArchived = Boolean(dropped && (dropped.rank > 100 || (event.previousRank && event.previousRank >= 100)));
  const isDisplaced = Boolean(dropped && !isArchived && dropped.id !== event.promotedItem?.id);

  return (
    <div
      className="fixed top-20 right-4 z-50 max-w-[calc(100vw-2rem)] sm:max-w-md w-full sm:w-[420px] bg-[#18191d]/98 backdrop-blur-xl border border-white/[0.16] rounded-2xl shadow-2xl shadow-black/90 overflow-hidden animate-in fade-in slide-in-from-top-10 zoom-in-95 duration-300"
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Live Billboard Bump
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            aria-label="Dismiss bump notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details Cards */}
        <div className={`grid ${dropped ? 'grid-cols-2' : 'grid-cols-1'} gap-2 text-xs`}>
          {/* Promoted Challenger */}
          <div
            onClick={() => onSelectSlot?.(event.promotedItem.id)}
            className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-amber-400/40 transition-colors cursor-pointer group"
          >
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Promoted To
            </span>
            <p className="font-semibold text-white group-hover:text-amber-300 transition-colors truncate mt-0.5">
              {event.promotedItem?.title || 'Contender'}
            </p>
            <div className="flex items-center justify-between mt-1 font-mono text-[11px]">
              <Badge variant="rank" rank={event.newRank} />
              <span className="text-slate-200 font-semibold">
                ${event.promotedItem?.activeValue?.toLocaleString() || '0'}
              </span>
            </div>
          </div>

          {/* Dropped / Displaced Casualty */}
          {dropped && (
            <div
              className={`p-2.5 rounded-xl border ${
                isArchived
                  ? 'bg-rose-950/30 border-rose-500/25'
                  : 'bg-amber-950/20 border-amber-500/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider block ${
                    isArchived ? 'text-rose-300' : 'text-amber-300'
                  }`}
                >
                  {isArchived ? 'Archived (#101)' : 'Pushed Down'}
                </span>
                {isArchived ? (
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-amber-400" />
                )}
              </div>
              <p className="font-medium text-slate-300 truncate mt-0.5">
                {dropped.title || 'Displaced Slot'}
              </p>
              <div className="flex items-center justify-between mt-1 font-mono text-[11px]">
                <span className={`font-bold ${isArchived ? 'text-rose-400' : 'text-amber-400'}`}>
                  Rank #{dropped.rank || (isArchived ? 101 : event.newRank + 1)}
                </span>
                <span className="text-slate-400">
                  ${dropped.activeValue?.toLocaleString() || '0'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Narrative Description */}
        <p className="text-[11px] text-slate-300 leading-snug">
          <strong>{event.promotedItem?.bidderName || '@anonymous'}</strong> bumped into{' '}
          <strong className="text-white">Rank #{event.newRank}</strong> with{' '}
          <strong className="text-white font-mono">
            ${event.promotedItem?.activeValue?.toLocaleString() || '0'}
          </strong>
          .{' '}
          {isArchived ? (
            <span>
              <strong>{dropped?.title || 'Contender'}</strong> was knocked down to{' '}
              <strong className="text-rose-300 font-mono">Rank #101</strong> in the Graveyard.
            </span>
          ) : isDisplaced ? (
            <span>
              <strong>{dropped?.title || 'Contender'}</strong> was pushed down to{' '}
              <strong className="text-amber-300 font-mono">
                Rank #{dropped?.rank || event.newRank + 1}
              </strong>
              .
            </span>
          ) : (
            <span>All top 100 spots remain live on the billboard.</span>
          )}
        </p>
      </div>
    </div>
  );
};
