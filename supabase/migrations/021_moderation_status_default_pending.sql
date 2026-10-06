-- ==============================================================================
-- Migration 021: moderation_status defaults to 'pending' (SEC-018)
--
-- Split out of 020 because PostgreSQL rejects using a newly added enum value
-- in the same transaction that added it:
--   ERROR:  unsafe use of new value "pending" of enum type project_moderation_status
--   HINT:   New enum values must be committed before they can be used.
-- 020 adds the 'pending' label; this migration — applied strictly AFTER 020 —
-- installs it as the column default. Safe under any applier (per-statement
-- autocommit, per-file transaction, or dashboard SQL editor).
-- ==============================================================================

alter table public.projects
  alter column moderation_status set default 'pending'::project_moderation_status;
