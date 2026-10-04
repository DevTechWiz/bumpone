import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms & Conditions - BumpOne.lol",
  description:
    "Official Terms and Conditions for digital billboard advertising, sponsored listings, and directory showcase services on BumpOne.lol.",
};

export default function TermsPage() {
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
              href="/privacy"
              className="hidden sm:inline-flex text-xs font-mono text-neutral-400 hover:text-amber-400 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/refund"
              className="hidden sm:inline-flex text-xs font-mono text-neutral-400 hover:text-amber-400 transition-colors"
            >
              Refund Policy
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-400 border border-amber-500/20">
              LEGAL TERMS 2026
            </span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12 md:py-16">
        <div className="border-b border-white/[0.08] pb-8 mb-10">
          <span className="inline-block rounded-full bg-amber-400/10 px-3 py-1 font-mono text-xs font-semibold text-amber-400 border border-amber-400/20 mb-3">
            DIGITAL ADVERTISING AGREEMENT
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">Terms &amp; Conditions</h1>
          <p className="mt-3 text-sm font-mono text-neutral-400">
            Last Updated: October 4, 2026 • Governing all Directory Showcase and Digital Billboard Services
          </p>
        </div>

        <div className="space-y-10 text-[15px] leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">01.</span> Agreement &amp; Acceptance
            </h2>
            <p className="mb-3">
              By accessing, browsing, registering on, or purchasing digital advertising or promotional space on BumpOne (&quot;BumpOne.lol&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;the Service&quot;), you acknowledge and agree to be bound by these Terms &amp; Conditions and our Privacy Policy.
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-neutral-300">
              <strong className="block mb-1 text-white">Eligibility:</strong> You represent and warrant that you are at least 18 years of age (or the age of legal majority in your country) and possess the lawful authority to enter into commercial transactions for promotional services.
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">02.</span> Scope of Services
            </h2>
            <p className="mb-3">
              BumpOne provides an online digital showcase, web directory, and tech promotional billboard platform. Developers, entrepreneurs, and product creators can purchase fixed-price sponsorship packages to list, feature, and showcase their applications, websites, software tools, and digital products.
            </p>
            <p>
              Services provided include public listing in our digital directory, rendering of promotional banners/logos, outbound hyperlink routing to the sponsor&apos;s specified website, and inclusion in our curated project database.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">03.</span> Pricing, Payment &amp; Billing
            </h2>
            <p className="mb-3">
              All promotional packages are priced transparently as one-time digital service fees in Indian Rupees (INR) and US Dollars (USD):
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>
                <strong>Starter Showcase (₹199 / $2.99):</strong> Standard digital directory listing with verified do-follow project link and category classification.
              </li>
              <li>
                <strong>Featured Billboard (₹499 / $5.99):</strong> Highlighted showcase placement, priority category spotlight, and verified project badge.
              </li>
              <li>
                <strong>Hero Billboard (₹999 / $11.99):</strong> Premier top-tier homepage billboard spotlight placement with high visibility.
              </li>
            </ul>
            <p className="mt-3">
              All payments are processed securely through our authorized payment processing and Merchant of Record (MoR) partners, including <strong>Dodo Payments</strong> and <strong>Razorpay Software Private Limited</strong>. Depending on your region, checkout will be billed in USD or INR. We do not store or process sensitive debit/credit card credentials on our servers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">04.</span> Content Moderation &amp; Acceptable Use
            </h2>
            <p className="mb-3">
              All submitted URLs, logos, graphics, and text are reviewed to protect our community and maintain showcase quality. We strictly prohibit any submissions containing:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-300">
              <li>Malware, viruses, phishing, spyware, or deceptive downloads.</li>
              <li>Illegal goods, unregulated financial schemes, or predatory services.</li>
              <li>Defamatory, hateful, infringing, or adult content.</li>
            </ul>
            <p className="mt-3">
              BumpOne reserves the right to reject, unpublish, or request modifications to any sponsored listing that violates these standards. In the event of moderation rejection, a full refund will be provided.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">05.</span> Intellectual Property &amp; License
            </h2>
            <p className="mb-3">
              Sponsors retain all intellectual property rights to their trademarks, logos, brand names, and digital assets. By submitting a project for showcase listing, you grant BumpOne a non-exclusive, worldwide, royalty-free license to display your project title, logo, and description solely for directory showcase and promotional purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">06.</span> Service Availability &amp; Disclaimer
            </h2>
            <p className="mb-3">
              While we strive for 99.9% platform availability, digital directory services are provided on an &quot;as is&quot; and &quot;as available&quot; basis. BumpOne makes no representation regarding specific traffic numbers, click-through volumes, or revenue generation resulting from any sponsored listing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">07.</span> Governing Law &amp; Dispute Resolution
            </h2>
            <p className="mb-3">
              These Terms shall be governed by and construed in accordance with the laws of <strong>India</strong>, including the Information Technology Act, 2000. Any legal disputes arising in connection with these terms shall be subject to the exclusive jurisdiction of the competent courts in <strong>Bengaluru, Karnataka, India</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-amber-400 font-mono text-sm">08.</span> Contact Information
            </h2>
            <p className="mb-3">
              If you have any questions or require legal clarification regarding these Terms, please reach out to our legal and support team:
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-[#14151b] p-5 font-mono text-sm">
              <p className="text-neutral-400">
                <span className="text-neutral-500">Legal Contact:</span>{" "}
                <a href="mailto:support@bumpone.lol" className="text-amber-400 hover:underline">
                  support@bumpone.lol
                </a>
              </p>
              <p className="text-neutral-400 mt-1">
                <span className="text-neutral-500">Platform:</span> BumpOne Digital Showcase &amp; Billboard
              </p>
            </div>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-16 pt-8 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-neutral-500">
          <div>© 2026 BumpOne.lol • Curated Digital Billboard &amp; Directory Showcase</div>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-amber-400 transition-colors">Privacy Policy</Link>
            <Link href="/refund" className="hover:text-amber-400 transition-colors">Refund Policy</Link>
            <Link href="/contact" className="hover:text-amber-400 transition-colors">Contact Us</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
