"use client";

import { useParams, useRouter } from "next/navigation";
import { ProfileView } from "../../../components/ProfileView";

export default function ProjectShowcasePage() {
  const router = useRouter();
  const routeParams = useParams();
  const id = (routeParams?.id as string) || "slot-1";

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 font-sans py-6">
      <ProfileView
        profileId={id}
        initialMode="project"
        onBack={() => router.push("/")}
        onSelectProfile={(nextId) => router.push(`/profile/${nextId}`)}
        onClaimSlot={() => router.push("/?claim=true")}
        onBumpProject={(projId) => router.push(`/?target=${projId}`)}
        onOpenAlerts={() => router.push("/?alerts=true")}
      />
    </div>
  );
}
