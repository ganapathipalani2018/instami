-- Run once in Supabase → SQL Editor to enable real video dates (WebRTC signalling).
create table if not exists public.call_signals (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  sender uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('offer', 'answer', 'ice', 'hangup')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists call_signals_match_idx on public.call_signals (match_id, id);
alter table public.call_signals enable row level security;

drop policy if exists "read signals in own matches" on public.call_signals;
create policy "read signals in own matches" on public.call_signals for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b)));
drop policy if exists "send signals in own matches" on public.call_signals;
create policy "send signals in own matches" on public.call_signals for insert to authenticated
  with check (sender = auth.uid() and exists (select 1 from public.matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b)));
drop policy if exists "delete own signals" on public.call_signals;
create policy "delete own signals" on public.call_signals for delete to authenticated using (sender = auth.uid());
