create table if not exists public.stadiums (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create unique index if not exists stadiums_name_unique
  on public.stadiums (lower(btrim(name)));

alter table public.football_fixtures
  add column if not exists match_time time without time zone,
  add column if not exists stadium_id uuid references public.stadiums(id) on delete set null;

alter table public.stadiums enable row level security;

drop policy if exists stadiums_public_read on public.stadiums;
create policy stadiums_public_read on public.stadiums
for select to anon, authenticated using (true);

drop policy if exists stadiums_admin_insert on public.stadiums;
create policy stadiums_admin_insert on public.stadiums
for insert to authenticated with check ((select public.is_app_admin()));

drop policy if exists stadiums_admin_delete on public.stadiums;
create policy stadiums_admin_delete on public.stadiums
for delete to authenticated using ((select public.is_app_admin()));

revoke all on public.stadiums from anon, authenticated;
grant select on public.stadiums to anon, authenticated;
grant insert, delete on public.stadiums to authenticated;
grant update (match_date, match_time, stadium_id)
  on public.football_fixtures to authenticated;
