"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Search,
  Tag,
  ArrowRight,
  Globe,
  Layers,
  HelpCircle,
  X,
  Lock,
  ChevronRight,
} from "lucide-react";
import type { Profile } from "@/lib/board";

interface ShowcaseBillboardPageProps {
  initialProfiles?: Profile[];
}

const CATEGORIES = [
  "All",
  "Tech",
  "AI",
  "SaaS",
  "Apps",
  "Web3",
] as const;

export function ShowcaseBillboardPage({ initialProfiles = [] }: ShowcaseBillboardPageProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "featured" | "hero">("featured");
  const [selectedGateway, setSelectedGateway] = useState<"dodo" | "razorpay">("dodo");

  // Form states
  const [projectTitle, setProjectTitle] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [projectCategory, setProjectCategory] = useState("Tech");
  const [projectImage, setProjectImage] = useState("");
  const [sponsorEmail, setSponsorEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Auto-detect sponsor success callback from Dodo Payments
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("status") === "sponsor_success") {
        setSubmitSuccess(true);
        setIsModalOpen(true);
      }
    }
  }, []);

  // Filter projects
  const filteredProfiles = useMemo(() => {
    return initialProfiles.filter((p) => {
      const matchCat = selectedCategory === "All" || p.category?.toLowerCase() === selectedCategory.toLowerCase();
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.handle?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [initialProfiles, selectedCategory, searchQuery]);

  const handleOpenSponsorModal = (plan: "starter" | "featured" | "hero" = "featured") => {
    setSelectedPlan(plan);
    setSubmitError("");
    setSubmitSuccess(false);
    setIsModalOpen(true);
  };

  const handleSponsorCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/sponsor/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          title: projectTitle,
          url: projectUrl,
          category: projectCategory,
          imageUrl: projectImage || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80",
          email: sponsorEmail,
          gateway: selectedGateway,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Unable to initialize sponsorship order.");
      }

      // 1. Dodo Payments Checkout (Global / USD)
      if (data.gateway === "dodo" && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      // 2. Razorpay Checkout (Domestic India / INR)
      const loadScript = () => {
        return new Promise((resolve) => {
          if ((window as any).Razorpay) return resolve(true);
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const scriptLoaded = await loadScript();
      if (!scriptLoaded) {
        throw new Error("Razorpay payment gateway failed to load. Please check your network.");
      }

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "BumpOne Digital Showcase",
        description: `${selectedPlan.toUpperCase()} Showcase Slot Placement`,
        order_id: data.order_id,
        prefill: {
          email: sponsorEmail,
        },
        theme: {
          color: "#f59e0b",
        },
        handler: function () {
          setSubmitSuccess(true);
          setIsSubmitting(false);
        },
        modal: {
          ondismiss: function () {
            setIsSubmitting(false);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setSubmitError(err.message || "An unexpected error occurred.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0d] text-neutral-100 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* 1. Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#090a0d]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 font-mono font-black text-lg group-hover:scale-105 transition-transform">
              B
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-white text-base">BUMPONE</span>
              <span className="text-amber-400 text-xs font-mono ml-1 font-semibold">.SHOWCASE</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-neutral-400">
            <a href="#showcase" className="hover:text-amber-400 transition-colors">Showcase Directory</a>
            <a href="#pricing" className="hover:text-amber-400 transition-colors">Pricing Plans</a>
            <Link href="/contact" className="hover:text-amber-400 transition-colors">About &amp; Contact</Link>
            <Link href="/terms" className="hover:text-amber-400 transition-colors">Terms</Link>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenSponsorModal("featured")}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 font-bold text-neutral-950 text-xs sm:text-sm hover:bg-amber-300 transition-all shadow-lg shadow-amber-400/20 active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
              <span>Sponsor a Slot — ₹199 / $2.99</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 border-b border-white/[0.06]">
        {/* Subtle background glow */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-amber-500/10 blur-[130px] rounded-full" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/[0.08] px-3.5 py-1 text-xs font-mono font-medium text-amber-300 mb-6">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
            <span>Curated Digital Showcase &amp; Developer Billboard</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.15]">
            Featured Digital Billboard Space for <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
              Modern Tech &amp; Software Projects
            </span>
          </h1>

          <p className="mt-5 max-w-2xl mx-auto text-base sm:text-lg text-neutral-300 leading-relaxed">
            Discover high-performance apps, AI utilities, developer tools, and tech products. Sponsor a featured digital billboard slot to showcase your project to developers, creators, and early adopters.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => handleOpenSponsorModal("featured")}
              className="inline-flex items-center gap-2.5 rounded-xl bg-amber-400 px-6 py-3 font-bold text-neutral-950 text-sm hover:bg-amber-300 transition-all shadow-xl shadow-amber-400/25 active:scale-95"
            >
              <span>Reserve Sponsored Space</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="#showcase"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 font-medium text-neutral-300 text-sm hover:bg-white/[0.08] hover:text-white transition-all"
            >
              <span>Explore Directory</span>
            </a>
          </div>

          {/* Quick trust metrics */}
          <div className="mt-12 pt-8 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-black text-white font-mono">100+</div>
              <div className="text-xs text-neutral-400 mt-0.5">Showcased Projects</div>
            </div>
            <div>
              <div className="text-2xl font-black text-white font-mono">₹199 <span className="text-xs font-normal text-neutral-400 font-sans">($2.99)</span></div>
              <div className="text-xs text-neutral-400 mt-0.5">Starting Fixed Price</div>
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-400 font-mono">Instant</div>
              <div className="text-xs text-neutral-400 mt-0.5">Digital Placement</div>
            </div>
            <div>
              <div className="text-2xl font-black text-white font-mono">Secure</div>
              <div className="text-xs text-neutral-400 mt-0.5">Global Checkout</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Transparent Fixed Pricing Section */}
      <section id="pricing" className="py-16 md:py-24 border-b border-white/[0.06] bg-[#0c0d12]/50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-mono font-semibold tracking-wider text-amber-400 uppercase">
              Transparent Sponsorship Plans
            </span>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              Promote Your Software to our Audience
            </h2>
            <p className="mt-3 text-sm text-neutral-400">
              Clear, one-time sponsorship packages with zero recurring surprises. Choose your placement tier and go live instantly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Starter Plan */}
            <div className="rounded-2xl border border-white/10 bg-[#12141a] p-6 flex flex-col justify-between hover:border-white/20 transition-all">
              <div>
                <div className="text-xs font-mono font-bold text-neutral-400 uppercase tracking-wider mb-2">
                  Starter Directory
                </div>
                <div className="flex items-baseline gap-1.5 mb-4">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">₹199</span>
                  <span className="text-sm sm:text-base font-semibold text-neutral-400 font-mono">($2.99)</span>
                  <span className="text-xs text-neutral-400 font-mono">/ one-time</span>
                </div>
                <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                  Ideal for indie developers, side projects, and new open-source software launches.
                </p>

                <ul className="space-y-3 text-xs text-neutral-300">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>30-Day Curated Directory Listing</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>Verified Project Title &amp; Backlink</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>Category Tagging (AI, SaaS, Tech)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>Standard Search Indexing</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleOpenSponsorModal("starter")}
                className="mt-8 w-full rounded-xl border border-white/15 bg-white/[0.04] py-2.5 font-bold text-white text-xs hover:bg-white/[0.08] transition-colors"
              >
                Sponsor Starter Slot — ₹199 / $2.99
              </button>
            </div>

            {/* Featured Plan (Highlighted) */}
            <div className="relative rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-amber-500/[0.08] to-[#12141a] p-6 flex flex-col justify-between shadow-xl shadow-amber-500/10">
              <div className="absolute -top-3 right-6 rounded-full bg-amber-400 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-neutral-950 font-mono">
                MOST POPULAR
              </div>

              <div>
                <div className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider mb-2">
                  Featured Billboard
                </div>
                <div className="flex items-baseline gap-1.5 mb-4">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">₹499</span>
                  <span className="text-sm sm:text-base font-semibold text-neutral-300 font-mono">($5.99)</span>
                  <span className="text-xs text-neutral-400 font-mono">/ one-time</span>
                </div>
                <p className="text-xs text-neutral-300 mb-6 leading-relaxed">
                  Enhanced digital billboard card with high visual emphasis and category spotlight priority.
                </p>

                <ul className="space-y-3 text-xs text-neutral-200">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span>Highlighted Billboard Banner Card</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span>Priority Category Showcase Placement</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span>&quot;Featured&quot; Gold Verification Badge</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span>Outbound Click &amp; View Analytics</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span>Priority 24h Review &amp; Activation</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleOpenSponsorModal("featured")}
                className="mt-8 w-full rounded-xl bg-amber-400 py-3 font-bold text-neutral-950 text-xs sm:text-sm hover:bg-amber-300 transition-colors shadow-lg shadow-amber-400/20"
              >
                Sponsor Featured Billboard — ₹499 / $5.99
              </button>
            </div>

            {/* Hero Spotlight */}
            <div className="rounded-2xl border border-white/10 bg-[#12141a] p-6 flex flex-col justify-between hover:border-white/20 transition-all">
              <div>
                <div className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider mb-2">
                  Hero Spotlight
                </div>
                <div className="flex items-baseline gap-1.5 mb-4">
                  <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">₹999</span>
                  <span className="text-sm sm:text-base font-semibold text-neutral-400 font-mono">($11.99)</span>
                  <span className="text-xs text-neutral-400 font-mono">/ one-time</span>
                </div>
                <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                  Maximum impact placement positioned in the primary showcase banner section.
                </p>

                <ul className="space-y-3 text-xs text-neutral-300">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <span>Top-Tier Homepage Billboard Position</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <span>Full-Width Hero Showcase Banner</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <span>Social Media &amp; Creator Spotlight Mention</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <span>Dedicated VIP Support &amp; Placement Guarantee</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => handleOpenSponsorModal("hero")}
                className="mt-8 w-full rounded-xl border border-purple-500/30 bg-purple-500/10 py-2.5 font-bold text-purple-300 text-xs hover:bg-purple-500/20 transition-colors"
              >
                Sponsor Hero Spotlight — ₹999 / $11.99
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Directory Showcase Section */}
      <section id="showcase" className="py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-mono font-semibold text-amber-400 uppercase">
                Active Listings
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
                Curated Project Directory
              </h2>
            </div>

            {/* Search and filters */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#12141a] pl-9 pr-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Category pills */}
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? "bg-amber-400 text-neutral-950 font-bold"
                        : "bg-white/[0.04] text-neutral-400 hover:text-white border border-white/[0.06]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Project Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {filteredProfiles.length > 0 ? (
              filteredProfiles.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="group rounded-xl border border-white/[0.08] bg-[#111318] p-4 flex flex-col justify-between hover:border-amber-400/40 hover:bg-[#141720] transition-all"
                >
                  <div>
                    {/* Project Thumbnail Image */}
                    <div className="relative h-40 w-full overflow-hidden rounded-lg bg-neutral-900 mb-3 border border-white/[0.06]">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-neutral-600">
                          <Layers className="h-8 w-8" />
                        </div>
                      )}
                      <span className="absolute top-2 left-2 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-300 border border-white/10">
                        {item.category || "Tech"}
                      </span>
                    </div>

                    {/* Title & Handle */}
                    <h3 className="font-bold text-white text-sm line-clamp-1 group-hover:text-amber-300 transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-xs font-mono text-neutral-400 mt-0.5">
                      {item.handle ? (item.handle.startsWith("@") ? item.handle : `@${item.handle}`) : "Verified Creator"}
                    </p>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Live Verified
                    </span>

                    {item.linkUrl && (
                      <a
                        href={item.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 hover:underline"
                      >
                        <span>Visit Site</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-16 text-center text-neutral-500">
                <Layers className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No showcase projects match your filter.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. Sponsor a Slot Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#12141b] p-6 sm:p-8 shadow-2xl">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {submitSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-white">Sponsorship Order Confirmed!</h3>
                <p className="text-sm text-neutral-300 max-w-md mx-auto">
                  Thank you for your digital showcase reservation. Our team has verified your details and your slot is now active in the directory.
                </p>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="mt-4 rounded-xl bg-amber-400 px-6 py-2.5 font-bold text-neutral-950 text-xs hover:bg-amber-300"
                >
                  Return to Showcase
                </button>
              </div>
            ) : (
              <form onSubmit={handleSponsorCheckout} className="space-y-4">
                <div>
                  <span className="text-xs font-mono font-semibold text-amber-400 uppercase">
                    Secure Global Checkout &bull; Instant Placement
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">Sponsor a Digital Showcase Slot</h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Fill in your project details. Payments are processed securely via authorized partners (Cards, UPI, Net Banking).
                  </p>
                </div>

                {/* Plan Selection */}
                <div>
                  <label className="block text-xs font-mono text-neutral-300 mb-1.5">Select Placement Tier</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "starter", title: "Starter", price: selectedGateway === "dodo" ? "$2.99" : "₹199" },
                      { id: "featured", title: "Featured", price: selectedGateway === "dodo" ? "$5.99" : "₹499" },
                      { id: "hero", title: "Hero", price: selectedGateway === "dodo" ? "$11.99" : "₹999" },
                    ].map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => setSelectedPlan(t.id as any)}
                        className={`rounded-xl border p-2.5 text-center transition-all ${
                          selectedPlan === t.id
                            ? "border-amber-400 bg-amber-400/10 text-white"
                            : "border-white/10 bg-white/[0.02] text-neutral-400 hover:border-white/20"
                        }`}
                      >
                        <div className="text-[11px] font-medium">{t.title}</div>
                        <div className="text-xs font-bold font-mono text-amber-300">{t.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div>
                  <label className="block text-xs font-mono text-neutral-300 mb-1.5">Payment Processor &amp; Currency</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedGateway("dodo")}
                      className={`rounded-xl border p-2.5 text-left transition-all ${
                        selectedGateway === "dodo"
                          ? "border-amber-400 bg-amber-400/10 text-white"
                          : "border-white/10 bg-white/[0.02] text-neutral-400 hover:border-white/20"
                      }`}
                    >
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                        Dodo Payments
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Cards, Apple Pay (USD)</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedGateway("razorpay")}
                      className={`rounded-xl border p-2.5 text-left transition-all ${
                        selectedGateway === "razorpay"
                          ? "border-amber-400 bg-amber-400/10 text-white"
                          : "border-white/10 bg-white/[0.02] text-neutral-400 hover:border-white/20"
                      }`}
                    >
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Razorpay
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">India UPI, NetBanking (INR)</div>
                    </button>
                  </div>
                </div>

                {/* Form Fields */}
                <div>
                  <label className="block text-xs font-mono text-neutral-300 mb-1">Project Name *</label>
                  <input
                    type="text"
                    required
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="e.g. SupaSprint AI"
                    className="w-full rounded-lg border border-white/10 bg-[#0a0b0e] px-3 py-2 text-xs text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-neutral-300 mb-1">Destination URL *</label>
                    <input
                      type="url"
                      required
                      value={projectUrl}
                      onChange={(e) => setProjectUrl(e.target.value)}
                      placeholder="https://yourproject.com"
                      className="w-full rounded-lg border border-white/10 bg-[#0a0b0e] px-3 py-2 text-xs text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-neutral-300 mb-1">Category *</label>
                    <select
                      value={projectCategory}
                      onChange={(e) => setProjectCategory(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#0a0b0e] px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                    >
                      <option value="Tech">Tech</option>
                      <option value="AI">AI</option>
                      <option value="SaaS">SaaS</option>
                      <option value="Apps">Apps</option>
                      <option value="Web3">Web3</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-300 mb-1">Logo / Banner Image URL</label>
                  <input
                    type="url"
                    value={projectImage}
                    onChange={(e) => setProjectImage(e.target.value)}
                    placeholder="https://yourproject.com/banner.png (Optional)"
                    className="w-full rounded-lg border border-white/10 bg-[#0a0b0e] px-3 py-2 text-xs text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-300 mb-1">Sponsor Contact Email *</label>
                  <input
                    type="email"
                    required
                    value={sponsorEmail}
                    onChange={(e) => setSponsorEmail(e.target.value)}
                    placeholder="your-email@company.com"
                    className="w-full rounded-lg border border-white/10 bg-[#0a0b0e] px-3 py-2 text-xs text-white placeholder-neutral-600 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                {submitError && (
                  <div className="rounded-lg border border-rose-500/20 bg-rose-950/20 p-2.5 text-xs text-rose-300">
                    {submitError}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 font-bold text-neutral-950 text-xs sm:text-sm hover:bg-amber-300 transition-colors shadow-lg shadow-amber-400/20 disabled:opacity-50"
                  >
                    <Lock className="h-4 w-4" />
                    <span>
                      {isSubmitting
                        ? "Opening Secure Gateway..."
                        : selectedGateway === "dodo"
                        ? `Pay with Dodo Payments — ${selectedPlan === "starter" ? "$2.99" : selectedPlan === "featured" ? "$5.99" : "$11.99"}`
                        : `Pay with Razorpay — ${selectedPlan === "starter" ? "₹199" : selectedPlan === "featured" ? "₹499" : "₹999"}`}
                    </span>
                  </button>

                  <p className="mt-2 text-[11px] text-center text-neutral-500 font-mono">
                    Secured by Dodo Payments (Global MoR) &amp; Razorpay (India) • SSL Encrypted
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 6. Comprehensive Razorpay-Compliant Footer */}
      <footer className="border-t border-white/[0.08] bg-[#07080b] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            {/* Col 1: Brand & Mission */}
            <div className="md:col-span-1">
              <Link href="/" className="flex items-center gap-2 font-bold text-white text-base">
                <span className="h-7 w-7 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 font-mono text-sm">
                  B
                </span>
                <span>BumpOne.lol</span>
              </Link>
              <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                Curated digital showcase and promotional developer billboard platform. Helping software tools, apps, and creators reach engaged tech audiences.
              </p>
            </div>

            {/* Col 2: Mandatory Policies */}
            <div>
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider mb-3">
                Legal &amp; Compliance
              </h4>
              <ul className="space-y-2 text-xs text-neutral-400 font-mono">
                <li>
                  <Link href="/terms" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3 text-neutral-600" />
                    <span>Terms &amp; Conditions</span>
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3 text-neutral-600" />
                    <span>Privacy Policy (DPDP 2026)</span>
                  </Link>
                </li>
                <li>
                  <Link href="/refund" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3 text-neutral-600" />
                    <span>Refund &amp; Cancellation</span>
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3 text-neutral-600" />
                    <span>About Us &amp; Contact</span>
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 3: Business Information */}
            <div>
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider mb-3">
                Business &amp; Support
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed mb-2">
                <strong>Platform:</strong> BumpOne Digital Showcase
              </p>
              <p className="text-xs text-neutral-400 leading-relaxed mb-2">
                <strong>Email:</strong>{" "}
                <a href="mailto:support@bumpone.lol" className="text-amber-400 hover:underline">
                  support@bumpone.lol
                </a>
              </p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                <strong>Support Hours:</strong> Mon – Sat (9 AM – 6 PM IST)
              </p>
            </div>

            {/* Col 4: Payment Security */}
            <div>
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider mb-3">
                Payment Security
              </h4>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-neutral-400 space-y-1.5">
                <div className="flex items-center gap-2 text-white font-medium">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>Authorized Payment Partners</span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Payments encrypted via 256-bit SSL. Processed by Dodo Payments &amp; Razorpay (Visa, Mastercard, UPI, RuPay, NetBanking).
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-neutral-500 gap-3">
            <div>&copy; 2026 BumpOne.lol • All Rights Reserved.</div>
            <div className="text-[11px] text-neutral-600">
              Curated Web Directory &amp; Digital Billboard Advertising Services.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
