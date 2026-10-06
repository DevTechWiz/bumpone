"use client";

import { ShareCard, type ShareProjectData } from "@/components/ShareCardModal";

export interface ShareCardClientProps {
  project: ShareProjectData;
}

export function ShareCardClient({ project }: ShareCardClientProps) {
  return <ShareCard project={project} isModal={false} />;
}
