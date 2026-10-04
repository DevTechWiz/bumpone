import type { Metadata } from "next";
import { getProject } from "@/lib/getProject";
import { ProjectShowcaseClient } from "./ProjectShowcaseClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return {
      title: "Project Showcase - BumpOne.lol",
      description: "View live project details, community reactions, and rank trajectory on the 100-slot wall.",
    };
  }
  return {
    title: `${project.name} - BumpOne.lol`,
    description: `${project.name} on the BumpOne 100-slot attention grid. Current rank #${project.peak_rank}, category ${project.category}.`,
  };
}

export default async function ProjectShowcasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  const preloadImgUrl = project?.imageUrl?.includes("images.unsplash.com") && project.imageUrl.includes("w=")
    ? project.imageUrl.replace(/w=\d+/, "w=600")
    : project?.imageUrl;

  return (
    <>
      {preloadImgUrl && (
        <link rel="preload" as="image" href={preloadImgUrl} fetchPriority="high" />
      )}
      <ProjectShowcaseClient id={id} initialProject={project} />
    </>
  );
}
