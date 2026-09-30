-- Production hardening: canonical names are projects/payments/board_events.
-- This migration supersedes the permissive MVP policies and RPCs.

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('moderator', 'admin')),
  created_at timestamptz not null default now()
);

do $$ begin
  create type purchase_quote_status as enum ('checkout_open', 'paid', 'expired', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  target_rank int not null check (target_rank between 1 and 100),
  quoted_amount_minor bigint not null check (quoted_amount_minor >= 1000 and quoted_amount_minor % 100 = 0),
  expected_rank int not null check (expected_rank between 1 and 101),
  expires_at timestamptz not null,
  status purchase_quote_status not null default 'checkout_open',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists idx_purchase_quotes_project_status on purchase_quotes(project_id, status);

alter table admin_users enable row level security;
alter table purchase_quotes enable row level security;

drop policy if exists "Users can update their own project metadata" on projects;
drop policy if exists "Anyone can add reactions" on reactions;
drop policy if exists "Anyone can submit a moderation report" on reports;
drop policy if exists "Anyone can post war room messages" on messages;

-- Column privileges are required in addition to RLS; owners cannot alter financial or moderation fields.
revoke insert, update, delete on projects, payments, payment_webhook_events, board_events,
  reactions, reaction_counts, reports, admin_audit_log, system_state, purchase_quotes, admin_users
  from anon, authenticated;
revoke update on projects from authenticated;
grant update (title, handle, image_path, destination_url, category_id) on projects to authenticated;

-- Sensitive SECURITY DEFINER functions are callable only by the server service role.
revoke all on function process_dodo_purchase(text, text, uuid, bigint, jsonb) from public;
revoke all on function add_project_reaction(uuid, text, text) from public;
revoke all on function add_profile_reaction(uuid, text, text) from public;
revoke all on function recalculate_board_ranks() from public;

drop function if exists process_dodo_purchase(text, text, uuid, bigint, jsonb);
create or replace function process_dodo_purchase(
  p_event_id text,
  p_payment_id text,
  p_quote_id uuid,
  p_amount_minor bigint,
  p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_project_id uuid; v_user_id uuid; v_quote_amount bigint; v_old_value bigint;
  v_new_value bigint; v_old_rank int; v_new_rank int; v_seq bigint; v_payment uuid;
  v_category_id uuid; v_title text; v_handle text; v_displaced int := 0;
begin
  if p_event_id is null or p_payment_id is null or p_amount_minor < 1000 or p_amount_minor % 100 <> 0 then
    raise exception 'invalid payment event';
  end if;
  perform pg_advisory_xact_lock(hashtext('board_ranking_mutation'));
  if exists (select 1 from payment_webhook_events where provider = 'dodo' and provider_event_id = p_event_id)
     or exists (select 1 from payments where provider = 'dodo' and provider_payment_id = p_payment_id) then
    return jsonb_build_object('status', 'already_processed');
  end if;
  select project_id, user_id, quoted_amount_minor into v_project_id, v_user_id, v_quote_amount
  from purchase_quotes where id = p_quote_id and status = 'checkout_open' for update;
  if not found or v_quote_amount <> p_amount_minor then raise exception 'invalid or already consumed quote'; end if;
  select current_active_value_minor, current_rank, category_id, title, handle
    into v_old_value, v_old_rank, v_category_id, v_title, v_handle from projects where id = v_project_id for update;
  if not found then raise exception 'project not found'; end if;
  v_old_value := coalesce(v_old_value, 0); v_new_value := v_old_value + p_amount_minor;
  v_seq := nextval('global_event_sequence_seq');
  update projects set current_active_value_minor = v_new_value, total_paid_minor = total_paid_minor + p_amount_minor,
    ranking_sequence = v_seq, is_active = true, moderation_status = 'approved' where id = v_project_id;
  update projects set current_rank = null where is_active and current_rank is not null;
  with ranked as (select id, row_number() over (order by current_active_value_minor desc, ranking_sequence asc) as rank_pos
                  from projects where is_active and moderation_status = 'approved')
  update projects p set current_rank = r.rank_pos from ranked r where p.id = r.id and r.rank_pos <= 100;
  select current_rank into v_new_rank from projects where id = v_project_id;
  if v_new_rank is null then v_new_rank := 101; end if;
  v_displaced := case when coalesce(v_old_rank, 101) > v_new_rank then coalesce(v_old_rank, 101) - v_new_rank else 0 end;
  insert into payments (project_id, user_id, provider, quote_id, provider_payment_id, amount_minor, currency,
    previous_active_value_minor, new_active_value_minor, previous_rank, new_rank, status)
  values (v_project_id, v_user_id, 'dodo', p_quote_id::text, p_payment_id, p_amount_minor, 'USD',
    v_old_value, v_new_value, v_old_rank, least(v_new_rank, 100), 'paid') returning id into v_payment;
  insert into board_events (event_sequence, payment_id, project_id, project_title_snapshot, project_handle_snapshot,
    previous_rank, new_rank, previous_active_value_minor, new_active_value_minor, category_id, profiles_displaced, event_type)
  values (v_seq, v_payment, v_project_id, v_title, v_handle, v_old_rank, least(v_new_rank,100), v_old_value,
    v_new_value, v_category_id, v_displaced, case when v_old_rank is null then 'inserted' else 'bumped' end);
  insert into payment_webhook_events(provider, provider_event_id, payment_id, event_type, payload)
    values ('dodo', p_event_id, p_payment_id, 'payment.succeeded', p_payload);
  update purchase_quotes set status = 'paid', paid_at = now() where id = p_quote_id;
  return jsonb_build_object('status','success','payment_id',v_payment,'new_rank',least(v_new_rank,100),'sequence',v_seq);
end;
$$;

create or replace function add_project_reaction(p_project_id uuid, p_anonymous_id text, p_reaction_type text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_inserted uuid; v_count int;
begin
  if p_anonymous_id is null or length(p_anonymous_id) > 128 or p_reaction_type not in ('fire','eyes','heart','laugh') then
    raise exception 'invalid reaction';
  end if;
  insert into reactions(project_id, anonymous_id, reaction_type) values (p_project_id,p_anonymous_id,p_reaction_type::reaction_type)
    on conflict do nothing returning id into v_inserted;
  if v_inserted is not null then
    insert into reaction_counts(project_id,reaction_type,count) values (p_project_id,p_reaction_type::reaction_type,1)
      on conflict(project_id,reaction_type) do update set count = reaction_counts.count + 1 returning count into v_count;
  else
    select count into v_count from reaction_counts where project_id=p_project_id and reaction_type=p_reaction_type::reaction_type;
  end if;
  return jsonb_build_object('success',true,'reaction',p_reaction_type,'count',coalesce(v_count,0));
end;
$$;

create or replace function recalculate_board_ranks() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('board_ranking_mutation'));
  update projects set current_rank = null where current_rank is not null;
  with ranked as (select id, row_number() over(order by current_active_value_minor desc, ranking_sequence asc) rank_pos
    from projects where is_active and moderation_status='approved')
  update projects p set current_rank=r.rank_pos from ranked r where p.id=r.id and r.rank_pos<=100;
end;
$$;

grant execute on function process_dodo_purchase(text,text,uuid,bigint,jsonb) to service_role;
grant execute on function add_project_reaction(uuid,text,text) to service_role;
grant execute on function recalculate_board_ranks() to service_role;
