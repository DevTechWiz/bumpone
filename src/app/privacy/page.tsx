import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - BumpOne.lol",
  description: "Privacy Policy and data practices for BumpOne.lol.",
};

export default function PrivacyPage() {
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
            LEGAL COMPLIANCE
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm font-mono text-neutral-400">
            Last Updated: October 3, 2026 • Effective Immediately
          </p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">01.</span> Overview
            </h2>
            <p>
              BumpOne (&quot;BumpOne.lol&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides a live, competitive 100-slot attention grid for digital projects, creators, and products. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal data when you access or interact with our website located at{" "}
              <a href="https://bumpone.lol" className="text-amber-400 hover:underline">
                https://bumpone.lol
              </a>{" "}
              and associated subdomains.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">02.</span> Information We Collect
            </h2>
            <p className="mb-3">We collect only the essential information necessary to provide and secure the platform:</p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>
                <strong className="text-white">Authentication & Account Data:</strong> When you sign in using Google OAuth or Google One Tap, we receive your Google user ID, display name, verified email address, and profile picture avatar. We do not receive or store your Google password.
              </li>
              <li>
                <strong className="text-white">Project & Content Information:</strong> Information you voluntarily publish on the grid, including project titles, external links, promotional descriptions, custom handles, and uploaded promotional banners/logos.
              </li>
              <li>
                <strong className="text-white">Billing & Payment Records:</strong> Financial transactions are processed directly by our Merchant of Record and authorized payment processors (including Dodo Payments and Stripe). We store transaction identifiers, purchase status, and minor currency amounts. We never store or handle raw credit card numbers or sensitive banking credentials.
              </li>
              <li>
                <strong className="text-white">Technical Telemetry & Security Logs:</strong> IP addresses, browser user-agent strings, device metadata, and request rate-limiting metrics collected exclusively to mitigate fraud, prevent automated bot attacks, and protect War Room telemetry.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">03.</span> How We Use Your Information
            </h2>
            <p className="mb-3">Your data is utilized strictly for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>To maintain, render, and broadcast the live 100-slot grid and dynamic ranking algorithms.</li>
              <li>To link project ownership, crowns, and displacement events to authenticated profiles.</li>
              <li>To enforce platform safety, prevent fraudulent charges, and defend against denial-of-service or spoofing exploits.</li>
              <li>To notify account holders of critical displacement events or account-related security updates.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">04.</span> Data Sharing & Third-Party Service Providers
            </h2>
            <p className="mb-3">
              We do not sell, rent, or trade your personal information to data brokers or advertisers. We share data solely with trusted infrastructure partners required to deliver our application:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>
                <strong className="text-white">Supabase (PostgreSQL & Realtime):</strong> Secure cloud database hosting with strict Row Level Security (RLS) policies.
              </li>
              <li>
                <strong className="text-white">Cloudflare (Workers & R2 Storage):</strong> Edge computing, DDoS mitigation, and global CDN asset delivery for uploaded graphics.
              </li>
              <li>
                <strong className="text-white">Google Identity Services:</strong> Secure federated OAuth single-sign-on.
              </li>
              <li>
                <strong className="text-white">Dodo Payments / Stripe:</strong> PCI-DSS compliant checkout and merchant-of-record payment processing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">05.</span> Public Data Notice
            </h2>
            <p>
              Please note that BumpOne is a public, competitive attention arena. Any project title, handle, graphic, or link you submit to a slot is intended for public consumption and will be visible worldwide to all visitors and automated indexers. Do not include private or confidential information in your public project slots.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">06.</span> Your Rights & Data Deletion
            </h2>
            <p>
              Depending on your jurisdiction (including GDPR and CCPA), you have the right to request access to, rectification of, or permanent deletion of your account and personal data. To submit a data deletion or privacy request, contact us directly at{" "}
              <a href="mailto:privacy@bumpone.lol" className="text-amber-400 hover:underline">
                privacy@bumpone.lol
              </a>
              . Requests are verified and processed within 30 calendar days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">07.</span> Contact & Inquiries
            </h2>
            <p>
              For any questions regarding this Privacy Policy or our operational security practices, please reach out via email:
            </p>
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 font-mono text-sm">
              <p className="text-white">BumpOne Operations</p>
              <p className="text-neutral-400">Website: https://bumpone.lol</p>
              <p className="text-amber-400">Email: privacy@bumpone.lol</p>
            </div>
          </section>
        </div>

        <div className="mt-16 border-t border-white/[0.08] pt-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-neutral-500 gap-4">
          <span>&copy; {new Date().getFullYear()} BumpOne.lol • All Rights Reserved</span>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-amber-400 transition-colors">
              Terms of Service
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
