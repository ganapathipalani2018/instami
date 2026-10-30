-- Instami backend schema for Supabase (Postgres + Auth + Storage).
-- Run this in: Supabase dashboard > SQL Editor > New query.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  age int not null check (age >= 18 and age <= 99),
  bio text not null default '' check (char_length(bio) <= 300),
  job text not null default '' check (char_length(job) <= 60),
  city text not null default '',
  interests text[] not null default '{}',
  photos text[] not null default '{}',
  verified boolean not null default false,
  premium_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.swipes (
  swiper uuid not null references public.profiles (id) on delete cascade,
  target uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('like', 'pass', 'super')),
  created_at timestamptz not null default now(),
  primary key (swiper, target),
  check (swiper <> target)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  sender uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_match_idx on public.messages (match_id, created_at);

create table if not exists public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

-- A match is created automatically when two people like each other.
create or replace function public.create_match_on_mutual_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.action in ('like', 'super') and exists (
    select 1 from public.swipes s
    where s.swiper = new.target and s.target = new.swiper and s.action in ('like', 'super')
  ) then
    insert into public.matches (user_a, user_b)
    values (least(new.swiper, new.target), greatest(new.swiper, new.target))
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists swipes_mutual on public.swipes;
create trigger swipes_mutual after insert or update on public.swipes
  for each row execute function public.create_match_on_mutual_like();

-- Row level security: everything is locked down by default.
alter table public.profiles enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;

create policy "profiles readable by signed-in users" on public.profiles for select to authenticated
  using (not exists (select 1 from public.blocks b where (b.blocker = id and b.blocked = auth.uid()) or (b.blocker = auth.uid() and b.blocked = id)));
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "delete own profile" on public.profiles for delete to authenticated using (id = auth.uid());

create policy "see own swipes" on public.swipes for select to authenticated using (swiper = auth.uid());
create policy "make own swipes" on public.swipes for insert to authenticated with check (swiper = auth.uid());
create policy "change own swipes" on public.swipes for update to authenticated using (swiper = auth.uid()) with check (swiper = auth.uid());

create policy "see own matches" on public.matches for select to authenticated using (auth.uid() in (user_a, user_b));

create policy "read messages in own matches" on public.messages for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b)));
create policy "send messages in own matches" on public.messages for insert to authenticated
  with check (sender = auth.uid() and exists (select 1 from public.matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b)));

create policy "manage own blocks" on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

-- Photo storage: public read, each user writes only inside their own folder (<user id>/file).
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict do nothing;
create policy "photos are public" on storage.objects for select using (bucket_id = 'photos');
create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- premium_until and verified must only be set by a trusted server (e.g. a payment webhook using the service role).
revoke update (premium_until, verified) on public.profiles from authenticated;
revoke insert (premium_until, verified) on public.profiles from authenticated;
