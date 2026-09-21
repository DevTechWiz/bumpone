import React, { useState, useEffect, useRef } from 'react';
import {
  DollarSign,
  Image as ImageIcon,
  Link as LinkIcon,
  Crown,
  Sparkles,
  Zap,
  ArrowRight,
  Upload,
  Check,
  Shield,
  Tag,
} from 'lucide-react';
import { Modal, Input, Button, Badge } from './ui';
import { SlotItem } from '../lib/slotTypes';
import { getRankTier } from './ui/Badge';
import { MIN_TOP_UP } from '../lib/board';

export interface TopUpOrder {
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
  existingHandles: { id: string; title: string; activeValue: number }[];
  preselectedTargetSlot?: SlotItem | null;
  onSubmitTopUp: (order: TopUpOrder) => void;
}

const PRESET_AVATARS = [
  { label: 'Cyberpunk (Wide)', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80' },
  { label: 'Neon Pilot (Portrait)', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80' },
  { label: 'Synthwave (Wide)', url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=700&auto=format&fit=crop&q=80' },
  { label: 'Samurai (Portrait)', url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=80' },
  { label: 'Neural AI (Square)', url: 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=500&auto=format&fit=crop&q=80' },
  { label: 'Android (Portrait)', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80' },
  { label: 'Solar Flare (Square)', url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=500&auto=format&fit=crop&q=80' },
];

const CATEGORY_ICON = Tag;

export const TakeOverModal: React.FC<TakeOverModalProps> = ({
  isOpen,
  onClose,
  currentSlots,
  entryFloor,
  categories,
  existingHandles,
  preselectedTargetSlot,
  onSubmitTopUp,
}) => {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [holderId, setHolderId] = useState<string>('');
  const [topUpStr, setTopUpStr] = useState<string>('1');
  const [imageUrl, setImageUrl] = useState<string>('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80');
  const [linkUrl, setLinkUrl] = useState<string>('https://twitter.com/cyberpunk');
  const [title, setTitle] = useState<string>('Cyberpunk Odyssey');
  const [bidderName, setBidderName] = useState<string>('@neo_runner');
  const [category, setCategory] = useState<string>(categories[0] ?? 'AI');
  const [imageError, setImageError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
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

  // Sync defaults when opened: prefill top-up to pass the preselected target.
  useEffect(() => {
    if (isOpen) {
      if (preselectedTargetSlot) {
        // Canonical prefill: target value - 0 (new) + $10, using live board value.
        setTopUpStr(String(Math.max(MIN_TOP_UP, preselectedTargetSlot.amountPaid + 10)));
        setTitle(`Claim on #${preselectedTargetSlot.rank}`);
      } else {
        setTopUpStr(String(Math.max(MIN_TOP_UP, entryFloor + 10)));
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
  const currentValue = mode === 'existing' && holder ? holder.activeValue : 0;
  const parsedTopUp = Math.floor(parseFloat(topUpStr) || 0);
  const resultingValue = currentValue + Math.max(0, parsedTopUp);

  const boardValues = React.useMemo(() => currentSlots.map((s) => s.amountPaid), [currentSlots]);

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

  const handleQuickPreset = (targetAmount: number) => {
    // Canonical presets: top-up needed for a fresh profile to pass a tier anchor.
    setTopUpStr(String(Math.max(MIN_TOP_UP, targetAmount - currentValue + 10)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedTopUp < MIN_TOP_UP) {
      setErrorMsg(`Minimum top-up is $${MIN_TOP_UP}. Payments and active values use whole USD only.`);
      return;
    }
    if (mode === 'existing' && !holder) {
      setErrorMsg('Pick the profile you already hold to top it up.');
      return;
    }
    if (!imageUrl.trim()) {
      setErrorMsg('Please provide a square image URL.');
      return;
    }
    if (!linkUrl.trim() || !/^https:\/\//.test(linkUrl.trim())) {
      setErrorMsg('Destination link must start with https://.');
      return;
    }

    onSubmitTopUp({
      topUp: parsedTopUp,
      resultingValue,
      currentValue,
      imageUrl: imageUrl.trim(),
      linkUrl: linkUrl.trim(),
      title: (mode === 'existing' && holder ? holder.title : title.trim()) || 'Anonymous Challenger',
      handle: bidderName.trim() || '@challenger',
      category,
      aspectRatio: imageDimensions.aspectRatio,
      naturalWidth: imageDimensions.width,
      naturalHeight: imageDimensions.height,
    });

    onClose();
  };

  const kingSlot = currentSlots[0];
  const eliteSlot13 = currentSlots[12] || currentSlots[currentSlots.length - 1];
  const lordSlot54 = currentSlots[53] || currentSlots[currentSlots.length - 1];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
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
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setErrorMsg(null); }}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === m ? 'bg-white text-zinc-950 shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {m === 'new' ? 'New profile' : 'Top up existing'}
            </button>
          ))}
        </div>

        {mode === 'existing' && (
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wider block mb-1.5">
              Profile you hold
            </label>
            <select
              value={holderId}
              onChange={(e) => setHolderId(e.target.value)}
              className="w-full bg-white/[0.05] text-xs text-white rounded-xl border border-white/[0.08] px-3 py-2 focus:outline-none"
            >
              <option value="">Select profile…</option>
              {existingHandles.map((h) => (
                <option key={h.id} value={h.id}>{h.title} (${h.activeValue})</option>
              ))}
            </select>
          </div>
        )}

        {/* Quick Strategy Targets in dark glass */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 uppercase tracking-wider">
            Concentric Tier Quick Targets (top-up for a fresh profile)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleQuickPreset(entryFloor)}
              className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08] hover:border-white/[0.2] text-left transition-all cursor-pointer"
            >
              <span className="block text-[10px] text-slate-400 font-medium">Enter Board (1x1)</span>
              <span className="block text-sm font-mono font-semibold text-white">
                ${Math.max(MIN_TOP_UP, entryFloor - currentValue + 10)}
              </span>
            </button>

            {lordSlot54 && (
              <button
                type="button"
                onClick={() => handleQuickPreset(lordSlot54.amountPaid)}
                className="p-2.5 rounded-xl bg-black/40 border border-zinc-600/40 hover:border-zinc-400/60 text-left transition-all cursor-pointer"
              >
                <span className="block text-[10px] text-zinc-300 font-medium flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" /> Pass #54
                </span>
                <span className="block text-sm font-mono font-semibold text-zinc-200">
                  ${Math.max(MIN_TOP_UP, lordSlot54.amountPaid - currentValue + 10)}
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
                  <Sparkles className="w-2.5 h-2.5" /> Pass #13
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
                  <Crown className="w-2.5 h-2.5" /> Take King (4x4)
                </span>
                <span className="block text-sm font-mono font-semibold text-amber-200">
                  ${Math.max(MIN_TOP_UP, kingSlot.amountPaid - currentValue + 10)}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 1. Top-up Amount */}
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
                {tierProjected === 'king' && '4x4 Sovereign Citadel'}
                {tierProjected === 'elite' && '2x2 Inner Orbit Tile'}
                {tierProjected === 'lord' && 'Mid-Orbit Vanguard Tile'}
                {tierProjected === 'contender' && '1x1 Perimeter Contender'}
                {tierProjected === 'bubble' && '1x1 Drop Brink (Danger Zone!)'}
                {tierProjected === 'dropped' && 'Below the board — kept off-board'}
              </span>
            </div>

            {projectedRank <= 100 && (
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                At <strong>${resultingValue}</strong> active value, you take <strong>Rank #{projectedRank}</strong> (recomputed at payment).
                {bumpedVictim && (
                  <span>
                    {' '}You shift <strong>{bumpedVictim.title}</strong> down to #{projectedRank + 1}.
                  </span>
                )}
                {victimSlot100 && (
                  <span className="text-rose-400 font-medium block mt-1">
                    Slot #100 (<strong>{victimSlot100.title}</strong>) leaves the wall but is kept off-board.
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* 2. Image and Thumbnail Preview */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 uppercase tracking-wider block">
            2. Slot Tile Graphic (1:1 Square)
          </label>

          {/* Quick Preset Avatars */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[10px] text-slate-500 shrink-0 font-mono uppercase">Presets:</span>
            {PRESET_AVATARS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setImageUrl(preset.url);
                  setImageError(false);
                  measureImageDimensions(preset.url);
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] border transition-all shrink-0 cursor-pointer ${
                  imageUrl === preset.url
                    ? 'bg-white/[0.15] border-white/[0.3] text-white font-medium'
                    : 'bg-black/40 border-white/[0.08] text-slate-400 hover:text-slate-200'
                }`}
              >
                <img src={preset.url} alt={preset.label} className="w-3.5 h-3.5 rounded-full object-cover" />
                <span>{preset.label}</span>
                {imageUrl === preset.url && <Check className="w-2.5 h-2.5 text-emerald-400" />}
              </button>
            ))}
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
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    setImageUrl(reader.result);
                    setImageError(false);
                    measureImageDimensions(reader.result);
                  }
                };
                reader.readAsDataURL(file);
              }
            }}
            className={`p-3 rounded-xl border border-dashed transition-all ${
              isDragging
                ? 'bg-indigo-500/10 border-indigo-400'
                : 'bg-black/30 border-white/[0.12] hover:border-white/[0.25]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-slate-900 overflow-hidden shrink-0 border border-white/[0.1] flex items-center justify-center">
                  {!imageError && imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Preview"
                      onError={() => setImageError(true)}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-600" />
                  )}
                </div>
                <div className="text-xs space-y-0.5">
                  <span className="font-medium text-slate-200 block">
                    {imageUrl.startsWith('data:') ? 'Custom Uploaded Image' : 'Selected Graphic Preview'}
                  </span>
                  <p className="text-[11px] text-slate-400">
                    {imageDimensions.width && imageDimensions.height ? (
                      <span className="text-emerald-400 font-mono">
                        {imageDimensions.width}&times;{imageDimensions.height}px ({imageDimensions.aspectRatio}:1)
                      </span>
                    ) : (
                      'Drag & drop an image here or paste URL below'
                    )}
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setImageUrl(reader.result);
                        setImageError(false);
                        measureImageDimensions(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<Upload className="w-3 h-3" />}
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] py-1 shrink-0"
              >
                Upload File
              </Button>
            </div>
          </div>

          <Input
            label="Or Direct Image URL"
            value={imageUrl.startsWith('data:') ? 'Custom local image file loaded' : imageUrl}
            disabled={imageUrl.startsWith('data:')}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setImageError(false);
            }}
            onBlur={() => {
              if (imageUrl && !imageUrl.startsWith('data:')) {
                measureImageDimensions(imageUrl);
              }
            }}
            leftAddon={<ImageIcon className="w-4 h-4" />}
            placeholder="https://images.unsplash.com/..."
            helperText="Paste direct image link or use the file upload above"
          />
        </div>

        {/* 3. Destination Link */}
        <Input
          label="3. Destination Link URL (https only)"
          type="url"
          required
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          leftAddon={<LinkIcon className="w-4 h-4" />}
          placeholder="https://yourwebsite.com"
          helperText="Where users go when clicking your image on the board"
        />

        {/* Brand Name & Handle + Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Slot Title / Brand"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Project"
            disabled={mode === 'existing'}
          />
          <Input
            label="Bidder Handle / Name"
            value={bidderName}
            onChange={(e) => setBidderName(e.target.value)}
            placeholder="@handle"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-300 uppercase tracking-wider flex items-center gap-1 mb-1.5">
            <CATEGORY_ICON className="w-3 h-3" /> Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-white/[0.05] text-xs text-white rounded-xl border border-white/[0.08] px-3 py-2 focus:outline-none"
          >
            {categories.map((c) => (
              <option key={c} value={c} className="bg-zinc-900">{c}</option>
            ))}
          </select>
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
          <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              leftIcon={<Zap className="w-4 h-4" />}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Top Up & Slam (${parsedTopUp || MIN_TOP_UP})
            </Button>
          </div>
        )}
        {!failed && (
          <p className="text-center text-[11px]">
            <button type="button" onClick={() => setFailed(true)} className="text-slate-500 underline hover:text-slate-300">
              Simulate failed payment (mock)
            </button>
          </p>
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
