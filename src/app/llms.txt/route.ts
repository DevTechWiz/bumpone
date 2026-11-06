import { NextResponse } from 'next/server';

export const revalidate = 3600; // Cache for 1 hour at edge

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bumpone.lol';

  const content = `# BumpOne Digital Billboard
> The 100-slot live attention billboard and real-time startup leaderboard.

BumpOne is an attention marketplace where modern software tools, indie startups, and web projects compete in real time for 100 billboard slots, verified do-follow backlinks, and top-tier visibility. Active value dictates rank: projects outbid competitors, claim the #1 King crown, or defend their position against displacement.

## Core Resources
- [Live Billboard](${baseUrl}): The active 100-slot attention grid and leaderboard.
- [Product Hunt Alternatives Guide](${baseUrl}/blog/product-hunt-alternatives-startup-launch-platforms): The top 7 launch platforms compared for speed, cost, and SEO backlinks.
- [Outbid.lol Alternative Guide](${baseUrl}/blog/outbid-lol-alternative-digital-billboard): Comparison of modern bidding boards vs Outbid.lol.
- [Full Project Catalogue](${baseUrl}/llms-full.txt): Complete directory of currently ranked projects in clean markdown.
- [Rules & Mechanics](${baseUrl}/#rules): Dynamic rank recomputation, floor pricing, and displacement math.
- [Blog & Analysis](${baseUrl}/blog): Deep dives into attention economics and product discovery.
- [Terms & Security](${baseUrl}/terms): Instant digital service delivery and buyer protections.

## APIs & Tools for Agents
- [Live Board Data](${baseUrl}/api/board): JSON feed of active projects (rank, title, handle, category, value).
- [Embed Badge API](${baseUrl}/api/badge?id={project_id}): Dynamic SVG badge for project READMEs and websites.
- [Submit / Takeover](${baseUrl}): Interactive modal to claim slots and bump active visibility.
`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
