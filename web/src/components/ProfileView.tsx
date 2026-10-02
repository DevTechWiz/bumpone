"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Zap,
  TrendingUp,
  Share2,
  Copy,
  Check,
  Crown,
  Settings,
  Eye,
  Upload,
  UserCheck,
  Image as ImageIcon,
  AlertCircle,
  Move,
  RotateCcw,
  Tag,
  Plus,
  Layers,
  Globe,
  User as UserIcon,
  Edit3,
  ChevronDown,
  Lock,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Modal,
  Input,
  Avatar,
  XTwitterIcon,
  GitHubIcon,
  StatDisplay,
  Skeleton,
  SkeletonAvatar,
  SkeletonBadge,
  SkeletonStat,
  SkeletonCard,
  SkeletonText,
} from "./ui";
import type { TopUpOrder } from "./TakeOverModal";
import type { SlotItem } from "../lib/slotTypes";

const TakeOverModal = dynamic(
  () => import("./TakeOverModal").then((m) => m.TakeOverModal),
  { ssr: false }
);
import {
  REACTION_EMOJI,
  CATEGORIES,
  sortBoard,
  money,
  type ReactionKey,
  type Profile,
  type Category,
  type User,
  getHandleCooldownRemainingDays,
} from "../lib/board";
import { soundEngine } from "../lib/sound";
import { useAuth } from "../lib/useAuth";
import { createClient } from "../lib/supabase/client";
import { sessionGetJSON, safeGetJSON } from "../lib/storage";

export interface ProfileViewProps {
  profileId: string;
  initialMode?: "user" | "project";
  onBack?: () => void;
  onSelectProfile?: (profileId: string) => void;
  onUpdateProfile?: (updated: Profile) => void;
  onClaimSlot?: () => void;
  onOpenAlerts?: () => void;
  onBumpProject?: (projectId: string) => void;
  onRequireAuth?: () => void;
}

export function ProfileView({
  profileId,
  initialMode,
  onBack,
  onSelectProfile,
  onUpdateProfile,
  onClaimSlot,
  onOpenAlerts,
  onBumpProject,
  onRequireAuth,
}: ProfileViewProps) {
  const { user, profile: authProfile, loading: authLoading } = useAuth();

  // Loading state for board profiles
  const [isProfilesLoading, setIsProfilesLoading] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const cached = sessionGetJSON<Profile[]>("bumped_board_cache");
      if (cached && Array.isArray(cached) && cached.length > 0) return false;
      const saved = safeGetJSON<Profile[]>("bumped_board_profiles");
      if (saved && Array.isArray(saved) && saved.length > 0) return false;
    }
    return true;
  });

  // Real board profiles from database
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    if (typeof window !== "undefined") {
      const cached = sessionGetJSON<Profile[]>("bumped_board_cache");
      if (cached && Array.isArray(cached) && cached.length > 0) return cached;
      const saved = safeGetJSON<Profile[]>("bumped_board_profiles");
      if (saved && Array.isArray(saved) && saved.length > 0) return saved;
    }
    return [];
  });

  // Fetch real board profiles from database
  useEffect(() => {
    fetch("/api/board?limit=120")
      .then((res) => res.json())
      .then((data) => {
        if (data?.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
          setProfiles(data.profiles);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch board profiles:", err);
      })
      .finally(() => {
        setIsProfilesLoading(false);
      });
  }, []);

  const cleanId = (profileId || "self").toLowerCase().replace("@", "").trim();

  // User profile state (for self)
  const [selfProfile, setSelfProfile] = useState<User | null>(() => {
    if (authProfile) {
      return {
        id: authProfile.id,
        name: authProfile.display_name || authProfile.handle || "Creator",
        handle: authProfile.handle || "",
        avatar_url: authProfile.avatar_url || "",
        bio: authProfile.bio || "",
        website: authProfile.website || "",
        twitter: authProfile.twitter || "",
        github: authProfile.github || "",
      };
    }
    return null;
  });

  const isSelf =
    cleanId === "self" ||
    cleanId === "me" ||
    Boolean(user && (cleanId === user.id.toLowerCase() || (selfProfile?.handle && cleanId === selfProfile.handle.toLowerCase())));

  const [isSelfLoading, setIsSelfLoading] = useState<boolean>(true);
  const [isRemoteLoading, setIsRemoteLoading] = useState<boolean>(() => {
    return cleanId !== "self" && cleanId !== "me";
  });

  // Keep selfProfile in sync with auth hook
  useEffect(() => {
    if (authProfile && (!selfProfile || !selfProfile.name || selfProfile.name === "N/A")) {
      setSelfProfile({
        id: authProfile.id,
        name: authProfile.display_name || authProfile.handle || "Creator",
        handle: authProfile.handle || "",
        avatar_url: authProfile.avatar_url || "",
        bio: authProfile.bio || "",
        website: authProfile.website || "",
        twitter: authProfile.twitter || "",
        github: authProfile.github || "",
      });
      setIsSelfLoading(false);
    }
  }, [authProfile, selfProfile]);

  // Fetch authenticated user profile from Supabase
  useEffect(() => {
    if (!user) {
      if (!authLoading) {
        setIsSelfLoading(false);
      }
      return;
    }
    const userId = user.id;
    let isCancelled = false;

    async function loadUserProfile() {
      try {
        const supabase = createClient();
        const res = await supabase
          .from("users")
          .select("id, handle, display_name, avatar_url, bio, website, twitter, github, created_at, handle_last_changed_at")
          .eq("id", userId)
          .maybeSingle();

        let userData: any = res.data;
        if (res.error && res.error.message?.includes("handle_last_changed_at")) {
          const fallback = await supabase
            .from("users")
            .select("id, handle, display_name, avatar_url, bio, website, twitter, github, created_at")
            .eq("id", userId)
            .maybeSingle();
          userData = fallback.data;
        }

        if (!isCancelled && userData) {
          setSelfProfile({
            id: userData.id,
            name: userData.display_name || userData.handle || "Creator",
            handle: userData.handle || "",
            avatar_url: userData.avatar_url || "",
            bio: userData.bio || "",
            website: userData.website || "",
            twitter: userData.twitter || "",
            github: userData.github || "",
            created_at: userData.created_at,
            handle_last_changed_at: userData.handle_last_changed_at || undefined,
          });
          return;
        }

        // If row in public.users doesn't exist yet, sync with server
        if (!isCancelled && !userData) {
          const res = await fetch("/api/auth/sync", { method: "POST" });
          if (res.ok) {
            const synced = await res.json();
            if (synced?.user && !isCancelled) {
              setSelfProfile({
                id: synced.user.id,
                name: synced.user.display_name || synced.user.handle || "Creator",
                handle: synced.user.handle || "",
                avatar_url: synced.user.avatar_url || "",
                bio: synced.user.bio || "",
                website: synced.user.website || "",
                twitter: synced.user.twitter || "",
                github: synced.user.github || "",
                created_at: synced.user.created_at,
                handle_last_changed_at: synced.user.handle_last_changed_at || undefined,
              });
            }
          }
        }
      } catch (e) {
        console.warn("Failed to load user profile:", e);
      } finally {
        if (!isCancelled) {
          setIsSelfLoading(false);
        }
      }
    }

    loadUserProfile();
    return () => {
      isCancelled = true;
    };
  }, [user, authLoading]);

  // Fetch remote creator profile if viewing someone else
  const [remoteCreator, setRemoteCreator] = useState<User | null>(null);

  useEffect(() => {
    if (isSelf || !cleanId || cleanId === "self" || cleanId === "me") return;
    let isCancelled = false;

    async function loadRemoteCreator() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("users")
          .select("id, handle, display_name, avatar_url, bio, website, twitter, github, created_at")
          .or(`handle.eq.${cleanId},id.eq.${cleanId}`)
          .single();

        if (!isCancelled && !error && data) {
          setRemoteCreator({
            id: data.id,
            name: data.display_name || data.handle || cleanId,
            handle: data.handle || cleanId,
            avatar_url: data.avatar_url || "",
            bio: data.bio || "",
            website: data.website || "",
            twitter: data.twitter || "",
            github: data.github || "",
            created_at: data.created_at,
          });
        }
      } catch (e) {
        console.warn("Failed to load remote creator:", e);
      } finally {
        if (!isCancelled) {
          setIsRemoteLoading(false);
        }
      }
    }

    loadRemoteCreator();
    return () => {
      isCancelled = true;
    };
  }, [isSelf, cleanId]);

  // Check if cleanId matches an existing creator profile
  const matchedCreator: User | undefined = useMemo(() => {
    if (isSelf) return undefined;
    if (remoteCreator) return remoteCreator;

    // Check if any loaded project matches this owner or handle
    const foundProject = profiles.find(
      (p) =>
        p.owner_id?.toLowerCase() === cleanId ||
        p.owner_handle?.toLowerCase().replace("@", "") === cleanId ||
        p.owner_name?.toLowerCase() === cleanId ||
        p.handle?.toLowerCase().replace("@", "") === cleanId
    );
    if (foundProject) {
      return {
        id: foundProject.owner_id || foundProject.id || cleanId,
        name: foundProject.owner_name || foundProject.name || cleanId,
        handle: (foundProject.owner_handle || foundProject.handle || cleanId).replace("@", ""),
        avatar_url: foundProject.owner_avatar || foundProject.imageUrl || "",
        bio: foundProject.owner_bio || "",
        joined_days_ago: foundProject.joined_days_ago,
      };
    }

    return undefined;
  }, [isSelf, remoteCreator, cleanId, profiles]);

  // Is viewing a user (self or other creator) vs single project showcase
  const isViewingUser =
    initialMode === "user" ||
    (initialMode !== "project" &&
      (cleanId === "self" ||
        cleanId === "me" ||
        Boolean(user && (cleanId === user.id.toLowerCase() || (selfProfile?.handle && cleanId === selfProfile.handle.toLowerCase()))) ||
        Boolean(matchedCreator) ||
        (cleanId !== "" && !cleanId.startsWith("slot-") && isNaN(Number(cleanId)) && !profiles.some((p) => p.id === cleanId || p.id === profileId))));

  const isUserLoading =
    isViewingUser &&
    (
      (isSelf && (authLoading || (Boolean(user) && (isSelfLoading || !selfProfile)))) ||
      (!isSelf && (isRemoteLoading || (!matchedCreator && !remoteCreator && isProfilesLoading)))
    );

  // Active creator profile when in user view
  const fallbackUser = useMemo(
    (): User => ({
      id: cleanId,
      name: cleanId || "Creator",
      handle: cleanId || "creator",
      avatar_url: "",
      bio: "",
    }),
    [cleanId]
  );

  const defaultEmptySelf: User = useMemo(
    () => ({
      id: user?.id || "self",
      name: user?.user_metadata?.full_name || user?.user_metadata?.name || "Creator",
      handle: user?.user_metadata?.user_name || "creator",
      avatar_url: user?.user_metadata?.avatar_url || "",
      bio: "",
      website: "",
      twitter: "",
      github: "",
    }),
    [user]
  );

  const activeUser: User = useMemo(() => {
    if (isSelf) return selfProfile || defaultEmptySelf;
    if (matchedCreator) return matchedCreator;
    return fallbackUser;
  }, [isSelf, selfProfile, defaultEmptySelf, matchedCreator, fallbackUser]);

  // Human-readable joined text
  const joinedDisplay = useMemo(() => {
    if (activeUser.created_at) {
      const diffMs = Date.now() - new Date(activeUser.created_at).getTime();
      const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      return diffDays === 0 ? "today" : `${diffDays}d ago`;
    }
    if (activeUser.joined_days_ago != null && activeUser.joined_days_ago > 0) {
      return `${activeUser.joined_days_ago}d ago`;
    }
    return "recently";
  }, [activeUser.created_at, activeUser.joined_days_ago]);

  // Projects owned by this active creator profile
  const creatorProjects = useMemo(() => {
    if (isSelf) {
      const userHandle = (selfProfile?.handle || user?.user_metadata?.user_name || "").toLowerCase().replace("@", "");
      return profiles.filter(
        (x) =>
          Boolean(user && x.owner_id === user.id) ||
          Boolean(userHandle && userHandle !== "n/a" && x.owner_handle?.toLowerCase().replace("@", "") === userHandle) ||
          Boolean(userHandle && userHandle !== "n/a" && x.handle.toLowerCase().replace("@", "") === userHandle)
      );
    }

    if (matchedCreator) {
      const creatorHandle = (matchedCreator.handle || "").toLowerCase().replace("@", "");
      return profiles.filter(
        (x) =>
          (matchedCreator.id && x.owner_id?.toLowerCase() === matchedCreator.id.toLowerCase()) ||
          (creatorHandle && creatorHandle !== "n/a" && x.owner_handle?.toLowerCase().replace("@", "") === creatorHandle) ||
          (creatorHandle && creatorHandle !== "n/a" && x.handle.toLowerCase().replace("@", "") === creatorHandle) ||
          (matchedCreator.name && matchedCreator.name !== "N/A" && x.owner_name?.toLowerCase() === matchedCreator.name.toLowerCase())
      );
    }

    return [];
  }, [isSelf, user, selfProfile, matchedCreator, profiles]);

  const matchedProject = useMemo(() => {
    return profiles.find(
      (x) =>
        x.id === profileId ||
        x.id === cleanId ||
        x.seq.toString() === cleanId ||
        x.name.toLowerCase() === cleanId ||
        x.handle?.toLowerCase().replace("@", "") === cleanId
    );
  }, [profiles, profileId, cleanId]);

  // If viewing a single project showcase
  const singleProject = useMemo((): Profile => {
    if (isViewingUser) {
      if (creatorProjects.length > 0) {
        return creatorProjects[0];
      }
      return {
        id: "slot-preview",
        name: activeUser.name || "Preview Project",
        handle: activeUser.handle ? `@${activeUser.handle}` : "@creator",
        category: "Tech",
        active_value: 0,
        seq: 0,
        imageUrl: "",
        linkUrl: "",
        owner_id: activeUser.id,
        owner_name: activeUser.name,
        owner_handle: activeUser.handle,
        owner_avatar: activeUser.avatar_url,
        views: 0,
        shares: 0,
        times_bumped: 0,
        times_climbed: 0,
        joined_days_ago: 0,
        last_bump_at: 0,
        peak_rank: 0,
        journey: [],
        reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
      };
    }
    return (
      matchedProject ?? {
        id: profileId,
        seq: 0,
        name: "Project",
        handle: "",
        category: "Tech",
        active_value: 0,
        imageUrl: "",
        linkUrl: "",
        peak_rank: 0,
        times_bumped: 0,
        times_climbed: 0,
        views: 0,
        shares: 0,
        joined_days_ago: 0,
        last_bump_at: 0,
        journey: [],
        reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
      }
    );
  }, [isViewingUser, creatorProjects, activeUser, matchedProject, profileId]);

  const p: Profile = singleProject;

  const isProjectLoading =
    !isViewingUser &&
    (isProfilesLoading || (!matchedProject && profiles.length === 0));

  const sorted = useMemo(() => sortBoard(profiles), [profiles]);

  const slots: SlotItem[] = useMemo(() => {
    return sorted.map((item, idx) => ({
      id: item.id,
      rank: idx + 1,
      imageUrl: item.imageUrl,
      linkUrl: item.linkUrl,
      title: item.name,
      bidderName: item.handle,
      amountPaid: item.active_value,
      createdAt: item.last_bump_at,
      imagePosX: item.imagePosX,
      imagePosY: item.imagePosY,
      imageZoom: item.imageZoom,
      owner_id: item.owner_id,
      owner_name: item.owner_name,
      owner_handle: item.owner_handle,
      owner_avatar: item.owner_avatar,
      category: item.category,
      reactions: item.reactions,
    }));
  }, [sorted]);

  const entryFloor = useMemo(() => {
    if (sorted.length < 100) return 10;
    const lastActive = sorted[99];
    return lastActive ? lastActive.active_value + 10 : 10;
  }, [sorted]);

  const [isBiddingOpen, setIsBiddingOpen] = useState(false);
  const [targetSlotToBump, setTargetSlotToBump] = useState<SlotItem | null>(null);

  const handleClaim = () => {
    soundEngine.playClick();
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth();
        return;
      }
    }
    if (onClaimSlot) {
      onClaimSlot();
    } else {
      setTargetSlotToBump(null);
      setIsBiddingOpen(true);
    }
  };

  const handleBump = (proj: Profile) => {
    soundEngine.playClick();
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth();
        return;
      }
    }
    if (onBumpProject) {
      onBumpProject(proj.id);
    } else {
      const slot = slots.find((s) => s.id === proj.id) || {
        id: proj.id,
        rank: sorted.findIndex((s) => s.id === proj.id) + 1 || 100,
        imageUrl: proj.imageUrl,
        linkUrl: proj.linkUrl,
        title: proj.name,
        bidderName: proj.handle,
        amountPaid: proj.active_value,
        createdAt: proj.last_bump_at || Date.now(),
        category: proj.category,
        owner_id: proj.owner_id,
        owner_name: proj.owner_name,
        owner_handle: proj.owner_handle,
        owner_avatar: proj.owner_avatar,
      };
      setTargetSlotToBump(slot);
      setIsBiddingOpen(true);
    }
  };

  const handleProcessTopUp = (_order: TopUpOrder) => {
    soundEngine.playCoronation();
    fetch("/api/board?limit=120")
      .then((res) => res.json())
      .then((data) => {
        if (data?.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
          setProfiles(data.profiles);
        }
      })
      .catch(() => {});
  };

  const hasSlotOnGrid = Boolean(p.id !== "slot-preview" && p.active_value > 0);
  const globalRank = hasSlotOnGrid ? sorted.findIndex((x) => x.id === p.id) + 1 : 0;
  const catRank = hasSlotOnGrid
    ? sortBoard(profiles.filter((x) => x.category === p.category)).findIndex((x) => x.id === p.id) + 1
    : 0;

  // Is current viewer the owner of the active project p?
  const isOwnerOfP = Boolean(
    isSelf ||
    (user && (
      p.owner_id === user.id ||
      (selfProfile?.handle && p.owner_handle?.toLowerCase().replace("@", "") === selfProfile.handle.toLowerCase()) ||
      (selfProfile?.name && p.owner_name?.toLowerCase() === selfProfile.name.toLowerCase())
    ))
  );

  // Project reaction state for project view
  const [projectReactions, setProjectReactions] = useState<Record<string, number>>(() => ({
    fire: p.reactions?.fire || 0,
    eyes: p.reactions?.eyes || 0,
    heart: p.reactions?.heart || 0,
    laugh: p.reactions?.laugh || 0,
  }));
  const [activeProjectReactions, setActiveProjectReactions] = useState<Set<string>>(new Set());

  useEffect(() => {
    setProjectReactions({
      fire: p.reactions?.fire || 0,
      eyes: p.reactions?.eyes || 0,
      heart: p.reactions?.heart || 0,
      laugh: p.reactions?.laugh || 0,
    });
  }, [p.reactions, p.id]);

  useEffect(() => {
    if (!isViewingUser && p.id && user) {
      fetch(`/api/reactions?projectId=${p.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.userReactions)) {
            setActiveProjectReactions(new Set(data.userReactions));
          }
        })
        .catch(() => {});
    } else {
      setActiveProjectReactions(new Set());
    }
  }, [isViewingUser, p.id, user]);

  const handleProjectReaction = async (type: 'fire' | 'eyes' | 'heart' | 'laugh') => {
    soundEngine.playClick();
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth();
      }
      return;
    }

    const isAlreadyActive = activeProjectReactions.has(type);
    const newActive = new Set(activeProjectReactions);

    if (isAlreadyActive) {
      newActive.delete(type);
      setActiveProjectReactions(newActive);
      setProjectReactions((prev) => ({
        ...prev,
        [type]: Math.max(0, (prev[type] || 1) - 1),
      }));

      try {
        const res = await fetch(`/api/reactions?projectId=${p.id}&reaction=${type}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data?.count != null) {
          setProjectReactions((prev) => ({ ...prev, [type]: data.count }));
        }
      } catch {
        // Keep optimistic state
      }
    } else {
      newActive.add(type);
      setActiveProjectReactions(newActive);
      setProjectReactions((prev) => ({
        ...prev,
        [type]: (prev[type] || 0) + 1,
      }));

      try {
        const res = await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: p.id, reaction: type }),
        });
        const data = await res.json();
        if (data?.count != null) {
          setProjectReactions((prev) => ({ ...prev, [type]: data.count }));
        }
      } catch {
        // Keep optimistic state
      }
    }
  };

  // Edit User Modal state (Self mode)
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [profileEditName, setProfileEditName] = useState(selfProfile?.name || "");
  const [profileEditHandle, setProfileEditHandle] = useState(selfProfile?.handle || "");
  const [profileEditBio, setProfileEditBio] = useState(selfProfile?.bio || "");
  const [profileEditAvatar, setProfileEditAvatar] = useState(selfProfile?.avatar_url || "");
  const [profileEditWebsite, setProfileEditWebsite] = useState(selfProfile?.website || "");
  const [profileEditTwitter, setProfileEditTwitter] = useState(selfProfile?.twitter || "");
  const [profileEditGithub, setProfileEditGithub] = useState(selfProfile?.github || "");
  const [profileSavedSuccess, setProfileSavedSuccess] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const [handleCheckError, setHandleCheckError] = useState<string | null>(null);
  const [handleCheckSuccess, setHandleCheckSuccess] = useState(false);
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);

  // 30-day handle cooldown calculation
  const cooldownDaysRemaining = useMemo(() => {
    return getHandleCooldownRemainingDays(selfProfile?.handle_last_changed_at);
  }, [selfProfile?.handle_last_changed_at]);

  const handleOpenEditUser = () => {
    soundEngine.playClick();
    setProfileEditName(selfProfile?.name && selfProfile.name !== "N/A" ? selfProfile.name : "");
    setProfileEditHandle(selfProfile?.handle && selfProfile.handle !== "N/A" ? selfProfile.handle : "");
    setProfileEditBio(selfProfile?.bio || "");
    setProfileEditAvatar(selfProfile?.avatar_url || "");
    setProfileEditWebsite(selfProfile?.website || "");
    setProfileEditTwitter(selfProfile?.twitter || "");
    setProfileEditGithub(selfProfile?.github || "");
    setProfileSavedSuccess(false);
    setHandleCheckError(null);
    setHandleCheckSuccess(false);
    setAvatarUploadError(null);
    setIsEditingUser(true);
  };

  // Debounced handle validation & database uniqueness check
  useEffect(() => {
    if (!isEditingUser) return;
    const cleanCurrent = (selfProfile?.handle || "").replace(/^@/, "").trim().toLowerCase();
    const cleanNew = profileEditHandle.replace(/^@/, "").trim().toLowerCase();

    if (!cleanNew) {
      setHandleCheckError("Handle cannot be empty");
      setHandleCheckSuccess(false);
      setIsCheckingHandle(false);
      return;
    }

    if (cleanNew === cleanCurrent) {
      setHandleCheckError(null);
      setHandleCheckSuccess(false);
      setIsCheckingHandle(false);
      return;
    }

    if (cooldownDaysRemaining > 0) {
      setHandleCheckError(`Handle locked. Next change available in ${cooldownDaysRemaining} day${cooldownDaysRemaining === 1 ? "" : "s"}.`);
      setHandleCheckSuccess(false);
      setIsCheckingHandle(false);
      return;
    }

    if (cleanNew.length < 2) {
      setHandleCheckError("Handle must be at least 2 characters.");
      setHandleCheckSuccess(false);
      setIsCheckingHandle(false);
      return;
    }
    if (cleanNew.length > 30) {
      setHandleCheckError("Handle cannot exceed 30 characters.");
      setHandleCheckSuccess(false);
      setIsCheckingHandle(false);
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanNew)) {
      setHandleCheckError("Only letters, numbers, and underscores allowed.");
      setHandleCheckSuccess(false);
      setIsCheckingHandle(false);
      return;
    }

    setIsCheckingHandle(true);
    setHandleCheckError(null);
    setHandleCheckSuccess(false);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/check-handle?handle=${encodeURIComponent(cleanNew)}&userId=${encodeURIComponent(user?.id || "")}`
        );
        const data = await res.json();
        if (!res.ok || !data.available) {
          setHandleCheckError(data.error || "This @handle is already taken.");
          setHandleCheckSuccess(false);
        } else {
          setHandleCheckError(null);
          setHandleCheckSuccess(true);
        }
      } catch (err) {
        console.warn("Handle check error:", err);
      } finally {
        setIsCheckingHandle(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [profileEditHandle, isEditingUser, selfProfile?.handle, cooldownDaysRemaining, user?.id]);

  // Handle direct avatar upload via /api/uploads/image
  const handleAvatarFile = async (file: File) => {
    setAvatarUploadError(null);
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      setAvatarUploadError("Please upload a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarUploadError("Image size must be less than 5MB.");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        setProfileEditAvatar(data.url);
        soundEngine.playClick();
      } else {
        // Fallback to FileReader base64
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setProfileEditAvatar(ev.target.result as string);
            soundEngine.playClick();
          }
        };
        reader.readAsDataURL(file);
        if (data?.error && !data.error.includes("Authentication")) {
          setAvatarUploadError(data.error);
        }
      }
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setProfileEditAvatar(ev.target.result as string);
          soundEngine.playClick();
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (handleCheckError) {
      return;
    }
    const cleanCurrent = (selfProfile?.handle || "").replace(/^@/, "").trim().toLowerCase();
    const cleanNew = profileEditHandle.replace(/^@/, "").trim().toLowerCase();
    const isHandleChanged = Boolean(cleanNew && cleanNew !== cleanCurrent);

    if (isHandleChanged && cooldownDaysRemaining > 0) {
      setHandleCheckError(`You can only change your @handle once every 30 days.`);
      return;
    }

    soundEngine.playClick();
    const nowIso = new Date().toISOString();
    const updated: User = {
      id: user?.id || selfProfile?.id || "self",
      name: profileEditName.trim() || (selfProfile?.name && selfProfile.name !== "N/A" ? selfProfile.name : "Creator"),
      handle: cleanNew || (selfProfile?.handle && selfProfile.handle !== "N/A" ? selfProfile.handle : "creator"),
      bio: profileEditBio.trim(),
      avatar_url: profileEditAvatar.trim(),
      website: profileEditWebsite.trim(),
      twitter: profileEditTwitter.trim().replace("@", ""),
      github: profileEditGithub.trim(),
      handle_last_changed_at: isHandleChanged ? nowIso : selfProfile?.handle_last_changed_at,
    };
    setSelfProfile(updated);

    if (user) {
      const currentUserId = user.id;
      (async () => {
        try {
          const supabase = createClient();
          const updatePayload: Record<string, any> = {
            display_name: updated.name !== "N/A" ? updated.name : null,
            handle: updated.handle !== "N/A" ? updated.handle : null,
            bio: updated.bio || null,
            avatar_url: updated.avatar_url || null,
            website: updated.website || null,
            twitter: updated.twitter || null,
            github: updated.github || null,
            updated_at: nowIso,
          };
          if (isHandleChanged) {
            updatePayload.handle_last_changed_at = nowIso;
          }
          let { error } = await supabase
            .from("users")
            .update(updatePayload)
            .eq("id", currentUserId);

          if (error && error.message?.includes("handle_last_changed_at")) {
            delete updatePayload.handle_last_changed_at;
            await supabase
              .from("users")
              .update(updatePayload)
              .eq("id", currentUserId);
          }
        } catch (err) {
          console.warn("Supabase update error:", err);
        }
      })();
    }
    setProfileSavedSuccess(true);
    setTimeout(() => {
      setIsEditingUser(false);
      setProfileSavedSuccess(false);
    }, 1000);
  };

  // Edit Project Modal state (Zero Sliders)
  const [editingProject, setEditingProject] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("AI");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editImagePosX, setEditImagePosX] = useState(50);
  const [editImagePosY, setEditImagePosY] = useState(50);
  const [editImageZoom, setEditImageZoom] = useState(1);
  const [isRepositioning, setIsRepositioning] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [copiedLink, setCopiedLink] = useState(false);

  // Open modal for a specific project
  const handleOpenEditProject = (proj: Profile) => {
    soundEngine.playClick();
    setEditingProject(proj);
    setEditName(proj.name);
    setEditLinkUrl(proj.linkUrl || "");
    setEditCategory(proj.category);
    setEditImageUrl(proj.imageUrl);
    setEditImagePosX(proj.imagePosX ?? 50);
    setEditImagePosY(proj.imagePosY ?? 50);
    setEditImageZoom(proj.imageZoom ?? 1);
    setUploadError(null);
    setSavedSuccess(false);
  };

  // Direct image file upload for project
  const handleImageFile = (file: File) => {
    setUploadError(null);
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      setUploadError("Please upload a JPG, PNG, or WebP image. SVGs and GIFs are not allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image size must be less than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setEditImageUrl(result);
        soundEngine.playClick();
      }
    };
    reader.onerror = () => {
      setUploadError("Failed to read image file. Please try another image.");
    };
    reader.readAsDataURL(file);
  };

  // Left click drag to pan
  const handleMouseDownReposition = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    e.preventDefault();
    setIsRepositioning(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: editImagePosX,
      posY: editImagePosY,
    };
  };

  const handleMouseMoveReposition = (e: React.MouseEvent) => {
    if (!isRepositioning || !dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    const sensitivity = 0.35 / (editImageZoom || 1);
    const newPosX = Math.max(0, Math.min(100, Math.round(dragStartRef.current.posX - deltaX * sensitivity)));
    const newPosY = Math.max(0, Math.min(100, Math.round(dragStartRef.current.posY - deltaY * sensitivity)));
    setEditImagePosX(newPosX);
    setEditImagePosY(newPosY);
  };

  const handleMouseUpReposition = () => {
    setIsRepositioning(false);
    dragStartRef.current = null;
  };

  // Mouse wheel scroll to zoom in/out (no sliders)
  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
    setEditImageZoom((prev) => {
      const next = Math.max(1, Math.min(3, Number((prev + zoomDelta).toFixed(2))));
      return next;
    });
  };

  const handleResetPosition = () => {
    soundEngine.playClick();
    setEditImagePosX(50);
    setEditImagePosY(50);
    setEditImageZoom(1);
  };

  // Save updated project settings
  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    soundEngine.playClick();

    const updated: Profile = {
      ...editingProject,
      name: editName.trim() || editingProject.name,
      linkUrl: editLinkUrl.trim() || editingProject.linkUrl,
      imageUrl: editImageUrl || editingProject.imageUrl,
      category: editCategory,
      imagePosX: editImagePosX,
      imagePosY: editImagePosY,
      imageZoom: editImageZoom,
    };

    const nextProfiles = profiles.map((item) => (item.id === updated.id ? updated : item));
    setProfiles(nextProfiles);

    if (onUpdateProfile) {
      onUpdateProfile(updated);
    }

    // Persist project changes directly to Supabase database
    if (user) {
      (async () => {
        try {
          const supabase = createClient();
          await supabase
            .from("projects")
            .update({
              title: updated.name,
              destination_url: updated.linkUrl,
              image_path: updated.imageUrl,
              image_pos_x: updated.imagePosX ?? 50,
              image_pos_y: updated.imagePosY ?? 50,
              image_zoom: updated.imageZoom ?? 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", updated.id);
        } catch (err) {
          console.warn("Failed to persist project update to database:", err);
        }
      })();
    }

    setSavedSuccess(true);
    if (onUpdateProfile) {
      onUpdateProfile(updated);
    }

    setTimeout(() => {
      setEditingProject(null);
      setSavedSuccess(false);
    }, 1000);
  };

  const handleCopyLink = () => {
    soundEngine.playClick();
    if (typeof window !== "undefined" && navigator.clipboard) {
      const link = isViewingUser
        ? `${window.location.origin}/profile/${isSelf ? "self" : activeUser.handle ? activeUser.handle : activeUser.id}`
        : `${window.location.origin}/project/${p.id}`;
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleFlexOnX = () => {
    soundEngine.playClick();
    const handleText = activeUser.handle ? `@${activeUser.handle.replace("@", "")}` : activeUser.name || "Creator";
    const text = encodeURIComponent(
      isViewingUser
        ? `Check out ${handleText}'s projects on @bumpone_lol!\n\nhttps://bumpone.lol/profile/${activeUser.handle ? activeUser.handle.replace("@", "") : "self"}`
        : `Check out #${hasSlotOnGrid && globalRank > 0 ? globalRank : "1"} "${p.name || "Project"}" on @bumpone_lol with ${money(p.active_value)} active value!\n\nhttps://bumpone.lol/project/${p.id}`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank", "noopener,noreferrer");
  };

  // Aggregated stats across creator projects
  const totalInvested = creatorProjects.reduce((acc, x) => acc + x.active_value, 0);
  const bestRank =
    creatorProjects.length > 0
      ? Math.min(
          ...creatorProjects.map((x) => {
            const r = sorted.findIndex((s) => s.id === x.id);
            return r === -1 ? 999 : r + 1;
          })
        )
      : 0;
  const totalViews = creatorProjects.reduce((acc, x) => acc + (x.views || 0), 0);

  const totalReactionsReceived = creatorProjects.reduce(
    (sum, proj) =>
      sum +
      Number(proj.reactions?.fire || 0) +
      Number(proj.reactions?.eyes || 0) +
      Number(proj.reactions?.heart || 0) +
      Number(proj.reactions?.laugh || 0),
    0
  );

  const reactionsBreakdown = creatorProjects.reduce(
    (acc, proj) => {
      acc.fire += Number(proj.reactions?.fire || 0);
      acc.eyes += Number(proj.reactions?.eyes || 0);
      acc.heart += Number(proj.reactions?.heart || 0);
      acc.laugh += Number(proj.reactions?.laugh || 0);
      return acc;
    },
    { fire: 0, eyes: 0, heart: 0, laugh: 0 }
  );

  if (isSelf && !user && !authLoading) {
    return (
      <div className="mx-auto max-w-[640px] w-full px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg border border-white/[0.08]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Grid
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg border border-white/[0.08]"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Grid
            </Link>
          )}
        </div>

        <div className="rounded-3xl border border-white/[0.1] bg-[#18191d]/90 p-8 sm:p-10 shadow-2xl backdrop-blur-xl text-center space-y-6">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-xl shadow-amber-500/10">
            <Lock className="w-10 h-10" />
          </div>

          <div className="space-y-2 max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Creator Account Required
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sign in with your Google or X / Twitter account to view your dashboard, manage your projects on the 100-slot wall, and edit your verified creator profile.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant="primary"
              size="lg"
              leftIcon={<UserCheck className="w-4 h-4 fill-zinc-950" />}
              onClick={() => {
                if (onRequireAuth) onRequireAuth();
                else if (typeof window !== "undefined") window.location.href = "/?auth=true";
              }}
              className="w-full sm:w-auto font-bold px-8 py-3 shadow-lg shadow-amber-500/20"
            >
              Sign In / Connect Account
            </Button>
            {onBack ? (
              <Button
                variant="ghost"
                size="lg"
                onClick={onBack}
                className="w-full sm:w-auto text-xs text-slate-400 hover:text-white"
              >
                Return to Grid
              </Button>
            ) : (
              <Link
                href="/"
                className="w-full sm:w-auto text-xs text-slate-400 hover:text-white py-3 px-4 rounded-lg bg-white/[0.04] border border-white/[0.08]"
              >
                Return to Grid
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1080px] w-full px-4 sm:px-6 py-2">
      {/* Top Navigation & Status Bar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg border border-white/[0.08]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Grid
          </button>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg border border-white/[0.08]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Grid
          </Link>
        )}

        <div className="flex items-center gap-2">
          {!isViewingUser && isOwnerOfP && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Settings className="w-3.5 h-3.5 text-slate-300" />}
              onClick={() => handleOpenEditProject(p)}
              className="text-xs py-1.5 px-3 bg-white/[0.05] border-white/[0.15] hover:border-white/[0.3] text-white"
            >
              Edit Project
            </Button>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] px-3 py-1.5 rounded-lg border border-white/[0.08] transition-colors cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? "Link Copied" : "Copy Link"}</span>
          </button>
          <button
            type="button"
            onClick={handleFlexOnX}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-[#000] hover:bg-[#111] px-3.5 py-1.5 rounded-lg border border-white/[0.2] transition-all cursor-pointer shadow-sm hover:border-white/[0.4]"
          >
            <Share2 className="w-3.5 h-3.5 text-slate-300" />
            <span>Share on X</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW A: USER PROFILE & PORTFOLIO OF PROJECTS                              */}
      {/* ========================================================================= */}
      {isViewingUser ? (
        <div className="space-y-6 pb-8">
          {/* User Profile Card */}
          {isUserLoading ? (
            <div className="rounded-2xl border border-white/[0.1] bg-[#18191d]/90 p-6 shadow-2xl backdrop-blur-xl animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <SkeletonAvatar size="xl" shape="rounded-2xl" className="ring-2 ring-white/[0.08]" />
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Skeleton variant="text" width={180} className="h-6 sm:h-7" />
                      <SkeletonBadge width={120} />
                    </div>
                    <Skeleton variant="text" width={100} className="h-3.5" />
                    <SkeletonText lines={2} widths={["90%", "65%"]} className="space-y-1.5 pt-1" />
                    <div className="flex items-center gap-3 pt-2">
                      <Skeleton variant="rounded-full" width={110} height={20} />
                      <Skeleton variant="rounded-full" width={90} height={20} />
                      <Skeleton variant="rounded-full" width={80} height={20} />
                    </div>
                  </div>
                </div>
                {isSelf && (
                  <Skeleton variant="rounded-lg" width={105} height={32} />
                )}
              </div>

              {/* Aggregated Portfolio Stats Across Projects */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-white/[0.08]">
                <SkeletonStat variant="metric" />
                <SkeletonStat variant="metric" />
                <SkeletonStat variant="metric" />
                <SkeletonStat variant="metric" />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.1] bg-[#18191d]/90 p-6 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                <div className="flex items-start gap-4">
                  <Avatar
                    src={activeUser.avatar_url}
                    alt={activeUser.name || "Creator"}
                    name={activeUser.name || "Creator"}
                    size="xl"
                    shape="rounded-2xl"
                    ringClassName="ring-2 ring-amber-400/40 shadow-xl shrink-0"
                    fallbackClassName="bg-amber-500/10 border border-amber-500/30 text-amber-300"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                        {activeUser.name || "Creator"}
                      </h1>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium flex items-center gap-1">
                        <UserCheck className="w-3 h-3" /> {isSelf ? "Your Creator Account" : "Creator Profile"}
                      </span>
                    </div>
                    {activeUser.handle ? (
                      <p className="text-xs text-amber-300 font-mono">
                        @{activeUser.handle.replace("@", "")}
                      </p>
                    ) : null}
                    {activeUser.bio ? (
                      <p className="text-xs text-slate-300 leading-relaxed max-w-xl pt-1">
                        {activeUser.bio}
                      </p>
                    ) : isSelf ? (
                      <p className="text-xs text-slate-500 italic max-w-xl pt-1">
                        No bio added yet. Click &quot;Edit Profile&quot; to add one.
                      </p>
                    ) : null}

                    {/* Social, Web Links, and Joined date */}
                    <div className="flex items-center gap-3 pt-2 text-xs text-slate-400 flex-wrap">
                      {activeUser.website && (
                        <a
                          href={activeUser.website.startsWith("http") ? activeUser.website : `https://${activeUser.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-white transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono text-[11px] truncate max-w-[150px]">
                            {activeUser.website.replace(/^https?:\/\//, "")}
                          </span>
                        </a>
                      )}
                      {activeUser.twitter && (
                        <a
                          href={`https://x.com/${activeUser.twitter.replace("@", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-white transition-colors"
                        >
                          <XTwitterIcon className="w-3.5 h-3.5 text-slate-300" />
                          <span className="font-mono text-[11px]">@{activeUser.twitter.replace("@", "")}</span>
                        </a>
                      )}
                      {activeUser.github && (
                        <a
                          href={`https://github.com/${activeUser.github}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-white transition-colors"
                        >
                          <GitHubIcon className="w-3.5 h-3.5 text-slate-300" />
                          <span className="font-mono text-[11px]">{activeUser.github}</span>
                        </a>
                      )}
                      {activeUser.created_at && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                          Joined {joinedDisplay}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isSelf && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Edit3 className="w-3.5 h-3.5 text-slate-300" />}
                      onClick={handleOpenEditUser}
                      className="text-xs py-1.5"
                    >
                      Edit Profile
                    </Button>
                  </div>
                )}
              </div>

              {/* Aggregated Portfolio Stats Across Projects */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-white/[0.08]">
                <StatDisplay
                  variant="metric"
                  value={creatorProjects.length}
                  label="Total Projects"
                  icon={<Layers className="w-3 h-3 text-sky-400" />}
                />
                <StatDisplay
                  variant="metric"
                  value={creatorProjects.length > 0 && totalInvested > 0 ? money(totalInvested) : "$0"}
                  valueClassName="text-amber-300"
                  label="Value on Wall"
                  icon={<Zap className="w-3 h-3 text-amber-400" />}
                />
                <StatDisplay
                  variant="metric"
                  value={bestRank > 0 && bestRank <= 100 ? `#${bestRank}` : "Unranked"}
                  valueClassName="text-emerald-300"
                  label="Best Live Rank"
                  icon={<Crown className="w-3 h-3 text-amber-400" />}
                />
                <StatDisplay
                  variant="metric"
                  value={creatorProjects.length > 0 && totalViews > 0 ? totalViews.toLocaleString() : "0"}
                  valueClassName="text-slate-200"
                  label="Total Views"
                  icon={<Eye className="w-3 h-3 text-indigo-400" />}
                />
              </div>

              {/* Aggregated Community Clout Across Creator Portfolio */}
              <div className="mt-4 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🔥</span>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="text-amber-300 font-mono text-sm">{totalReactionsReceived.toLocaleString()}</span>
                      <span className="text-slate-300 font-medium">Combined Community Reactions</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Total reaction clout earned across {creatorProjects.length} {creatorProjects.length === 1 ? 'project' : 'projects'} on the board
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-neutral-300" title="Fire reactions">
                    <span>🔥</span> <span>{reactionsBreakdown.fire}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-neutral-300" title="Eyes reactions">
                    <span>👀</span> <span>{reactionsBreakdown.eyes}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-neutral-300" title="Heart reactions">
                    <span>❤️</span> <span>{reactionsBreakdown.heart}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-neutral-300" title="Laugh reactions">
                    <span>😂</span> <span>{reactionsBreakdown.laugh}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Portfolio Section: Projects Owned by This Profile */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  {isSelf ? "My Projects & Products" : `Projects by @${activeUser.handle}`}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isSelf
                    ? "Manage your active products on the 100-slot wall. Update titles, framing, and links anytime."
                    : `Active bids and slots owned by @${activeUser.handle}.`}
                </p>
              </div>

              {isSelf && creatorProjects.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={handleClaim}
                  className="text-xs py-1.5"
                >
                  Add Project
                </Button>
              )}
            </div>

            {isUserLoading || (isProfilesLoading && creatorProjects.length === 0) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : creatorProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.01] p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">No projects on the wall yet</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    {isSelf
                      ? "You haven't bid any projects onto the 100-slot wall. Bid your first product to claim your live spot and boost visibility!"
                      : "This creator currently has no active projects on the board."}
                  </p>
                </div>
                {isSelf && (
                  <Button
                    variant="primary"
                    size="md"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={handleClaim}
                    className="font-bold shadow-lg shadow-amber-500/20"
                  >
                    Bid Your First Project
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {creatorProjects.map((proj) => {
                  const rankOnGrid = sorted.findIndex((s) => s.id === proj.id) + 1;
                  const isLive = rankOnGrid > 0 && rankOnGrid <= 100;

                  return (
                    <div
                      key={proj.id}
                      className="group rounded-2xl border border-white/[0.08] hover:border-white/[0.2] bg-[#18191d]/90 p-4 shadow-xl transition-all duration-200 flex flex-col justify-between"
                    >
                      <div>
                        {/* Cover Tile Thumbnail with custom framing applied */}
                        <div className="relative h-44 w-full rounded-xl overflow-hidden bg-[#0d0e12] border border-white/[0.1] flex items-center justify-center">
                          {proj.imageUrl ? (
                            <img
                              src={proj.imageUrl}
                              alt={proj.name || "Project"}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              style={{
                                objectPosition: `${proj.imagePosX ?? 50}% ${proj.imagePosY ?? 50}%`,
                                transform: proj.imageZoom && proj.imageZoom > 1 ? `scale(${proj.imageZoom})` : undefined,
                                transformOrigin: `${proj.imagePosX ?? 50}% ${proj.imagePosY ?? 50}%`,
                              }}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1 text-slate-500">
                              <ImageIcon className="w-8 h-8 stroke-1" />
                              <span className="text-[10px] font-mono text-slate-500">No Image</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                          {/* Floating Badges */}
                          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                            {isLive ? (
                              <Badge variant="rank" rank={rankOnGrid} />
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/30 text-rose-300 border border-rose-500/40">
                                Displaced
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/70 text-slate-300 border border-white/10 backdrop-blur-md">
                              {proj.category || "General"}
                            </span>
                          </div>

                          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-amber-300">
                              {proj.active_value != null && proj.active_value > 0 ? `${money(proj.active_value)} paid` : "$0 paid"}
                            </span>
                            <span className="text-[10px] text-slate-300 font-mono">
                              {proj.views != null && proj.views > 0 ? `${proj.views.toLocaleString()} views` : "0 views"}
                            </span>
                          </div>
                        </div>

                        {/* Project Details */}
                        <div className="mt-3">
                          <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                            {proj.name || "Untitled Project"}
                          </h3>
                          {proj.linkUrl ? (
                            <a
                              href={proj.linkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-slate-400 hover:text-white transition-colors truncate mt-0.5 flex items-center gap-1 font-mono"
                            >
                              <span className="truncate">{proj.linkUrl.replace(/^https?:\/\//, "")}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : null}
                        </div>
                      </div>

                      {/* Project Action Toolbar */}
                      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectProfile) onSelectProfile(proj.id);
                          }}
                          className="text-xs text-slate-400 hover:text-white transition-colors font-medium cursor-pointer"
                        >
                          View Showcase
                        </button>

                        <div className="flex items-center gap-1.5">
                          {isSelf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={<Settings className="w-3 h-3 text-slate-300" />}
                              onClick={() => handleOpenEditProject(proj)}
                              className="text-xs py-1 px-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08]"
                            >
                              Edit
                            </Button>
                          )}

                          <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<Zap className="w-3 h-3 text-slate-950" />}
                            onClick={() => handleBump(proj)}
                            className="text-xs py-1 px-2.5 font-bold"
                          >
                            Bump
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : isProjectLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pb-8 animate-in fade-in duration-200">
          {/* Left Column: Primary Project Details (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#18191d]/90 shadow-2xl backdrop-blur-xl">
              {/* Cover Banner Skeleton */}
              <div className="relative h-56 sm:h-72 bg-[#0d0e12] overflow-hidden flex items-center justify-center">
                <Skeleton variant="rectangular" className="w-full h-full" />
                <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <SkeletonBadge width={70} />
                    <SkeletonBadge width={90} />
                  </div>
                  <SkeletonBadge width={60} />
                </div>
              </div>

              {/* Project Details */}
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <Skeleton variant="text" width={220} className="h-7 sm:h-8" />
                  <Skeleton variant="text" width={260} className="h-3.5 opacity-60" />
                </div>

                {/* Website Destination Bar Skeleton */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton variant="text" width={110} className="h-3 opacity-60" />
                    <Skeleton variant="text" width={180} className="h-3.5" />
                  </div>
                  <Skeleton variant="rounded-lg" width={95} height={32} />
                </div>

                {/* 4 KPI Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <SkeletonStat variant="metric" />
                  <SkeletonStat variant="metric" />
                  <SkeletonStat variant="metric" />
                  <SkeletonStat variant="metric" />
                </div>
              </div>
            </div>

            {/* Creator Attribution Card Skeleton */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#18191d]/90 p-4 shadow-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <SkeletonAvatar size="lg" shape="rounded-xl" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton variant="text" width={90} className="h-2.5 opacity-60" />
                  <Skeleton variant="text" width={140} className="h-4" />
                  <Skeleton variant="text" width={80} className="h-3" />
                </div>
              </div>
              <Skeleton variant="rounded-lg" width={140} height={32} />
            </div>

            {/* Rank History Skeleton */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#18191d]/90 p-5 shadow-xl space-y-3">
              <Skeleton variant="text" width={120} className="h-3.5" />
              <Skeleton variant="rounded-xl" className="w-full h-24" />
            </div>
          </div>

          {/* Right Column: Actions & Bump Box Skeleton (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-white/[0.1] bg-[#18191d]/90 p-5 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton variant="text" width={130} className="h-4" />
                <Skeleton variant="text" width={50} className="h-4" />
              </div>
              <SkeletonText lines={2} widths={["95%", "80%"]} />
              <Skeleton variant="rounded-xl" className="w-full h-11" />
            </div>
          </div>
        </div>
      ) : !matchedProject && profiles.length > 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#18191d]/90 p-8 text-center max-w-lg mx-auto space-y-4 my-8">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Project Not Found</h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            This project is not currently active on the 100-slot wall, or the link may be outdated.
          </p>
          {onBack && (
            <Button variant="outline" size="sm" onClick={onBack}>
              Return to Wall
            </Button>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW B: SINGLE PROJECT / PRODUCT SHOWCASE                                 */
        /* ========================================================================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pb-8">
          {/* Left Column: Primary Project Details (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Hero Showcase Card */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#18191d]/90 shadow-2xl backdrop-blur-xl">
              {/* Visual Cover Banner with user's custom pan & zoom applied */}
              <div className="relative h-56 sm:h-72 bg-[#0d0e12] overflow-hidden flex items-center justify-center">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name || "Project"}
                    className="h-full w-full select-none object-cover"
                    style={{
                      objectPosition: `${p.imagePosX ?? 50}% ${p.imagePosY ?? 50}%`,
                      transform: p.imageZoom && p.imageZoom > 1 ? `scale(${p.imageZoom})` : undefined,
                      transformOrigin: `${p.imagePosX ?? 50}% ${p.imagePosY ?? 50}%`,
                    }}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                    <ImageIcon className="w-10 h-10 stroke-1" />
                    <span className="text-xs font-mono text-slate-500">No Image Uploaded</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#18191d] via-[#18191d]/20 to-transparent pointer-events-none" />

                {/* Floating Rank & Value Badges on Cover */}
                <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {hasSlotOnGrid ? (
                      <>
                        <Badge variant="rank" rank={Math.min(globalRank, 100)} />
                        <span className="rounded-full bg-black/80 px-3 py-1 font-mono text-xs font-bold text-white border border-white/[0.2] backdrop-blur-md">
                          {p.active_value != null && p.active_value > 0 ? `${money(p.active_value)} paid` : "$0 paid"}
                        </span>
                      </>
                    ) : (
                      <span className="rounded-full bg-rose-500/20 px-3 py-1 font-mono text-xs font-bold text-rose-300 border border-rose-500/30 backdrop-blur-md">
                        Displaced (Graveyard)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-200 bg-black/60 backdrop-blur-md px-2.5 py-0.5 rounded-md border border-white/[0.15]">
                    {p.category || "General"}
                  </span>
                </div>
              </div>

              {/* Project Details */}
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{p.name || "Untitled Project"}</h1>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <span>Project #{p.id}</span>
                      <span>·</span>
                      <span>{p.category || "General"}</span>
                      {hasSlotOnGrid && (
                        <>
                          <span>·</span>
                          <span>{p.joined_days_ago ? `On the wall for ${p.joined_days_ago} days` : "Just joined the wall"}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {isOwnerOfP && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditProject(p)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1 rounded-lg border border-white/[0.08] cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" /> Edit Project
                    </button>
                  )}
                </div>

                {/* Website Destination Bar */}
                <div className="mt-5 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Website Destination</div>
                    <div className="text-xs text-slate-200 truncate font-mono mt-0.5">{p.linkUrl || "No website attached"}</div>
                  </div>
                  {p.linkUrl && (
                    <a
                      href={p.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] px-4 py-2 text-xs font-semibold text-white border border-white/[0.1] transition-colors shrink-0"
                    >
                      <span>Visit Site</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                    </a>
                  )}
                </div>

                {/* Key Performance Indicators */}
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <StatDisplay
                    variant="metric"
                    value={hasSlotOnGrid && globalRank > 0 ? `#${globalRank}` : "Unranked"}
                    label="Overall Rank"
                  />
                  <StatDisplay
                    variant="metric"
                    value={hasSlotOnGrid && catRank > 0 ? `#${catRank}` : "—"}
                    valueClassName="text-sky-300"
                    label={`${p.category || "Category"} Rank`}
                  />
                  <StatDisplay
                    variant="metric"
                    value={hasSlotOnGrid && p.peak_rank > 0 ? `#${p.peak_rank}` : "—"}
                    valueClassName="text-amber-300"
                    label="Best Rank"
                  />
                  <StatDisplay
                    variant="metric"
                    value={p.views != null && p.views > 0 ? p.views.toLocaleString() : "0"}
                    label="Total Views"
                  />
                </div>

                {/* Interactive Project Community Reactions */}
                <div className="mt-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
                  <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider font-semibold">
                    Community Reactions
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { type: 'fire', emoji: '🔥', label: 'Fire' },
                      { type: 'eyes', emoji: '👀', label: 'Eyes' },
                      { type: 'heart', emoji: '❤️', label: 'Heart' },
                      { type: 'laugh', emoji: '😂', label: 'Laugh' },
                    ].map(({ type, emoji, label }) => {
                      const isActive = activeProjectReactions.has(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleProjectReaction(type as any)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                            isActive
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 ring-1 ring-amber-400/40 shadow-sm shadow-amber-500/20 scale-105'
                              : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.08] text-neutral-300 hover:scale-105 active:scale-95'
                          } border`}
                          title={user ? (isActive ? `Remove ${label}` : `React with ${label}`) : `Sign in to react with ${label}`}
                        >
                          <span className="text-sm">{emoji}</span>
                          <span className={`text-[10px] font-mono font-medium ${isActive ? 'text-amber-300 font-bold' : 'text-neutral-300'}`}>
                            {projectReactions[type] || 0}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Creator Attribution Card: Connects Project to Owner Profile */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#18191d]/90 p-4 shadow-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  src={p.owner_avatar}
                  alt={p.owner_name || p.handle || "Creator"}
                  name={p.owner_name || p.handle}
                  size="lg"
                  shape="rounded-xl"
                  ringClassName="ring-1 ring-amber-400/40 shrink-0"
                  fallbackClassName="bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-base"
                />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Created & Owned By</div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                    <span className="truncate">{p.owner_name || (p.handle ? `@${p.handle.replace("@", "")}` : "Anonymous")}</span>
                    {isOwnerOfP && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium shrink-0">
                        You own this
                      </span>
                    )}
                  </div>
                  {(p.owner_handle || p.handle) && (
                    <div className="text-xs text-amber-300 font-mono">
                      {p.owner_handle
                        ? `@${p.owner_handle.replace("@", "")}`
                        : `@${p.handle.replace("@", "")}`}
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                leftIcon={<UserIcon className="w-3.5 h-3.5 text-slate-300" />}
                onClick={() => {
                  const targetId = p.owner_handle || p.owner_id || (p.handle ? p.handle.replace("@", "") : "");
                  if (targetId && onSelectProfile) {
                    onSelectProfile(targetId);
                  }
                }}
                className="text-xs shrink-0 py-1.5"
              >
                View Creator Profile
              </Button>
            </div>

            {/* Historical Trajectory & Rank Journey */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#18191d]/90 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Rank History
                </h2>
                <span className="text-[11px] text-slate-500 font-mono">
                  {p.times_bumped != null && p.times_bumped > 0 ? `${p.times_bumped} bumps total` : "0 bumps total"}
                </span>
              </div>

              {!hasSlotOnGrid || !p.journey || p.journey.length === 0 ? (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-xs text-slate-400">
                    No previous rank changes recorded yet.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 overflow-x-auto py-2">
                  {p.journey.map((r, i) => {
                    const isLast = i === p.journey.length - 1;
                    const isPeak = r === p.peak_rank;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-mono shrink-0 border ${
                          isLast
                            ? "bg-amber-400/20 text-amber-300 border-amber-400/40 font-bold"
                            : isPeak
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : "bg-white/[0.04] text-slate-400 border-white/[0.06]"
                        }`}
                      >
                        <span>#{r}</span>
                        {isPeak && <Crown className="w-2.5 h-2.5 text-emerald-400" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Actions & Bump Box (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-500/10 via-[#18191d]/90 to-[#18191d]/90 p-5 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> {isOwnerOfP ? "Protect / Top-Up Project" : "Take Over / Bump Slot"}
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  {p.active_value != null && p.active_value > 0 ? `$${p.active_value}` : "$0"}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {isOwnerOfP
                  ? "Top up your active value to climb higher on the 100-slot wall. Your existing paid value always carries forward."
                  : p.name && p.name !== "N/A"
                  ? `Outbid "${p.name}" to claim their spot on the grid and shove competitors downward.`
                  : "Outbid this slot to claim a spot on the grid and shove competitors downward."}
              </p>

              <Button
                variant="primary"
                size="lg"
                leftIcon={<Zap className="w-4 h-4 text-slate-950" />}
                onClick={() => handleBump(p)}
                className="w-full justify-center text-sm font-bold shadow-lg shadow-amber-500/20"
              >
                {isOwnerOfP ? "Top Up Active Value" : "Outbid & Bump Slot"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* USER EDIT MODAL (Update Display Name, Handle, Avatar, Bio)                */}
      {/* ========================================================================= */}
      {isEditingUser && (
        <Modal
          isOpen={isEditingUser}
          onClose={() => setIsEditingUser(false)}
          title="Edit Creator Profile"
          subtitle="Update your public creator identity, avatar, bio, and social links."
          maxWidth="md"
        >
          <form onSubmit={handleSaveUser} className="space-y-4 pt-1">
            {profileSavedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Profile saved successfully!</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Display Name"
                value={profileEditName}
                onChange={(e) => setProfileEditName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                required
              />

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300 uppercase tracking-wider select-none">
                    Public @Handle
                  </label>
                  {cooldownDaysRemaining > 0 ? (
                    <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Locked ({cooldownDaysRemaining}d)
                    </span>
                  ) : isCheckingHandle ? (
                    <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                      Checking...
                    </span>
                  ) : handleCheckSuccess ? (
                    <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Available
                    </span>
                  ) : null}
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm pointer-events-none">
                    @
                  </span>
                  <input
                    type="text"
                    disabled={cooldownDaysRemaining > 0}
                    value={profileEditHandle}
                    onChange={(e) => setProfileEditHandle(e.target.value.replace(/^@/, ''))}
                    placeholder="username"
                    required
                    className={`w-full bg-[#141519] text-white rounded-xl text-sm border pl-8 pr-3.5 py-2.5 transition-colors focus:outline-none ${
                      cooldownDaysRemaining > 0
                        ? "border-white/[0.08] text-slate-400 cursor-not-allowed bg-black/40"
                        : handleCheckError
                        ? "border-rose-500/50 focus:ring-1 focus:ring-rose-500/40"
                        : handleCheckSuccess
                        ? "border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/40"
                        : "border-white/[0.12] hover:border-white/[0.2] focus:ring-1 focus:ring-amber-400/40"
                    }`}
                  />
                  {cooldownDaysRemaining > 0 && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Lock className="w-4 h-4 text-amber-400/80" />
                    </div>
                  )}
                </div>

                {handleCheckError ? (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {handleCheckError}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400">
                    {cooldownDaysRemaining > 0
                      ? `Handles can only be changed once every 30 days. Next edit in ${cooldownDaysRemaining} day${cooldownDaysRemaining === 1 ? '' : 's'}.`
                      : "Can be changed once every 30 days. Alphanumeric and underscores only."}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wider block mb-1.5">
                Bio / About
              </label>
              <textarea
                value={profileEditBio}
                onChange={(e) => setProfileEditBio(e.target.value)}
                rows={3}
                placeholder="What do you build? Tell other creators and visitors about your work..."
                className="w-full bg-black/50 text-neutral-100 rounded-xl text-sm border border-white/[0.1] px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none"
              />
            </div>

            {/* Direct Avatar Image Upload (No URL input) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wider block">
                Profile Avatar
              </label>

              {avatarUploadError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{avatarUploadError}</span>
                </div>
              )}

              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleAvatarFile(file);
                    e.target.value = "";
                  }
                }}
              />

              <div className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                {/* Avatar Preview */}
                <div className="relative w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-white/15 bg-black/60 shadow-inner flex items-center justify-center">
                  {profileEditAvatar ? (
                    <img
                      src={profileEditAvatar}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <UserIcon className="w-8 h-8 text-slate-500" />
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                    </div>
                  )}
                </div>

                {/* Upload & Remove controls */}
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={isUploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      onClick={() => avatarFileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="text-xs py-1.5"
                    >
                      {isUploadingAvatar ? "Uploading..." : profileEditAvatar ? "Change Photo" : "Upload Photo"}
                    </Button>

                    {profileEditAvatar && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setProfileEditAvatar("");
                          setAvatarUploadError(null);
                        }}
                        disabled={isUploadingAvatar}
                        className="text-xs py-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    JPG, PNG, or WebP. Max 5MB. Resized and optimized automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Links */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Website"
                value={profileEditWebsite}
                onChange={(e) => setProfileEditWebsite(e.target.value)}
                placeholder="https://yourpage.com"
              />
              <Input
                label="X / Twitter"
                value={profileEditTwitter}
                onChange={(e) => setProfileEditTwitter(e.target.value)}
                placeholder="@handle"
              />
              <Input
                label="GitHub"
                value={profileEditGithub}
                onChange={(e) => setProfileEditGithub(e.target.value)}
                placeholder="username"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setIsEditingUser(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={Boolean(handleCheckError) || isCheckingHandle || isUploadingAvatar}
              >
                Save Profile
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* PROJECT EDIT MODAL (Zero Sliders, Left-Click Drag Pan, Wheel Zoom)        */}
      {/* ========================================================================= */}
      {editingProject && (
        <Modal
          isOpen={Boolean(editingProject)}
          onClose={() => setEditingProject(null)}
          title={`Edit Project: ${editingProject.name}`}
          subtitle="Update product title, website destination, and cover artwork positioning."
          maxWidth="md"
        >
          <form onSubmit={handleSaveProject} className="space-y-4 pt-1">
            {savedSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Project updated successfully!</span>
              </div>
            )}

            {/* Project Title */}
            <Input
              label="Project Title"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. Acme Copilot, DeFi Pulse"
              required
            />

            {/* Website Destination URL */}
            <Input
              label="Destination Website URL"
              leftAddon={<Globe className="w-4 h-4" />}
              value={editLinkUrl}
              onChange={(e) => setEditLinkUrl(e.target.value)}
              placeholder="https://yourproduct.com"
              type="url"
              required
            />

            {/* Category Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wider select-none flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Category</span>
              </label>
              <div className="relative">
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as Category)}
                  className="w-full appearance-none bg-[#141519] text-white rounded-xl text-sm border border-white/[0.12] px-3.5 py-2.5 pr-10 focus:outline-none focus:ring-1 focus:ring-amber-400/40 hover:border-white/[0.2] transition-colors cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} className="bg-[#18191d] text-white py-1">
                      {cat}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Artwork Upload & Position Studio (Zero Sliders) */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Project Cover Artwork</span>
              </label>

              {uploadError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleImageFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative rounded-xl p-3.5 text-center cursor-pointer transition-all duration-200 group border-2 ${
                  isDraggingFile
                    ? "border-amber-400 bg-amber-500/10"
                    : "border-dashed border-white/[0.16] hover:border-amber-400/60 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center justify-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white">Click to upload new artwork or drag & drop</p>
                    <p className="text-[10px] text-slate-400">PNG, JPG, WebP, GIF (max 5MB)</p>
                  </div>
                </div>
              </div>

              {/* Interactive Viewport: Wheel to Zoom, Left-Click Drag to Pan */}
              {editImageUrl && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <Move className="w-3.5 h-3.5 text-amber-400" /> Positioning & Framing
                    </span>
                    <button
                      type="button"
                      onClick={handleResetPosition}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>

                  <div
                    onWheel={handleWheelZoom}
                    onMouseDown={handleMouseDownReposition}
                    onMouseMove={handleMouseMoveReposition}
                    onMouseUp={handleMouseUpReposition}
                    onMouseLeave={handleMouseUpReposition}
                    onDoubleClick={handleResetPosition}
                    className={`relative h-56 w-full rounded-xl overflow-hidden select-none bg-[#090a0d] border border-white/[0.14] ${
                      isRepositioning ? "cursor-grabbing" : "cursor-grab"
                    }`}
                  >
                    <img
                      src={editImageUrl}
                      alt="Position preview"
                      draggable={false}
                      className="h-full w-full pointer-events-none select-none object-cover"
                      style={{
                        objectPosition: `${editImagePosX}% ${editImagePosY}%`,
                        transform: editImageZoom > 1 ? `scale(${editImageZoom})` : undefined,
                        transformOrigin: `${editImagePosX}% ${editImagePosY}%`,
                      }}
                      referrerPolicy="no-referrer"
                    />

                    {/* Clean instructions overlay */}
                    <div className="absolute top-2 left-2 pointer-events-none px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-[10px] text-slate-300 flex items-center gap-1.5 shadow-sm">
                      <Move className="w-3 h-3 text-amber-400" />
                      <span>Left-click drag to pan · Scroll to zoom</span>
                    </div>

                    <div className="absolute bottom-2 right-2 pointer-events-none px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-mono text-amber-300 shadow-sm">
                      {Math.round(editImageZoom * 100)}% zoom
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit / Cancel Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setEditingProject(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* TAKE OVER / BID MODAL (In-Place on Profile Page)                          */}
      {/* ========================================================================= */}
      {isBiddingOpen && (
        <TakeOverModal
          isOpen={isBiddingOpen}
          hasBackdrop={true}
          onClose={() => {
            setIsBiddingOpen(false);
            setTargetSlotToBump(null);
          }}
          currentSlots={slots}
          entryFloor={entryFloor}
          categories={[...CATEGORIES]}
          existingHandles={creatorProjects.map((proj) => ({
            id: proj.id,
            title: proj.name,
            activeValue: proj.active_value,
            handle: proj.handle,
            imageUrl: proj.imageUrl,
            linkUrl: proj.linkUrl,
            category: proj.category,
            owner_id: proj.owner_id,
          }))}
          preselectedTargetSlot={targetSlotToBump}
          onRequireAuth={onRequireAuth}
          onSubmitTopUp={(orderData) => {
            handleProcessTopUp(orderData);
            setIsBiddingOpen(false);
            setTargetSlotToBump(null);
          }}
        />
      )}
    </div>
  );
}
