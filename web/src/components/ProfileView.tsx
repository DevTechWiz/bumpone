"use client";

import Link from "next/link";
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
} from "lucide-react";
import { Badge, Button, Modal, Input } from "./ui";

function XTwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}
import {
  REACTION_EMOJI,
  CATEGORIES,
  CREATORS,
  getCreator,
  buildProfiles,
  sortBoard,
  money,
  type ReactionKey,
  type Profile,
  type Category,
  type User,
} from "../lib/board";
import { soundEngine } from "../lib/sound";
import { useAuth } from "../lib/useAuth";
import { safeGetJSON } from "../lib/storage";

export interface ProfileViewProps {
  profileId: string;
  onBack?: () => void;
  onSelectProfile?: (profileId: string) => void;
  onUpdateProfile?: (updated: Profile) => void;
  onClaimSlot?: () => void;
  onOpenAlerts?: () => void;
  onBumpProject?: (projectId: string) => void;
}

export function ProfileView({
  profileId,
  onBack,
  onSelectProfile,
  onUpdateProfile,
  onClaimSlot,
  onOpenAlerts,
  onBumpProject,
}: ProfileViewProps) {
  const { user } = useAuth();

  // Load board projects/slots from localStorage or generate seed
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    if (typeof window !== "undefined") {
      const saved = safeGetJSON<Profile[]>("bumped_profiles_v2");
      if (saved && Array.isArray(saved) && saved.length > 0) {
        return saved;
      }
    }
    return buildProfiles();
  });

  // Local customized user profile state (for self)
  const defaultUserHandle = user?.user_metadata?.user_name || user?.email?.split("@")[0] || "creator";
  const defaultDisplayName =
    user?.user_metadata?.custom_claims?.global_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.user_name ||
    user?.email?.split("@")[0] ||
    "Creator";

  const [selfProfile, setSelfProfile] = useState<User>(() => {
    if (typeof window !== "undefined") {
      const saved = safeGetJSON<User>("bumped_user");
      if (saved && saved.name) return saved;
    }
    return {
      id: user?.id || "self",
      name: defaultDisplayName,
      handle: defaultUserHandle,
      avatar_url:
        user?.user_metadata?.avatar_url ||
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80",
      bio: "Creator and builder on BumpOne. Shipping high-signal products to the wall.",
      website: "https://bumpone.lol",
      twitter: defaultUserHandle,
      github: defaultUserHandle,
      joined_days_ago: 12,
    };
  });

  // Determine whether viewing Self, Other Creator, or Project
  const cleanId = (profileId || "self").toLowerCase().replace("@", "").trim();

  const isSelf =
    cleanId === "self" ||
    cleanId === "me" ||
    Boolean(user && (cleanId === user.id.toLowerCase() || cleanId === defaultUserHandle.toLowerCase()));

  // Check if cleanId matches an existing creator profile
  const matchedCreator: User | undefined = useMemo(() => {
    if (isSelf) return undefined;
    const direct = getCreator(cleanId);
    if (direct) return direct;

    const fromCreators = CREATORS.find(
      (c) =>
        c.id.toLowerCase() === cleanId ||
        c.handle.toLowerCase() === cleanId ||
        c.name.toLowerCase() === cleanId
    );
    if (fromCreators) return fromCreators;

    // Check if any project has this owner
    const foundProject = profiles.find(
      (p) =>
        p.owner_id?.toLowerCase() === cleanId ||
        p.owner_handle?.toLowerCase().replace("@", "") === cleanId ||
        p.owner_name?.toLowerCase() === cleanId
    );
    if (foundProject && foundProject.owner_name) {
      return {
        id: foundProject.owner_id || cleanId,
        name: foundProject.owner_name,
        handle: (foundProject.owner_handle || foundProject.handle || cleanId).replace("@", ""),
        avatar_url:
          foundProject.owner_avatar ||
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80",
        bio: foundProject.owner_bio || "Creator and product builder on BumpOne.",
        joined_days_ago: foundProject.joined_days_ago || 30,
      };
    }

    return undefined;
  }, [isSelf, cleanId, profiles]);

  // Is viewing a user (self or other creator) vs single project showcase
  const isViewingUser = isSelf || Boolean(matchedCreator);

  // Active creator profile when in user view
  const activeUser: User = isSelf
    ? selfProfile
    : matchedCreator || {
        id: cleanId,
        name: cleanId,
        handle: cleanId,
        avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80",
        bio: "Builder on BumpOne.",
        joined_days_ago: 1,
      };

  // Projects owned by this active creator profile
  const creatorProjects = useMemo(() => {
    if (isSelf) {
      if (!user) return [];
      const userHandle = (selfProfile.handle || defaultUserHandle || '').toLowerCase().replace('@', '');
      return profiles.filter(
        (x) =>
          Boolean(user && x.owner_id === user.id) ||
          Boolean(userHandle && x.owner_handle?.toLowerCase().replace('@', '') === userHandle) ||
          Boolean(userHandle && x.handle.toLowerCase().replace('@', '') === userHandle)
      );
    }

    if (matchedCreator) {
      return profiles.filter(
        (x) =>
          x.owner_id?.toLowerCase() === matchedCreator.id.toLowerCase() ||
          x.owner_handle?.toLowerCase().replace("@", "") === matchedCreator.handle.toLowerCase() ||
          x.handle.toLowerCase().replace("@", "") === matchedCreator.handle.toLowerCase() ||
          x.owner_name?.toLowerCase() === matchedCreator.name.toLowerCase()
      );
    }

    return [];
  }, [isSelf, user, selfProfile, defaultUserHandle, matchedCreator, profiles]);

  // If viewing a single project showcase
  const singleProject = useMemo((): Profile => {
    if (isViewingUser) {
      return (
        creatorProjects[0] || {
          id: "slot-preview",
          name: "Project Title",
          handle: `@${activeUser.handle}`,
          category: "Tech",
          active_value: 0,
          seq: 0,
          imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80",
          linkUrl: "https://bumpone.lol",
          owner_id: activeUser.id,
          owner_name: activeUser.name,
          owner_handle: activeUser.handle,
          owner_avatar: activeUser.avatar_url,
          views: 0,
          shares: 0,
          times_bumped: 0,
          times_climbed: 0,
          joined_days_ago: 0,
          last_bump_at: Date.now(),
          peak_rank: 0,
          journey: [],
          reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
        }
      );
    }
    return profiles.find((x) => x.id === profileId) ?? profiles[0];
  }, [isViewingUser, creatorProjects, activeUser, profileId, profiles]);

  const [p, setP] = useState<Profile>(singleProject);
  useEffect(() => {
    setP(singleProject);
  }, [singleProject]);

  const sorted = useMemo(() => sortBoard(profiles), [profiles]);
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
      (selfProfile.handle && p.owner_handle?.toLowerCase().replace("@", "") === selfProfile.handle.toLowerCase()) ||
      (selfProfile.name && p.owner_name?.toLowerCase() === selfProfile.name.toLowerCase())
    ))
  );

  // Edit User Modal state (Self mode)
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [profileEditName, setProfileEditName] = useState(selfProfile.name);
  const [profileEditHandle, setProfileEditHandle] = useState(selfProfile.handle);
  const [profileEditBio, setProfileEditBio] = useState(selfProfile.bio || "");
  const [profileEditAvatar, setProfileEditAvatar] = useState(selfProfile.avatar_url || "");
  const [profileEditWebsite, setProfileEditWebsite] = useState(selfProfile.website || "");
  const [profileEditTwitter, setProfileEditTwitter] = useState(selfProfile.twitter || "");
  const [profileEditGithub, setProfileEditGithub] = useState(selfProfile.github || "");
  const [profileSavedSuccess, setProfileSavedSuccess] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenEditUser = () => {
    soundEngine.playClick();
    setProfileEditName(selfProfile.name);
    setProfileEditHandle(selfProfile.handle);
    setProfileEditBio(selfProfile.bio || "");
    setProfileEditAvatar(selfProfile.avatar_url || "");
    setProfileEditWebsite(selfProfile.website || "");
    setProfileEditTwitter(selfProfile.twitter || "");
    setProfileEditGithub(selfProfile.github || "");
    setProfileSavedSuccess(false);
    setIsEditingUser(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playClick();
    const updated: User = {
      ...selfProfile,
      name: profileEditName.trim() || selfProfile.name,
      handle: profileEditHandle.trim().replace("@", "") || selfProfile.handle,
      bio: profileEditBio.trim(),
      avatar_url: profileEditAvatar.trim() || selfProfile.avatar_url,
      website: profileEditWebsite.trim(),
      twitter: profileEditTwitter.trim().replace("@", ""),
      github: profileEditGithub.trim(),
    };
    setSelfProfile(updated);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("bumped_user", JSON.stringify(updated));
      } catch (err) {
        console.warn("Failed to persist user:", err);
      }
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
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("bumped_profiles_v2", JSON.stringify(nextProfiles));
      } catch (err) {
        console.warn("Failed to persist profiles to localStorage:", err);
      }
    }

    if (p.id === updated.id) {
      setP(updated);
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
        ? `${window.location.origin}/profile/${isSelf ? "self" : activeUser.handle}`
        : `${window.location.origin}/project/${p.id}`;
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleFlexOnX = () => {
    soundEngine.playClick();
    const text = encodeURIComponent(
      isViewingUser
        ? `Check out @${activeUser.handle}'s projects on @bumpone_lol!\n\nhttps://bumpone.lol/profile/${activeUser.handle}`
        : `Check out #${globalRank} "${p.name}" on @bumpone_lol with ${money(p.active_value)} active value!\n\nhttps://bumpone.lol/project/${p.id}`
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
          {isSelf && (
            <>
              <button
                type="button"
                onClick={handleOpenEditUser}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] px-3 py-1.5 rounded-lg border border-white/[0.1] transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-400" /> Edit Profile
              </button>
              <button
                type="button"
                onClick={onClaimSlot}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-1.5 rounded-lg border border-amber-500/30 transition-all cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Bid New Project
              </button>
            </>
          )}

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
          <div className="rounded-2xl border border-white/[0.1] bg-[#18191d]/90 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
              <div className="flex items-start gap-4">
                {activeUser.avatar_url ? (
                  <img
                    src={activeUser.avatar_url}
                    alt={activeUser.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-amber-400/40 shadow-xl shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl font-bold text-amber-300 shadow-xl shrink-0">
                    {activeUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      {activeUser.name}
                    </h1>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> {isSelf ? "Your Creator Account" : "Creator Profile"}
                    </span>
                  </div>
                  <p className="text-xs text-amber-300 font-mono">
                    @{activeUser.handle}
                  </p>
                  {activeUser.bio && (
                    <p className="text-xs text-slate-300 leading-relaxed max-w-xl pt-1">
                      {activeUser.bio}
                    </p>
                  )}

                  {/* Social and Web Links */}
                  <div className="flex items-center gap-3 pt-2 text-xs text-slate-400">
                    {activeUser.website && (
                      <a
                        href={activeUser.website}
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
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={onClaimSlot}
                    className="text-xs py-1.5 shadow-lg shadow-amber-500/20 font-bold"
                  >
                    Bid New Project
                  </Button>
                </div>
              )}
            </div>

            {/* Aggregated Portfolio Stats Across Projects */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-white/[0.08]">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 text-center">
                <div className="font-mono text-2xl font-bold text-white">{creatorProjects.length}</div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-center gap-1">
                  <Layers className="w-3 h-3 text-sky-400" /> Total Projects
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 text-center">
                <div className="font-mono text-2xl font-bold text-amber-300">{money(totalInvested)}</div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> Value on Wall
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 text-center">
                <div className="font-mono text-2xl font-bold text-emerald-300">
                  {bestRank > 0 && bestRank <= 100 ? `#${bestRank}` : "—"}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" /> Best Live Rank
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 text-center">
                <div className="font-mono text-2xl font-bold text-slate-200">
                  {totalViews.toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-center gap-1">
                  <Eye className="w-3 h-3 text-indigo-400" /> Total Views
                </div>
              </div>
            </div>
          </div>

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

              {isSelf && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={onClaimSlot}
                  className="text-xs py-1.5"
                >
                  Add Project
                </Button>
              )}
            </div>

            {creatorProjects.length === 0 ? (
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
                    onClick={onClaimSlot}
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
                        <div className="relative h-44 w-full rounded-xl overflow-hidden bg-[#0d0e12] border border-white/[0.1]">
                          <img
                            src={proj.imageUrl}
                            alt={proj.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            style={{
                              objectPosition: `${proj.imagePosX ?? 50}% ${proj.imagePosY ?? 50}%`,
                              transform: proj.imageZoom && proj.imageZoom > 1 ? `scale(${proj.imageZoom})` : undefined,
                              transformOrigin: `${proj.imagePosX ?? 50}% ${proj.imagePosY ?? 50}%`,
                            }}
                            referrerPolicy="no-referrer"
                          />
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
                              {proj.category}
                            </span>
                          </div>

                          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-amber-300">
                              {money(proj.active_value)} paid
                            </span>
                            <span className="text-[10px] text-slate-300 font-mono">
                              {(proj.views || 0).toLocaleString()} views
                            </span>
                          </div>
                        </div>

                        {/* Project Details */}
                        <div className="mt-3">
                          <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                            {proj.name}
                          </h3>
                          {proj.linkUrl && (
                            <a
                              href={proj.linkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-slate-400 hover:text-white transition-colors truncate mt-0.5 flex items-center gap-1 font-mono"
                            >
                              <span className="truncate">{proj.linkUrl.replace(/^https?:\/\//, "")}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          )}
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
                            onClick={() => {
                              if (onBumpProject) {
                                onBumpProject(proj.id);
                              } else if (onClaimSlot) {
                                onClaimSlot();
                              }
                            }}
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
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="h-full w-full select-none object-cover"
                  style={{
                    objectPosition: `${p.imagePosX ?? 50}% ${p.imagePosY ?? 50}%`,
                    transform: p.imageZoom && p.imageZoom > 1 ? `scale(${p.imageZoom})` : undefined,
                    transformOrigin: `${p.imagePosX ?? 50}% ${p.imagePosY ?? 50}%`,
                  }}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#18191d] via-[#18191d]/20 to-transparent pointer-events-none" />

                {/* Floating Rank & Value Badges on Cover */}
                <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {hasSlotOnGrid ? (
                      <>
                        <Badge variant="rank" rank={Math.min(globalRank, 100)} />
                        <span className="rounded-full bg-black/80 px-3 py-1 font-mono text-xs font-bold text-white border border-white/[0.2] backdrop-blur-md">
                          {money(p.active_value)} paid
                        </span>
                      </>
                    ) : (
                      <span className="rounded-full bg-rose-500/20 px-3 py-1 font-mono text-xs font-bold text-rose-300 border border-rose-500/30 backdrop-blur-md">
                        Displaced (Graveyard)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-200 bg-black/60 backdrop-blur-md px-2.5 py-0.5 rounded-md border border-white/[0.15]">
                    {p.category}
                  </span>
                </div>
              </div>

              {/* Project Details */}
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{p.name}</h1>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <span>Project #{p.id}</span>
                      <span>·</span>
                      <span>{p.category}</span>
                      {hasSlotOnGrid && (
                        <>
                          <span>·</span>
                          <span>On the wall for {p.joined_days_ago} days</span>
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
                    <div className="text-xs text-slate-200 truncate font-mono mt-0.5">{p.linkUrl || "No website link added"}</div>
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
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
                    <div className="font-mono text-xl font-bold text-white">
                      {hasSlotOnGrid ? `#${globalRank}` : "—"}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Overall Rank</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
                    <div className="font-mono text-xl font-bold text-sky-300">
                      {hasSlotOnGrid ? `#${catRank}` : "—"}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{p.category} Rank</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
                    <div className="font-mono text-xl font-bold text-amber-300">
                      {hasSlotOnGrid ? `#${p.peak_rank}` : "—"}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Best Rank</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
                    <div className="font-mono text-xl font-bold text-white">
                      {(p.views ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Total Views</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Creator Attribution Card: Connects Project to Owner Profile */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#18191d]/90 p-4 shadow-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {p.owner_avatar ? (
                  <img
                    src={p.owner_avatar}
                    alt={p.owner_name || p.handle}
                    className="w-12 h-12 rounded-xl object-cover ring-1 ring-amber-400/40 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-base shrink-0">
                    {(p.owner_name || p.handle).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Created & Owned By</div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                    <span className="truncate">{p.owner_name || p.handle}</span>
                    {isOwnerOfP && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium shrink-0">
                        You own this
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-amber-300 font-mono">
                    @{p.owner_handle || p.handle.replace("@", "")}
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                leftIcon={<UserIcon className="w-3.5 h-3.5 text-slate-300" />}
                onClick={() => {
                  const targetId = p.owner_handle || p.owner_id || p.handle.replace("@", "");
                  if (onSelectProfile) {
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
                  {p.times_bumped} bumps total
                </span>
              </div>

              {!hasSlotOnGrid ? (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-xs text-slate-400">
                    This project has been pushed to the Graveyard. Outbid with a top-up to return to the active top 100!
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
                  ${p.active_value}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {isOwnerOfP
                  ? "Top up your active value to climb higher on the 100-slot wall. Your existing paid value always carries forward."
                  : `Outbid "${p.name}" to claim their spot on the grid and shove competitors downward.`}
              </p>

              <Button
                variant="primary"
                size="lg"
                leftIcon={<Zap className="w-4 h-4 text-slate-950" />}
                onClick={() => {
                  if (onBumpProject) {
                    onBumpProject(p.id);
                  } else if (onClaimSlot) {
                    onClaimSlot();
                  }
                }}
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
              <Input
                label="Public @Handle"
                value={profileEditHandle}
                onChange={(e) => setProfileEditHandle(e.target.value)}
                placeholder="e.g. alexrivera"
                required
              />
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

            {/* Avatar URL & File Upload */}
            <div className="space-y-2">
              <Input
                label="Avatar Image URL"
                value={profileEditAvatar}
                onChange={(e) => setProfileEditAvatar(e.target.value)}
                placeholder="https://..."
              />
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      if (ev.target?.result) {
                        setProfileEditAvatar(ev.target.result as string);
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
                leftIcon={<Upload className="w-3.5 h-3.5" />}
                onClick={() => avatarFileInputRef.current?.click()}
                className="text-xs py-1"
              >
                Upload Avatar File
              </Button>
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
              <Button type="submit" variant="primary" size="md">
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
    </div>
  );
}
