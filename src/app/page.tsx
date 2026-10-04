import type { Metadata } from 'next';
import { getBoardProfiles } from '@/lib/getBoard';
import { sortBoard } from '@/lib/board';
import { HomePageClient } from './HomePageClient';

export const metadata: Metadata = {
  title: {
    absolute: 'BumpOne.lol - The 100-Slot Digital Billboard & Developer Showcase',
  },
  description:
    'A dynamic 100-slot attention grid where active value rules the billboard. Live developer showcase, ranking leaderboard, and tech project launchpad. Crown conquered at #1 Center King.',
  alternates: {
    canonical: 'https://bumpone.lol',
  },
};

export default async function HomePage() {
  const initialProfiles = await getBoardProfiles(120);
  const sorted = sortBoard(initialProfiles);
  const kingSlot = sorted[0];

  const kingImageUrl = kingSlot?.imageUrl?.includes('images.unsplash.com') && kingSlot.imageUrl.includes('w=')
    ? kingSlot.imageUrl.replace(/w=\d+/, 'w=400')
    : kingSlot?.imageUrl;

  return (
    <>
      {kingImageUrl && (
        <link rel="preload" as="image" href={kingImageUrl} fetchPriority="high" />
      )}
      <HomePageClient initialProfiles={initialProfiles} />
    </>
  );
}
