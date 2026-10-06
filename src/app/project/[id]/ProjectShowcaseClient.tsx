"use client";

import { HomePageClient } from "@/app/HomePageClient";
import type { Profile } from "../../../lib/board";

export interface ProjectShowcaseClientProps {
  id: string;
  initialProject?: Profile | null;
  initialProfiles?: Profile[];
}

export function ProjectShowcaseClient({ id, initialProject, initialProfiles }: ProjectShowcaseClientProps) {
  return (
    <HomePageClient
      initialProfiles={initialProfiles}
      initialViewingProfileId={id}
      initialViewingProfileMode="project"
      initialProject={initialProject}
    />
  );
}
