import React, { useState, useEffect, useRef } from 'react';
import {
  DollarSign,
  Image as ImageIcon,
  Link as LinkIcon,
  Crown,
  Sparkles,
  Zap,
  ArrowRight,
  ArrowLeft,
  Upload,
  Check,
  Shield,
  Tag,
  Lock,
  ShieldCheck,
  AtSign,
  ChevronDown,
} from 'lucide-react';
import { Modal, Input, Button, Badge } from './ui';
import { SlotItem } from '../lib/slotTypes';
import { getRankTier } from './ui/Badge';
import { MIN_TOP_UP } from '../lib/board';
import { useAuth } from '../lib/useAuth';

export interface TopUpOrder {
  projectId?: string;
  title: string;
  handle: string;
  linkUrl: string;
  imageUrl: string;
  category: string;
  topUp: number;
  resultingValue: number;
  currentValue: number;
  aspectRatio?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface TakeOverModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSlots: SlotItem[];
  entryFloor: number;
  categories: string[];
  existingHandles: {
    id: string;
    title: string;
    activeValue: number;
    handle?: string;
    imageUrl?: string;
    linkUrl?: string;
    category?: string;
    owner_id?: string;
  }[];
  preselectedTargetSlot?: SlotItem | null;
  onSubmitTopUp: (order: TopUpOrder) => void;
  hasBackdrop?: boolean;
  onBack?: () => void;
}

const CATEGORY_ICON = Tag;

export const TakeOverModal: React.FC<TakeOverModalProps> = ({
  isOpen,
  onClose,
  onBack,
  currentSlots,
  entryFloor,
  categories,
  existingHandles,
  preselectedTargetSlot,
  onSubmitTopUp,
  hasBackdrop = true,
}) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [holderId, setHolderId] = useState<string>('');
  const [topUpStr, setTopUpStr] = useState<string>(String(MIN_TOP_UP));
  const [imageUrl, setImageUrl] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<string>(categories[0] ?? 'AI');
  const [imageError, setImageError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width?: number; height?: number; aspectRatio?: number }>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const measureImageDimensions = (src: string) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setImageDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: Number((img.naturalWidth / img.naturalHeight).toFixed(3)),
        });
      }
    };
    img.src = src;
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.url) {
        setImageUrl(data.url);
        setImageError(false);
        measureImageDimensions(data.url);
        setIsUploading(false);
        return;
      } else {
        setErrorMsg(data?.error || 'Failed to upload image. Max 5MB, JPG/PNG/WebP only.');
        setIsUploading(false);
        return;
      }
    } catch {
      setErrorMsg('Network error while uploading image. Please try again.');
      setIsUploading(false);
    }
  };

  // Sync defaults when opened: prefill top-up to pass the preselected target.
  useEffect(() => {
    if (isOpen) {
      if (preselectedTargetSlot) {
        const isMine = existingHandles.some((h) => h.id === preselectedTargetSlot.id);
        if (isMine) {
          setMode('existing');
          setHolderId(preselectedTargetSlot.id);
          const holderObj = existingHandles.find((h) => h.id === preselectedTargetSlot.id);
          if (holderObj) {
            setTitle(holderObj.title);
            if (holderObj.imageUrl) {
              setImageUrl(holderObj.imageUrl);
              measureImageDimensions(holderObj.imageUrl);
            }
            if (holderObj.linkUrl) setLinkUrl(holderObj.linkUrl);
            if (holderObj.category) setCategory(holderObj.category);
          }
          setTopUpStr(String(MIN_TOP_UP));
        } else if (existingHandles.length > 0) {
          // Rival slot clicked: user owns projects, allow them to outbid with their first project
          setMode('existing');
          const firstProj = existingHandles[0];
          setHolderId(firstProj.id);
          setTitle(firstProj.title);
          if (firstProj.imageUrl) {
            setImageUrl(firstProj.imageUrl);
            measureImageDimensions(firstProj.imageUrl);
          }
          if (firstProj.linkUrl) setLinkUrl(firstProj.linkUrl);
          if (firstProj.category) setCategory(firstProj.category);
          const needed = Math.max(MIN_TOP_UP, preselectedTargetSlot.amountPaid - firstProj.activeValue + 10);
          setTopUpStr(String(needed));
        } else {
          // No projects owned yet: bid a new project to pass the target
          setMode('new');
          setTopUpStr(String(Math.max(MIN_TOP_UP, preselectedTargetSlot.amountPaid + 10)));
          setTitle('');
          setLinkUrl('');
        }
      } else {
        if (existingHandles.length === 0) {
          setMode('new');
        }
        setTopUpStr(String(Math.max(MIN_TOP_UP, entryFloor + 10)));
        if (mode === 'new' && !title) {
          setTitle('');
          setLinkUrl('');
        }
      }
      setErrorMsg(null);
      setFailed(false);
      setImageError(false);
      if (imageUrl) {
        measureImageDimensions(imageUrl);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, entryFloor, preselectedTargetSlot]);

  const holder = existingHandles.find((h) => h.id === holderId) ?? null;

  // Sync details once when an existing project is selected from dropdown
  useEffect(() => {
    if (mode === 'existing' && holderId) {
      const selected = existingHandles.find((h) => h.id === holderId);
      if (selected) {
        if (selected.title) setTitle(selected.title);
        if (selected.imageUrl) {
          setImageUrl(selected.imageUrl);
          measureImageDimensions(selected.imageUrl);
        }
        if (selected.linkUrl) setLinkUrl(selected.linkUrl);
        if (selected.category) setCategory(selected.category);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, holderId]);

  const handleModeChange = (newMode: 'new' | 'existing') => {
    setMode(newMode);
    setErrorMsg(null);
    if (newMode === 'new') {
      setTitle('');
      setLinkUrl('');
      setHolderId('');
      setImageUrl('');
      setImageDimensions({});
    } else if (existingHandles.length > 0) {
      const initialHolder = holderId ? existingHandles.find((h) => h.id === holderId) : existingHandles[0];
      if (initialHolder) {
        setHolderId(initialHolder.id);
        if (initialHolder.title) setTitle(initialHolder.title);
        if (initialHolder.imageUrl) {
          setImageUrl(initialHolder.imageUrl);
          measureImageDimensions(initialHolder.imageUrl);
        }
        if (initialHolder.linkUrl) setLinkUrl(initialHolder.linkUrl);
        if (initialHolder.category) setCategory(initialHolder.category);
      }
    }
  };

  const currentValue = mode === 'existing' && holder ? holder.activeValue : 0;
  const parsedTopUp = Math.floor(parseFloat(topUpStr) || 0);
  const resultingValue = currentValue + Math.max(0, parsedTopUp);

  // Derive verified creator handle from authenticated session or selected project holder.
  // Locked down to prevent impersonation and identity spoofing on the board.
  const authUsername =
    user?.user_metadata?.user_name ||
    user?.user_metadata?.preferred_username ||
    (user?.email ? user.email.split('@')[0] : null);

  const effectiveHandle =
    mode === 'existing' && holder
      ? (holder.handle?.startsWith('@') ? holder.handle : `@${holder.handle || 'creator'}`)
      : authUsername
      ? (authUsername.startsWith('@') ? authUsername : `@${authUsername}`)
      : '@challenger';

  const boardValues = React.useMemo(() => {
    const pool = mode === 'existing' && holder ? currentSlots.filter((s) => s.id !== holder.id) : currentSlots;
    return pool.map((s) => s.amountPaid).sort((a, b) => b - a);
  }, [currentSlots, mode, holder]);

  // Live projection: recompute rank against the CURRENT board (quotes never reserve).
  const projectedRank = React.useMemo(() => {
    if (resultingValue <= 0) return null;
    return recomputeRankValues(boardValues, resultingValue);
  }, [resultingValue, boardValues]);

  const tierProjected = React.useMemo(() => {
    if (!projectedRank || projectedRank > 100) return 'dropped';
    return getRankTier(projectedRank);
  }, [projectedRank]);

  const bumpedVictim = projectedRank && projectedRank <= 100 ? currentSlots[projectedRank - 1] : null;
  const victimSlot100 = currentSlots[99] || null;
  // Only new project bids displace slot #100 off the board (existing top-ups reorder internally)
  const willDisplaceSlot100 = mode === 'new' && victimSlot100 && projectedRank && projectedRank <= 100;

  const handleQuickPreset = (targetAmount: number) => {
    // Canonical presets: top-up needed for a fresh profile to pass a tier anchor.
    setTopUpStr(String(Math.max(MIN_TOP_UP, targetAmount - currentValue + 10)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedTopUp < MIN_TOP_UP) {
      setErrorMsg(`Minimum top-up is $${MIN_TOP_UP}. Payments and active values use whole USD only.`);
      return;
    }
    if (mode === 'existing' && !holder) {
      setErrorMsg('Pick the project you already hold to top it up.');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('Please enter a project or product name.');
      return;
    }
    if (!imageUrl.trim()) {
      setErrorMsg(mode === 'new' ? 'Please upload your project logo or artwork.' : 'Project artwork is missing.');
      return;
    }
    if (!linkUrl.trim()) {
      setErrorMsg('Please enter a destination link URL (https://).');
      return;
    }
    if (!/^https:\/\//i.test(linkUrl.trim())) {
      setErrorMsg('Destination link must start with https://');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const orderData: TopUpOrder = {
      projectId: mode === 'existing' && holder ? holder.id : undefined,
      topUp: parsedTopUp,
      resultingValue,
      currentValue,
      imageUrl: imageUrl.trim(),
      linkUrl: linkUrl.trim(),
      title: title.trim(),
      handle: effectiveHandle,
      category,
      aspectRatio: imageDimensions.aspectRatio,
      naturalWidth: imageDimensions.width,
      naturalHeight: imageDimensions.height,
    };

    try {
      const res = await fetch('/api/purchase/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          mode: mode === 'existing' ? 'top_up' : 'new',
          profileId: mode === 'existing' && holder ? holder.id : undefined,
          topUpAmount: parsedTopUp,
          currentValue,
          targetRank: projectedRank,
          title: orderData.title,
          handle: effectiveHandle,
          linkUrl: orderData.linkUrl,
          imageUrl: orderData.imageUrl,
          category: orderData.category,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to initiate purchase session.');
        setIsSubmitting(false);
        return;
      }

      if (data.checkout_url && !data.checkout_url.includes('localhost') && !data.checkout_url.includes('127.0.0.1')) {
        // Redirect to external Dodo Hosted Checkout
        window.location.href = data.checkout_url;
        return;
      }

      // Local / simulated checkout confirmation: apply to interactive UI
      onSubmitTopUp(orderData);
      onClose();
    } catch (err: any) {
      console.warn('Purchase API offline or local fallback:', err);
      onSubmitTopUp(orderData);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const kingSlot = currentSlots[0];
  const eliteSlot13 = currentSlots[12] || currentSlots[currentSlots.length - 1];
  const lordSlot40 = currentSlots[39] || currentSlots[currentSlots.length - 1];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onBack={onBack}
      zIndex="z-[70]"
      hasBackdrop={hasBackdrop}
      title="Claim Your Turf on the Board"
      subtitle={`Rank is determined by Active Value. Minimum top-up $${MIN_TOP_UP}. Board floor: $${entryFloor}.`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Active Value banner in dark glass */}
        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-white/[0.08] text-slate-200 mt-0.5 border border-white/[0.1]">
            <Zap className="w-4 h-4" />
          </div>
          <div className="text-xs text-slate-300 leading-relaxed space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-200">Your active value carries forward:</span>
              <span className="font-mono font-bold text-white text-sm">
                ${currentValue} + ${parsedTopUp || 0} = ${resultingValue}
              </span>
            </div>
            <p className="text-slate-400 text-[11px]">
              You only pay the top-up — never repay what you already hold. Quote valid 10:00, recomputed at payment; final position is the highest your paid value qualifies for.
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/40 border border-white/[0.08]">
          <button
            type="button"
            onClick={() => handleModeChange('new')}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'new' ? 'bg-white text-zinc-950 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Bid New Project
          </button>
          <button
            type="button"
            disabled={existingHandles.length === 0}
            onClick={() => {
              if (existingHandles.length === 0) return;
              handleModeChange('existing');
            }}
            title={existingHandles.length === 0 ? "You don't own any active projects yet" : undefined}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
              existingHandles.length === 0
                ? 'opacity-40 cursor-not-allowed text-neutral-500'
                : mode === 'existing'
                ? 'bg-white text-zinc-950 shadow-sm cursor-pointer'
                : 'text-neutral-400 hover:text-white cursor-pointer'
            }`}
          >
            Bump Existing Project {existingHandles.length > 0 ? `(${existingHandles.length})` : ''}
          </button>
        </div>

        {mode === 'existing' && (
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wider block mb-1.5">
              Select Project to Bump
            </label>
            <div className="relative">
              <select
                value={holderId}
                onChange={(e) => setHolderId(e.target.value)}
                className="w-full appearance-none bg-[#141519] text-neutral-100 text-xs rounded-xl border border-white/[0.12] px-3.5 py-2.5 pr-9 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 hover:border-white/[0.2] transition-colors cursor-pointer"
              >
                <option value="" className="bg-[#18191d] text-neutral-400">
                  Select project to bump…
                </option>
                {existingHandles.map((h) => (
                  <option key={h.id} value={h.id} className="bg-[#18191d] text-white py-1">
                    {h.title} (${h.activeValue})
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {/* Quick Targets in dark glass */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 uppercase tracking-wider">
            Quick Rank Targets
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleQuickPreset(entryFloor)}
              className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08] hover:border-white/[0.2] text-left transition-all cursor-pointer"
            >
              <span className="block text-[10px] text-slate-400 font-medium">
                {currentValue >= entryFloor && currentValue > 0 ? 'Floor Target' : 'Enter Grid (#100)'}
              </span>
              <span className="block text-sm font-mono font-semibold text-white">
                ${Math.max(MIN_TOP_UP, entryFloor - currentValue + 10)}
              </span>
            </button>

            {lordSlot40 && (
              <button
                type="button"
                onClick={() => handleQuickPreset(lordSlot40.amountPaid)}
                className="p-2.5 rounded-xl bg-black/40 border border-zinc-600/40 hover:border-zinc-400/60 text-left transition-all cursor-pointer"
              >
                <span className="block text-[10px] text-zinc-300 font-medium flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" /> Top 40 Spot
                </span>
                <span className="block text-sm font-mono font-semibold text-zinc-200">
                  ${Math.max(MIN_TOP_UP, lordSlot40.amountPaid - currentValue + 10)}
                </span>
              </button>
            )}

            {eliteSlot13 && (
              <button
                type="button"
                onClick={() => handleQuickPreset(eliteSlot13.amountPaid)}
                className="p-2.5 rounded-xl bg-black/40 border border-white/[0.12] hover:border-white/[0.25] text-left transition-all cursor-pointer"
              >
                <span className="block text-[10px] text-slate-300 font-medium flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Top 10 Spot
                </span>
                <span className="block text-sm font-mono font-semibold text-slate-200">
                  ${Math.max(MIN_TOP_UP, eliteSlot13.amountPaid - currentValue + 10)}
                </span>
              </button>
            )}

            {kingSlot && (
              <button
                type="button"
                onClick={() => handleQuickPreset(kingSlot.amountPaid)}
                className="p-2.5 rounded-xl bg-black/40 border border-amber-400/30 hover:border-amber-400/60 text-left transition-all cursor-pointer"
              >
                <span className="block text-[10px] text-amber-300 font-medium flex items-center gap-1">
                  <Crown className="w-2.5 h-2.5" /> Bump #1 Crown
                </span>
                <span className="block text-sm font-mono font-semibold text-amber-200">
                  ${Math.max(MIN_TOP_UP, kingSlot.amountPaid - currentValue + 10)}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 1. Top-up Amount */}
        <div className="space-y-1.5">
          <Input
            label="1. Top-Up Amount ($ USD)"
            type="number"
            min={MIN_TOP_UP}
            step="1"
            required
            value={topUpStr}
            onChange={(e) => {
              setTopUpStr(e.target.value);
              setErrorMsg(null);
            }}
            leftAddon={<DollarSign className="w-4 h-4 text-slate-400" />}
            placeholder="Enter at least $10"
          />
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[10px] text-slate-400 font-mono">Quick Stepper:</span>
            {[10, 25, 50, 100].map((inc) => (
              <button
                key={inc}
                type="button"
                onClick={() => {
                  const cur = Math.max(0, parseInt(topUpStr) || 0);
                  setTopUpStr(String(cur + inc));
                  setErrorMsg(null);
                }}
                className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white border border-white/[0.08] transition-all cursor-pointer"
              >
                +${inc}
              </button>
            ))}
          </div>
        </div>

        {/* Live Rank Projection Calculator Box */}
        {projectedRank && (
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              tierProjected === 'king'
                ? 'bg-amber-950/20 border-amber-400/40 text-amber-200'
                : tierProjected === 'elite'
                ? 'bg-white/[0.05] border-white/[0.18] text-neutral-200'
                : tierProjected === 'lord'
                ? 'bg-zinc-800/40 border-zinc-500/30 text-zinc-200'
                : tierProjected === 'contender'
                ? 'bg-black/40 border-white/[0.08] text-neutral-300'
                : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                  Projected Outcome:
                </span>
                <Badge variant="rank" rank={projectedRank <= 100 ? projectedRank : 100} />
              </div>
              <span className="text-xs font-mono font-medium text-neutral-300">
                {tierProjected === 'king' && '👑 #1 King Spot (4x4 center)'}
                {tierProjected === 'elite' && '⚡ Top 10 Spot (2x2 grid)'}
                {tierProjected === 'lord' && '🛡️ Top 40 Spot'}
                {tierProjected === 'contender' && '🎯 Active Spot (1x1)'}
                {tierProjected === 'dropped' && 'Below #100 — saved off-grid'}
              </span>
            </div>

            {projectedRank <= 100 && (
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                At <strong>${resultingValue}</strong> active value, you bump to <strong>Rank #{projectedRank}</strong> (recomputed at payment).
                {bumpedVictim && (
                  <span>
                    {' '}You shift <strong>{bumpedVictim.title}</strong> down to #{projectedRank + 1}.
                  </span>
                )}
                {willDisplaceSlot100 && victimSlot100 && (
                  <span className="text-rose-400 font-medium block mt-1">
                    Slot #100 (<strong>{victimSlot100.title}</strong>) leaves the wall into the graveyard.
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* 2. Project Logo & Artwork Upload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wider block">
              2. Project Logo & Artwork (1:1 Square)
            </label>
            <span className="text-[10px] text-amber-400/90 font-mono tracking-wide uppercase flex items-center gap-1">
              {mode === 'new' ? 'Mandatory • Max 5MB' : 'Live Board Artwork'}
            </span>
          </div>

          {/* Drag and Drop Zone or Manual File Selection */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                handleFileUpload(file);
              }
            }}
            className={`p-3.5 rounded-xl border transition-all ${
              isDragging
                ? 'bg-indigo-500/10 border-indigo-400'
                : imageUrl
                ? 'bg-black/40 border-white/[0.14]'
                : 'bg-black/30 border-dashed border-white/[0.2] hover:border-white/[0.35]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-slate-900 overflow-hidden shrink-0 border border-white/[0.12] flex items-center justify-center relative shadow-inner">
                  {!imageError && imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Project Logo"
                      onError={() => setImageError(true)}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <ImageIcon className="w-6 h-6 stroke-[1.5]" />
                    </div>
                  )}
                </div>
                <div className="text-xs space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-white block">
                      {isUploading
                        ? 'Uploading to Cloudflare CDN…'
                        : imageUrl
                        ? 'Project Logo Ready'
                        : 'Upload Project Logo'}
                    </span>
                    {imageUrl && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        ✓ Ready
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {imageDimensions.width && imageDimensions.height ? (
                      <span className="text-emerald-400 font-mono">
                        {imageDimensions.width}&times;{imageDimensions.height}px ({imageDimensions.aspectRatio}:1)
                      </span>
                    ) : (
                      'Upload high-res JPG, PNG, or WebP (square recommended)'
                    )}
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file);
                  }
                }}
              />

              <Button
                type="button"
                variant={imageUrl ? 'secondary' : 'primary'}
                size="sm"
                leftIcon={<Upload className="w-3.5 h-3.5" />}
                onClick={() => fileInputRef.current?.click()}
                className="text-xs py-1.5 shrink-0"
              >
                {imageUrl ? 'Replace Logo' : 'Upload Logo'}
              </Button>
            </div>
          </div>
        </div>

        {/* 3. Destination Link */}
        <Input
          label="3. Destination Link URL (https only)"
          type="url"
          required
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          leftAddon={<LinkIcon className="w-4 h-4" />}
          placeholder="https://yourproject.com"
          helperText="Where users go when clicking your tile on the board"
        />

        {/* Project Name & Creator Handle + Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Project / Product Name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. My Next Project"
            required
            helperText={mode === 'existing' ? "Editable — update or rebrand anytime" : undefined}
          />
          <Input
            label="Creator Handle"
            value={effectiveHandle}
            readOnly
            disabled
            leftAddon={<AtSign className="w-3.5 h-3.5 text-slate-400" />}
            rightAddon={
              user ? (
                <span title="Verified Account">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </span>
              ) : (
                <span title="Locked Handle">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                </span>
              )
            }
            helperText={
              user
                ? "Locked & verified to your account"
                : mode === 'existing'
                ? "Locked to project owner"
                : "Sign in to bind your verified handle"
            }
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-300 uppercase tracking-wider flex items-center gap-1 mb-1.5">
            <CATEGORY_ICON className="w-3 h-3" /> Category
          </label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full appearance-none bg-[#141519] text-neutral-100 text-xs rounded-xl border border-white/[0.12] px-3.5 py-2.5 pr-9 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 hover:border-white/[0.2] transition-colors cursor-pointer"
            >
              {categories.map((c) => (
                <option key={c} value={c} className="bg-[#18191d] text-white py-1">
                  {c}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs font-medium text-rose-300">
            {errorMsg}
          </div>
        )}

        {failed ? (
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 text-center space-y-2">
            <p className="text-sm font-bold text-white">Payment failed</p>
            <p className="text-xs text-slate-300">No ranking change. No charge captured. Your quote is kept for 10 minutes.</p>
            <div className="flex gap-2 justify-center">
              <Button type="button" variant="secondary" size="sm" onClick={() => setFailed(false)}>Try again</Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Return to board</Button>
            </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3">
            {onBack ? (
              <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={isSubmitting} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back to Card
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <div className="flex items-center gap-2">
              {onBack && (
                <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                leftIcon={<Zap className="w-4 h-4 fill-zinc-950" />}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                {isSubmitting ? 'Securing Checkout…' : `Top Up & Bump ($${parsedTopUp || MIN_TOP_UP})`}
              </Button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Payment buys a visibility service — not ownership, investment, or a wallet balance. Ranking is dynamic and recomputed when payment confirms.
        </p>
      </form>
    </Modal>
  );
};

function recomputeRankValues(boardValues: number[], resultingValue: number): number {
  // Highest position resultingValue qualifies for (strictly greater beats; ties keep earlier holders first in mock).
  let rank = 1;
  for (const v of boardValues) {
    if (resultingValue > v) break;
    rank++;
  }
  return rank;
}
