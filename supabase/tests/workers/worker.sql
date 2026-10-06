-- worker.sql
-- Generic concurrent webhook worker. Invoked by run_*.sh inside the container:
--   psql -v ON_ERROR_STOP=1 -v scenario=<s> -v wid=<n> -v start_at=<iso> \
--        -v event_id=<e> -v pay_id=<p> -v amount=<minor> \
--        -v quote_id=<uuid> -v project_id=<uuid> -v user_id=<uuid> \
--        -f /tmp/tests/workers/worker.sql
-- All workers of a scenario share the same start_at barrier so their RPC calls
-- collide inside the idempotency/quote critical sections.
\set ON_ERROR_STOP on

select pg_sleep_until(:'start_at'::timestamptz);

insert into db_test_results (scenario, worker, status)
select
  :'scenario',
  :wid::int,
  coalesce(r ->> 'status', '?') ||
    coalesce(' - ' || (r ->> 'message'), '')
from (
  select public.process_dodo_purchase(
    :'event_id',
    :'pay_id',
    :'amount'::bigint,
    jsonb_build_object(
      'metadata',
      jsonb_build_object(
        'quote_id', :'quote_id',
        'project_id', :'project_id',
        'user_id', :'user_id'
      )
    ),
    null,
    :'quote_id'::uuid
  ) as r
) t;
