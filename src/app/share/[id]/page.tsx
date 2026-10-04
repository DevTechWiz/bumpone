import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { money } from "@/lib/board";

async function getProjectForShare(id: string) {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let query = supabaseAdmin
      .from("projects")
      .select("id, title, handle, image_path, current_rank, current_active_value_minor");

    if (isUuid) {
      query = query.eq("id", id);
    } else {
      const clean = id.replace(/^@/, "");
      query = query.or(`handle.eq.${clean},handle.eq.@${clean}`);
    }

    const { data } = await query.maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = await getProjectForShare(id);
  if (!project) {
    return { title: "BumpOne.lol - Project Share" };
  }
  const rank = project.current_rank || 1;
  const activeValue = Math.floor(Number(project.current_active_value_minor || 0) / 100);
  const title = `${project.title} just bumped to #${rank} on BumpOne.lol`;
  const description = `${project.title} holds ${money(activeValue)} active value at rank #${rank}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectForShare(id);
  if (!project) {
    notFound();
  }
  const rank = project.current_rank || 1;
  const activeValue = Math.floor(Number(project.current_active_value_minor || 0) / 100);

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 font-sans flex items-center justify-center px-4">
      <div
        className="w-full max-w-[520px] rounded-[20px] border border-white/[0.14] p-10 text-center shadow-2xl shadow-black/80"
        style={{ background: `linear-gradient(135deg, rgba(24,25,29,0.97), rgba(18,19,22,0.97))` }}
      >
        <div className="text-[13px] font-bold tracking-widest text-amber-400">BUMPONE.LOL</div>
        <div className="relative mx-auto my-4 h-28 w-28 overflow-hidden rounded-2xl border border-amber-400/40 shadow-xl shadow-amber-500/20">
          <img
            src={project.image_path || ""}
            alt={project.title}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <h1 className="m-0 font-mono text-[44px] font-extrabold text-amber-200">#{rank}</h1>
        <div className="my-3 text-xl font-bold text-white">{project.title} just bumped to #{rank}</div>
        <p className="text-sm text-slate-300">{money(activeValue)} active value.</p>
        <div className="mt-5 flex justify-center gap-2.5">
          <Link
            href={`/project/${project.id}`}
            className="rounded-xl border border-white/[0.15] px-4 py-2 text-xs font-bold text-white no-underline hover:border-white/[0.35]"
          >
            View Full Profile
          </Link>
          <Link href="/" className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-zinc-950 no-underline">
            Open wall
          </Link>
        </div>
      </div>
    </div>
  );
}
