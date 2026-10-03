"use client";

import { useParams, useRouter } from "next/navigation";
import { ProfileView } from "../../../components/ProfileView";

export default function ProfilePage() {
  const router = useRouter();
  const routeParams = useParams();
  const id = (routeParams?.id as string) || "slot-1";

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 font-sans py-6">
      <ProfileView
        profileId={id}
        initialMode="user"
        onBack={handleBack}
        onSelectProfile={(nextId, mode) => {
          if (mode === "project" || nextId.startsWith("slot-")) {
            router.push(`/project/${nextId}`);
          } else {
            router.push(`/profile/${nextId}`);
          }
        }}
        onRequireAuth={() => router.push("/?auth=true")}
        onClaimSlot={() => router.push("/?claim=true")}
        onBumpProject={(projId) => router.push(`/?target=${projId}`)}
      />
    </div>
  );
}
