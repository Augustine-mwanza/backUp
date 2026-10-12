alter table public.football_fixtures
  add column if not exists admin_done boolean not null default false;

grant update (admin_done) on public.football_fixtures to authenticated;
