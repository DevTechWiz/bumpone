import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function generateBadgeSvg(title: string, rank: number | null, isLive: boolean): string {
  const rankText = rank ? (rank === 1 ? `👑 Rank #1` : rank <= 10 ? `⚡ Rank #${rank}` : `Rank #${rank}`) : "Featured";
  const rightBg = rank === 1 ? "#d97706" : rank && rank <= 10 ? "#4f46e5" : isLive ? "#059669" : "#475569";
  const leftText = "BumpOne.lol";
  
  // Approximate widths based on character counts
  const leftWidth = 84;
  const rightWidth = Math.max(76, rankText.length * 8 + 18);
  const totalWidth = leftWidth + rightWidth;
  const height = 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" role="img" aria-label="${leftText}: ${rankText}">
  <title>${title} on ${leftText} - ${rankText}</title>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="5" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="${height}" fill="#18181b"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="${rightBg}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" text-rendering="geometricPrecision" font-size="11" font-weight="600">
    <!-- Brand Name -->
    <text x="${leftWidth / 2}" y="16" fill="#f4f4f5">${leftText}</text>
    <!-- Rank / Status -->
    <text x="${leftWidth + rightWidth / 2}" y="16" fill="#ffffff">${rankText}</text>
  </g>
</svg>`;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cleanId = decodeURIComponent(id || "").replace(/\.svg$/, "");

  let title = "Featured Project";
  let rank: number | null = null;
  let isLive = true;

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    let query = supabaseAdmin
      .from("projects")
      .select("id, title, handle, current_rank, is_active");

    if (isUuid) {
      query = query.eq("id", cleanId);
    } else {
      const cleanHandle = cleanId.replace(/^@/, "");
      query = query.or(`handle.eq.${cleanHandle},handle.eq.@${cleanHandle}`);
    }

    const { data: project } = await query.maybeSingle();

    if (project) {
      title = project.title || "Project";
      rank = project.current_rank || null;
      isLive = Boolean(project.is_active && (!rank || rank <= 100));
    }
  } catch {
    // Graceful fallback on network/config edge cases
  }

  const svg = generateBadgeSvg(title, rank, isLive);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
