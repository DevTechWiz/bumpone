'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Skeleton } from '../../components/ui';

type TopEntry = { rank: number; id?: string; title?: string; handle?: string; active_value: number };
type QueueEntry = {
  id: string;
  title?: string;
  handle?: string;
  destination_url?: string;
  image_path?: string;
  created_at?: string;
};
type PurchaseEntry = {
  amount: number;
  status: string;
  created_at?: string | null;
  final_rank?: number | null;
  target_rank?: number | null;
  checkout_session?: string | null;
  profile?: string | null;
  profile_handle?: string | null;
};
type ReportEntry = {
  id?: string;
  reason?: string;
  details?: string | null;
  status?: string;
  created_at?: string;
  profile?: string | null;
};

export type ContactReply = {
  id: string;
  admin_email: string;
  reply_text: string;
  resend_id?: string | null;
  delivered_via_api: boolean;
  error?: string | null;
  sent_at: string;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'in_progress' | 'resolved';
  admin_notes?: string | null;
  replies?: ContactReply[];
  created_at: string;
};

type Stats = {
  totalRevenue: number;
  activeProfiles: number;
  openReports: number;
  purchasesPaused: boolean;
  freeClaimsEnabled?: boolean;
  freeClaimsLimit?: number;
  minBumpUsd?: number;
  totalProfiles?: number;
  totalPurchases?: number;
  successfulPayments?: number;
  averagePayment?: number;
  failedPayments?: number;
  chargebacks?: number;
  moderationQueueCount?: number;
  valueRange?: { min: number; max: number } | null;
  top100?: TopEntry[];
  moderationQueue?: QueueEntry[];
  recentPurchases?: PurchaseEntry[];
  recentReports?: ReportEntry[];
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [reason, setReason] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [updatingConfig, setUpdatingConfig] = useState(false);
  const [newLimit, setNewLimit] = useState<string>('');

  // Support Desk State
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageFilter, setMessageFilter] = useState<'all' | 'new' | 'in_progress' | 'resolved'>('all');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});

  const loadMessages = useCallback(async () => {
    setMessagesLoading(true);
    try {
      const url = messageFilter === 'all' ? '/api/admin/contact' : `/api/admin/contact?status=${messageFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // ignore
    } finally {
      setMessagesLoading(false);
    }
  }, [messageFilter]);

  const load = async () => {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) { setError(res.status === 401 ? 'Sign in with an administrator account to continue.' : 'Your account is not authorized for administration.'); return; }
    setStats(await res.json()); setError(null);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  const sendReply = async (messageId: string) => {
    const draft = (replyDrafts[messageId] || '').trim();
    if (!draft) {
      setActionFeedback((prev) => ({ ...prev, [messageId]: 'Reply text cannot be empty.' }));
      return;
    }

    setSendingReplyId(messageId);
    setActionFeedback((prev) => ({ ...prev, [messageId]: 'Sending reply...' }));

    try {
      const res = await fetch('/api/admin/contact/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, replyText: draft, markStatus: 'resolved' }),
      });
      const data = await res.json();
      if (res.ok) {
        setReplyDrafts((prev) => ({ ...prev, [messageId]: '' }));
        setActionFeedback((prev) => ({
          ...prev,
          [messageId]: data.emailDispatched
            ? '✓ Reply sent via Resend and marked resolved!'
            : `✓ Reply logged! (${data.resendError || 'Email API pending'})`,
        }));
        await loadMessages();
      } else {
        setActionFeedback((prev) => ({ ...prev, [messageId]: `Failed: ${data.error || 'Server error'}` }));
      }
    } catch (err: any) {
      setActionFeedback((prev) => ({ ...prev, [messageId]: `Error: ${err?.message || 'Network error'}` }));
    } finally {
      setSendingReplyId(null);
    }
  };

  const updateMessageStatus = async (messageId: string, status: 'new' | 'in_progress' | 'resolved') => {
    try {
      const res = await fetch('/api/admin/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, status }),
      });
      if (res.ok) {
        await loadMessages();
      }
    } catch {
      // ignore
    }
  };
  const pause = async () => {
    if (!stats) return;
    const actionReason = pauseReason.trim().length >= 3
      ? pauseReason.trim()
      : (stats.purchasesPaused ? 'Resumed by admin' : 'Emergency pause by admin');
    const prevPaused = stats.purchasesPaused;
    const nextPaused = !prevPaused;

    // 1. Optimistic UI update — immediate zero-lag toggle
    setStats((prev) => (prev ? { ...prev, purchasesPaused: nextPaused } : null));
    setError(null);

    try {
      const res = await fetch('/api/admin/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextPaused, reason: actionReason }),
      });
      if (res.ok) {
        setPauseReason('');
      } else {
        // Revert on failure
        setStats((prev) => (prev ? { ...prev, purchasesPaused: prevPaused } : null));
        setError('Could not update purchase state.');
      }
    } catch {
      setStats((prev) => (prev ? { ...prev, purchasesPaused: prevPaused } : null));
      setError('Network error while updating purchase state.');
    }
  };

  const toggleFreeClaims = async () => {
    if (!stats) return;
    const previousState = stats.freeClaimsEnabled;
    const nextState = !previousState;

    // 1. Optimistic UI update — immediate zero-lag switch
    setStats((prev) => (prev ? { ...prev, freeClaimsEnabled: nextState } : null));
    setError(null);
    setUpdatingConfig(true);

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          freeClaimsEnabled: nextState,
          reason: `Admin ${nextState ? 'enabled' : 'disabled'} free claims from admin panel`,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // Revert on failure
        setStats((prev) => (prev ? { ...prev, freeClaimsEnabled: previousState } : null));
        setError(errData.error || 'Could not update free claims state. Check database migration.');
      }
    } catch {
      setStats((prev) => (prev ? { ...prev, freeClaimsEnabled: previousState } : null));
      setError('Network error while updating free claims.');
    } finally {
      setUpdatingConfig(false);
    }
  };

  const updateFreeClaimsLimit = async (limitVal: number) => {
    if (!stats || isNaN(limitVal) || limitVal < 1) return;
    const previousLimit = stats.freeClaimsLimit;

    // 1. Optimistic UI update — immediate zero-lag switch
    setStats((prev) => (prev ? { ...prev, freeClaimsLimit: limitVal } : null));
    setNewLimit('');
    setError(null);
    setUpdatingConfig(true);

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          freeClaimsLimit: limitVal,
          reason: `Admin updated free claims capacity limit to ${limitVal}`,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // Revert on failure
        setStats((prev) => (prev ? { ...prev, freeClaimsLimit: previousLimit } : null));
        setError(errData.error || 'Could not update free claims limit. Check database migration.');
      }
    } catch {
      setStats((prev) => (prev ? { ...prev, freeClaimsLimit: previousLimit } : null));
      setError('Network error while updating free claims limit.');
    } finally {
      setUpdatingConfig(false);
    }
  };
  const moderate = async (status: 'approved' | 'suspended' | 'rejected', id?: string) => {
    const target = id ?? projectId;
    if (!target) { setError('Enter a project UUID.'); return; }
    const actionReason = reason.trim().length >= 3
      ? reason.trim()
      : (status === 'approved' ? 'Approved by admin' : status === 'suspended' ? 'Suspended by admin' : 'Rejected by admin');
    const res = await fetch('/api/admin/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: target, status, reason: actionReason }),
    });
    if (res.ok) { if (!id) { setProjectId(''); setReason(''); } setError(null); await load(); } else setError('Moderation action failed.');
  };
  return (
    <main className="min-h-screen bg-[#06080F] p-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex justify-between items-center border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Image
              src="/bumpone-logo.png"
              alt="BumpOne Logo"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-1.5">
                BumpOne<span className="text-amber-400">.lol</span>
                <span className="text-xs font-mono font-normal text-neutral-400 ml-2 px-2 py-0.5 rounded bg-white/5 border border-white/10">Control Center</span>
              </h1>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs font-mono text-neutral-400 hover:text-white transition-colors bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-lg"
          >
            ← Live Board
          </Link>
        </div>
        {error ? (
          <p className="rounded bg-rose-950/40 p-4 text-rose-200">{error}</p>
        ) : !stats ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 animate-in fade-in duration-200">
            {Array.from({ length: 8 }).map((_, i) => (
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
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Metric label="Total profiles" value={stats.totalProfiles ?? 0} />
              <Metric label="Total purchases" value={stats.totalPurchases ?? 0} />
              <Metric label="Successful payments" value={stats.successfulPayments ?? 0} />
              <Metric label="Average payment" value={`$${stats.averagePayment ?? 0}`} />
              <Metric label="Failed payments" value={stats.failedPayments ?? 0} />
              <Metric label="Chargebacks" value={stats.chargebacks ?? 0} />
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-neutral-300">
              <span>Active-value range: {stats.valueRange ? `$${stats.valueRange.min} – $${stats.valueRange.max}` : '—'}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 rounded border border-rose-900/60 bg-rose-950/20 p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">🚨 Emergency Killswitch</h3>
                  <p className="text-xs text-neutral-300">Takes effect on next checkout; already-paid transactions keep settling via webhooks.</p>
                </div>
                <input className="w-full rounded bg-black p-2 text-xs border border-white/10" placeholder="Reason (optional)" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} />
                <button onClick={pause} className="rounded bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 text-xs cursor-pointer">
                  {stats.purchasesPaused ? 'Resume Purchases' : 'Pause All Purchases'}
                </button>
              </div>

              <div className="space-y-3 rounded border border-emerald-900/60 bg-emerald-950/20 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>🎁 Free Launch Claims</span>
                    </h3>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${stats.freeClaimsEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-400'}`}>
                      {stats.freeClaimsEnabled ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300">
                    Max capacity limit: <strong>{stats.freeClaimsLimit ?? 50}</strong> slots. Live claimed: <strong>{stats.activeProfiles}</strong> slots.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-emerald-900/40">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="w-28 rounded bg-black p-1.5 text-xs text-white border border-white/10"
                    placeholder={`Limit (${stats.freeClaimsLimit ?? 50})`}
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                  />
                  <button
                    onClick={() => updateFreeClaimsLimit(parseInt(newLimit))}
                    disabled={updatingConfig || !newLimit}
                    className="rounded bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    Set Limit
                  </button>
                  <button
                    onClick={toggleFreeClaims}
                    disabled={updatingConfig}
                    className={`ml-auto rounded px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      stats.freeClaimsEnabled
                        ? 'bg-rose-700 hover:bg-rose-600 text-white'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                    }`}
                  >
                    {updatingConfig ? 'Saving…' : stats.freeClaimsEnabled ? 'Turn OFF' : 'Turn ON'}
                  </button>
                </div>
              </div>
            </div>
            {/* Automated Pending Moderation Queue */}
            <section className="space-y-4 rounded border border-amber-500/20 bg-amber-500/[0.02] p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>🛡️ Pending Moderation Queue</span>
                  </h2>
                  <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300">
                    {stats.moderationQueue?.length || 0} Pending
                  </span>
                </div>
                <button
                  type="button"
                  onClick={load}
                  className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-400 hover:text-white cursor-pointer"
                >
                  Refresh
                </button>
              </div>

              {(stats.moderationQueue?.length ?? 0) === 0 ? (
                <p className="text-xs text-neutral-500 py-3">✓ All clear! No pending projects awaiting moderation.</p>
              ) : (
                <div className="space-y-3">
                  {stats.moderationQueue?.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-white/10 bg-black/40 hover:border-white/20 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.image_path ? (
                          <img
                            src={item.image_path}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover bg-white/5 border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-neutral-500 shrink-0">
                            No Logo
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white truncate">{item.title || 'Untitled'}</h4>
                            {item.handle && <span className="text-xs text-neutral-400 font-mono">@{item.handle}</span>}
                          </div>
                          {item.destination_url && (
                            <a
                              href={item.destination_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-amber-400 hover:underline truncate block max-w-md"
                            >
                              {item.destination_url}
                            </a>
                          )}
                          <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                            ID: {item.id} · {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => moderate('rejected', item.id)}
                          className="rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800/40 text-rose-300 px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => moderate('approved', item.id)}
                          className="rounded bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 text-xs font-bold cursor-pointer transition-colors shadow-sm"
                        >
                          Approve (Go Live)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3 rounded border border-white/10 p-4">
              <h2>Moderate project by UUID</h2>
              <div className="flex flex-wrap gap-2">
                <input className="min-w-60 flex-1 rounded bg-black p-2 text-sm" placeholder="Project UUID" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
                <input className="min-w-40 flex-1 rounded bg-black p-2 text-sm" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => moderate('suspended')} className="rounded bg-rose-700 px-3 py-2 text-sm font-medium hover:bg-rose-600">Suspend</button>
                <button onClick={() => moderate('approved')} className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600">Approve</button>
              </div>
            </section>
            <section className="space-y-3 rounded border border-white/10 p-4">
              <h2>Current top 100</h2>
              {(stats.top100?.length ?? 0) === 0 ? (
                <p className="text-sm text-neutral-500">No active projects.</p>
              ) : (
                <ol className="max-h-80 overflow-y-auto text-sm">
                  {(stats.top100 || []).map((entry) => (
                    <li key={entry.id || entry.rank} className="flex justify-between border-b border-white/5 py-1">
                      <span>#{entry.rank} {entry.title || 'Untitled'}{entry.handle ? <span className="text-neutral-500"> @{entry.handle}</span> : null}</span>
                      <span className="font-mono text-neutral-400">${entry.active_value}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="space-y-3 rounded border border-white/10 p-4">
              <h2>Recent purchases</h2>
              {(stats.recentPurchases?.length ?? 0) === 0 ? (
                <p className="text-sm text-neutral-500">No purchases yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-neutral-400">
                      <tr>
                        <th className="py-1 pr-3">Profile</th>
                        <th className="py-1 pr-3">Amount</th>
                        <th className="py-1 pr-3">Status</th>
                        <th className="py-1 pr-3">Target → final</th>
                        <th className="py-1 pr-3">Session</th>
                        <th className="py-1">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.recentPurchases || []).map((entry, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-1 pr-3">{entry.profile || '—'}{entry.profile_handle ? <span className="text-neutral-500"> @{entry.profile_handle}</span> : null}</td>
                          <td className="py-1 pr-3">${entry.amount}</td>
                          <td className="py-1 pr-3">{entry.status}</td>
                          <td className="py-1 pr-3">{entry.target_rank != null || entry.final_rank != null ? `${entry.target_rank ?? '?'} → ${entry.final_rank ?? '?'}` : '—'}</td>
                          <td className="max-w-40 truncate py-1 pr-3 font-mono text-xs text-neutral-500">{entry.checkout_session || '—'}</td>
                          <td className="py-1 text-neutral-400">{entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="space-y-3 rounded border border-white/10 p-4">
              <h2>Recent reports</h2>
              {(stats.recentReports?.length ?? 0) === 0 ? (
                <p className="text-sm text-neutral-500">No reports yet.</p>
              ) : (
                <ul className="divide-y divide-white/5 text-sm">
                  {(stats.recentReports || []).map((entry) => (
                    <li key={entry.id} className="py-2">
                      <span className="font-medium capitalize">{entry.reason}</span>
                      {entry.profile ? <span className="text-neutral-400"> — {entry.profile}</span> : null}
                      <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs capitalize">{entry.status}</span>
                      {entry.details ? <p className="text-neutral-500">{entry.details}</p> : null}
                      <p className="text-xs text-neutral-600">{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Customer Support & Contact Messages */}
            <section className="space-y-4 rounded border border-white/10 p-5 bg-white/[0.01]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">Support &amp; Contact Desk</h2>
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-mono font-bold text-amber-300">
                    {messages.filter((m) => m.status === 'new').length} New
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {(['all', 'new', 'in_progress', 'resolved'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setMessageFilter(filter)}
                      className={`rounded px-2.5 py-1 capitalize transition-colors cursor-pointer ${
                        messageFilter === filter
                          ? 'bg-amber-400 font-bold text-zinc-950'
                          : 'bg-white/5 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {filter.replace('_', ' ')}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={loadMessages}
                    className="ml-2 rounded border border-white/10 px-2 py-1 text-xs text-neutral-400 hover:text-white cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {messagesLoading && messages.length === 0 ? (
                <p className="text-sm text-neutral-500 py-4">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-neutral-500 py-4">No {messageFilter !== 'all' ? messageFilter : ''} messages found.</p>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                  {messages.map((msg) => (
                    <div key={msg.id} className="rounded-lg border border-white/10 bg-black/40 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                        <div>
                          <span className="font-semibold text-white">{msg.name}</span>
                          <span className="ml-2 font-mono text-xs text-amber-400">&lt;{msg.email}&gt;</span>
                          <span className="ml-2 text-xs text-neutral-500">{new Date(msg.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-mono uppercase font-bold ${
                              msg.status === 'new'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : msg.status === 'in_progress'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {msg.status.replace('_', ' ')}
                          </span>
                          <select
                            value={msg.status}
                            onChange={(e) => updateMessageStatus(msg.id, e.target.value as any)}
                            className="rounded border border-white/10 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300"
                          >
                            <option value="new">New</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-mono font-bold text-neutral-300 mb-1">
                          Subject: <span className="text-white font-sans">{msg.subject}</span>
                        </div>
                        <p className="text-sm text-neutral-300 bg-white/[0.02] p-3 rounded border border-white/5 whitespace-pre-wrap">
                          {msg.message}
                        </p>
                      </div>

                      {/* Reply History */}
                      {msg.replies && msg.replies.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-white/5">
                          <div className="text-[11px] font-mono text-neutral-400">Previous Replies:</div>
                          {msg.replies.map((reply) => (
                            <div key={reply.id} className="text-xs bg-emerald-950/20 border border-emerald-500/20 p-2.5 rounded">
                              <div className="flex justify-between text-neutral-400 text-[10px] mb-1 font-mono">
                                <span>Sent by {reply.admin_email}</span>
                                <span>{new Date(reply.sent_at).toLocaleString()}</span>
                              </div>
                              <p className="text-neutral-200 whitespace-pre-wrap">{reply.reply_text}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply Composer */}
                      <div className="pt-2 border-t border-white/5 space-y-2">
                        <textarea
                          rows={2}
                          placeholder={`Type response to ${msg.email}...`}
                          value={replyDrafts[msg.id] || ''}
                          onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                          className="w-full rounded border border-white/10 bg-[#0d0e12] p-2 text-xs text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-mono text-neutral-400">
                            {actionFeedback[msg.id] && (
                              <span className={actionFeedback[msg.id].startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'}>
                                {actionFeedback[msg.id]}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject)} — BumpOne Support&body=${encodeURIComponent('\n\n--- Original Message ---\n' + msg.message)}`}
                              className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:text-white"
                            >
                              1-Click Mailto
                            </a>
                            <button
                              type="button"
                              disabled={sendingReplyId === msg.id}
                              onClick={() => sendReply(msg.id)}
                              className="rounded bg-amber-400 px-3 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {sendingReplyId === msg.id ? 'Sending...' : 'Send Reply via Resend'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded border border-white/10 p-4"><p className="text-sm text-neutral-400">{label}</p><p className="text-xl font-bold">{value}</p></div>; }
