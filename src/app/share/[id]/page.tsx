import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { money } from "@/lib/board";

// Mirrors the profile/[id] route + getProject (SEC-006/SEC-020): share cards
// render approved+active projects only, and malformed handles are rejected
// before they can reach the PostgREST .or() filter.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE_RE = /^[a-z0-9_]{1,30}$/;

async function getProjectForShare(id: string) {
  try {
    // Next 15 hands params through without decoding %40 — accept both the
    // raw `@handle` and `%40handle` forms, then validate the cleaned handle.
    let raw = id;
    try {
      raw = decodeURIComponent(id);
    } catch {
      // malformed percent-encoding — validate the raw value below
    }
    const isUuid = UUID_RE.test(raw);
    const clean = raw.replace(/^@/, "");

    if (!isUuid && !HANDLE_RE.test(clean)) return null;

    let query = supabaseAdmin
      .from("projects")
      .select("id, title, handle, image_path, current_rank, current_active_value_minor")
      .eq("is_active", true)
      .eq("moderation_status", "approved");

    if (isUuid) {
      query = query.eq("id", raw);
    } else {
      // Handles are not unique across projects rows; limit 1 so maybeSingle
      // gets a single row instead of erroring into a 404 (matches getProject).
      query = query
        .or(`handle.eq.${clean},handle.eq.@${clean}`)
        .order("current_rank", { ascending: true });
    }

    const { data } = await query.limit(1).maybeSingle();
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
import { ShareCardClient } from "./ShareCardClient";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectForShare(id);
  if (!project) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 font-sans flex items-center justify-center p-4 sm:p-8">
      <ShareCardClient project={project} />
    </div>
  );
}
