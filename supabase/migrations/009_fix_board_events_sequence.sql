-- Fix missing sequence referenced in process_dodo_purchase RPC
create sequence if not exists board_events_event_sequence_seq start 1000;
