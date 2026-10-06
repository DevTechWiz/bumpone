import type { Metadata } from "next";
import { getBoardProfiles } from "@/lib/getBoard";
import { HomePageClient } from "@/app/HomePageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bumpone.lol';
  const cleanHandle = id.startsWith('@') ? id : `@${id}`;

  return {
    title: `${cleanHandle} - Creator Profile - BumpOne.lol`,
    description: `View ${cleanHandle}'s creator profile, projects, and rank stats on BumpOne.lol.`,
    alternates: {
      canonical: `${baseUrl}/profile/${id}`,
    },
    openGraph: {
      title: `${cleanHandle} - BumpOne.lol`,
      description: `View ${cleanHandle}'s creator profile and projects on BumpOne.lol.`,
      url: `${baseUrl}/profile/${id}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${cleanHandle} - BumpOne.lol`,
      description: `View ${cleanHandle}'s creator profile and projects on BumpOne.lol.`,
    },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initialProfiles = await getBoardProfiles(120);

  return (
    <HomePageClient
      initialProfiles={initialProfiles}
      initialViewingProfileId={id}
      initialViewingProfileMode="user"
    />
  );
}
