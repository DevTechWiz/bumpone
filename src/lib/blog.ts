/**
 * Blog content loader + renderer (server-only).
 *
 * Content lives in `content/blog/*.md` with frontmatter. Loading happens at
 * build/prerender time on Node; keep this module out of client bundles.
 * Only `status: approved` posts are eligible for the public site — the
 * marketing engine's review gate writes statuses into the source files, not here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { marked } from 'marked';
import { z } from 'zod';

const CONTENT_DIR = join(process.cwd(), 'content', 'blog');

const BlogFrontmatterSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(320),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, 'slug must be kebab-case'),
  keywords: z.array(z.string().max(80)).max(10).default([]),
  status: z.enum(['draft', 'blocked', 'approved']),
});

export type BlogPost = z.infer<typeof BlogFrontmatterSchema> & { "body": string };

/** Derive the slug from the filename stem so it outranks any frontmatter mismatch. */
const filenameSlug = (file: string) => basename(file).replace(/\.md$/, '').toLowerCase();

function splitFrontmatter(raw: string): { frontmatter: string; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  return { frontmatter: match[1], body: raw.slice(match[0].length) };
}

/** Minimal `key: value` frontmatter reader for our one-level schema (no YAML dep). */
function parseFrontmatter(source: string): Record<string, string> | null {
  const record: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (match) record[match[1]] = match[2].trim();
  }
  return record;
}

/** Escape raw HTML BEFORE markdown-parsing so authored content can't inject markup. */
function escapeHtml(source: string): string {
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safe markdown → HTML: escape first (no raw HTML passthrough), then GFM render. */
export function renderBlogMarkdown(markdownSource: string): string {
  const html = marked.parse(escapeHtml(markdownSource), { gfm: true, async: false, breaks: false });
  return typeof html === 'string' ? html : String(html);
}

function readPost(file: string): BlogPost | null {
  const raw = readFileSync(join(CONTENT_DIR, file), 'utf8');
  const parts = splitFrontmatter(raw);
  if (!parts) return null;
  const fields = parseFrontmatter(parts.frontmatter);
  if (!fields) return null;
  // date may carry a timestamp; normalize fully-padded YYYY-MM-DD or reject
  if (fields.date) fields.date = fields.date.slice(0, 10);
  const parsed = BlogFrontmatterSchema.safeParse({
    keywords: fields.keywords ? fields.keywords.replace(/[[\]]/g, '').split(',').map((k) => k.trim()).filter(Boolean) : [],
    title: fields.title,
    description: fields.description,
    date: fields.date,
    slug: fields.slug && /^[a-z0-9-]+$/.test(fields.slug) ? fields.slug : filenameSlug(file),
    status: fields.status,
  });
  if (!parsed.success) return null; // malformed/draft/blocked: never public
  return { ...parsed.data, body: parts.body };
}

/** All publicly-visible posts, newest first. Missing dir → empty list. */
export function listBlogPosts(): BlogPost[] {
  let files: string[];
  try {
    files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return files
    .map(readPost)
    .filter((p): p is BlogPost => p !== null && p.status === 'approved')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  const post = listBlogPosts().find((p) => p.slug === slug);
  return post ?? null;
}

export const blogSlugs = () => listBlogPosts().map((p) => p.slug);
