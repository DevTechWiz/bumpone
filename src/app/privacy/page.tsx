import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy & DPDP Act Compliance - BumpOne.lol",
  description:
    "Privacy Policy, DPDP Act 2023/2026 compliance, GDPR, CCPA disclosures, and Google API Limited Use terms for BumpOne.lol.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#07080b] text-neutral-300 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Header Navigation */}
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
              href="/terms"
              className="hidden sm:inline-flex text-xs font-mono text-neutral-400 hover:text-amber-400 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/refund"
              className="hidden sm:inline-flex text-xs font-mono text-neutral-400 hover:text-amber-400 transition-colors"
            >
              Refund Policy
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              DPDP 2026 &amp; GDPR READY
            </span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12 md:py-16">
        <div className="border-b border-white/[0.08] pb-8 mb-10">
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="rounded-full bg-amber-400/10 px-3 py-1 font-mono text-xs font-semibold text-amber-400 border border-amber-400/20">
              DATA PRIVACY POLICY
            </span>
            <span className="rounded-full bg-blue-400/10 px-3 py-1 font-mono text-xs font-semibold text-blue-400 border border-blue-400/20">
              INDIA DPDP ACT 2023/2026
            </span>
            <span className="rounded-full bg-purple-400/10 px-3 py-1 font-mono text-xs font-semibold text-purple-400 border border-purple-400/20">
              GDPR & CCPA COMPLIANT
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm font-mono text-neutral-400">
            Last Updated: October 3, 2026 • In Effect for all BumpOne.lol Services
          </p>
        </div>

        <div className="space-y-12 text-[15px] leading-relaxed text-neutral-300">
          {/* 01. Overview */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">01.</span> Data Fiduciary Overview & Scope
            </h2>
            <p className="mb-3">
              BumpOne (&quot;BumpOne.lol&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates as a Data Fiduciary under the{" "}
              <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong> of India and as a Data Controller under the General Data Protection Regulation (GDPR) of the European Union.
            </p>
            <p>
              This Privacy Policy applies to personal data collected when you visit, authenticate, submit digital projects to, or execute micro-transactions on{" "}
              <a href="https://bumpone.lol" className="text-amber-400 hover:underline">
                https://bumpone.lol
              </a>{" "}
              and associated application programming interfaces (APIs).
            </p>
          </section>

          {/* 02. Itemised Notice & Collection */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">02.</span> Itemised Notice of Personal Data Collected
            </h2>
            <p className="mb-3">
              In accordance with Section 5 of the DPDP Act and Article 13 of the GDPR, we provide this clear, itemised notice of the categories of personal data processed:
            </p>
            <div className="grid grid-cols-1 gap-3 font-sans">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="font-bold text-white mb-1">A. Authentication & Profile Credentials (Google OAuth)</div>
                <div className="text-sm text-neutral-400 mb-2">
                  <strong>Data Items:</strong> Full name, primary email address, Google Profile UID, and avatar photo URL.
                </div>
                <div className="text-xs font-mono text-amber-300">
                  Purpose: Authenticating user sessions, linking slot ownership, and preventing unauthorized account takeover.
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="font-bold text-white mb-1">B. Digital Project Billboard Content</div>
                <div className="text-sm text-neutral-400 mb-2">
                  <strong>Data Items:</strong> Project title, project destination URL, promotional handle (e.g. @builder), project banner/icon uploaded to Cloudflare R2, and description.
                </div>
                <div className="text-xs font-mono text-amber-300">
                  Purpose: Displaying the competitive 100-slot attention grid and public leaderboard.
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="font-bold text-white mb-1">C. Financial Transaction Identifiers</div>
                <div className="text-sm text-neutral-400 mb-2">
                  <strong>Data Items:</strong> Dodo Payments transaction IDs, customer email, transaction timestamp, payment status, and order currency amounts (USD).
                </div>
                <div className="text-xs font-mono text-amber-300">
                  Purpose: Crediting active slot values, triggering real-time bump displacement events, and anti-fraud verification.
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="font-bold text-white mb-1">D. Security & Anti-Abuse Telemetry</div>
                <div className="text-sm text-neutral-400 mb-2">
                  <strong>Data Items:</strong> IP address, browser user-agent, request timestamps, and rate-limiting counters.
                </div>
                <div className="text-xs font-mono text-amber-300">
                  Purpose: Enforcing sliding-window rate limits, blocking spoofed live activity feed messages, and DDoS mitigation.
                </div>
              </div>
            </div>
          </section>

          {/* 03. Google Limited Use */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">03.</span> Google API Services User Data Policy (Limited Use)
            </h2>
            <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-5 space-y-3">
              <p className="font-semibold text-blue-200">
                BumpOne strictly complies with the Google API Services User Data Policy, including the Limited Use requirements.
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-neutral-300">
                <li>
                  We access only the basic profile data (name, email, profile picture) requested via the standard OAuth scopes (<code className="text-blue-300 font-mono">openid</code>, <code className="text-blue-300 font-mono">profile</code>, <code className="text-blue-300 font-mono">email</code>).
                </li>
                <li>
                  We do not sell, rent, or transfer Google user data to external data brokers or advertising platforms.
                </li>
                <li>
                  We do not use Google user data to train generalized AI/ML models or large language models.
                </li>
                <li>
                  Your Google credentials are used exclusively to authenticate your identity on BumpOne.lol.
                </li>
              </ul>
            </div>
          </section>

          {/* 04. Age Restriction & Protection of Children */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">04.</span> Protection of Children & Minors (DPDP Act Section 9)
            </h2>
            <p className="mb-3">
              BumpOne is a commercial digital promotional arena intended exclusively for individuals who are at least{" "}
              <strong className="text-white">18 years of age</strong> (or the age of majority in your jurisdiction).
            </p>
            <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 text-sm text-rose-200">
              <strong>Mandatory Minor Protection:</strong> In compliance with Section 9 of the DPDP Act, we do not knowingly process personal data of children, undertake behavioral monitoring or tracking of children, or serve targeted advertising to minors. If we discover that personal data of a minor has been collected without verifiable parental consent, we will purge that data immediately.
            </div>
          </section>

          {/* 05. Third-Party Data Processors & Cross-Border Transfers */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">05.</span> Authorized Data Processors & Cross-Border Transfers
            </h2>
            <p className="mb-3">
              Under Section 16 of the DPDP Act and Chapter V of the GDPR, personal data may be processed by trusted infrastructure partners operating in secure cloud regions:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border border-white/[0.08] rounded-xl overflow-hidden">
                <thead className="bg-white/[0.04] text-neutral-300">
                  <tr>
                    <th className="p-3">Partner</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Location</th>
                    <th className="p-3">Security Safeguard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-neutral-400">
                  <tr>
                    <td className="p-3 font-bold text-white">Supabase Inc.</td>
                    <td className="p-3">Database & Realtime</td>
                    <td className="p-3">AWS Global Cloud</td>
                    <td className="p-3">SOC2 Type II, RLS Enforcement</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-white">Cloudflare Inc.</td>
                    <td className="p-3">CDN, Workers & R2</td>
                    <td className="p-3">Global Edge Network</td>
                    <td className="p-3">ISO 27001, TLS 1.3 Strict</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-white">Google LLC</td>
                    <td className="p-3">OAuth Identity</td>
                    <td className="p-3">Global Infrastructure</td>
                    <td className="p-3">OpenID Connect, Token Verification</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-white">Dodo Payments Inc.</td>
                    <td className="p-3">Merchant of Record &amp; Billing</td>
                    <td className="p-3">PCI-DSS Compliant Tier</td>
                    <td className="p-3">PCI Level 1, Svix Webhook Signature Verification</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 06. Data Principal Rights under India DPDP Act */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">06.</span> Data Principal Rights (DPDP Act, 2023)
            </h2>
            <p className="mb-4">
              As a Data Principal under India&apos;s DPDP Act, you possess the following statutory rights:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                <strong className="text-amber-400 block mb-1 font-mono">1. Right to Access Information (Sec 11)</strong>
                You may request a summary of the personal data being processed by us, a description of the processing activities, and identities of all data fiduciaries with whom it is shared.
              </div>
              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                <strong className="text-amber-400 block mb-1 font-mono">2. Right to Correction & Erasure (Sec 12)</strong>
                You may request the correction of inaccurate data, completion of incomplete data, or permanent erasure of personal data that is no longer necessary for the specified purpose.
              </div>
              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                <strong className="text-amber-400 block mb-1 font-mono">3. Right to Withdraw Consent (Sec 6)</strong>
                You may withdraw consent at any time. Withdrawal does not affect lawful processing conducted prior to revocation, but will cease active profile synchronization.
              </div>
              <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                <strong className="text-amber-400 block mb-1 font-mono">4. Right to Nominate (Sec 14)</strong>
                You have the statutory right to nominate an individual who, in the event of your death or incapacity, shall exercise your rights as a Data Principal.
              </div>
            </div>
          </section>

          {/* 07. International Rights (GDPR & CCPA) */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">07.</span> International Rights (GDPR & US CCPA/CPRA)
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>
                <strong className="text-white">GDPR (EU/UK):</strong> You have the right to data portability, restriction of processing, objection to automated profiling, and lodging a complaint with your local supervisory authority.
              </li>
              <li>
                <strong className="text-white">California Consumer Privacy Act (CCPA/CPRA):</strong> We do not sell or share personal information for cross-context behavioral advertising. You have the right to request disclosure of categories of information collected, request deletion, and not receive discriminatory treatment for exercising these rights.
              </li>
            </ul>
          </section>

          {/* 08. Grievance Redressal & DPO */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">08.</span> Grievance Redressal Mechanism & Officer (DPDP Section 13)
            </h2>
            <p className="mb-4">
              In compliance with Section 13 of the DPDP Act and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, we have designated a dedicated <strong>Grievance Redressal Officer</strong>:
            </p>
            <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-5 font-mono text-sm space-y-2">
              <div className="text-amber-300 font-bold text-base">DESIGNATED GRIEVANCE OFFICER</div>
              <div className="text-neutral-300">Name: Grievance & Compliance Desk</div>
              <div className="text-neutral-300">Entity: BumpOne Platform Operations</div>
              <div className="text-neutral-300">Direct Email: <a href="mailto:grievance@bumpone.lol" className="text-amber-400 underline">grievance@bumpone.lol</a></div>
              <div className="text-neutral-300">General Privacy: <a href="mailto:privacy@bumpone.lol" className="text-amber-400 underline">privacy@bumpone.lol</a></div>
              <div className="text-neutral-400 text-xs pt-2">
                Turnaround Commitment: All grievances, consent revocations, and data deletion requests are acknowledged within 24 hours and fully resolved within <strong>30 calendar days</strong>.
              </div>
            </div>
            <p className="mt-4 text-xs text-neutral-400 leading-normal">
              <strong>Escalation Notice:</strong> If you are located in India and your grievance is not resolved satisfactorily by our Grievance Officer within the prescribed timeframe, you have the right to escalate your complaint directly to the <strong>Data Protection Board of India (DPBI)</strong> in accordance with Section 13(3) of the DPDP Act.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/[0.08] pt-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-neutral-500 gap-4">
          <span>&copy; {new Date().getFullYear()} BumpOne.lol • Curated Digital Billboard &amp; Directory Showcase</span>
          <div className="flex flex-wrap gap-4">
            <Link href="/terms" className="hover:text-amber-400 transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-amber-400 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/refund" className="hover:text-amber-400 transition-colors">
              Refund Policy
            </Link>
            <Link href="/contact" className="hover:text-amber-400 transition-colors">
              Contact Us
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
