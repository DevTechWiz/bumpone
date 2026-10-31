const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '..', 'content', 'blog');
const manifestPath = path.join(__dirname, '..', 'src', 'lib', 'blog-manifest.json');

if (fs.existsSync(contentDir)) {
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.md'));
  const posts = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(contentDir, f), 'utf8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) continue;

    const front = {};
    for (const line of match[1].split(/\r?\n/)) {
      const m = line.match(/^([a-z_]+):\s*(.*)$/);
      if (m) front[m[1]] = m[2].trim();
    }

    const body = raw.slice(match[0].length);
    const keywords = front.keywords
      ? front.keywords
          .replace(/[[\]]/g, '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      : [];

    posts.push({
      title: front.title,
      description: front.description,
      date: (front.date || '').slice(0, 10),
      slug: front.slug || f.replace(/\.md$/, '').toLowerCase(),
      keywords,
      status: front.status,
      body,
    });
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  fs.writeFileSync(manifestPath, JSON.stringify(posts, null, 2) + '\n');
  console.log(`[blog] generated manifest with ${posts.length} posts`);
}
