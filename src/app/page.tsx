import type { Metadata } from 'next';
import { getBoardProfiles } from '@/lib/getBoard';
import { ShowcaseBillboardPage } from '@/components/ShowcaseBillboardPage';

export const metadata: Metadata = {
  title: 'BumpOne.lol - Curated Digital Showcase & Developer Billboard',
  description:
    'A curated digital showcase and tech promotional billboard for modern software, developer tools, SaaS applications, and tech projects.',
};

export default async function HomePage() {
  const initialProfiles = await getBoardProfiles(120);

  return <ShowcaseBillboardPage initialProfiles={initialProfiles} />;
}
