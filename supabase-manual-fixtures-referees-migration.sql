create table if not exists public.referees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create unique index if not exists referees_name_unique
  on public.referees (lower(btrim(name)));

alter table public.football_fixtures
  add column if not exists referee_id uuid references public.referees(id) on delete set null,
  add column if not exists match_round integer not null default 1 check (match_round >= 1);

alter table public.referees enable row level security;

alter table public.football_fixtures
  drop constraint if exists football_fixtures_unique_pair;

drop index if exists public.football_fixtures_group_pair_unique;
drop index if exists public.football_fixtures_group_pair_round_unique;
create unique index football_fixtures_group_pair_round_unique
  on public.football_fixtures (
    gender,
    upper(btrim(group_name)),
    least(home_team_id, away_team_id),
    greatest(home_team_id, away_team_id),
    match_round
  );

create or replace function public.validate_football_fixture_teams()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.teams as home_team
    join public.teams as away_team on away_team.id = new.away_team_id
    where home_team.id = new.home_team_id
      and home_team.activity = 'Football'
      and away_team.activity = 'Football'
      and home_team.gender = new.gender
      and away_team.gender = new.gender
      and upper(btrim(home_team.group_name)) = upper(btrim(new.group_name))
      and upper(btrim(away_team.group_name)) = upper(btrim(new.group_name))
  ) then
    raise exception 'Fixture teams must be football teams in the fixture group and gender';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_football_fixture_teams on public.football_fixtures;
create trigger validate_football_fixture_teams
before insert or update of gender, group_name, home_team_id, away_team_id on public.football_fixtures
for each row execute function public.validate_football_fixture_teams();

create or replace function public.protect_played_fixture_assignments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.match_status = 'played'
      and (new.home_team_id is distinct from old.home_team_id
        or new.away_team_id is distinct from old.away_team_id) then
    raise exception 'Played fixture teams cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_played_fixture_assignments on public.football_fixtures;
create trigger protect_played_fixture_assignments
before update of home_team_id, away_team_id, referee_id on public.football_fixtures
for each row execute function public.protect_played_fixture_assignments();

create or replace function public.sync_group_stage_fixtures_for_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_gender text;
  target_group text;
begin
  if new.activity = 'Football' and length(btrim(new.group_name)) > 0 then
    target_gender := new.gender;
    target_group := upper(btrim(new.group_name));
    perform pg_advisory_xact_lock(hashtextextended(target_gender || '|' || target_group, 0));

    delete from public.football_fixtures
    where (home_team_id = new.id or away_team_id = new.id)
      and not (gender = target_gender and upper(btrim(group_name)) = target_group);
  else
    delete from public.football_fixtures
    where home_team_id = new.id or away_team_id = new.id;
  end if;

  return new;
end;
$$;

drop policy if exists referees_public_read on public.referees;
create policy referees_public_read on public.referees
for select to anon, authenticated using (true);

drop policy if exists referees_admin_insert on public.referees;
create policy referees_admin_insert on public.referees
for insert to authenticated with check ((select public.is_app_admin()));

drop policy if exists referees_admin_delete on public.referees;
create policy referees_admin_delete on public.referees
for delete to authenticated using ((select public.is_app_admin()));

drop policy if exists fixtures_admin_insert on public.football_fixtures;
create policy fixtures_admin_insert on public.football_fixtures
for insert to authenticated with check ((select public.is_app_admin()));

revoke all on public.referees from anon, authenticated;
grant select on public.referees to anon, authenticated;
grant insert, delete on public.referees to authenticated;
grant insert, delete on public.football_fixtures to authenticated;
grant update (referee_id) on public.football_fixtures to authenticated;
