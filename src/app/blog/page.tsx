import type { Metadata } from "next";
import Link from "next/link";
import { listBlogPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "How the live attention board works: active value, bump battles, tiers, and the economics of taking the top tile.",
  alternates: { canonical: "https://bumpone.lol/blog" },
};

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default function BlogIndex() {
  const posts = listBlogPosts();

  return (
    <main className="min-h-screen bg-[#0A0B0E] text-neutral-200 font-sans">
      <div className="mx-auto w-full max-w-3xl px-5 py-14">
        <header className="mb-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">BumpOne</p>
          <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Field notes from the wall</h1>
          <p className="mt-3 text-neutral-400">
            How the live attention market works, and what the board rewards. Everything is visible: spends, ranks, and
            bump history.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="font-mono text-sm text-neutral-500">No posts yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {posts.map((post) => (
              <li key={post.slug} className="py-7">
                <Link
                  href={`/blog/${post.slug}`}
                  className="group block"
                >
                  <time dateTime={post.date} className="font-mono text-[11px] text-neutral-500">
                    {formatDate(post.date)}
                  </time>
                  <h2 className="mt-1.5 text-xl font-bold text-white transition-colors group-hover:text-amber-400 sm:text-2xl">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-[15px] leading-relaxed text-neutral-400">{post.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-12">
          <Link
            href="/"
            className="font-mono text-[12px] text-amber-400 transition-colors hover:text-amber-300"
          >
            &larr; Back to the wall
          </Link>
          <div className="mt-4 flex gap-4 font-mono text-[11px] text-neutral-500">
            <Link href="/contact" className="hover:text-neutral-300">Contact</Link>
            <Link href="/terms" className="hover:text-neutral-300">Terms</Link>
            <Link href="/privacy" className="hover:text-neutral-300">Privacy</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
