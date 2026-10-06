-- ==============================================================================
-- Migration 022: payments.new_rank nullable (SEC-018)
--
-- A payment on a PENDING (never-moderated) project is financially real but the
-- project holds no board rank. payments.new_rank was `not null` with a
-- 1..100 range check, which left no truthful value for "not on the board".
-- The column becomes nullable: NULL = never ranked at payment time;
-- non-null values are still guarded by chk_payments_new_rank_range (1..100).
-- Approved-path payments are unchanged (always 1..100).
-- ==============================================================================

alter table public.payments alter column new_rank drop not null;
