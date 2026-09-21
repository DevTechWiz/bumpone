import React, { useEffect } from 'react';
import { Zap, X } from 'lucide-react';
import { BumpEvent } from '../lib/slotTypes';
import { Badge } from './ui';

export interface BumpNotificationProps {
  event: BumpEvent | null;
  onDismiss: () => void;
}

export const BumpNotification: React.FC<BumpNotificationProps> = ({
  event,
  onDismiss,
}) => {
  useEffect(() => {
    if (!event) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 7000);
    return () => clearTimeout(timer);
  }, [event, onDismiss]);

  if (!event) return null;

  return (
      <div
        className="fixed top-20 right-4 z-50 max-w-md w-full sm:w-[420px] bg-[#18191d]/98 backdrop-blur-xl border border-white/[0.16] rounded-2xl shadow-2xl shadow-black/90 overflow-hidden animate-in fade-in slide-in-from-top-10 zoom-in-95 duration-300"
      >
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-white/[0.08] text-white border border-white/[0.12]">
                <Zap className="w-3.5 h-3.5 animate-pulse" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Live Bump Event
              </span>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Promoted Challenger */}
            <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Slotted In
              </span>
              <p className="font-semibold text-white truncate mt-0.5">
                {event.promotedItem.title}
              </p>
              <div className="flex items-center justify-between mt-1 font-mono text-[11px]">
                <Badge variant="rank" rank={event.newRank} />
                <span className="text-slate-200 font-semibold">
                  ${event.promotedItem.amountPaid}
                </span>
              </div>
            </div>

            {/* Dropped Casualty */}
            <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/25">
              <span className="text-[10px] font-mono text-rose-300 uppercase tracking-wider block">
                Deleted (#101)
              </span>
              <p className="font-medium text-slate-300 truncate mt-0.5">
                {event.droppedItem.title}
              </p>
              <div className="flex items-center justify-between mt-1 font-mono text-[11px]">
                <span className="text-rose-400 font-bold line-through">
                  #100
                </span>
                <span className="text-slate-400">
                  ${event.droppedItem.amountPaid}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-[11px] text-slate-300 leading-snug">
            <strong>{event.promotedItem.bidderName}</strong> paid{' '}
            <strong className="text-white font-mono">${event.promotedItem.amountPaid}</strong>, taking <strong>Rank #{event.newRank}</strong>. Slot #100 was pushed off into the graveyard.
          </p>
        </div>
      </div>
  );
};
