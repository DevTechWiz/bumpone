import { NextResponse } from 'next/server';
import { getBoardProfiles } from '@/lib/getBoard';

export const revalidate = 300; // Cache 5 minutes at edge

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bumpone.lol';
  const profiles = await getBoardProfiles(100);

  let markdown = `# BumpOne Billboard: Full Project Directory\n`;
  markdown += `> Machine-readable full export of active projects ranked on BumpOne.\n`;
  markdown += `> Updated: ${new Date().toISOString()}\n\n`;

  markdown += `## Overview\n`;
  markdown += `BumpOne is a live 100-slot attention billboard. Below is the list of currently active, approved projects competing on the grid.\n\n`;

  markdown += `| Rank | Project Title | Creator Handle | Category | Active Value (USD) | Destination URL |\n`;
  markdown += `| :---: | :--- | :--- | :--- | :---: | :--- |\n`;

  if (!profiles || profiles.length === 0) {
    markdown += `| - | No active projects on the board | - | - | - | - |\n`;
  } else {
    for (const p of profiles) {
      const rank = p.peak_rank <= 100 ? `#${p.peak_rank}` : 'Top 100';
      const title = (p.name || 'Untitled').replace(/\|/g, '-');
      const handle = p.handle ? `@${p.handle}` : '-';
      const category = p.category || 'Tech';
      const value = `$${p.active_value}`;
      const url = p.linkUrl || `${baseUrl}/project/${p.id}`;

      markdown += `| ${rank} | [${title}](${baseUrl}/project/${p.id}) | ${handle} | ${category} | ${value} | ${url} |\n`;
    }
  }

  markdown += `\n## Integration Notes for AI Agents\n`;
  markdown += `- To fetch structured JSON: GET ${baseUrl}/api/board\n`;
  markdown += `- To render dynamic SVG rank badges: GET ${baseUrl}/api/badge?id={project_id}\n`;
  markdown += `- Platform Website: ${baseUrl}\n`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
