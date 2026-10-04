import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy - BumpOne.lol",
  description:
    "Official Cancellation and Refund Policy for digital billboard spots and curated directory listings on BumpOne.lol.",
};

export default function RefundPolicyPage() {
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
              Contact Us
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-400 border border-amber-500/20">
              POLICY COMPLIANCE 2026
            </span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12 md:py-16">
        <div className="border-b border-white/[0.08] pb-8 mb-10">
          <span className="inline-block rounded-full bg-amber-400/10 px-3 py-1 font-mono text-xs font-semibold text-amber-400 border border-amber-400/20 mb-3">
            LEGAL DISCLOSURE
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
            Refund &amp; Cancellation Policy
          </h1>
          <p className="mt-3 text-sm font-mono text-neutral-400">
            Last Updated: October 4, 2026 • Applicable to all Digital Billboard &amp; Directory Purchases
          </p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">01.</span> Nature of Services
            </h2>
            <p className="mb-3">
              BumpOne (&quot;BumpOne.lol&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;the Service&quot;) provides digital billboard space, project placements, and curated web directory listings for developers, creators, and startups.
            </p>
            <p>
              Upon successful completion of payment through our secure payment partners (Dodo Payments / Razorpay), your billboard spot or directory listing is scheduled and digitally rendered on the live billboard.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">02.</span> Cancellation Window &amp; Eligibility
            </h2>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-white mb-1">Pre-Publication Cancellations (Within 24 Hours)</h3>
                <p className="text-sm text-neutral-400">
                  If you book a digital billboard spot and request cancellation before your listing has gone live or within twenty-four (24) hours of order confirmation, you are eligible for a 100% full refund with no cancellation penalties.
                </p>
              </div>
              <div className="border-t border-white/[0.06] pt-3">
                <h3 className="font-semibold text-white mb-1">Post-Publication Policy</h3>
                <p className="text-sm text-neutral-400">
                  Because digital billboard space, immediate search indexing, backlinks, and promotional visibility are rendered instantaneously upon live publication, fees for active and published billboard listings are generally non-refundable once the billboard spot has been activated.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">03.</span> Exceptions &amp; Full Refund Guarantees
            </h2>
            <p className="mb-3">
              We stand behind our platform uptime and digital service quality. A full (100%) refund will be issued under any of the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>
                <strong>Duplicate Charges:</strong> In the event that your payment method was debited more than once for a single billboard booking due to a network glitch or gateway timeout.
              </li>
              <li>
                <strong>Technical Non-Delivery:</strong> If our automated servers or platform fail to render or display your approved billboard spot within 48 hours of payment confirmation.
              </li>
              <li>
                <strong>Moderation Rejection:</strong> If a submitted project does not meet our content quality standards (e.g. prohibited or malicious links), your submission will be rejected and 100% of the payment will be automatically refunded.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">04.</span> Refund Processing Timeframe
            </h2>
            <p className="mb-3">
              Approved refunds are initiated immediately by our billing team. Funds are credited back to the original source payment instrument (Bank Account, UPI, Debit Card, or Credit Card) via our authorized payment partners (Dodo Payments / Razorpay).
            </p>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm text-emerald-200">
              <strong className="block mb-1">Processing SLA:</strong> Refunds typically reflect in your account within <strong>5 to 7 business days</strong>, subject to standard interbank settlement cycles.
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">05.</span> How to Request a Refund or Cancellation
            </h2>
            <p className="mb-3">
              To request a cancellation or refund, please contact our support desk with your payment reference ID:
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-[#14151b] p-5 font-mono text-sm space-y-2">
              <p className="text-neutral-400">
                <span className="text-neutral-500">Email:</span>{" "}
                <a href="mailto:support@bumpone.lol" className="text-amber-400 hover:underline font-semibold">
                  support@bumpone.lol
                </a>
              </p>
              <p className="text-neutral-400">
                <span className="text-neutral-500">Subject:</span> Refund Request - [Your Order/Payment ID]
              </p>
              <p className="text-neutral-400">
                <span className="text-neutral-500">Response Window:</span> Under 24 business hours
              </p>
            </div>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-16 pt-8 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-neutral-500">
          <div>© 2026 BumpOne.lol • Curated Digital Billboard &amp; Directory Showcase</div>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-amber-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-amber-400 transition-colors">Privacy Policy</Link>
            <Link href="/contact" className="hover:text-amber-400 transition-colors">Contact Us</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
