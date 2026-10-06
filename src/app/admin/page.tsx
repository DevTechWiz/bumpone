'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Skeleton } from '../../components/ui';

type Stats = { totalRevenue: number; activeProfiles: number; openReports: number; purchasesPaused: boolean };

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [reason, setReason] = useState('');
  const [pauseReason, setPauseReason] = useState('');

  const load = async () => {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) { setError(res.status === 401 ? 'Sign in with an administrator account to continue.' : 'Your account is not authorized for administration.'); return; }
    setStats(await res.json()); setError(null);
  };
  useEffect(() => { load(); }, []);
  const pause = async () => {
    if (!stats) return;
    if (pauseReason.trim().length < 3) { setError('A reason (3+ characters) is required for pause/resume actions.'); return; }
    const res = await fetch('/api/admin/emergency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: !stats.purchasesPaused, reason: pauseReason.trim() }) });
    if (res.ok) { setPauseReason(''); setError(null); await load(); } else setError('Could not update purchase state.');
  };
  const moderate = async (status: 'approved' | 'suspended') => {
    const res = await fetch('/api/admin/moderate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, status, reason }) });
    if (res.ok) { setProjectId(''); setReason(''); } else setError('Moderation action failed.');
  };
  return (
    <main className="min-h-screen bg-[#06080F] p-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex justify-between">
          <h1 className="text-2xl font-bold">BumpOne Control Center</h1>
          <Link href="/">Board</Link>
        </div>
        {error ? (
          <p className="rounded bg-rose-950/40 p-4 text-rose-200">{error}</p>
        ) : !stats ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 animate-in fade-in duration-200">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-4 bg-white/[0.02] space-y-2">
                <Skeleton variant="text" width="60%" className="h-4" />
                <Skeleton variant="text" width="40%" className="h-6" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Metric label="Lifetime volume" value={`$${stats.totalRevenue}`} />
              <Metric label="Active slots" value={stats.activeProfiles} />
              <Metric label="Open reports" value={stats.openReports} />
              <Metric label="Purchases" value={stats.purchasesPaused ? 'Paused' : 'Live'} />
            </div>
            <div className="space-y-2 rounded border border-rose-900/60 bg-rose-950/20 p-4">
              <p className="text-sm text-neutral-300">Emergency purchase control — takes effect on the next checkout attempt; already-paid transactions keep settling via webhooks.</p>
              <input className="w-full rounded bg-black p-2" placeholder="Reason (required, recorded in audit log)" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} />
              <button onClick={pause} className="rounded bg-rose-600 px-4 py-2">
                {stats.purchasesPaused ? 'Resume purchases' : 'Pause purchases'}
              </button>
            </div>
            <section className="space-y-3 rounded border border-white/10 p-4">
              <h2>Moderate project</h2>
              <input className="w-full rounded bg-black p-2" placeholder="Project UUID" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
              <input className="w-full rounded bg-black p-2" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button onClick={() => moderate('suspended')} className="mr-2 rounded bg-rose-700 px-3 py-2">Suspend</button>
              <button onClick={() => moderate('approved')} className="rounded bg-emerald-700 px-3 py-2">Approve</button>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded border border-white/10 p-4"><p className="text-sm text-neutral-400">{label}</p><p className="text-xl font-bold">{value}</p></div>; }
