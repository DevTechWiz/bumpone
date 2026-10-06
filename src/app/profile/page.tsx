import type { Metadata } from 'next';
import { getBoardProfiles } from '@/lib/getBoard';
import { HomePageClient } from '@/app/HomePageClient';

export const metadata: Metadata = {
  title: 'My Creator Dashboard - BumpOne.lol',
  description: 'Manage your projects, slot telemetry, and verified creator credentials on BumpOne.lol.',
  alternates: {
    canonical: 'https://bumpone.lol/profile',
  },
};

export default async function MyProfilePage() {
  const initialProfiles = await getBoardProfiles(120);

  return (
    <HomePageClient
      initialProfiles={initialProfiles}
      initialViewingProfileId="self"
      initialViewingProfileMode="user"
    />
  );
}
