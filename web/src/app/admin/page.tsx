'use client';

import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Play, Pause, RefreshCw, CheckCircle, Lock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    totalRevenue: number;
    activeProfiles: number;
    openReports: number;
    purchasesPaused: boolean;
  } | null>(null);
  const [moderateId, setModerateId] = useState('');
  const [moderationReason, setModerationReason] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchOverview = async (authPin: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/overview?pin=${authPin}`, {
        headers: { 'x-admin-pin': authPin },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setIsAuthenticated(true);
        sessionStorage.setItem('bumped_admin_pin', authPin);
      } else {
        alert('Invalid Admin PIN');
      }
    } catch (err) {
      alert('Failed to connect to admin endpoint');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('bumped_admin_pin');
    if (saved) {
      setPin(saved);
      fetchOverview(saved);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    fetchOverview(pin);
  };

  const toggleEmergencyPause = async () => {
    if (!stats) return;
    const nextState = !stats.purchasesPaused;
    const confirm = window.confirm(
      nextState
        ? 'Are you sure you want to PAUSE all incoming purchases across the board?'
        : 'Resume accepting purchases?'
    );
    if (!confirm) return;

    try {
      const res = await fetch('/api/admin/emergency', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': pin,
        },
        body: JSON.stringify({ paused: nextState }),
      });
      if (res.ok) {
        setStats((prev) => prev ? { ...prev, purchasesPaused: nextState } : null);
        setActionMessage(nextState ? 'Purchases paused globally.' : 'Purchases resumed globally.');
      }
    } catch {
      alert('Failed to update emergency state');
    }
  };

  const handleModeration = async (status: 'suspended' | 'approved') => {
    if (!moderateId) return;
    try {
      const res = await fetch('/api/admin/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': pin,
        },
        body: JSON.stringify({
          profileId: moderateId,
          status,
          reason: moderationReason,
        }),
      });
      if (res.ok) {
        setActionMessage(`Profile ${moderateId} successfully set to ${status}.`);
        setModerateId('');
        setModerationReason('');
      } else {
        alert('Moderation action failed');
      }
    } catch {
      alert('Network error');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#06080F] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold mb-1">BumpOne Control Center</h1>
          <p className="text-xs text-neutral-400 mb-6">Enter administrative master PIN to proceed</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Admin PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-center text-sm font-mono tracking-widest focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-white text-zinc-950 font-semibold text-xs tracking-wide hover:bg-neutral-200 transition-all cursor-pointer"
            >
              {loading ? 'Authenticating…' : 'Access War Room'}
            </button>
          </form>
          <div className="mt-4">
            <Link href="/" className="text-[11px] text-neutral-500 hover:text-white flex items-center justify-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back to Public Board
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080F] text-white p-6 sm:p-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-indigo-400" />
              <h1 className="text-2xl font-bold tracking-tight">Mission Control & Moderation</h1>
            </div>
            <p className="text-xs text-neutral-400">Manage board integrity, transactions, and emergency operations</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchOverview(pin)}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link
              href="/"
              className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all text-xs font-medium cursor-pointer"
            >
              View Board
            </Link>
          </div>
        </div>

        {actionMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider block mb-1">Lifetime Volume</span>
            <span className="text-2xl font-mono font-bold">${stats?.totalRevenue ?? 0}</span>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider block mb-1">Active Slots</span>
            <span className="text-2xl font-mono font-bold">{stats?.activeProfiles ?? 0}</span>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider block mb-1">Open Reports</span>
            <span className="text-2xl font-mono font-bold text-amber-400">{stats?.openReports ?? 0}</span>
          </div>
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider block mb-1">Board Ingestion</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md inline-block ${
              stats?.purchasesPaused ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {stats?.purchasesPaused ? 'PAUSED' : 'HEALTHY'}
            </span>
          </div>
        </div>

        {/* Emergency Kill Switch */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Emergency Purchase Circuit Breaker</span>
            </div>
            <p className="text-xs text-neutral-400">
              Freezes checkout session creation immediately if Dodo Payments API or database experiences anomalous spikes.
            </p>
          </div>
          <button
            onClick={toggleEmergencyPause}
            className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
              stats?.purchasesPaused
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20'
            }`}
          >
            {stats?.purchasesPaused ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> Resume Board Purchases
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" /> Pause All Purchases
              </>
            )}
          </button>
        </div>

        {/* Slot Moderation Quick Tool */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-4">
          <h2 className="text-sm font-semibold">Profile Moderation Quick Action</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Profile ID (UUID or slot-x)"
              value={moderateId}
              onChange={(e) => setModerateId(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Reason for action"
              value={moderationReason}
              onChange={(e) => setModerationReason(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleModeration('suspended')}
                className="flex-1 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-semibold cursor-pointer"
              >
                Suspend
              </button>
              <button
                type="button"
                onClick={() => handleModeration('approved')}
                className="flex-1 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold cursor-pointer"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
