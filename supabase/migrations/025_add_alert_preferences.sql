-- 025_add_alert_preferences.sql
-- Adds configurable Billboard Rank Alert preferences to users
-- Default: emailAlerts=true, browserAlerts=false, instantKingAlert=true

alter table public.users
add column if not exists alert_preferences jsonb not null default '{"emailAlerts": true, "browserAlerts": false, "instantKingAlert": true}'::jsonb;

comment on column public.users.alert_preferences is 'User notification preferences for billboard outbids, rank drops, and graveyard alerts';
