import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#07080b] text-neutral-300 font-sans flex flex-col items-center justify-center p-6 text-center selection:bg-amber-500/30 selection:text-amber-200">
      <div className="h-16 w-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 mb-6">
        <Compass className="h-8 w-8 animate-pulse" />
      </div>

      <span className="font-mono text-xs font-semibold text-amber-400 tracking-widest uppercase bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full mb-4">
        404 • Slot Not Found
      </span>

      <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-3">
        Lost in the Attention Grid
      </h1>

      <p className="max-w-md text-sm md:text-base text-neutral-400 leading-relaxed mb-8">
        The billboard slot, project showcase, or destination you are searching for does not exist or has been shifted off the grid.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-300 transition-colors shadow-lg shadow-amber-400/10"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Live Billboard</span>
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-5 py-2.5 text-sm font-mono text-neutral-300 hover:text-white transition-colors"
        >
          <span>Contact Support</span>
        </Link>
      </div>
    </div>
  );
}
