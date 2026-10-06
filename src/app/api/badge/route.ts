import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/getProject';

export const runtime = 'nodejs';

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
    <!-- Brand Icon Spark -->
    <path d="M16 11 L20 19 L12 19 Z" fill="#FBBF24" />
    <polygon points="14,18 18,10 22,18" fill="#FFFFFF" opacity="0.9" />
    <!-- Brand Label -->
    <text x="59" y="19" fill="#F3F4F6" letter-spacing="0.4">BumpOne</text>
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
