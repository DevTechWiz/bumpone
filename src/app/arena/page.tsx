import type { Metadata } from 'next';
import { getBoardProfiles } from '@/lib/getBoard';
import { sortBoard } from '@/lib/board';
import { HomePageClient } from '../HomePageClient';

export const metadata: Metadata = {
  title: 'BumpOne.lol - Live 100-Slot Digital Billboard & Showcase Arena',
  description:
    '100 dynamic showcase slots. Elevate your software ranking and gain live global visibility on the dynamic tech billboard.',
};

export default async function ArenaPage() {
  const initialProfiles = await getBoardProfiles(120);
  const sorted = sortBoard(initialProfiles);
  const kingSlot = sorted[0];

  const kingImageUrl = kingSlot?.imageUrl?.includes('images.unsplash.com') && kingSlot.imageUrl.includes('w=')
    ? kingSlot.imageUrl.replace(/w=\d+/, 'w=400')
    : kingSlot?.imageUrl;

  return (
    <>
      {kingImageUrl && (
        <head>
          <link rel="preload" as="image" href={kingImageUrl} fetchPriority="high" />
        </head>
      )}
      <HomePageClient initialProfiles={initialProfiles} />
    </>
  );
}
