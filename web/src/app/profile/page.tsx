'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ProfileView } from '../../components/ProfileView';

export default function MyProfilePage() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen bg-[#121316] text-neutral-100 py-6">
      <ProfileView
        profileId="self"
        initialMode="user"
        onBack={handleBack}
        onSelectProfile={(nextId, mode) => {
          if (mode === 'project' || nextId.startsWith('slot-')) {
            router.push(`/project/${nextId}`);
          } else {
            router.push(`/profile/${nextId}`);
          }
        }}
        onRequireAuth={() => router.push('/?auth=true')}
        onClaimSlot={() => router.push('/?claim=true')}
        onBumpProject={(projId) => router.push(`/?target=${projId}`)}
      />
    </div>
  );
}
