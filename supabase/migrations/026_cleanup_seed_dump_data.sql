-- 026_cleanup_seed_dump_data.sql
-- Production Clean Slate Migration:
-- Purges all test and mock projects, test payments, quotes, reactions, reports, and events.
-- Leaves the 100-slot wall completely fresh and ready for live production launch.

begin;

-- 1. Clean up War Room chat messages (leaving only the official launch announcement)
delete from public.messages;

insert into public.messages (author_name, author_handle, avatar_color, text, slot_tag, is_official) values
  ('System', '@bumpone', '#06b6d4', 'The 100-slot wall is live! Claim Rank #1 to become the founding King.', 1, true);

-- 2. Clean up moderation reports, reactions, and board events
delete from public.reports;
delete from public.reactions;
delete from public.board_events;

-- 3. Clean up test payments and purchase quotes
delete from public.payments;
delete from public.purchase_quotes;
delete from public.payment_events;

-- 4. Clean up all test projects
delete from public.projects;

commit;
