import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy - BumpOne.lol",
  description:
    "Official Strict Non-Refundable and Final Sale Policy for digital billboard placements and project top-ups on BumpOne.lol.",
  alternates: {
    canonical: "https://bumpone.lol/refund",
  },
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-[#07080b] text-neutral-300 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#07080b]/85 backdrop-blur-xl px-4 sm:px-6 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-mono font-medium text-neutral-400 hover:text-white transition-colors bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-lg"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Billboard</span>
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
              href="/terms"
              className="hidden sm:inline-flex text-xs font-mono text-neutral-400 hover:text-amber-400 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/contact"
              className="hidden sm:inline-flex text-xs font-mono text-neutral-400 hover:text-amber-400 transition-colors"
            >
              Contact Support
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-400 border border-amber-500/20">
              FINAL SALE POLICY
            </span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12 md:py-16">
        {/* Header */}
        <div className="border-b border-white/[0.08] pb-8 mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 font-mono text-xs font-semibold text-rose-400 border border-rose-500/20">
              NON-REFUNDABLE DIGITAL SERVICE
            </span>
            <span className="inline-block rounded-full bg-amber-400/10 px-3 py-1 font-mono text-xs font-semibold text-amber-400 border border-amber-400/20">
              INSTANT DELIVERY
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
            Refund &amp; Cancellation Policy
          </h1>
          <p className="mt-3 text-sm font-mono text-neutral-400">
            Last Updated: October 2026 • Governing all Digital Billboard Placements &amp; Active Value Top-Ups
          </p>
        </div>

        {/* Highlight Alert Box */}
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-5 mb-10 space-y-2">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Strict Final Sale Notice</span>
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed">
            BumpOne provides an instantaneous, real-time digital advertising and visibility service. Because billboard slot assignment, rank recalculation, and do-follow backlinks are rendered immediately upon payment confirmation, <strong className="text-white">all purchases are 100% final, non-cancellable, and non-refundable</strong> once executed.
          </p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed text-neutral-300">
          {/* Section 01 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">01.</span> Nature of Service &amp; Instant Digital Delivery
            </h2>
            <p className="mb-3">
              BumpOne (&quot;BumpOne.lol&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;the Service&quot;) operates a live 100-slot attention grid and digital promotional billboard for developers, creators, software products, and startups.
            </p>
            <p>
              When you purchase a billboard slot or top up an existing project, our automated database engine fulfills the service <strong className="text-white">instantaneously</strong>:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5 text-neutral-300 text-sm">
              <li>Your project graphics, title, and verified link are immediately rendered on the live billboard.</li>
              <li>Global leaderboard ranks are recalculated in real time.</li>
              <li>The bump event is broadcast across our live telemetry feed to active viewers.</li>
            </ul>
          </section>

          {/* Section 02 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">02.</span> No-Refund &amp; Final Sale Terms
            </h2>
            <p className="mb-3">
              Due to the immediate consumption of promotional attention, live backlink indexing, and real-time computing power, <strong className="text-white">BumpOne does not provide refunds, returns, or cancellations</strong> under standard circumstances, including but not limited to:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <strong className="block text-white mb-1">Rank Displacements</strong>
                <span className="text-neutral-400">
                  Ranking on BumpOne is competitive and dynamic. If another user tops up a higher active value and moves ahead of your position, this is the intended mechanic of the board and is non-refundable.
                </span>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <strong className="block text-white mb-1">Traffic or Click Guarantees</strong>
                <span className="text-neutral-400">
                  We guarantee prominent, high-fidelity billboard rendering on our grid. We do not guarantee specific user conversion, click volumes, or third-party business outcomes.
                </span>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <strong className="block text-white mb-1">Change of Mind</strong>
                <span className="text-neutral-400">
                  Because digital billboard space is reserved and rendered in real time, requests to cancel or revoke an active bump due to change of mind cannot be honored.
                </span>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <strong className="block text-white mb-1">Inactive or Updated URLs</strong>
                <span className="text-neutral-400">
                  You maintain the right to update your destination URL and project logo at any time via your profile settings, but changing destination links does not trigger refund eligibility.
                </span>
              </div>
            </div>
          </section>

          {/* Section 03 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">03.</span> Violations of Acceptable Use &amp; Immediate Forfeiture
            </h2>
            <p className="mb-3">
              BumpOne actively protects the safety and integrity of the digital billboard. Any listing containing malware, fraudulent schemes, phishing links, unlawful materials, or offensive content will be delisted and banned immediately upon detection.
            </p>
            <p className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-4 text-sm text-neutral-300">
              <strong className="text-rose-400">Strict Forfeiture Rule:</strong> Submitting content that violates our Terms of Service constitutes an irrecoverable breach of contract. Listings terminated or removed for policy violations are <strong className="text-white">strictly non-refundable</strong>, and all associated fees are permanently forfeited.
            </p>
          </section>

          {/* Section 04 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">04.</span> Inadvertent Duplicate Processor Charges
            </h2>
            <p className="mb-3">
              Because promotional visibility and leaderboard ranking are provisioned instantaneously upon checkout completion, BumpOne enforces an absolute no-refund policy for all rendered services.
            </p>
            <p className="text-sm text-neutral-300 mb-3">
              The sole administrative correction reviewed is in the rare event of an <strong className="text-white">inadvertent technical duplicate transaction</strong> caused by a payment gateway network timeout (e.g. where your card or bank account was debited multiple times for the exact same order session).
            </p>
            <p className="text-sm text-neutral-400">
              To request a review of a verified duplicate charge, contact our billing desk within 7 days of the occurrence with your transaction IDs. Once verified, duplicate debits are reversed back exclusively to the original payment method via our Merchant of Record, <strong className="text-white">Dodo Payments Inc.</strong>
            </p>
          </section>

          {/* Section 05 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">05.</span> Contact Billing &amp; Inquiries
            </h2>
            <p className="mb-3">
              If you experienced an inadvertent duplicate charge or technical issue during checkout, please reach our billing desk with your payment reference or checkout session ID:
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-[#14151b] p-5 font-mono text-sm space-y-2">
              <p className="text-neutral-400">
                <span className="text-neutral-500">Email:</span>{" "}
                <a href="mailto:support@bumpone.lol" className="text-amber-400 hover:underline font-semibold">
                  support@bumpone.lol
                </a>
              </p>
              <p className="text-neutral-400">
                <span className="text-neutral-500">Support Desk:</span>{" "}
                <Link href="/contact" className="text-amber-400 hover:underline">
                  bumpone.lol/contact
                </Link>
              </p>
              <p className="text-neutral-400">
                <span className="text-neutral-500">Response Window:</span> Under 24 business hours
              </p>
            </div>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-16 pt-8 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-neutral-500">
          <div>© 2026 BumpOne.lol • The 100-Slot Digital Billboard</div>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-amber-400 transition-colors">Live Billboard</Link>
            <Link href="/terms" className="hover:text-amber-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-amber-400 transition-colors">Privacy Policy</Link>
            <Link href="/contact" className="hover:text-amber-400 transition-colors">Contact Us</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
