'use client';

import React, { useState, useRef, useEffect } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { User, LogOut, Layers, ChevronDown, Zap, Bell } from 'lucide-react';
import { Avatar } from './ui';

export interface UserMenuProps {
  user: SupabaseUser;
  userHandle?: string;
  onSignOut: () => void;
  onViewProfile?: () => void;
  onViewMySlots?: () => void;
  onClaimSlot?: () => void;
  onOpenAlerts?: () => void;
  userSlotsCount?: number;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  user,
  userHandle: propUserHandle,
  onSignOut,
  onViewProfile,
  onViewMySlots,
  onClaimSlot,
  onOpenAlerts,
  userSlotsCount = 0,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userHandle = (
    propUserHandle ||
    user.user_metadata?.user_name ||
    user.user_metadata?.preferred_username ||
    'creator'
  ).toLowerCase().replace('@', '');

  const displayName =
    user.user_metadata?.custom_claims?.global_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    userHandle;

  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.12] text-xs text-neutral-200 transition-all cursor-pointer shadow-sm hover:border-amber-400/40"
        title="Account & Slots"
      >
        <Avatar
          src={avatarUrl}
          name={displayName}
          size="xs"
          ringClassName="ring-1 ring-white/20"
        />
        <span className="font-semibold max-w-[80px] sm:max-w-[120px] truncate text-white">
          @{userHandle}
        </span>
        {userSlotsCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-mono font-bold">
            {userSlotsCount}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#141518]/95 backdrop-blur-xl border border-white/[0.12] shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 divide-y divide-white/[0.06]">
          {/* User Header */}
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                <p className="text-[11px] text-amber-300 font-mono truncate">@{userHandle}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${userSlotsCount > 0
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-white/[0.06] text-neutral-400 border border-white/[0.08]'
                }`}>
                {userSlotsCount > 0 ? `${userSlotsCount} projects` : '0 projects'}
              </span>
            </div>
          </div>

          {/* Core Profile & Slot Actions */}
          <div className="py-1 space-y-0.5">
            {onViewProfile && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onViewProfile();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-neutral-200 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer text-left"
              >
                <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white leading-tight">User Profile & Projects</div>
                  <div className="text-[10px] text-neutral-400 truncate">Account stats & all your products</div>
                </div>
              </button>
            )}

            {onViewMySlots && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onViewMySlots();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-neutral-200 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-white leading-tight">My Billboard Spots</div>
                    <div className="text-[10px] text-neutral-400 truncate">View your projects on the billboard</div>
                  </div>
                </div>
                {userSlotsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-mono font-bold shrink-0">
                    {userSlotsCount}
                  </span>
                )}
              </button>
            )}

            {onClaimSlot && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onClaimSlot();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-neutral-200 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer text-left"
              >
                <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white leading-tight">Book Billboard Spot</div>
                  <div className="text-[10px] text-neutral-400 truncate">Place project or boost rank</div>
                </div>
              </button>
            )}
          </div>

          {/* Preferences & Notifications */}
          <div className="py-1">
            {onOpenAlerts && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenAlerts();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-neutral-200 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer text-left"
              >
                <div className="w-6 h-6 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <Bell className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white leading-tight">Billboard Alerts</div>
                  <div className="text-[10px] text-neutral-400 truncate">Email &amp; push notifications when rank drops</div>
                </div>
              </button>
            )}
          </div>

          {/* Session Logout */}
          <div className="pt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
