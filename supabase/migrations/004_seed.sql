-- 004_seed.sql
-- Seed categories, Genesis projects, initial board events, and initial messages
-- Clean Architecture: operates on categories, projects, board_events, messages

-- Ensure populate_message_author preserves seed and system messages where user_id is null
create or replace function populate_message_author()
returns trigger as $$
begin
  if new.user_id is not null then
    select display_name, handle into new.author_name, new.author_handle
    from users where id = new.user_id;
  end if;

  if new.author_name is null then
    new.author_name := coalesce(new.author_handle, 'Anonymous');
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    new.is_official := false;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ==============================================================================
-- PART 1: Production-Essential Reference Data (Required in all environments)
-- ==============================================================================
insert into categories (name, slug, display_order) values
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

-- ==============================================================================
-- PART 2: Bootstrap Genesis Board (Disabled for Production Launch)
-- Kept here for optional local dev seeding if explicitly required.
-- ==============================================================================
/*
do $$
declare
  cat_ai uuid;
  cat_apps uuid;
  cat_websites uuid;
  cat_creators uuid;
  cat_games uuid;
  cat_design uuid;
  cat_tech uuid;
  v_val_minor bigint;
  v_cat uuid;
  v_title text;
  v_handle text;
  v_url text;
  v_img text;
  v_project_id uuid;
begin
  select id into cat_ai from categories where slug = 'ai';
  select id into cat_apps from categories where slug = 'apps';
  select id into cat_websites from categories where slug = 'websites';
  select id into cat_creators from categories where slug = 'creators';
  select id into cat_games from categories where slug = 'games';
  select id into cat_design from categories where slug = 'design';
  select id into cat_tech from categories where slug = 'tech';

  -- Only seed if projects table is empty
  if not exists (select 1 from projects limit 1) then
    for i in 1..100 loop
      v_val_minor := (110 - i) * 100; -- in USD cents ($109 at #1 down to $10 at #100)
      
      -- Assign varied categories & brands
      case (i % 7)
        when 0 then
          v_cat := cat_ai;
          v_title := case when i = 1 then 'Apex AI Copilot' else 'Neural Agent #' || i end;
          v_handle := '@apex_ai';
          v_url := 'https://github.com';
          v_img := 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=500&auto=format&fit=crop&q=80';
        when 1 then
          v_cat := cat_tech;
          v_title := case when i = 1 then 'Solana Syndicate DAO' else 'Hyperdrive Protocol #' || i end;
          v_handle := '@sabor_dao';
          v_url := 'https://solana.com';
          v_img := 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80';
        when 2 then
          v_cat := cat_design;
          v_title := case when i = 2 then 'Cyberpunk Tokyo' else 'Studio Neon #' || i end;
          v_handle := '@shinji_3d';
          v_url := 'https://artstation.com';
          v_img := 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=700&auto=format&fit=crop&q=80';
        when 3 then
          v_cat := cat_creators;
          v_title := case when i = 3 then 'Neon Samurai Genesis' else 'Creator Wave #' || i end;
          v_handle := '@vortex_eth';
          v_url := 'https://opensea.io';
          v_img := 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';
        when 4 then
          v_cat := cat_apps;
          v_title := case when i = 4 then 'SaaS Pulse Tracker' else 'Orbit Chat #' || i end;
          v_handle := '@marcus_builds';
          v_url := 'https://indiehackers.com';
          v_img := 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80';
        when 5 then
          v_cat := cat_games;
          v_title := case when i = 5 then 'Voxel Punk Arcade' else 'Ether Knight #' || i end;
          v_handle := '@pixel_pete';
          v_url := 'https://itch.io';
          v_img := 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=700&auto=format&fit=crop&q=80';
        else
          v_cat := cat_websites;
          v_title := case when i = 6 then 'Lumen Grid' else 'Chrome Atlas #' || i end;
          v_handle := '@lumen_grid';
          v_url := 'https://vercel.com';
          v_img := 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=700&auto=format&fit=crop&q=80';
      end case;

      insert into projects (
        title, handle, image_path, destination_url,
        category_id, current_rank, current_active_value_minor,
        total_paid_minor, ranking_sequence, is_active,
        views_count
      ) values (
        v_title, v_handle, v_img, v_url,
        v_cat, i, v_val_minor,
        v_val_minor, 1000 + i, true,
        (101 - i) * 37
      ) returning id into v_project_id;

      -- Initial seed board displacement event
      insert into board_events (
        event_sequence, project_id, project_title_snapshot, project_handle_snapshot,
        previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
        category_id, profiles_displaced, event_type
      ) values (
        1000 + i, v_project_id, v_title, v_handle,
        null, i, 0, v_val_minor, v_cat, 0, 'inserted'
      );

      -- Initial reaction count placeholders
      insert into reaction_counts (project_id, reaction_type, count) values
        (v_project_id, 'fire', (i * 7) % 53),
        (v_project_id, 'eyes', (i * 3) % 29),
        (v_project_id, 'heart', (i * 5) % 19),
        (v_project_id, 'laugh', (i * 2) % 11);
    end loop;

    -- Seed initial War Room messages
    insert into messages (author_name, author_handle, avatar_color, text, slot_tag, is_official) values
      ('System', '@bumpone', '#06b6d4', 'The 100-slot grid is live! Top up your project bid to displace rivals and capture #1.', 1, true);
  end if;
end $$;
*/
