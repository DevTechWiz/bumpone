import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogPostBySlug, listBlogPosts, renderBlogMarkdown } from "@/lib/blog";

// Pure content + fs at build time: prerender every post statically, no runtime fs.
export const dynamic = "force-static";

export function generateStaticParams() {
  return listBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return { title: "Not found" };
  const ogImageUrl = "https://bumpone.lol/opengraph-image";
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `https://bumpone.lol/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: `${post.date}T00:00:00Z`,
      url: `https://bumpone.lol/blog/${post.slug}`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [ogImageUrl],
    },
  };
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const authorName = post.author || "BumpOne Editorial Team";
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: `${post.date}T00:00:00Z`,
    dateModified: `${post.date}T00:00:00Z`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://bumpone.lol/blog/${post.slug}`,
    },
    author: {
      "@type": "Organization",
      name: authorName,
      url: "https://bumpone.lol",
    },
    publisher: {
      "@type": "Organization",
      name: "BumpOne",
      url: "https://bumpone.lol",
      logo: {
        "@type": "ImageObject",
        url: "https://bumpone.lol/bumpone-logo.png",
      },
    },
    image: "https://bumpone.lol/opengraph-image",
  };

  return (
    <main className="min-h-screen bg-[#0A0B0E] text-neutral-200 font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd).replace(/</g, '\\u003c') }}
      />
      <article className="mx-auto w-full max-w-3xl px-5 py-14">
        <header className="mb-8">
          <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-500">
            <time dateTime={post.date}>
              {formatDate(post.date)}
            </time>
            <span>•</span>
            <span className="text-neutral-400">{authorName}</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">{post.title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">{post.description}</p>
        </header>

        {/* Rendered from escaped, approved first-party markdown only. */}
        <div
          className="prose-blog space-y-0 text-[15px] leading-relaxed text-neutral-300 [&_a]:text-amber-400 [&_a]:underline [&_a:hover]:text-amber-300 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-neutral-300 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-white [&_li]:my-1 [&_ol]:my-4 [&_p]:my-4 [&_strong]:text-white [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-400/60 [&_blockquote]:pl-4 [&_blockquote]:text-neutral-400"
          dangerouslySetInnerHTML={{ __html: renderBlogMarkdown(post.body) }}
        />

        <footer className="mt-12 border-t border-white/[0.08] pt-6">
          <Link
            href="/"
            className="font-mono text-[12px] text-amber-400 transition-colors hover:text-amber-300"
          >
            &larr; Back to the wall
          </Link>
          <div className="mt-4 flex gap-4 font-mono text-[11px] text-neutral-500">
            <Link href="/blog" className="hover:text-neutral-300">Blog index</Link>
            <Link href="/contact" className="hover:text-neutral-300">Contact</Link>
            <Link href="/terms" className="hover:text-neutral-300">Terms</Link>
            <Link href="/privacy" className="hover:text-neutral-300">Privacy</Link>
          </div>
        </footer>
      </article>
    </main>
  );
}
