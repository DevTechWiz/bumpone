-- 002_ranking_rpc.sql
-- Authoritative Atomic Database Functions & RPCs for BumpOne.lol
-- PostgreSQL 16+ / Supabase Engine
-- Clean Architecture: operates on projects, payments, board_events, payment_webhook_events

-- ==============================================================================
-- 1. Authoritative Atomic Ranking Mutation on Dodo Webhook
-- ==============================================================================
create or replace function process_dodo_purchase(
  p_event_id text,
  p_payment_id text,
  p_project_id uuid,
  p_amount_minor bigint,
  p_payload jsonb
) returns jsonb as $$
declare
  v_old_value_minor bigint;
  v_new_value_minor bigint;
  v_old_rank int;
  v_new_rank int;
  v_seq bigint;
  v_displaced int := 0;
  v_payment_id uuid;
  v_category_id uuid;
  v_title text;
  v_handle text;
begin
  -- 1. Webhook Idempotency Check: Don't re-process duplicate events
  if exists (
    select 1 from payment_webhook_events 
    where provider = 'dodo' and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- 2. Lock Board for serial execution (Advisory transaction lock prevents concurrent ranking races)
  perform pg_advisory_xact_lock(hashtext('board_ranking_mutation'));

  -- 3. Fetch current project state
  select current_active_value_minor, current_rank, category_id, title, handle
  into v_old_value_minor, v_old_rank, v_category_id, v_title, v_handle
  from projects 
  where id = p_project_id;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Project not found');
  end if;

  -- 4. Calculate new values in minor units (cents)
  v_old_value_minor := coalesce(v_old_value_minor, 0);
  v_new_value_minor := v_old_value_minor + p_amount_minor;
  v_seq := nextval('global_event_sequence_seq');

  -- 5. Update buyer project with new active bid value and ranking sequence
  update projects
  set current_active_value_minor = v_new_value_minor,
      ranking_sequence = v_seq,
      total_paid_minor = total_paid_minor + p_amount_minor,
      is_active = true,
      moderation_status = 'approved',
      updated_at = now()
  where id = p_project_id;

  -- 6. Atomically recalculate all board positions 1..100 based on:
  -- ORDER BY current_active_value_minor DESC, ranking_sequence ASC
  -- Use two-phase rank clearing to guarantee no transient partial unique index collisions.
  update projects
  set current_rank = null
  where is_active = true and current_rank is not null;

  with ranked as (
    select id, row_number() over (
      order by current_active_value_minor desc, ranking_sequence asc
    ) as rank_pos
    from projects
    where is_active = true and moderation_status = 'approved'
  )
  update projects p
  set current_rank = r.rank_pos
  from ranked r
  where p.id = r.id and r.rank_pos <= 100;

  -- 7. Query buyer's newly assigned rank
  select current_rank into v_new_rank
  from projects
  where id = p_project_id;

  -- If beyond top 100, rank is null (Graveyard)
  if v_new_rank is null then
    v_new_rank := 101;
  end if;

  if v_old_rank is null then
    v_displaced := case when v_new_rank <= 100 then 101 - v_new_rank else 0 end;
  elsif v_new_rank < v_old_rank then
    v_displaced := v_old_rank - v_new_rank;
  else
    v_displaced := 0;
  end if;

  -- 8. Record financial payment transaction in ledger
  insert into payments (
    project_id, user_id, provider, quote_id, provider_payment_id,
    amount_minor, currency, previous_active_value_minor, new_active_value_minor,
    previous_rank, new_rank, status
  ) select
    p_project_id, user_id, 'dodo', (p_payload->'metadata'->>'quote_id'), p_payment_id,
    p_amount_minor, 'USD', v_old_value_minor, v_new_value_minor,
    v_old_rank, least(v_new_rank, 100), 'paid'::payment_status
  from projects where id = p_project_id
  returning id into v_payment_id;

  -- 9. Record board event in immutable audit journal
  insert into board_events (
    event_sequence, payment_id, project_id, project_title_snapshot, project_handle_snapshot,
    previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
    category_id, profiles_displaced, event_type
  ) values (
    v_seq, v_payment_id, p_project_id, v_title, v_handle,
    v_old_rank, least(v_new_rank, 100), v_old_value_minor, v_new_value_minor,
    v_category_id, v_displaced,
    case
      when v_old_rank is null then 'inserted'::board_event_type
      when v_new_rank > 100 then 'left_top_100'::board_event_type
      else 'bumped'::board_event_type
    end
  );

  -- 10. Record webhook event for multi-tier idempotency
  insert into payment_webhook_events (
    provider, provider_event_id, payment_id, event_type, payload
  ) values (
    'dodo', p_event_id, p_payment_id, 'payment.succeeded', p_payload
  );

  return jsonb_build_object(
    'status', 'success',
    'payment_id', v_payment_id,
    'new_rank', least(v_new_rank, 100),
    'new_active_value_minor', v_new_value_minor,
    'sequence', v_seq,
    'displaced', v_displaced
  );
end;
$$ language plpgsql security definer;

-- ==============================================================================
-- 2. Atomic Reaction Recording & Counter Increment RPC
-- ==============================================================================
create or replace function add_project_reaction(
  p_project_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb as $$
declare
  v_new_count int := 1;
begin
  -- Validate reaction type enum
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  -- Insert reaction if not already reacted by this anonymous identity
  insert into reactions (project_id, anonymous_id, reaction_type)
  values (p_project_id, p_anonymous_id, p_reaction_type::reaction_type)
  on conflict (project_id, anonymous_id, reaction_type) do nothing;

  -- Upsert counter atomically
  insert into reaction_counts (project_id, reaction_type, count)
  values (p_project_id, p_reaction_type::reaction_type, 1)
  on conflict (project_id, reaction_type)
  do update set count = reaction_counts.count + 1
  returning count into v_new_count;

  return jsonb_build_object(
    'success', true,
    'reaction', p_reaction_type,
    'count', v_new_count
  );
end;
$$ language plpgsql security definer;

-- Backward-compatibility aliases
create or replace function add_profile_reaction(
  p_profile_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb as $$
begin
  return add_project_reaction(p_profile_id, p_anonymous_id, p_reaction_type);
end;
$$ language plpgsql security definer;

-- ==============================================================================
-- 3. Maintenance / Admin Re-ranking Function
-- Re-compacts active rankings 1..100 after a moderation suspension or refund
-- ==============================================================================
create or replace function recalculate_board_ranks()
returns void as $$
begin
  perform pg_advisory_xact_lock(hashtext('board_ranking_mutation'));

  update projects
  set current_rank = null
  where is_active = true and current_rank is not null;

  with ranked as (
    select id, row_number() over (
      order by current_active_value_minor desc, ranking_sequence asc
    ) as rank_pos
    from projects
    where is_active = true and moderation_status = 'approved'
  )
  update projects p
  set current_rank = r.rank_pos
  from ranked r
  where p.id = r.id and r.rank_pos <= 100;
end;
$$ language plpgsql security definer;
