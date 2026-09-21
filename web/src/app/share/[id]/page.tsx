import Link from "next/link";
import type { Metadata } from "next";
import { buildProfiles, sortBoard, money } from "../../../lib/board";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const profiles = buildProfiles();
  const p = profiles.find((x) => x.id === id) ?? profiles[6];
  const rank = sortBoard(profiles).findIndex((x) => x.id === p.id) + 1;
  const title = `${p.name} just bumped to #${rank} on Bumped.lol`;
  const description = `${p.name} holds ${money(p.active_value)} active value at rank #${rank}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profiles = buildProfiles();
  const p = profiles.find((x) => x.id === id) ?? profiles[6];
  const rank = sortBoard(profiles).findIndex((x) => x.id === p.id) + 1;
  const moved = 5 + ((p.seq - 1000) % 37);

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 font-sans flex items-center justify-center px-4">
      <div className="w-full max-w-[520px] rounded-[20px] border border-white/[0.14] p-10 text-center shadow-2xl shadow-black/80"
        style={{ background: `linear-gradient(135deg, rgba(24,25,29,0.97), rgba(18,19,22,0.97))` }}>
        <div className="text-[13px] font-bold tracking-widest text-slate-400">BUMPED.LOL</div>
        <div className="relative mx-auto my-4 h-28 w-28 overflow-hidden rounded-2xl border border-amber-400/40 shadow-xl shadow-amber-500/20">
          <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <h1 className="m-0 font-mono text-[44px] font-extrabold text-amber-200">#{rank}</h1>
        <div className="my-3 text-xl font-bold text-white">{p.name} just bumped to #{rank}</div>
        <p className="text-sm text-slate-300">{moved} profiles moved. {money(p.active_value)} active value.</p>
        <div className="mt-5 flex justify-center gap-2.5">
          <Link href={`/profile/${p.id}`} className="rounded-xl border border-white/[0.15] px-4 py-2 text-xs font-bold text-white no-underline hover:border-white/[0.35]">View passport</Link>
          <Link href="/" className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-zinc-950 no-underline">Open wall</Link>
        </div>
      </div>
    </div>
  );
}
