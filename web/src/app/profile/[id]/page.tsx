"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "../../../components/ui";
import {
  REACTION_EMOJI,
  buildProfiles,
  sortBoard,
  money,
  type ReactionKey,
} from "../../../lib/board";

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const profiles = useMemo(() => buildProfiles(), []);
  const p = profiles.find((x) => x.id === id) ?? profiles[0];
  const sorted = useMemo(() => sortBoard(profiles), [profiles]);
  const globalRank = sorted.findIndex((x) => x.id === p.id) + 1;
  const catRank =
    sortBoard(profiles.filter((x) => x.category === p.category)).findIndex((x) => x.id === p.id) + 1;
  const [mine, setMine] = useState<Partial<Record<ReactionKey, boolean>>>({});

  const stats: [string, string][] = [
    [`#${globalRank}`, "Global rank"],
    [`#${catRank}`, `${p.category} rank`],
    [money(p.active_value), "Active value"],
    [`#${p.peak_rank}`, "Peak rank"],
    [`${p.times_bumped}`, "Times bumped"],
    [`${p.times_climbed}`, "Times climbed"],
    [p.views.toLocaleString(), "Profile views"],
    [`${p.shares}`, "Shares"],
  ];

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 font-sans">
      <div className="mx-auto max-w-[880px] px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to the wall
        </Link>

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#18191d]/95">
          <div className="relative h-44 sm:h-56">
            <img src={p.imageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-40" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#18191d] via-transparent to-transparent" />
            <div className="absolute bottom-3 left-4 flex items-center gap-2">
              <Badge variant="rank" rank={Math.min(globalRank, 100)} />
              <span className="rounded-full bg-black/70 px-2.5 py-0.5 font-mono text-xs font-bold text-white border border-white/[0.15]">
                {money(p.active_value)}
              </span>
            </div>
          </div>
          <div className="p-5">
            <h1 className="text-2xl font-bold text-white">{p.name}</h1>
            <p className="mt-1 text-xs text-slate-400">
              {p.handle} · {p.category} · joined {p.joined_days_ago}d ago
            </p>
            {p.linkUrl && (
              <a href={p.linkUrl} target="_blank" rel="noopener noreferrer"
                className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-xs text-slate-200 hover:border-white/[0.2]">
                <span className="truncate">{p.linkUrl}</span>
                <ExternalLink className="w-4 h-4 shrink-0 text-slate-400" />
              </a>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stats.map(([v, k]) => (
                <div key={k} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-center">
                  <div className="font-mono text-lg font-bold text-white">{v}</div>
                  <div className="text-[11px] text-slate-400">{k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/[0.1] bg-[#18191d]/95 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Rank journey</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1 font-mono text-xs">
            {p.journey.map((r, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-slate-600">→</span>}
                <span className={`rounded-lg border px-2 py-1 ${r === p.peak_rank ? "border-amber-400/50 text-amber-200" : "border-white/[0.1] text-slate-300"}`}>
                  #{r}
                </span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Every purchase is a permanent public event. Pushed off the wall? The profile is kept — top up to reclaim.</p>
        </div>

        <div className="mt-4 rounded-2xl border border-white/[0.1] bg-[#18191d]/95 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Reactions <span className="font-sans font-normal normal-case text-slate-500">(never affect rank)</span>
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(REACTION_EMOJI) as ReactionKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setMine((m) => ({ ...m, [k]: !m[k] }))}
                aria-pressed={!!mine[k]}
                aria-label={`React with ${k} to ${p.name}`}
                className={`rounded-full border px-4 py-2 text-[15px] text-white transition-all cursor-pointer ${
                  mine[k] ? "border-rose-400/60 bg-rose-500/10" : "border-white/[0.1] bg-white/[0.04] hover:border-white/[0.3]"
                }`}
              >
                {REACTION_EMOJI[k]} {p.reactions[k] + (mine[k] ? 1 : 0)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
