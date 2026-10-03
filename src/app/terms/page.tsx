import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - BumpOne.lol",
  description: "Terms of Service and auction rules for BumpOne.lol.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0d0e12] text-neutral-300 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Header bar */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0d0e12]/80 backdrop-blur-md px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-base font-bold tracking-wider text-amber-400 hover:text-amber-300 transition-colors"
          >
            <span>◀</span>
            <span>BUMPONE.LOL</span>
          </Link>
          <span className="font-mono text-xs text-neutral-500 uppercase tracking-widest">Legal Document</span>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12 md:py-16">
        <div className="border-b border-white/[0.08] pb-8 mb-10">
          <span className="inline-block rounded-full bg-amber-400/10 px-3 py-1 font-mono text-xs font-semibold text-amber-400 border border-amber-400/20 mb-3">
            TERMS & CONDITIONS
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm font-mono text-neutral-400">
            Last Updated: October 3, 2026 • Effective Immediately
          </p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">01.</span> Agreement to Terms
            </h2>
            <p>
              By accessing, browsing, registering an account, or submitting payments on BumpOne (&quot;BumpOne.lol&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;the Service&quot;), you agree to be legally bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to all provisions contained herein, you must immediately discontinue use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">02.</span> Description of the Platform Mechanics
            </h2>
            <p className="mb-3">
              BumpOne operates a dynamic, competitive 100-slot attention billboard. Users submit digital projects (comprising titles, URLs, graphics, and descriptions) and pay micro-transaction fees to &quot;bump&quot; slots upwards in rank, competing for the #1 King throne.
            </p>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 text-sm text-neutral-300">
              <strong className="text-amber-300 block mb-1">Core Auction Dynamic:</strong>
              Slot rank is strictly fluid. Any project occupying any slot (including #1) may be outbid, displaced, pushed down the ranking hierarchy, or knocked off the live 100-slot arena into the Graveyard at any second by another participant. BumpOne does not guarantee permanent placement, fixed time duration, or specific impression volumes for any slot.
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">03.</span> Strict Non-Refundable Purchases & Cancellation Policy
            </h2>
            <p className="mb-3">
              Due to the immediate digital nature of promotional billboard attention and real-time displacement mechanics:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>
                <strong className="text-white">Immediate Delivery:</strong> When you purchase or bump a slot, promotional placement and broadcast to the live grid occur instantaneously upon payment authorization.
              </li>
              <li>
                <strong className="text-white">All Sales Are Final:</strong> All payments, including slot acquisitions, takeovers, and bump boosts, are non-refundable. No refunds, credits, or exchanges will be issued under any circumstances, including if your slot is displaced by another user moments after payment.
              </li>
              <li>
                <strong className="text-white">Chargeback Prohibition:</strong> By initiating a transaction, you acknowledge that you are purchasing immediate promotional placement and waive any right to dispute or chargeback completed transactions through your payment provider.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">04.</span> Acceptable Use & Content Standards
            </h2>
            <p className="mb-3">
              You are solely responsible for all content, titles, images, and destination URLs associated with your submitted projects. You expressly agree not to submit or link to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>Malicious software, phishing schemes, fraudulent offers, or deceptive financial scams.</li>
              <li>Hate speech, harassment, defamation, threats, or incitement of violence against individuals or groups.</li>
              <li>Sexually explicit, pornographic, or non-consensual imagery.</li>
              <li>Materials that infringe upon any patent, trademark, trade secret, copyright, or other proprietary rights.</li>
              <li>Illegal substances, unauthorized firearms, or activities prohibited by applicable local, state, national, or international law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">05.</span> Moderation & Termination Rights
            </h2>
            <p>
              BumpOne administrators maintain unilateral authority to review, flag, redact, or permanently burn any project or slot that violates our Content Standards or poses legal or security risks. In the event a project is removed or burned for violating these Terms, no refunds will be provided.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">06.</span> Disclaimers & Limitation of Liability
            </h2>
            <p className="mb-3">
              The Service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind, whether express or implied.
            </p>
            <p>
              To the fullest extent permitted by applicable law, BumpOne, its creators, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, goodwill, or traffic resulting from your use of or inability to access the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">07.</span> Contact & Legal Notice
            </h2>
            <p>
              For legal inquiries, copyright notices (DMCA), or terms clarification, please contact our administrative team:
            </p>
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 font-mono text-sm">
              <p className="text-white">BumpOne Operations & Legal</p>
              <p className="text-neutral-400">Website: https://bumpone.lol</p>
              <p className="text-amber-400">Email: legal@bumpone.lol</p>
            </div>
          </section>
        </div>

        <div className="mt-16 border-t border-white/[0.08] pt-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-neutral-500 gap-4">
          <span>&copy; {new Date().getFullYear()} BumpOne.lol • All Rights Reserved</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-amber-400 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/" className="hover:text-amber-400 transition-colors">
              Live Grid
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
