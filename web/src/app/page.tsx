import type { Metadata } from 'next';
import { getBoardProfiles } from '@/lib/getBoard';
import { sortBoard } from '@/lib/board';
import { HomePageClient } from './HomePageClient';

export const metadata: Metadata = {
  title: 'BumpOne.lol - The 100-Slot Attention Grid',
  description: 'A dynamic 100-slot attention grid where active value rules the wall. Crown conquered at #1 Center King.',
};

export default async function HomePage() {
  const initialProfiles = await getBoardProfiles(120);
  const sorted = sortBoard(initialProfiles);
  const kingSlot = sorted[0];

  const kingImageUrl = kingSlot?.imageUrl?.includes("images.unsplash.com") && kingSlot.imageUrl.includes("w=")
    ? kingSlot.imageUrl.replace(/w=\d+/, "w=400")
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
