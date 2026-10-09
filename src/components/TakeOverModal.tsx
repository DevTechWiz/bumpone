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
  Shield,
  Tag,
  Lock,
  ShieldCheck,
  AtSign,
  ChevronDown,
  Target,
  Flame,
} from 'lucide-react';
import { Modal, Input, Button, Badge, getRankTier } from './ui';
import { SlotItem } from '../lib/slotTypes';
import { MIN_TOP_UP } from '../lib/board';
import { sessionSetJSON } from '../lib/storage';
import { useAuth } from '../lib/useAuth';
import { processImageForUpload } from '../lib/imageOptimization';

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
  previousRank?: number | null;
  aspectRatio?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface BumpPendingOrder {
  projectId?: string;
  title: string;
  handle: string;
  previousRank: number | null;
  resultingValue: number;
  at: number;
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
  onSubmitTopUp?: (order: TopUpOrder) => void;
  hasBackdrop?: boolean;
  onBack?: () => void;
  onRequireAuth?: () => void;
}

const CATEGORY_ICON = Tag;

import { normalizeUrl } from '../lib/urls';
export { normalizeUrl };

export const TakeOverModal: React.FC<TakeOverModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onRequireAuth,
  currentSlots,
  entryFloor,
  categories,
  existingHandles,
  preselectedTargetSlot,
  onSubmitTopUp,
  hasBackdrop = true,
}) => {
  const { user, profile } = useAuth();
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [holderId, setHolderId] = useState<string>('');
  const [topUpStr, setTopUpStr] = useState<string>(String(MIN_TOP_UP));
  const [imageUrl, setImageUrl] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [creatorHandle, setCreatorHandle] = useState<string>('');
  const [category, setCategory] = useState<string>(categories[0] ?? 'AI');
  const [imageError, setImageError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width?: number; height?: number; aspectRatio?: number }>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevOpenRef = useRef(false);
  const initializedSlotIdRef = useRef<string | null>(null);

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
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image exceeds 5MB size limit.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    try {
      let uploadFile: File = file;
      try {
        const processed = await processImageForUpload(file);
        uploadFile = processed.file;
      } catch (procErr) {
        console.warn('Client-side image processing fallback to original:', procErr);
      }

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('type', 'projects');
      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.url) {
        setImageUrl(data.url);
        setImageError(false);
        if (data.width && data.height) {
          setImageDimensions({
            width: data.width,
            height: data.height,
            aspectRatio: data.aspectRatio || 1,
          });
        } else {
          measureImageDimensions(data.url);
        }
      } else {
        setErrorMsg(data?.error || 'Failed to upload image. Max 5MB, JPG/PNG/WebP only.');
      }
    } catch {
      setErrorMsg('Network error while uploading image. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Sync defaults only once when opened or when preselected target explicitly changes.
  // Never re-run while modal is already open to prevent clearing user in-progress edits!
  useEffect(() => {
    const isOpening = isOpen && !prevOpenRef.current;
    const currentTargetId = preselectedTargetSlot?.id ?? null;
    const isTargetChanged = isOpen && currentTargetId !== initializedSlotIdRef.current;

    if (isOpening || isTargetChanged) {
      initializedSlotIdRef.current = currentTargetId;

      if (preselectedTargetSlot) {
        const isMine = existingHandles.some((h) => h.id === preselectedTargetSlot.id);
        if (isMine) {
          setMode('existing');
          setHolderId(preselectedTargetSlot.id);
          const holderObj = existingHandles.find((h) => h.id === preselectedTargetSlot.id);
          const slotMatch = currentSlots.find((s) => s.id === preselectedTargetSlot.id);
          if (holderObj) {
            setTitle(holderObj.title || '');
            const img = holderObj.imageUrl || (holderObj as any).image_path || (holderObj as any).image_url || slotMatch?.imageUrl || preselectedTargetSlot.imageUrl || '';
            setImageUrl(img);
            setImageError(false);
            if (img) {
              measureImageDimensions(img);
            } else {
              setImageDimensions({});
            }
            setLinkUrl(holderObj.linkUrl || (holderObj as any).destination_url || slotMatch?.linkUrl || preselectedTargetSlot.linkUrl || '');
            if (holderObj.category) setCategory(holderObj.category);
            if (holderObj.handle) setCreatorHandle(holderObj.handle.replace(/^@/, ''));
          }
          if (preselectedTargetSlot.rank > 100) {
            const currentVal = holderObj?.activeValue ?? preselectedTargetSlot.activeValue;
            const floorTarget = currentSlots.length < 100 ? 0 : Math.max(MIN_TOP_UP, entryFloor);
            const neededToEnter = Math.max(MIN_TOP_UP, floorTarget - currentVal + 10);
            setTopUpStr(String(neededToEnter));
          } else {
            setTopUpStr(String(MIN_TOP_UP));
          }
        } else if (existingHandles.length > 0) {
          // Rival slot clicked: user owns projects, allow them to outbid with their first project
          setMode('existing');
          const firstProj = existingHandles[0];
          const slotMatch = currentSlots.find((s) => s.id === firstProj.id);
          setHolderId(firstProj.id);
          setTitle(firstProj.title || '');
          const img = firstProj.imageUrl || (firstProj as any).image_path || (firstProj as any).image_url || slotMatch?.imageUrl || '';
          setImageUrl(img);
          setImageError(false);
          if (img) {
            measureImageDimensions(img);
          } else {
            setImageDimensions({});
          }
          setLinkUrl(firstProj.linkUrl || (firstProj as any).destination_url || slotMatch?.linkUrl || '');
          if (firstProj.category) setCategory(firstProj.category);
          if (firstProj.handle) setCreatorHandle(firstProj.handle.replace(/^@/, ''));
          const isTargetEmpty = !preselectedTargetSlot.activeValue || preselectedTargetSlot.id.startsWith('open-slot-');
          const needed = isTargetEmpty
            ? MIN_TOP_UP
            : Math.max(MIN_TOP_UP, preselectedTargetSlot.activeValue - firstProj.activeValue + 10);
          setTopUpStr(String(needed));
        } else {
          // No projects owned yet: bid a new project to pass the target
          setMode('new');
          const isTargetEmpty = !preselectedTargetSlot.activeValue || preselectedTargetSlot.id.startsWith('open-slot-');
          const needed = isTargetEmpty
            ? MIN_TOP_UP
            : Math.max(MIN_TOP_UP, preselectedTargetSlot.activeValue + 10);
          setTopUpStr(String(needed));
          setTitle('');
          setLinkUrl('');
          setImageUrl('');
          setImageError(false);
          setImageDimensions({});
          const defaultH = profile?.handle || user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || '';
          setCreatorHandle(defaultH.replace(/^@/, ''));
        }
      } else {
        if (existingHandles.length === 0) {
          setMode('new');
          setHolderId('');
          setTitle('');
          setLinkUrl('');
          setImageUrl('');
          setImageError(false);
          setImageDimensions({});
        } else {
          setMode('existing');
          const firstProj = existingHandles[0];
          const slotMatch = currentSlots.find((s) => s.id === firstProj.id);
          setHolderId(firstProj.id);
          setTitle(firstProj.title || '');
          const img = firstProj.imageUrl || (firstProj as any).image_path || (firstProj as any).image_url || slotMatch?.imageUrl || '';
          setImageUrl(img);
          setImageError(false);
          if (img) {
            measureImageDimensions(img);
          } else {
            setImageDimensions({});
          }
          setLinkUrl(firstProj.linkUrl || (firstProj as any).destination_url || slotMatch?.linkUrl || '');
          if (firstProj.category) setCategory(firstProj.category);
          if (firstProj.handle) setCreatorHandle(firstProj.handle.replace(/^@/, ''));
        }
        const floorNeeded = currentSlots.length < 100 ? MIN_TOP_UP : Math.max(MIN_TOP_UP, entryFloor) + 10;
        setTopUpStr(String(floorNeeded));
        const defaultH = profile?.handle || user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || '';
        if (defaultH) {
          setCreatorHandle(defaultH.replace(/^@/, ''));
        }
      }
      setErrorMsg(null);
      setFailed(false);
      setImageError(false);
    }

    if (!isOpen) {
      initializedSlotIdRef.current = null;
    }
    prevOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preselectedTargetSlot?.id]);

  // Sync profile handle when loaded asynchronously for a new project
  useEffect(() => {
    if (mode === 'new' && !creatorHandle && profile?.handle) {
      setCreatorHandle(profile.handle.replace(/^@/, ''));
    }
  }, [profile, mode, creatorHandle]);

  useEffect(() => {
    setImageError(false);
  }, [imageUrl, holderId]);

  const holder = existingHandles.find((h) => h.id === holderId) ?? null;

  const handleSelectHolder = (newHolderId: string) => {
    setHolderId(newHolderId);
    setErrorMsg(null);
    setImageError(false);
    const selected = existingHandles.find((h) => h.id === newHolderId);
    const slotMatch = currentSlots.find((s) => s.id === newHolderId);
    if (selected) {
      setTitle(selected.title || '');
      const img = selected.imageUrl || (selected as any).image_path || (selected as any).image_url || slotMatch?.imageUrl || '';
      setImageUrl(img);
      setImageError(false);
      if (img) {
        measureImageDimensions(img);
      } else {
        setImageDimensions({});
      }
      setLinkUrl(selected.linkUrl || (selected as any).destination_url || slotMatch?.linkUrl || '');
      if (selected.category) setCategory(selected.category);
      if (selected.handle) setCreatorHandle(selected.handle.replace(/^@/, ''));
      if (preselectedTargetSlot) {
        const needed = Math.max(MIN_TOP_UP, Math.max(MIN_TOP_UP, preselectedTargetSlot.activeValue) - selected.activeValue + 10);
        setTopUpStr(String(needed));
      } else {
        setTopUpStr(String(MIN_TOP_UP));
      }
    }
  };

  const handleModeChange = (newMode: 'new' | 'existing') => {
    if (newMode === mode) return;
    setMode(newMode);
    setErrorMsg(null);
    setImageError(false);
    if (newMode === 'new') {
      setTitle('');
      setLinkUrl('');
      setHolderId('');
      setImageUrl('');
      setImageDimensions({});
      const defaultH = profile?.handle || user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || '';
      setCreatorHandle(defaultH.replace(/^@/, ''));
      if (preselectedTargetSlot) {
        const isTargetEmpty = !preselectedTargetSlot.activeValue || preselectedTargetSlot.id.startsWith('open-slot-');
        const needed = isTargetEmpty
          ? MIN_TOP_UP
          : Math.max(MIN_TOP_UP, preselectedTargetSlot.activeValue + 10);
        setTopUpStr(String(needed));
      } else {
        const occupiedCount = currentSlots.filter((s) => !s.id.startsWith('open-slot-')).length;
        const floorNeeded = occupiedCount < 100 ? MIN_TOP_UP : Math.max(MIN_TOP_UP, entryFloor) + 10;
        setTopUpStr(String(floorNeeded));
      }
    } else if (existingHandles.length > 0) {
      const initialHolder = holderId ? existingHandles.find((h) => h.id === holderId) : existingHandles[0];
      const targetHolder = initialHolder || existingHandles[0];
      const slotMatch = currentSlots.find((s) => s.id === targetHolder.id);
      if (targetHolder) {
        setHolderId(targetHolder.id);
        setTitle(targetHolder.title || '');
        const img = targetHolder.imageUrl || (targetHolder as any).image_path || (targetHolder as any).image_url || slotMatch?.imageUrl || '';
        setImageUrl(img);
        setImageError(false);
        if (img) {
          measureImageDimensions(img);
        } else {
          setImageDimensions({});
        }
        setLinkUrl(targetHolder.linkUrl || (targetHolder as any).destination_url || slotMatch?.linkUrl || '');
        if (targetHolder.category) setCategory(targetHolder.category);
        if (targetHolder.handle) setCreatorHandle(targetHolder.handle.replace(/^@/, ''));
        if (preselectedTargetSlot) {
          const isTargetEmpty = !preselectedTargetSlot.activeValue || preselectedTargetSlot.id.startsWith('open-slot-');
          const needed = isTargetEmpty
            ? MIN_TOP_UP
            : Math.max(MIN_TOP_UP, preselectedTargetSlot.activeValue - targetHolder.activeValue + 10);
          setTopUpStr(String(needed));
        }
      }
    }
  };

  const currentValue = mode === 'existing' && holder ? holder.activeValue : 0;
  const parsedTopUp = Math.floor(parseFloat(topUpStr) || 0);
  const resultingValue = currentValue + Math.max(0, parsedTopUp);

  const cleanHandle = creatorHandle.trim().replace(/^@/, '').toLowerCase();
  const effectiveHandle = cleanHandle
    ? `@${cleanHandle}`
    : profile?.handle
      ? (profile.handle.startsWith('@') ? profile.handle : `@${profile.handle}`)
      : user?.user_metadata?.user_name
        ? `@${user.user_metadata.user_name.replace(/^@/, '')}`
        : user?.user_metadata?.preferred_username
          ? `@${user.user_metadata.preferred_username.replace(/^@/, '')}`
          : '@creator';

  const boardValues = React.useMemo(() => {
    const pool = mode === 'existing' && holder ? currentSlots.filter((s) => s.id !== holder.id) : currentSlots;
    return pool.map((s) => s.activeValue).sort((a, b) => b - a);
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
  // Only new project bids displace the current occupant of #100 off the board into #101 (existing top-ups reorder internally)
  const _willDisplaceOccupantOf100 = mode === 'new' && victimSlot100 && projectedRank && projectedRank <= 100;

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
    const effectiveImageUrl = (imageUrl || displayImageUrl).trim();
    if (!effectiveImageUrl) {
      setErrorMsg(mode === 'new' ? 'Please upload your project logo or artwork.' : 'Project artwork is missing.');
      return;
    }

    const finalUrl = normalizeUrl(linkUrl);
    if (!finalUrl) {
      setErrorMsg('Please enter a destination link URL.');
      return;
    }

    try {
      const parsed = new URL(finalUrl);
      if (!parsed.hostname || !parsed.hostname.includes('.')) {
        setErrorMsg('Please enter a valid website domain.');
        return;
      }
    } catch {
      setErrorMsg('Please enter a valid website URL.');
      return;
    }

    if (mode === 'new' && (!projectedRank || projectedRank > 100)) {
      const minNeeded = currentSlots.length < 100 ? MIN_TOP_UP : Math.max(MIN_TOP_UP, entryFloor) + 10;
      setErrorMsg(`Your top-up of $${parsedTopUp} is below the board floor ($${Math.max(MIN_TOP_UP, entryFloor)}). Top up at least $${minNeeded} to enter the 100-slot wall.`);
      return;
    }

    const calculatedTargetRank = Math.min(100, Math.max(1, projectedRank || 100));

    const previousRank =
      mode === 'existing' && holder
        ? (() => {
            const idx = currentSlots.findIndex((s) => s.id === holder.id);
            return idx >= 0 ? idx + 1 : null;
          })()
        : null;

    setIsSubmitting(true);
    setErrorMsg(null);

    const orderData: TopUpOrder = {
      projectId: mode === 'existing' && holder ? holder.id : undefined,
      topUp: parsedTopUp,
      resultingValue,
      currentValue,
      previousRank,
      imageUrl: effectiveImageUrl,
      linkUrl: finalUrl,
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
          targetRank: calculatedTargetRank,
          title: orderData.title,
          handle: effectiveHandle,
          linkUrl: orderData.linkUrl,
          imageUrl: effectiveImageUrl,
          category: orderData.category,
        }),
      });

      const data = await res.json().catch(() => ({ error: 'Failed to initiate purchase session.' }));

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to initiate purchase session.');
        return;
      }

      if (data.checkout_url) {
        // SEC-025: never follow a redirect we cannot vouch for — the payment
        // gateway is always https, and our own dev-mode mock returns URLs on
        // this page's origin. Anything else (javascript:, data:, http:// …)
        // is dropped as an invalid response.
        try {
          const checkoutUrl = new URL(data.checkout_url, window.location.origin);
          if (
            checkoutUrl.protocol === 'https:' ||
            checkoutUrl.origin === window.location.origin
          ) {
            sessionSetJSON('bump_pending', {
              projectId: orderData.projectId,
              title: orderData.title,
              handle: orderData.handle,
              previousRank: orderData.previousRank ?? null,
              resultingValue: orderData.resultingValue,
              at: Date.now(),
            } satisfies BumpPendingOrder);
            onSubmitTopUp?.(orderData);
            window.location.href = checkoutUrl.href;
            return;
          }
        } catch {
          // malformed URL — fall through to the error below
        }
        setErrorMsg('Invalid payment redirect received. Please try again.');
        return;
      }

      setErrorMsg('Unable to retrieve payment checkout URL. Please try again.');
    } catch (err: any) {
      console.error('Purchase checkout error:', err);
      setErrorMsg('Payment gateway is currently unavailable. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentSlotMatch = currentSlots.find((s) => s.id === (holder?.id || holderId));
  const currentRank = mode === 'existing' && holder
    ? (currentSlotMatch?.rank ?? (preselectedTargetSlot && preselectedTargetSlot.id === holder.id ? preselectedTargetSlot.rank : null))
    : null;

  const isKingHolder = currentRank === 1;
  const isTop5Holder = currentRank != null && currentRank >= 2 && currentRank <= 5;
  const isTop10Holder = currentRank != null && currentRank >= 6 && currentRank <= 10;

  const displayImageUrl =
    imageUrl ||
    holder?.imageUrl ||
    (holder as any)?.image_path ||
    (holder as any)?.image_url ||
    currentSlotMatch?.imageUrl ||
    (preselectedTargetSlot && (preselectedTargetSlot.id === holderId || preselectedTargetSlot.id === holder?.id) ? preselectedTargetSlot.imageUrl : '');

  const kingSlot = currentSlots[0];
  const top5Slot = currentSlots[4] || currentSlots[currentSlots.length - 1];
  const top10Slot = currentSlots[9] || currentSlots[currentSlots.length - 1];

  const kingNeeded = kingSlot
    ? Math.max(MIN_TOP_UP, kingSlot.activeValue - currentValue + 10)
    : MIN_TOP_UP;

  const top5Needed = top5Slot
    ? Math.max(MIN_TOP_UP, top5Slot.activeValue - currentValue + 10)
    : MIN_TOP_UP;

  const top10Needed = top10Slot
    ? Math.max(MIN_TOP_UP, top10Slot.activeValue - currentValue + 10)
    : MIN_TOP_UP;

  const occupiedCount = currentSlots.filter((s) => !s.id.startsWith('open-slot-')).length;
  const floorNeeded = occupiedCount < 100
    ? MIN_TOP_UP
    : Math.max(MIN_TOP_UP * 2, Math.max(MIN_TOP_UP, entryFloor) - currentValue + 10);

  const isTargetMine = Boolean(
    preselectedTargetSlot && existingHandles.some((h) => h.id === preselectedTargetSlot.id)
  );

  const isTargetEmpty = Boolean(
    preselectedTargetSlot && (!preselectedTargetSlot.activeValue || preselectedTargetSlot.id.startsWith('open-slot-'))
  );

  const targetSlotNeeded = preselectedTargetSlot
    ? isTargetEmpty
      ? MIN_TOP_UP
      : isTargetMine
        ? preselectedTargetSlot.rank > 100
          ? Math.max(MIN_TOP_UP, (occupiedCount < 100 ? 0 : Math.max(MIN_TOP_UP, entryFloor)) - currentValue + 10)
          : MIN_TOP_UP
        : Math.max(MIN_TOP_UP, preselectedTargetSlot.activeValue - currentValue + 10)
    : null;

  interface PresetItem {
    id: string;
    label: string;
    subtitle: string;
    amount: number;
    badgeText?: string;
    theme: 'emerald' | 'gold' | 'purple' | 'sky' | 'rose' | 'default';
    icon: 'crown' | 'sparkles' | 'target' | 'flame' | 'shield';
    hintText?: string;
  }

  const presets: PresetItem[] = React.useMemo(() => {
    if (isKingHolder) {
      // King #1: Crown Defense & Lead Expansion Presets
      return [
        {
          id: 'defend-10',
          label: '+$10 Boost',
          subtitle: 'Streak Defend',
          amount: 10,
          badgeText: 'MIN',
          theme: 'gold',
          icon: 'crown',
          hintText: 'Hold lead',
        },
        {
          id: 'defend-25',
          label: '+$25 Shield',
          subtitle: 'Fortify Lead',
          amount: 25,
          badgeText: 'SAFE',
          theme: 'emerald',
          icon: 'shield',
          hintText: '+25 cushion',
        },
        {
          id: 'defend-50',
          label: '+$50 Guard',
          subtitle: 'Dominance Push',
          amount: 50,
          badgeText: 'HEAVY',
          theme: 'purple',
          icon: 'sparkles',
          hintText: 'Crush rivals',
        },
        {
          id: 'defend-100',
          label: '+$100 Vault',
          subtitle: 'Sovereign Lock',
          amount: 100,
          badgeText: '3×3 KING',
          theme: 'gold',
          icon: 'crown',
          hintText: 'Unbreakable',
        },
      ];
    }

    if (isTop5Holder) {
      // Top 5 Champion: Defend Anchor or Overtake King #1
      const kingOvertake = kingSlot ? Math.max(MIN_TOP_UP, kingSlot.activeValue - currentValue + 10) : 20;
      const amtKing = kingOvertake <= 10 ? 20 : kingOvertake;
      const amtShield = amtKing === 25 ? 35 : 25;
      const amtSurge = amtKing === 50 ? 60 : 50;

      return [
        {
          id: 'top5-10',
          label: '+$10 Advance',
          subtitle: 'Maintain Anchor',
          amount: 10,
          badgeText: '2×2',
          theme: 'purple',
          icon: 'sparkles',
          hintText: 'Stay in Top 5',
        },
        {
          id: 'top5-king',
          label: 'King #1 Crown',
          subtitle: 'Claim Throne',
          amount: amtKing,
          badgeText: '3×3',
          theme: 'gold',
          icon: 'crown',
          hintText: 'Center Stage',
        },
        {
          id: 'top5-25',
          label: '+$25 Shield',
          subtitle: 'Fortify Rank',
          amount: amtShield,
          badgeText: 'BOOST',
          theme: 'emerald',
          icon: 'shield',
          hintText: 'Solid buffer',
        },
        {
          id: 'top5-50',
          label: '+$50 Surge',
          subtitle: 'Power Leap',
          amount: amtSurge,
          badgeText: 'POWER',
          theme: 'sky',
          icon: 'sparkles',
          hintText: 'Surge ahead',
        },
      ];
    }

    if (isTop10Holder) {
      // Top 10 Elite: Break into Top 5 or take King #1
      const top5Overtake = top5Slot ? Math.max(MIN_TOP_UP, top5Slot.activeValue - currentValue + 10) : 20;
      const amtTop5 = top5Overtake <= 10 ? 20 : top5Overtake;
      const kingOvertake = kingSlot ? Math.max(amtTop5 + 10, kingSlot.activeValue - currentValue + 10) : amtTop5 + 20;
      const amtSurge = (amtTop5 === 50 || kingOvertake === 50) ? 75 : 50;

      return [
        {
          id: 'top10-10',
          label: '+$10 Advance',
          subtitle: 'Climb Elite',
          amount: 10,
          badgeText: 'ELITE',
          theme: 'sky',
          icon: 'sparkles',
          hintText: 'Advance row',
        },
        {
          id: 'top10-top5',
          label: 'Top 5 Champion',
          subtitle: 'Champion Anchor',
          amount: amtTop5,
          badgeText: '2×2',
          theme: 'purple',
          icon: 'sparkles',
          hintText: '2×2 spotlight',
        },
        {
          id: 'top10-king',
          label: 'King #1 Crown',
          subtitle: 'Claim Throne',
          amount: kingOvertake,
          badgeText: '3×3',
          theme: 'gold',
          icon: 'crown',
          hintText: 'Center Stage',
        },
        {
          id: 'top10-50',
          label: '+$50 Surge',
          subtitle: 'Power Leap',
          amount: amtSurge,
          badgeText: 'POWER',
          theme: 'emerald',
          icon: 'shield',
          hintText: 'Massive push',
        },
      ];
    }

    // Challenger (Rank > 10, Graveyard, or New Project)
    let p1Amount = floorNeeded;
    let p1Label = occupiedCount < 100 ? 'Claim Slot' : 'Beat #100';
    let p1Subtitle = occupiedCount < 100 ? 'Open Turf' : 'Billboard Floor';
    let p1Theme: PresetItem['theme'] = 'default';
    let p1Icon: PresetItem['icon'] = 'shield';
    let p1Badge = occupiedCount < 100 ? 'OPEN' : 'FLOOR';
    let p1Hint = 'Live Wall';

    if (preselectedTargetSlot && !isTargetMine && preselectedTargetSlot.rank > 1 && targetSlotNeeded != null) {
      p1Amount = targetSlotNeeded;
      p1Label = isTargetEmpty ? `Claim #${preselectedTargetSlot.rank}` : `Beat #${preselectedTargetSlot.rank}`;
      p1Subtitle = isTargetEmpty ? 'Open Turf' : preselectedTargetSlot.title;
      p1Theme = 'emerald';
      p1Icon = isTargetEmpty ? 'shield' : 'target';
      p1Badge = isTargetEmpty ? 'OPEN' : 'TARGET';
      p1Hint = isTargetEmpty ? '$10 Claim' : '+10 outbid';
    } else if (isTargetMine && preselectedTargetSlot && preselectedTargetSlot.rank > 100 && targetSlotNeeded != null) {
      p1Amount = targetSlotNeeded;
      p1Label = 'Live Wall';
      p1Subtitle = 'Reclaim Turf';
      p1Theme = 'rose';
      p1Icon = 'flame';
      p1Badge = 'GRAVE';
      p1Hint = 'Beat #100';
    }

    const p2Amount = Math.max(p1Amount + 10, top10Needed);
    const p3Amount = Math.max(p2Amount + 10, top5Needed);
    const p4Amount = Math.max(p3Amount + 10, kingNeeded);

    return [
      {
        id: 'challenger-target',
        label: p1Label,
        subtitle: p1Subtitle,
        amount: p1Amount,
        badgeText: p1Badge,
        theme: p1Theme,
        icon: p1Icon,
        hintText: p1Hint,
      },
      {
        id: 'challenger-top10',
        label: 'Top 10',
        subtitle: 'Elite Tier',
        amount: p2Amount,
        badgeText: 'ELITE',
        theme: 'sky',
        icon: 'sparkles',
        hintText: 'Hot Row',
      },
      {
        id: 'challenger-top5',
        label: 'Top 5',
        subtitle: 'Champion Anchor',
        amount: p3Amount,
        badgeText: '2×2',
        theme: 'purple',
        icon: 'sparkles',
        hintText: 'High Rank',
      },
      {
        id: 'challenger-king',
        label: 'King #1',
        subtitle: 'Center Stage',
        amount: p4Amount,
        badgeText: '3×3',
        theme: 'gold',
        icon: 'crown',
        hintText: 'Top Views',
      },
    ];
  }, [
    isKingHolder,
    isTop5Holder,
    isTop10Holder,
    kingSlot,
    top5Slot,
    currentValue,
    floorNeeded,
    currentSlots.length,
    preselectedTargetSlot,
    isTargetMine,
    targetSlotNeeded,
    top10Needed,
    top5Needed,
    kingNeeded,
  ]);

  const modalTitle = isTargetMine
    ? preselectedTargetSlot && preselectedTargetSlot.rank > 100
      ? `Reclaim "${preselectedTargetSlot?.title}" to Billboard`
      : `Top Up "${preselectedTargetSlot?.title}" (Rank #${preselectedTargetSlot?.rank})`
    : preselectedTargetSlot
      ? `Bump Slot #${preselectedTargetSlot.rank} — ${preselectedTargetSlot.title}`
      : mode === 'existing' && holder
        ? `Bump "${holder.title}"`
        : 'Bump Billboard Spot';

  const modalSubtitle = isTargetMine
    ? preselectedTargetSlot && preselectedTargetSlot.rank > 100
      ? `Top up active value to restore your project into the live top 100 billboard. Your preserved active value is $${preselectedTargetSlot.activeValue}.`
      : `Top up active value to propel "${preselectedTargetSlot?.title}" higher on the billboard. Minimum top-up $${MIN_TOP_UP}.`
    : preselectedTargetSlot
      ? `Place at least $${Math.max(MIN_TOP_UP, preselectedTargetSlot.activeValue) + 10} to claim Billboard Rank #${preselectedTargetSlot.rank}.`
      : mode === 'existing' && holder
        ? isKingHolder
          ? `Defend and cement your #1 King spot on the billboard. Minimum top-up $${MIN_TOP_UP}.`
          : `Top up active value to propel "${holder.title}" higher on the billboard. Minimum top-up $${MIN_TOP_UP}.`
        : `Minimum entry is $${MIN_TOP_UP}. To bump any filled slot, add at least +$${MIN_TOP_UP}.`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onBack={onBack}
      zIndex="z-[70]"
      hasBackdrop={hasBackdrop}
      title={modalTitle}
      subtitle={modalSubtitle}
      maxWidth="lg"
    >
      {!user ? (
        <div className="py-8 px-4 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-xl shadow-amber-500/10">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="text-lg font-bold text-white tracking-tight">
              Sign In to Bump or Boost Billboard Spot
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              You must be signed in with your account to bump billboard spots, lock in your creator handle, and carry forward active value.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="lg"
              leftIcon={<ShieldCheck className="w-4 h-4 fill-zinc-950" />}
              onClick={() => {
                onClose();
                onRequireAuth?.();
              }}
              className="w-full sm:w-auto font-bold px-6 py-2.5 shadow-lg shadow-amber-500/20"
            >
              Sign In to Continue
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={onClose}
              className="w-full sm:w-auto text-xs text-slate-400 hover:text-white"
            >
              Browse Billboard
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/40 border border-white/[0.08]">
            <button
              type="button"
              onClick={() => handleModeChange('new')}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${mode === 'new' ? 'bg-white text-zinc-950 shadow-sm' : 'text-neutral-400 hover:text-white'
                }`}
            >
              Add New Project
            </button>
            <button
              type="button"
              disabled={existingHandles.length === 0}
              onClick={() => {
                if (existingHandles.length === 0) return;
                handleModeChange('existing');
              }}
              title={existingHandles.length === 0 ? "You don't own any active projects yet" : undefined}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${existingHandles.length === 0
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
                  onChange={(e) => handleSelectHolder(e.target.value)}
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

          {/* Arena Ambition Presets with FOMO & Target Restoration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Arena Ambition Presets
              </label>
              {preselectedTargetSlot && !isTargetMine ? (
                <span className="text-[11px] text-emerald-400 font-mono font-medium flex items-center gap-1 truncate max-w-[220px]" title={`#${preselectedTargetSlot.rank} ${preselectedTargetSlot.title}`}>
                  <Target className="w-3 h-3 shrink-0" />
                  Target: #{preselectedTargetSlot.rank} {preselectedTargetSlot.title}
                </span>
              ) : isTargetMine && preselectedTargetSlot && preselectedTargetSlot.rank > 100 ? (
                <span className="text-[11px] text-rose-300 font-mono font-medium flex items-center gap-1">
                  <Flame className="w-3 h-3 text-rose-400 shrink-0" />
                  Graveyard #{preselectedTargetSlot.rank}
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presets.map((p) => {
                const isActive = parsedTopUp === p.amount;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setTopUpStr(String(p.amount));
                      setErrorMsg(null);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col justify-between hover:scale-[1.02] active:scale-[0.98] ${
                      isActive
                        ? p.theme === 'gold'
                          ? 'bg-gradient-to-br from-amber-500/30 via-black/85 to-yellow-950/40 border-amber-400 ring-2 ring-amber-400/90 shadow-xl shadow-amber-500/25'
                          : p.theme === 'purple'
                            ? 'bg-gradient-to-br from-purple-500/25 via-black/85 to-purple-950/40 border-purple-400 ring-2 ring-purple-400/90 shadow-xl shadow-purple-500/25'
                            : p.theme === 'sky'
                              ? 'bg-sky-950/40 border-sky-400 ring-2 ring-sky-400/80 shadow-lg shadow-sky-500/20'
                              : p.theme === 'emerald'
                                ? 'bg-emerald-950/40 border-emerald-400 ring-2 ring-emerald-400/80 shadow-lg shadow-emerald-500/20'
                                : p.theme === 'rose'
                                  ? 'bg-rose-950/40 border-rose-400 ring-2 ring-rose-400/80 shadow-lg shadow-rose-500/20'
                                  : 'bg-white/[0.12] border-white ring-2 ring-white/80 shadow-lg'
                        : p.theme === 'gold'
                          ? 'bg-gradient-to-br from-amber-500/10 via-black/60 to-yellow-950/20 border-amber-400/35 hover:border-amber-400/70 hover:shadow-lg hover:shadow-amber-500/15'
                          : p.theme === 'purple'
                            ? 'bg-gradient-to-br from-purple-500/10 via-black/60 to-purple-950/20 border-purple-400/30 hover:border-purple-400/70 hover:shadow-lg hover:shadow-purple-500/15'
                            : p.theme === 'emerald'
                              ? 'bg-emerald-950/15 border-emerald-500/30 hover:border-emerald-400/60'
                              : p.theme === 'rose'
                                ? 'bg-rose-950/15 border-rose-500/30 hover:border-rose-400/60'
                                : 'bg-black/40 border-white/[0.08] hover:border-white/[0.25]'
                    }`}
                  >
                    {p.theme === 'gold' && (
                      <div className="absolute -top-8 -right-8 w-20 h-20 bg-amber-500/15 rounded-full blur-lg pointer-events-none" />
                    )}
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`text-[10px] font-mono font-bold flex items-center gap-1 uppercase tracking-wide ${
                            p.theme === 'gold'
                              ? 'text-amber-300'
                              : p.theme === 'purple'
                                ? 'text-purple-300'
                                : p.theme === 'sky'
                                  ? 'text-sky-300'
                                  : p.theme === 'emerald'
                                    ? 'text-emerald-300'
                                    : p.theme === 'rose'
                                      ? 'text-rose-300'
                                      : 'text-slate-300'
                          }`}
                        >
                          {p.icon === 'crown' && (
                            <Crown className="w-3 h-3 text-amber-400 fill-amber-400/50 shrink-0" />
                          )}
                          {p.icon === 'sparkles' && (
                            <Sparkles
                              className={`w-3 h-3 shrink-0 ${
                                p.theme === 'purple' ? 'text-purple-400' : 'text-sky-400'
                              }`}
                            />
                          )}
                          {p.icon === 'target' && (
                            <Target className="w-3 h-3 text-emerald-400 shrink-0" />
                          )}
                          {p.icon === 'flame' && (
                            <Flame className="w-3 h-3 text-rose-400 shrink-0" />
                          )}
                          {p.icon === 'shield' && (
                            <Shield className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                          {p.label}
                        </span>
                        {isActive ? (
                          <span
                            className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${
                              p.theme === 'gold'
                                ? 'bg-amber-400'
                                : p.theme === 'purple'
                                  ? 'bg-purple-400'
                                  : p.theme === 'sky'
                                    ? 'bg-sky-400'
                                    : p.theme === 'emerald'
                                      ? 'bg-emerald-400'
                                      : p.theme === 'rose'
                                        ? 'bg-rose-400'
                                        : 'bg-white'
                            }`}
                          />
                        ) : p.badgeText ? (
                          <span
                            className={`text-[9px] font-mono px-1 py-0.2 rounded border font-bold shrink-0 ${
                              p.theme === 'gold'
                                ? 'bg-amber-400/20 text-amber-200 border-amber-400/40'
                                : p.theme === 'purple'
                                  ? 'bg-purple-400/20 text-purple-200 border-purple-400/40'
                                  : p.theme === 'sky'
                                    ? 'bg-sky-400/15 text-sky-200 border-sky-400/30'
                                    : p.theme === 'emerald'
                                      ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
                                      : p.theme === 'rose'
                                        ? 'bg-rose-400/15 text-rose-300 border-rose-400/30'
                                        : 'bg-white/[0.08] text-neutral-300 border-white/[0.12]'
                            }`}
                          >
                            {p.badgeText}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={`text-[11px] font-medium truncate ${
                          p.theme === 'gold' ? 'text-amber-100/90' : 'text-slate-200'
                        }`}
                        title={p.subtitle}
                      >
                        {p.subtitle}
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span
                        className={`text-base font-mono font-bold ${
                          p.theme === 'gold'
                            ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-400 font-black'
                            : p.theme === 'purple'
                              ? 'text-purple-200'
                              : p.theme === 'sky'
                                ? 'text-slate-100'
                                : p.theme === 'emerald'
                                  ? 'text-emerald-200'
                                  : p.theme === 'rose'
                                    ? 'text-rose-200'
                                    : 'text-white'
                        }`}
                      >
                        ${p.amount}
                      </span>
                      {p.hintText && (
                        <span
                          className={`text-[9px] font-mono ${
                            p.theme === 'gold'
                              ? 'text-amber-300/90'
                              : p.theme === 'purple'
                                ? 'text-purple-300/80'
                                : p.theme === 'sky'
                                  ? 'text-sky-300/80'
                                  : p.theme === 'emerald'
                                    ? 'text-emerald-400/90'
                                    : p.theme === 'rose'
                                      ? 'text-rose-300/80'
                                      : 'text-slate-400'
                          }`}
                        >
                          {p.hintText}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
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
              className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                tierProjected === 'king'
                  ? 'bg-amber-950/25 border-amber-400/40 text-amber-200 shadow-md shadow-amber-950/30'
                  : tierProjected === 'champion'
                    ? 'bg-purple-950/25 border-purple-400/40 text-purple-200 shadow-md shadow-purple-950/30'
                    : tierProjected === 'elite'
                      ? 'bg-sky-950/25 border-sky-400/40 text-sky-200 shadow-md shadow-sky-950/20'
                      : tierProjected === 'vanguard'
                        ? 'bg-emerald-950/25 border-emerald-400/30 text-emerald-200 shadow-md shadow-emerald-950/20'
                        : tierProjected === 'contender'
                          ? 'bg-zinc-900/80 border-zinc-700/60 text-zinc-300 shadow-md shadow-black/40'
                          : 'bg-rose-950/25 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                    Projected Outcome:
                  </span>
                  {projectedRank <= 100 ? (
                    <Badge variant="rank" rank={projectedRank} className="shadow-md" />
                  ) : (
                    <span className="px-2.5 py-1 rounded-md text-xs sm:text-sm font-mono font-bold bg-rose-950/40 text-rose-300 border border-rose-500/30">
                      Rank #{projectedRank} (Archived)
                    </span>
                  )}
                </div>
                <span className="text-xs sm:text-sm font-mono font-semibold text-neutral-300">
                  {tierProjected === 'king' && '👑 #1 King Spot'}
                  {tierProjected === 'champion' && '💎 Top 5 Champion Spot'}
                  {tierProjected === 'elite' && '⚡ Top 10 Spot'}
                  {tierProjected === 'vanguard' && '🛡️ Top 40 Spot'}
                  {tierProjected === 'contender' && '🎯 Contender Spot (Base Tier)'}
                  {tierProjected === 'dropped' && 'Rank #101+ (Archived) — below live top 100 showcase'}
                </span>
              </div>

              {projectedRank <= 100 && (
                <p className="text-xs sm:text-[13px] text-slate-300 mt-2.5 leading-relaxed">
                  At <strong className="text-white font-mono font-bold">${resultingValue}</strong> active value, you{' '}
                  {isKingHolder && projectedRank === 1 ? 'defend & fortify' : 'conquer'}{' '}
                  <strong
                    className={`font-mono font-bold ${
                      tierProjected === 'king'
                        ? 'text-amber-300'
                        : tierProjected === 'champion'
                          ? 'text-purple-300'
                          : tierProjected === 'elite'
                            ? 'text-sky-300'
                            : tierProjected === 'vanguard'
                              ? 'text-emerald-300'
                              : 'text-zinc-200'
                    }`}
                  >
                    Rank #{projectedRank}
                  </strong>{' '}
                  {isKingHolder && projectedRank === 1 ? '(Crown Defended)' : '(recomputed at payment)'}.
                  {bumpedVictim && (
                    <span>
                      {' '}You displace <strong className="text-white font-medium">{bumpedVictim.title}</strong> down to{' '}
                      <span className="font-mono text-neutral-300">#{projectedRank + 1}</span>.
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
                2. Project Logo & Artwork
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
              className={`p-3.5 rounded-xl border transition-all ${isDragging
                ? 'bg-indigo-500/10 border-indigo-400'
                : displayImageUrl
                  ? 'bg-black/40 border-white/[0.14]'
                  : 'bg-black/30 border-dashed border-white/[0.2] hover:border-white/[0.35]'
                }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-slate-900 overflow-hidden shrink-0 border border-white/[0.12] flex items-center justify-center relative shadow-inner">
                    {!imageError && displayImageUrl ? (
                      <>
                        <img
                          src={displayImageUrl}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover filter blur-md opacity-40 scale-125 pointer-events-none"
                          referrerPolicy="no-referrer"
                        />
                        <img
                          src={displayImageUrl}
                          alt="Project Logo"
                          onError={() => setImageError(true)}
                          className="relative z-10 max-h-full max-w-full object-contain p-1"
                          referrerPolicy="no-referrer"
                        />
                      </>
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
                          : displayImageUrl
                            ? 'Project Logo Ready'
                            : 'Upload Project Logo'}
                      </span>
                      {displayImageUrl && (
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
                      ) : displayImageUrl ? (
                        mode === 'existing' ? 'Live board artwork loaded' : 'Logo loaded. Click replace to swap'
                      ) : (
                        'Upload high-res JPG, PNG, or WebP'
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
                  variant={displayImageUrl ? 'secondary' : 'primary'}
                  size="sm"
                  leftIcon={<Upload className="w-3.5 h-3.5" />}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs py-1.5 shrink-0"
                >
                  {displayImageUrl ? 'Replace Logo' : 'Upload Logo'}
                </Button>
              </div>
            </div>
          </div>

          {/* 3. Destination Link */}
          <Input
            label="3. Destination Link URL"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={linkUrl}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              setErrorMsg(null);
            }}
            onBlur={() => {
              if (linkUrl.trim()) {
                setLinkUrl(normalizeUrl(linkUrl));
              }
            }}
            leftAddon={<LinkIcon className="w-4 h-4 text-slate-400" />}
            placeholder="yourproject.com"
            helperText="Website link displayed on your project card"
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
              value={creatorHandle ? `@${creatorHandle.replace(/^@/, '')}` : (profile?.handle ? `@${profile.handle.replace(/^@/, '')}` : '@anonymous')}
              readOnly
              disabled
              leftAddon={<AtSign className="w-3.5 h-3.5 text-slate-400" />}
              rightAddon={
                <span title="Locked to Verified Profile">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                </span>
              }
              className="bg-black/50 text-neutral-300 cursor-not-allowed border-white/[0.08]"
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
            Payment buys an immediate digital visibility service — not ownership, investment, or a wallet balance. Ranking is dynamic and recomputed when payment confirms. All purchases are final, instantaneously delivered, and strictly non-refundable.
          </p>
        </form>
      )}
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
