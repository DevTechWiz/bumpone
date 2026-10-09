import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/getProject';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const explicitRank = searchParams.get('rank');

  let rankText = 'Featured';
  let isKing = false;

  if (explicitRank && !isNaN(Number(explicitRank))) {
    const r = parseInt(explicitRank, 10);
    if (r === 1) {
      rankText = '👑 King #1';
      isKing = true;
    } else if (r > 0 && r <= 100) {
      rankText = `Rank #${r}`;
    }
  } else if (id) {
    try {
      const project = await getProject(id);
      if (project) {
        const rank = project.peak_rank || 1;
        if (rank === 1) {
          rankText = '👑 King #1';
          isKing = true;
        } else if (rank <= 100) {
          rankText = `Rank #${rank}`;
        } else {
          rankText = 'Top 100';
        }
      }
    } catch {
      // Fallback to default
    }
  }

  const badgeBg = isKing ? '#D97706' : '#F59E0B';
  const badgeTextColor = '#0B0C10';

const BUMPONE_ICON_BASE64 =
  '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';

  // Crisp, retina-ready SVG badge
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="186" height="30" viewBox="0 0 186 30" role="img" aria-label="BumpOne: ${rankText}">
  <linearGradient id="bgrad" x2="0" y2="100%">
    <stop offset="0" stop-color="#242731" />
    <stop offset="100%" stop-color="#121316" />
  </linearGradient>
  <linearGradient id="rgrad" x2="0" y2="100%">
    <stop offset="0" stop-color="${isKing ? '#FBBF24' : '#F59E0B'}" />
    <stop offset="100%" stop-color="${badgeBg}" />
  </linearGradient>
  <clipPath id="r">
    <rect width="186" height="30" rx="6" />
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="102" height="30" fill="url(#bgrad)" />
    <rect x="102" width="84" height="30" fill="url(#rgrad)" />
    <rect width="186" height="30" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
  </g>
  <g fill="#fff" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="11" font-weight="700">
    <!-- Official BumpOne Logo -->
    <image x="8" y="6" width="18" height="18" href="data:image/png;base64,${BUMPONE_ICON_BASE64}" />
    <!-- Brand Label -->
    <text x="61" y="19" fill="#F3F4F6" letter-spacing="0.4">BumpOne</text>
    <!-- Rank Label -->
    <text x="144" y="19" fill="${badgeTextColor}" font-weight="800" letter-spacing="0.2">${rankText}</text>
  </g>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
