"use client";

import { useRouter } from "next/navigation";
import { ProfileView } from "../../../components/ProfileView";
import type { Profile } from "../../../lib/board";

export interface ProjectShowcaseClientProps {
  id: string;
  initialProject?: Profile | null;
}

export function ProjectShowcaseClient({ id, initialProject }: ProjectShowcaseClientProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 font-sans py-6">
      <ProfileView
        profileId={id}
        initialMode="project"
        initialProject={initialProject}
        onBack={() => router.push("/")}
        onSelectProfile={(nextId) => router.push(`/profile/${nextId}`)}
        onClaimSlot={() => router.push("/?claim=true")}
        onBumpProject={(projId) => router.push(`/?target=${projId}`)}
        onOpenAlerts={() => router.push("/?alerts=true")}
      />
    </div>
  );
}
