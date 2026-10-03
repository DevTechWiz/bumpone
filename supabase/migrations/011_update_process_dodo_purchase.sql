-- 011_update_process_dodo_purchase.sql
-- Updates process_dodo_purchase with accurate payments table schema and collision-free ranking recalculation

create sequence if not exists global_event_sequence_seq start 1000;
create sequence if not exists board_events_event_sequence_seq start 1000;

create or replace function process_dodo_purchase(
  p_event_id text,
  p_payment_id text,
  p_amount_minor bigint,
  p_payload jsonb,
  p_project_id uuid default null,
  p_quote_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_id text;
  v_quote_amount bigint;
  v_project_id uuid := p_project_id;
  v_user_id uuid;
  v_old_value_minor bigint := 0;
  v_new_value_minor bigint;
  v_new_rank int;
  v_old_rank int;
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
    select 1 from payment_events 
    where provider in ('dodo', 'razorpay') and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- 2. Lock Board for serial execution
  perform pg_advisory_xact_lock(733100, 1);

  v_meta := coalesce(p_payload->'metadata', '{}'::jsonb);
  
  if p_quote_id is not null then
    v_quote_id := p_quote_id::text;
  else
    v_quote_id := v_meta->>'quote_id';
  end if;

  -- Validate quote if provided
  if v_quote_id is not null then
    select project_id, quoted_amount_minor into v_project_id, v_quote_amount
    from purchase_quotes
    where id = v_quote_id::uuid and status = 'checkout_open' and expires_at > now();

    if not found then
      return jsonb_build_object('status', 'error', 'message', 'Quote expired, cancelled, or not found');
    end if;

    if p_amount_minor <> v_quote_amount then
      return jsonb_build_object('status', 'error', 'message', 'Payment amount does not match authorized quote');
    end if;

    -- Mark quote as consumed/paid
    update purchase_quotes
    set status = 'paid', paid_at = now()
    where id = v_quote_id::uuid;
  end if;

  if v_project_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Missing project_id');
  end if;

  -- 3. Lock & read current project state
  select
    user_id, current_active_value_minor, current_rank, category_id, title, handle, moderation_status
  into
    v_user_id, v_old_value_minor, v_old_rank, v_category_id, v_title, v_handle
  from projects
  where id = v_project_id
  for update;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Target project not found');
  end if;

  -- Safeguard: reject payment processing if project was administratively suspended or rejected
  if exists (
    select 1 from projects 
    where id = v_project_id and moderation_status in ('suspended', 'rejected')
  ) then
    return jsonb_build_object('status', 'error', 'message', 'Cannot process takeover for suspended or rejected project');
  end if;

  -- 4. Calculate new values
  v_new_value_minor := v_old_value_minor + p_amount_minor;
  v_seq := nextval('global_event_sequence_seq');

  -- Record pre-recalculation ranks for displacement tracking
  create temp table _pre_recalc_ranks on commit drop as
  select id, current_rank, title, handle, current_active_value_minor, category_id
  from projects
  where is_active = true and moderation_status = 'approved' and current_rank is not null;

  -- 5. Update buyer's project record (do NOT set rank yet to avoid unique constraint collisions)
  update projects
  set
    current_active_value_minor = v_new_value_minor,
    total_paid_minor = total_paid_minor + p_amount_minor,
    ranking_sequence = v_seq,
    is_active = true,
    moderation_status = 'approved',
    updated_at = now()
  where id = v_project_id;

  -- 6. Atomically recalculate all active ranks 1..100
  -- First reset current_rank to null so no collision occurs on unique index idx_projects_active_rank
  update projects
  set current_rank = null
  where is_active = true and current_rank is not null;

  with ranked as (
    select
      id,
      row_number() over (
        order by current_active_value_minor desc, ranking_sequence asc
      ) as calculated_rank
    from projects
    where is_active = true and moderation_status = 'approved'
  )
  update projects p
  set
    current_rank = r.calculated_rank,
    updated_at = now()
  from ranked r
  where p.id = r.id and r.calculated_rank <= 100;

  -- Query buyer's newly assigned rank
  select current_rank into v_new_rank
  from projects
  where id = v_project_id;

  if v_new_rank is null then
    v_new_rank := 101;
  end if;

  -- Count displaced projects (projects whose rank worsened/increased)
  select count(*) into v_displaced
  from projects p
  join _pre_recalc_ranks pr on pr.id = p.id
  where p.id <> v_project_id
    and (p.current_rank > pr.current_rank or (p.current_rank is null and pr.current_rank is not null));

  -- 7. Insert financial audit record
  insert into payments (
    project_id, user_id, quote_id, provider,
    provider_payment_id, amount_minor, currency,
    previous_active_value_minor, new_active_value_minor,
    previous_rank, new_rank, status
  ) values (
    v_project_id, v_user_id, case when v_quote_id is not null then v_quote_id::uuid else null end,
    coalesce(p_payload->>'gateway', 'razorpay'),
    p_payment_id, p_amount_minor, 'USD',
    v_old_value_minor, v_new_value_minor,
    v_old_rank, least(v_new_rank, 100),
    'paid'::payment_status
  ) returning id into v_payment_id;

  -- 8. Insert board displacement event journal
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

  -- 9. Check if any project was displaced completely past #100 into the Graveyard
  insert into board_events (
    event_sequence, payment_id, project_id, project_title_snapshot, project_handle_snapshot,
    previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
    category_id, profiles_displaced, event_type
  )
  select
    nextval('global_event_sequence_seq'),
    v_payment_id,
    pr.id,
    pr.title,
    pr.handle,
    pr.current_rank,
    101, -- Graveyard rank indicator
    pr.current_active_value_minor,
    pr.current_active_value_minor,
    pr.category_id,
    1,
    'left_top_100'::board_event_type
  from _pre_recalc_ranks pr
  join projects p on p.id = pr.id
  where (p.current_rank is null or p.current_rank > 100)
    and pr.id <> v_project_id;

  -- 10. Record webhook event for multi-tier idempotency in payment_events
  insert into payment_events (
    provider, provider_event_id, payment_id, event_type, payload
  ) values (
    coalesce(p_payload->>'gateway', 'razorpay'), p_event_id, p_payment_id, 'payment.succeeded', p_payload
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
