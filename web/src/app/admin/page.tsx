'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Stats = { totalRevenue: number; activeProfiles: number; openReports: number; purchasesPaused: boolean };

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [reason, setReason] = useState('');

  const load = async () => {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) { setError(res.status === 401 ? 'Sign in with an administrator account to continue.' : 'Your account is not authorized for administration.'); return; }
    setStats(await res.json()); setError(null);
  };
  useEffect(() => { load(); }, []);
  const pause = async () => {
    if (!stats) return;
    const res = await fetch('/api/admin/emergency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: !stats.purchasesPaused }) });
    if (res.ok) setStats({ ...stats, purchasesPaused: !stats.purchasesPaused }); else setError('Could not update purchase state.');
  };
  const moderate = async (status: 'approved' | 'suspended') => {
    const res = await fetch('/api/admin/moderate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, status, reason }) });
    if (res.ok) { setProjectId(''); setReason(''); } else setError('Moderation action failed.');
  };
  return <main className="min-h-screen bg-[#06080F] p-8 text-white"><div className="mx-auto max-w-3xl space-y-6"><div className="flex justify-between"><h1 className="text-2xl font-bold">BumpOne Control Center</h1><Link href="/">Board</Link></div>{error ? <p className="rounded bg-rose-950/40 p-4 text-rose-200">{error}</p> : stats && <><div className="grid grid-cols-2 gap-4 md:grid-cols-4"><Metric label="Lifetime volume" value={`$${stats.totalRevenue}`} /><Metric label="Active slots" value={stats.activeProfiles} /><Metric label="Open reports" value={stats.openReports} /><Metric label="Purchases" value={stats.purchasesPaused ? 'Paused' : 'Live'} /></div><button onClick={pause} className="rounded bg-rose-600 px-4 py-2">{stats.purchasesPaused ? 'Resume purchases' : 'Pause purchases'}</button><section className="space-y-3 rounded border border-white/10 p-4"><h2>Moderate project</h2><input className="w-full rounded bg-black p-2" placeholder="Project UUID" value={projectId} onChange={(e) => setProjectId(e.target.value)} /><input className="w-full rounded bg-black p-2" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /><button onClick={() => moderate('suspended')} className="mr-2 rounded bg-rose-700 px-3 py-2">Suspend</button><button onClick={() => moderate('approved')} className="rounded bg-emerald-700 px-3 py-2">Approve</button></section></>}</div></main>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded border border-white/10 p-4"><p className="text-sm text-neutral-400">{label}</p><p className="text-xl font-bold">{value}</p></div>; }
