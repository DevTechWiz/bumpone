'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ProfileView } from '../../components/ProfileView';

export default function MyProfilePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 py-6">
      <ProfileView
        profileId="self"
        onBack={() => router.push('/')}
        onSelectProfile={(nextId) => router.push(`/profile/${nextId}`)}
        onRequireAuth={() => router.push('/?auth=true')}
        onClaimSlot={() => router.push('/?claim=true')}
        onBumpProject={(projId) => router.push(`/?target=${projId}`)}
      />
    </div>
  );
}
