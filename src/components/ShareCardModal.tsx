"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Copy, Crown, Sparkles, ExternalLink, Code2, Share2 } from "lucide-react";
import { Modal } from "./ui/Modal";
import { money } from "@/lib/board";

export interface ShareProjectData {
  id: string;
  title: string;
  handle?: string | null;
  image_path?: string | null;
  current_rank?: number | null;
  current_active_value_minor?: number | null;
}

export interface ShareCardProps {
  project: ShareProjectData;
  isModal?: boolean;
  onClose?: () => void;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://bumpone.lol";

export const ShareCard: React.FC<ShareCardProps> = ({
  project,
  isModal = false,
  onClose: _onClose,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  const rank = project.current_rank || 1;
  const activeValue = Math.floor(Number(project.current_active_value_minor || 0) / 100);
  const isKing = rank === 1;

  const canonicalShareUrl = `${BASE_URL}/share/${project.id}`;

  const tweetText = isKing
    ? `👑 We just conquered Rank #1 Center King on @bumpone! Displaced the board — check out the live attention grid:`
    : `🔥 ${project.title} is holding Rank #${rank} on @bumpone! Check out the live indie attention grid:`;

  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(canonicalShareUrl)}`;

  const handleCopyShareLink = async () => {
    try {
      const copyUrl = typeof window !== "undefined"
        ? `${window.location.origin}/share/${project.id}`
        : canonicalShareUrl;
      await navigator.clipboard.writeText(copyUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard write error
    }
  };

  return (
    <div
      className={`w-full max-w-[540px] text-center relative overflow-hidden ${
        isModal
          ? "p-4 sm:p-5"
          : "rounded-[24px] border border-white/[0.14] p-8 sm:p-10 shadow-2xl shadow-black/80 backdrop-blur-xl"
      }`}
      style={
        isModal
          ? undefined
          : { background: `linear-gradient(135deg, rgba(24,25,29,0.97), rgba(18,19,22,0.97))` }
      }
    >
      {/* Decorative ambient gradient */}
      <div
        className="absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-20"
        style={{ background: isKing ? "radial-gradient(#f59e0b, transparent)" : "radial-gradient(#3b82f6, transparent)" }}
      />
      <div
        className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-20"
        style={{ background: isKing ? "radial-gradient(#eab308, transparent)" : "radial-gradient(#8b5cf6, transparent)" }}
      />

      <div className="relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-[11px] font-mono font-bold tracking-widest text-amber-400 uppercase">
          {isKing ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
          {isKing ? "👑 REIGNING KING #1" : `RANK #${rank}`} • BUMPONE.LOL
        </div>

        <div className="relative mx-auto my-4 h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-2xl border-2 border-amber-400/40 shadow-xl shadow-amber-500/20 bg-black/40">
          <img
            src={project.image_path || ""}
            alt={project.title}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        <h1 className="m-0 font-mono text-[36px] sm:text-[46px] font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500">
          #{rank}
        </h1>

        <div className="my-1.5 text-lg sm:text-xl font-bold text-white tracking-tight">
          {project.title}
        </div>

        <p className="text-xs sm:text-sm text-slate-300 font-mono">
          {money(activeValue)} active attention value
        </p>

        {/* 1-Click Viral Actions */}
        <div className="mt-5 flex flex-col gap-2">
          <a
            href={twitterShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 shadow-lg shadow-amber-500/25 transition-all no-underline cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>{isKing ? "Brag as Reigning King on X" : "Share Rank on X"}</span>
          </a>

          <button
            type="button"
            onClick={handleCopyShareLink}
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-semibold text-xs bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white transition-colors cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
            <span>{copiedLink ? "Share Link Copied!" : "Copy Share Link"}</span>
          </button>

          {!isModal && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Link
                href={`/project/${project.id}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.15] bg-white/[0.04] hover:bg-white/[0.08] px-3 py-2 text-xs font-semibold text-white no-underline transition-colors"
              >
                <span>View Profile</span>
                <ExternalLink className="w-3 h-3 text-neutral-400" />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl bg-white hover:bg-neutral-200 px-3 py-2 text-xs font-bold text-zinc-950 no-underline transition-colors"
              >
                Open Live Wall
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface ShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ShareProjectData | null;
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const [activeTab, setActiveTab] = useState<"share" | "embed">("share");
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (!isOpen || !project) return null;

  const projectUrl = `${BASE_URL}/project/${project.id}`;
  const badgeUrl = `${BASE_URL}/api/badge?id=${project.id}`;

  const markdownSnippet = `[![Ranked on BumpOne](${badgeUrl})](${projectUrl})`;
  const htmlSnippet = `<a href="${projectUrl}"><img src="${badgeUrl}" alt="Ranked on BumpOne" /></a>`;

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      hasBackdrop={true}
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="p-4 sm:p-6 bg-[#18191d]/95">
        {/* Unified Tab Switcher */}
        <div className="flex items-center justify-center p-1 bg-white/[0.05] rounded-xl border border-white/[0.08] mb-4">
          <button
            type="button"
            onClick={() => setActiveTab("share")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "share"
                ? "bg-amber-400 text-zinc-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Social Card</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("embed")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "embed"
                ? "bg-amber-400 text-zinc-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Embed Badge</span>
          </button>
        </div>

        {/* Tab 1: Social Card */}
        {activeTab === "share" && (
          <ShareCard project={project} isModal={true} onClose={onClose} />
        )}

        {/* Tab 2: Embed Badge */}
        {activeTab === "embed" && (
          <div className="space-y-4 text-left p-1 sm:p-2">
            <div className="p-4 rounded-xl bg-black/60 border border-white/[0.08] flex flex-col items-center justify-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                Live SVG Preview
              </span>
              <img
                src={badgeUrl}
                alt="Ranked on BumpOne"
                className="h-8 w-auto drop-shadow-lg"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                <span className="font-semibold text-amber-300 font-mono text-[11px]">
                  Markdown (GitHub README)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(markdownSnippet, "md")}
                  className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                >
                  {copiedType === "md" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedType === "md" ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <pre className="m-0 p-2.5 text-[11px] font-mono text-neutral-200 bg-black/70 rounded-xl border border-white/[0.08] overflow-x-auto whitespace-pre-wrap break-all select-all">
                {markdownSnippet}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                <span className="font-semibold text-amber-300 font-mono text-[11px]">
                  HTML (Website / Footer)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(htmlSnippet, "html")}
                  className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                >
                  {copiedType === "html" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedType === "html" ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <pre className="m-0 p-2.5 text-[11px] font-mono text-neutral-200 bg-black/70 rounded-xl border border-white/[0.08] overflow-x-auto whitespace-pre-wrap break-all select-all">
                {htmlSnippet}
              </pre>
            </div>
          </div>
        )}

        {/* Shared Modal Footer */}
        <div className="mt-4 pt-3 flex items-center justify-end border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-semibold text-white border border-white/[0.1] transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};
