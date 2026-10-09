'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Skeleton } from '../../components/ui';

type TopEntry = { rank: number; id?: string; title?: string; handle?: string; active_value: number };
type QueueEntry = { id: string; title?: string; handle?: string; created_at?: string };
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
    const res = await fetch('/api/admin/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: !stats.purchasesPaused, reason: actionReason }),
    });
    if (res.ok) { setPauseReason(''); setError(null); await load(); } else setError('Could not update purchase state.');
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
            <div className="space-y-2 rounded border border-rose-900/60 bg-rose-950/20 p-4">
              <p className="text-sm text-neutral-300">Emergency purchase control — takes effect on the next checkout attempt; already-paid transactions keep settling via webhooks.</p>
              <input className="w-full rounded bg-black p-2" placeholder="Reason (optional, defaults automatically)" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} />
              <button onClick={pause} className="rounded bg-rose-600 px-4 py-2">
                {stats.purchasesPaused ? 'Resume purchases' : 'Pause purchases'}
              </button>
            </div>
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
