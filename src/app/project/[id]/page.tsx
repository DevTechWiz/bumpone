import type { Metadata } from "next";
import { getProject } from "@/lib/getProject";
import { getBoardProfiles } from "@/lib/getBoard";
import { HomePageClient } from "@/app/HomePageClient";

export const revalidate = 60; // Cache project showcase at edge for 60s (ISR)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bumpone.lol';

  if (!project) {
    return {
      title: "Project Showcase - BumpOne.lol",
      description: "View live project details, community reactions, and rank trajectory on the 100-slot wall.",
      alternates: {
        canonical: `${baseUrl}/project/${id}`,
      },
    };
  }

  const title = `${project.name} - BumpOne.lol`;
  const description = `${project.name} on the BumpOne 100-slot attention grid. Current rank #${project.peak_rank}, category ${project.category}.`;
  const ogImage = project.imageUrl || `${baseUrl}/opengraph-image`;

  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/project/${id}`,
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/project/${id}`,
      type: "website",
      images: [
        {
          url: ogImage,
          alt: project.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ProjectShowcasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, initialProfiles] = await Promise.all([
    getProject(id),
    getBoardProfiles(120),
  ]);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bumpone.lol';
  const preloadImgUrl = project?.imageUrl?.includes("images.unsplash.com") && project.imageUrl.includes("w=")
    ? project.imageUrl.replace(/w=\d+/, "w=600")
    : project?.imageUrl;

  const totalReactions = project?.reactions
    ? (project.reactions.fire || 0) + (project.reactions.eyes || 0) + (project.reactions.heart || 0) + (project.reactions.laugh || 0)
    : 0;

  const projectJsonLd = project
    ? {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: project.name,
        description: project.owner_bio || `${project.name} featured on BumpOne.lol live attention grid. Current rank #${project.peak_rank}.`,
        applicationCategory: project.category || "BusinessApplication",
        url: `${baseUrl}/project/${id}`,
        ...(project.imageUrl ? { image: project.imageUrl } : {}),
        ...(project.linkUrl ? { installUrl: project.linkUrl } : {}),
        ...(totalReactions > 0
          ? {
              interactionStatistic: {
                "@type": "InteractionCounter",
                interactionType: "https://schema.org/LikeAction",
                userInteractionCount: totalReactions,
              },
            }
          : {}),
      }
    : null;

  return (
    <>
      {preloadImgUrl && (
        <link rel="preload" as="image" href={preloadImgUrl} fetchPriority="high" />
      )}
      {projectJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(projectJsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <HomePageClient
        initialProfiles={initialProfiles}
        initialViewingProfileId={id}
        initialViewingProfileMode="project"
        initialProject={project}
      />
    </>
  );
}
