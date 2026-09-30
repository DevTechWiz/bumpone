-- 002_ranking_rpc.sql
-- Authoritative Atomic Database Functions & RPCs for BumpOne.lol
-- PostgreSQL 16+ / Supabase Engine
-- Security Hardened: search_path locked, strict execution grants, atomic project creation

-- ==============================================================================
-- 1. Authoritative Atomic Ranking Mutation on Dodo Webhook
-- ==============================================================================
create or replace function process_dodo_purchase(
  p_event_id text,
  p_payment_id text,
  p_amount_minor bigint,
  p_payload jsonb,
  p_project_id uuid default null,
  p_quote_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := p_project_id;
  v_quote_id text;
  v_quote_amount bigint;
  v_old_value_minor bigint := 0;
  v_new_value_minor bigint;
  v_old_rank int := null;
  v_new_rank int;
  v_seq bigint;
  v_displaced int := 0;
  v_payment_id uuid;
  v_category_id uuid;
  v_title text;
  v_handle text;
  v_meta jsonb;
begin
  -- 1. Webhook Idempotency Check: Don't re-process duplicate events
  if exists (
    select 1 from payment_webhook_events 
    where provider = 'dodo' and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- 2. Lock Board for serial execution (Advisory transaction lock prevents race conditions)
  perform pg_advisory_xact_lock(hashtext('board_ranking_mutation'));

  v_meta := coalesce(p_payload->'metadata', '{}'::jsonb);
  
  if p_quote_id is not null then
    v_quote_id := p_quote_id::text;
  else
    v_quote_id := v_meta->>'quote_id';
  end if;

  -- Validate quote if provided
  if v_quote_id is not null then
    select project_id, top_up_amount_minor into v_project_id, v_quote_amount
    from payment_quotes
    where id = v_quote_id::uuid and status = 'pending' and expires_at > now();
  end if;

  -- 3. Atomic New Project Creation (if brand new project top-up)
  if v_project_id is null or not exists (select 1 from projects where id = v_project_id) then
    select id into v_category_id from categories 
    where lower(name) = lower(coalesce(v_meta->>'category', 'Tech')) limit 1;

    if v_category_id is null then
      select id into v_category_id from categories order by display_order asc limit 1;
    end if;

    insert into projects (
      user_id,
      title,
      handle,
      destination_url,
      image_path,
      category_id,
      current_active_value_minor,
      total_paid_minor,
      ranking_sequence,
      is_active,
      moderation_status
    ) values (
      case when v_meta->>'user_id' is not null then (v_meta->>'user_id')::uuid else null end,
      coalesce(v_meta->>'title', 'Anonymous Challenger'),
      coalesce(v_meta->>'handle', '@challenger'),
      coalesce(v_meta->>'link_url', 'https://bumpone.lol'),
      coalesce(v_meta->>'image_url', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80'),
      v_category_id,
      0,
      0,
      0,
      true,
      'approved'
    ) returning id, title, handle into v_project_id, v_title, v_handle;
  else
    select current_active_value_minor, current_rank, category_id, title, handle
    into v_old_value_minor, v_old_rank, v_category_id, v_title, v_handle
    from projects 
    where id = v_project_id;
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
  where id = v_project_id;

  -- 6. Atomically recalculate all board positions 1..100 based on:
  -- ORDER BY current_active_value_minor DESC, ranking_sequence ASC
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
  where id = v_project_id;

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
    v_project_id, user_id, 'dodo',
    case when v_quote_id is not null then v_quote_id::uuid else null end,
    p_payment_id, p_amount_minor, 'USD', v_old_value_minor, v_new_value_minor,
    v_old_rank, least(v_new_rank, 100), 'paid'::payment_status
  from projects where id = v_project_id
  returning id into v_payment_id;

  -- Mark quote as paid if quote existed
  if v_quote_id is not null then
    update payment_quotes set status = 'paid' where id = v_quote_id::uuid;
  end if;

  -- 9. Record board displacement in immutable audit journal
  insert into board_events (
    event_sequence, payment_id, project_id, project_title_snapshot, project_handle_snapshot,
    previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
    category_id, profiles_displaced, event_type
  ) values (
    v_seq, v_payment_id, v_project_id, v_title, v_handle,
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
    'project_id', v_project_id,
    'payment_id', v_payment_id,
    'new_rank', least(v_new_rank, 100),
    'new_active_value_minor', v_new_value_minor,
    'sequence', v_seq,
    'displaced', v_displaced
  );
end;
$$;

revoke execute on function process_dodo_purchase from public, anon, authenticated;
grant execute on function process_dodo_purchase to service_role;

-- ==============================================================================
-- 2. Authoritative Atomic Refund Processing RPC
-- ==============================================================================
create or replace function process_dodo_refund(
  p_event_id text,
  p_payment_id text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment record;
  v_seq bigint;
begin
  -- 1. Idempotency check
  if exists (
    select 1 from payment_webhook_events
    where provider = 'dodo' and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- 2. Lock Board for serial execution
  perform pg_advisory_xact_lock(hashtext('board_ranking_mutation'));

  -- 3. Fetch original payment
  select * into v_payment from payments
  where provider_payment_id = p_payment_id
  for update;

  if not found or v_payment.status = 'refunded' then
    return jsonb_build_object('status', 'ignored', 'message', 'Payment not found or already refunded');
  end if;

  v_seq := nextval('global_event_sequence_seq');

  -- 4. Restore project's previous active value
  update projects
  set current_active_value_minor = v_payment.previous_active_value_minor,
      total_paid_minor = greatest(0, total_paid_minor - v_payment.amount_minor),
      ranking_sequence = v_seq,
      updated_at = now()
  where id = v_payment.project_id;

  -- 5. Mark payment as refunded
  update payments
  set status = 'refunded'::payment_status,
      updated_at = now()
  where id = v_payment.id;

  -- 6. Recalculate board ranks
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

  -- 7. Record rollback board event
  insert into board_events (
    event_sequence, payment_id, project_id,
    previous_rank, new_rank,
    previous_active_value_minor, new_active_value_minor,
    event_type
  ) values (
    v_seq, v_payment.id, v_payment.project_id,
    v_payment.new_rank, coalesce(v_payment.previous_rank, 101),
    v_payment.new_active_value_minor, v_payment.previous_active_value_minor,
    'refund_rollback'::board_event_type
  );

  -- 8. Record webhook idempotency
  insert into payment_webhook_events (
    provider, provider_event_id, payment_id, event_type, payload
  ) values (
    'dodo', p_event_id, p_payment_id, 'refund.succeeded', p_payload
  );

  return jsonb_build_object('status', 'success', 'refunded', true);
end;
$$;

revoke execute on function process_dodo_refund from public, anon, authenticated;
grant execute on function process_dodo_refund to service_role;

-- ==============================================================================
-- 3. Correct Atomic Reaction Recording RPC (Fixed double increment bug)
-- ==============================================================================
create or replace function add_project_reaction(
  p_project_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_new boolean := false;
  v_new_count int := 1;
begin
  -- Validate reaction type enum
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  -- Only proceed if the project exists
  if not exists (select 1 from projects where id = p_project_id) then
    return jsonb_build_object('success', false, 'error', 'Project not found');
  end if;

  -- Insert reaction only if not already reacted by this anonymous identity
  with inserted as (
    insert into reactions (project_id, anonymous_id, reaction_type)
    values (p_project_id, p_anonymous_id, p_reaction_type::reaction_type)
    on conflict (project_id, anonymous_id, reaction_type) do nothing
    returning id
  )
  select exists (select 1 from inserted) into v_is_new;

  -- If conflict occurred (already reacted), do NOT increment counter!
  if not v_is_new then
    select coalesce(count, 0) into v_new_count
    from reaction_counts
    where project_id = p_project_id and reaction_type = p_reaction_type::reaction_type;

    return jsonb_build_object(
      'success', true,
      'reaction', p_reaction_type,
      'count', coalesce(v_new_count, 0),
      'already_reacted', true
    );
  end if;

  -- Row was genuinely inserted: safely upsert counter
  insert into reaction_counts (project_id, reaction_type, count)
  values (p_project_id, p_reaction_type::reaction_type, 1)
  on conflict (project_id, reaction_type)
  do update set count = reaction_counts.count + 1
  returning count into v_new_count;

  return jsonb_build_object(
    'success', true,
    'reaction', p_reaction_type,
    'count', v_new_count,
    'already_reacted', false
  );
end;
$$;

revoke execute on function add_project_reaction from public, anon;
grant execute on function add_project_reaction to authenticated, service_role;

-- ==============================================================================
-- 4. Maintenance / Admin Re-ranking Function
-- ==============================================================================
create or replace function recalculate_board_ranks()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke execute on function recalculate_board_ranks from public, anon, authenticated;
grant execute on function recalculate_board_ranks to service_role;
