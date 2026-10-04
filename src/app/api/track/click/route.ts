import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Simple in-memory deduplication set to avoid click-spam inflation
const recentClicks = new Map<string, number>();

function isDuplicateClick(key: string): boolean {
  const now = Date.now();
  const lastTime = recentClicks.get(key);
  if (lastTime && now - lastTime < 60_000) {
    // Within 60 seconds from same IP/session
    return true;
  }
  recentClicks.set(key, now);
  // Periodic cleanup if map grows
  if (recentClicks.size > 2000) {
    for (const [k, v] of recentClicks.entries()) {
      if (now - v > 300_000) recentClicks.delete(k);
    }
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const projectId = body.projectId;
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "anon";
    const dedupKey = `${ip}:${projectId}`;

    if (!isDuplicateClick(dedupKey)) {
      // Increment views_count via RPC or direct update
      try {
        await supabaseAdmin.rpc("increment_project_views", { project_id_param: projectId });
      } catch {
        // Fallback: fetch current and update +1
        const { data } = await supabaseAdmin
          .from("projects")
          .select("views_count")
          .eq("id", projectId)
          .maybeSingle();

        if (data) {
          await supabaseAdmin
            .from("projects")
            .update({ views_count: (data.views_count || 0) + 1 })
            .eq("id", projectId);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") || searchParams.get("id");
  const targetUrl = searchParams.get("url");

  if (projectId) {
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "anon";
    const dedupKey = `${ip}:${projectId}`;
    if (!isDuplicateClick(dedupKey)) {
      try {
        await supabaseAdmin.rpc("increment_project_views", { project_id_param: projectId });
      } catch {
        const { data } = await supabaseAdmin
          .from("projects")
          .select("views_count")
          .eq("id", projectId)
          .maybeSingle();

        if (data) {
          await supabaseAdmin
            .from("projects")
            .update({ views_count: (data.views_count || 0) + 1 })
            .eq("id", projectId);
        }
      }
    }
  }

  // If redirect target provided, validate and redirect
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return NextResponse.redirect(targetUrl, 307);
      }
    } catch {
      // Invalid URL
    }
  }

  return NextResponse.json({ ok: true });
}
