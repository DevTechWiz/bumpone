-- 012_align_event_sequences.sql
-- Advances global_event_sequence_seq and board_events_event_sequence_seq past existing seed records

do $$
declare
  v_max bigint;
begin
  select coalesce(max(event_sequence), 1000) into v_max from board_events;
  perform setval('global_event_sequence_seq', v_max + 100);
  perform setval('board_events_event_sequence_seq', v_max + 100);
end $$;
