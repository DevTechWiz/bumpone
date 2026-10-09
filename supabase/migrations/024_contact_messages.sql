-- Migration 024: Create contact_messages table for Support Desk

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 100),
  email text not null check (char_length(email) <= 255),
  subject text not null check (char_length(subject) <= 200),
  message text not null check (char_length(message) <= 4000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  admin_notes text check (char_length(admin_notes) <= 4000),
  replies jsonb not null default '[]'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices for rapid querying in Admin Desk
create index if not exists idx_contact_messages_status on public.contact_messages(status);
create index if not exists idx_contact_messages_created_at on public.contact_messages(created_at desc);

-- Row Level Security
alter table public.contact_messages enable row level security;

-- Clean up any existing policies
drop policy if exists "Enable insert for everyone" on public.contact_messages;
drop policy if exists "Enable all for service role" on public.contact_messages;

-- Allow insert by public/anon API
create policy "Enable insert for everyone"
  on public.contact_messages
  for insert
  with check (true);

-- Allow full access for service_role
create policy "Enable all for service role"
  on public.contact_messages
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
