-- 027_expand_categories.sql
-- Expands the categories table with comprehensive options for modern startups, creators, Web3, SaaS, and dev tools.

insert into public.categories (name, slug, display_order) values
  ('AI', 'ai', 1),
  ('SaaS', 'saas', 2),
  ('Apps', 'apps', 3),
  ('Dev Tools', 'dev-tools', 4),
  ('Websites', 'websites', 5),
  ('Crypto & Web3', 'crypto', 6),
  ('Design', 'design', 7),
  ('Productivity', 'productivity', 8),
  ('Creators', 'creators', 9),
  ('Games', 'games', 10),
  ('FinTech', 'fintech', 11),
  ('E-Commerce', 'ecommerce', 12),
  ('Marketing', 'marketing', 13),
  ('Community', 'community', 14),
  ('Tech', 'tech', 15)
on conflict (slug) do update set
  name = excluded.name,
  display_order = excluded.display_order;
