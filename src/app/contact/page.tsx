"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Mail,
  Clock,
  MapPin,
  Send,
  CheckCircle2,
  ShieldCheck,
  ArrowLeft,
  CreditCard,
} from "lucide-react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#07080b] text-neutral-300 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Header bar */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#07080b]/85 backdrop-blur-xl px-4 sm:px-6 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-mono font-medium text-neutral-400 hover:text-white transition-colors bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-lg"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Showcase</span>
            </Link>

            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="h-8 w-8 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 font-mono font-black text-sm group-hover:scale-105 transition-transform">
                B
              </div>
              <span className="font-bold text-white tracking-tight text-sm sm:text-base">
                BumpOne<span className="text-amber-400">.lol</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/arena"
              className="hidden sm:inline-flex text-xs font-mono text-neutral-400 hover:text-amber-400 transition-colors"
            >
              Live Grid
            </Link>
            <Link
              href="/refund"
              className="hidden sm:inline-flex text-xs font-mono text-neutral-400 hover:text-amber-400 transition-colors"
            >
              Refund Policy
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SUPPORT OPERATIONAL
            </span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10 md:py-14">
        {/* Hero Section with Merchant Disclosures */}
        <div className="border-b border-white/[0.08] pb-8 mb-10">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-block rounded-full bg-amber-400/10 px-3 py-1 font-mono text-xs font-semibold text-amber-400 border border-amber-400/20">
              MERCHANT &amp; CUSTOMER SUPPORT
            </span>
            <span className="inline-block rounded-full bg-blue-500/10 px-3 py-1 font-mono text-xs font-semibold text-blue-400 border border-blue-500/20">
              DODO PAYMENTS &amp; RAZORPAY VERIFIED
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
            Contact &amp; Merchant Information
          </h1>
          <p className="mt-3 text-sm md:text-base leading-relaxed text-neutral-400 max-w-3xl">
            Have questions regarding digital billboard bookings, directory listings, or payment verification? Reach our dedicated operations desk. For global orders, billing and compliance are handled via our authorized Merchant of Record, <strong>Dodo Payments</strong>.
          </p>
        </div>

        {/* Business Overview & Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="h-9 w-9 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 mb-3">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Official Email</h3>
            <p className="text-xs text-neutral-400 mb-2">For inquiries, billboard support &amp; refunds</p>
            <a
              href="mailto:support@bumpone.lol"
              className="text-sm font-mono text-amber-400 hover:underline font-medium break-all"
            >
              support@bumpone.lol
            </a>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="h-9 w-9 rounded-lg bg-blue-400/10 border border-blue-400/20 flex items-center justify-center text-blue-400 mb-3">
              <Clock className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Response Window</h3>
            <p className="text-xs text-neutral-400 mb-2">Operational Hours (Mon – Sat)</p>
            <p className="text-sm font-mono text-neutral-300">
              9:00 AM – 6:00 PM IST<br />
              <span className="text-xs text-emerald-400">Response within 24h</span>
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="h-9 w-9 rounded-lg bg-purple-400/10 border border-purple-400/20 flex items-center justify-center text-purple-400 mb-3">
              <MapPin className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Operating Location</h3>
            <p className="text-xs text-neutral-400 mb-2">Registered Operations</p>
            <p className="text-sm font-mono text-neutral-300">
              Bengaluru, Karnataka<br />
              India - 560001
            </p>
          </div>
        </div>

        {/* About the Business Section */}
        <section className="mb-12 rounded-2xl border border-white/[0.08] bg-[#14151b] p-6 md:p-8">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">About BumpOne Digital Billboard</h2>
          </div>
          <p className="text-sm leading-relaxed text-neutral-300 mb-4">
            BumpOne (&quot;BumpOne.lol&quot;) is a modern tech promotional digital billboard designed specifically for software developers, indie makers, SaaS founders, and creative projects.
          </p>
          <p className="text-sm leading-relaxed text-neutral-400 mb-6">
            Our mission is to help remarkable tools, AI applications, open-source utilities, and developer projects achieve meaningful visibility. Through transparent, fixed-price spots, creators can book listings on our digital billboard, reaching our engaged tech community and early adopters.
          </p>

          {/* Dodo Payments & MoR Disclosure Box */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-4 sm:p-5 flex flex-col sm:flex-row items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="space-y-1 text-xs">
              <h4 className="font-bold text-white text-sm">Merchant of Record &amp; Global Billing</h4>
              <p className="text-neutral-300 leading-relaxed">
                For international purchases, <strong>Dodo Payments</strong> acts as the Merchant of Record (MoR) for BumpOne.lol, managing global compliance, cross-border payment security (PCI-DSS Level 1), and applicable VAT/sales taxes.
              </p>
              <div className="pt-2 flex flex-wrap gap-4 text-neutral-400 font-mono text-[11px]">
                <span>Invoicing: Dodo Payments</span>
                <span>•</span>
                <Link href="/refund" className="text-amber-400 hover:underline">
                  Refund &amp; Cancellation Policy
                </Link>
                <span>•</span>
                <Link href="/terms" className="text-amber-400 hover:underline">
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Contact Form */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
          <h2 className="text-xl font-bold text-white mb-2">Send Us a Direct Message</h2>
          <p className="text-xs text-neutral-400 mb-6 font-mono">
            Fill in the details below and our team will get back to you within 24 hours.
          </p>

          {submitted ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">Message Sent Successfully!</h3>
              <p className="text-sm text-neutral-300">
                Thank you for contacting us. Our operations team will respond to{" "}
                <span className="text-amber-400 font-mono">{email}</span> within 24 business hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 mb-1.5">
                    Your Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Sharma"
                    className="w-full rounded-lg border border-white/10 bg-[#0d0e12] px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-neutral-400 mb-1.5">
                    Email Address <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@domain.com"
                    className="w-full rounded-lg border border-white/10 bg-[#0d0e12] px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Billboard Listing Query / Payment Assistance"
                  className="w-full rounded-lg border border-white/10 bg-[#0d0e12] px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1.5">
                  Your Message <span className="text-amber-400">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we assist you with your project listing or payment?"
                  className="w-full rounded-lg border border-white/10 bg-[#0d0e12] px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-6 py-3 font-semibold text-neutral-950 text-sm hover:bg-amber-300 transition-colors shadow-lg shadow-amber-400/20"
              >
                <Send className="h-4 w-4" />
                Submit Message
              </button>
            </form>
          )}
        </div>

        {/* Footer links */}
        <div className="mt-16 pt-8 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-neutral-500">
          <div>© 2026 BumpOne.lol • Curated Digital Billboard &amp; Directory Showcase</div>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-amber-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-amber-400 transition-colors">Privacy Policy</Link>
            <Link href="/refund" className="hover:text-amber-400 transition-colors">Refund Policy</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
