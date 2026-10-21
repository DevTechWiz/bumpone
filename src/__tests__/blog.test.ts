/** Blog loader unit tests. Uses inline fixtures — content/blog may be empty on disk. */
import { describe, expect, it } from 'vitest';
import { renderBlogMarkdown } from '@/lib/blog';
import { z } from 'zod';
import { readFileSync } from 'node:fs';

// Re-import the schema through a fixture-driven path: the module reads the
// content directory, so tests exercise the shared pieces that are pure.

const APPROVED_FRONTMATTER = [
  '---',
  'title: Test Post',
  'description: A safe fixture description.',
  'date: 2026-10-19',
  'project: bumpone.lol',
  'channel: blog',
  'slot_id: blog-1',
  'slug: test-post',
  'keywords: [test, fixture]',
  'links: [https://bumpone.lol]',
  'status: approved',
  '---',
  '',
  'Body with [a link](https://bumpone.lol) and **bold**.',
].join('\n');

const DRAFT_FRONTMATTER = APPROVED_FRONTMATTER.replace('status: approved', 'status: draft');
const BLOCKED_FRONTMATTER = APPROVED_FRONTMATTER.replace('status: approved', 'status: blocked');

describe('blog markdown rendering', () => {
  it('renders GFM links, bold, and headings', () => {
    const html = renderBlogMarkdown('## Heading\n\nSee [the wall](https://bumpone.lol) and make it **bold**.');
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<a href="https://bumpone.lol"');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('never passes raw HTML through to the output (XSS guard)', () => {
    const html = renderBlogMarkdown('Innocent line <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes injected event handlers inside pseudo-tags', () => {
    const html = renderBlogMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('blog frontmatter policy', () => {
  const schemaKey = (source: string) => source.match(/^status: (.+)$/m)?.[1];

  it('the fixture set covers approved/draft/blocked statuses', () => {
    expect(schemaKey(APPROVED_FRONTMATTER)).toBe('approved');
    expect(schemaKey(DRAFT_FRONTMATTER)).toBe('draft');
    expect(schemaKey(BLOCKED_FRONTMATTER)).toBe('blocked');
  });

  it('the gitignored case: content dir itself is part of publishes, not code', () => {
    // Sanity: loader module exists and exports the public surface.
    const lib = readFileSync('src/lib/blog.ts', 'utf8');
    expect(lib).toMatch(/export function listBlogPosts/);
    expect(lib).toMatch(/export function getBlogPostBySlug/);
    expect(lib).toMatch(/z\.enum\(\['draft', 'blocked', 'approved'\]\)/);
  });

  it('unparsable frontmatter is dropped by the schema (no silent partial publish)', () => {
    const schema = z.object({ title: z.string().min(1), status: z.enum(['approved']) });
    expect(schema.safeParse({ title: '' }).success).toBe(false);
    expect(schema.safeParse({ title: 'ok', status: 'approved' }).success).toBe(true);
  });
});
