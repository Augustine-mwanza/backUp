create or replace function public.normalize_group_name(group_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(btrim(coalesce(group_name, '')), '^group[[:space:]]+', '', 'i'));
$$;

do $$
begin
  if exists (
    select 1
    from public.football_fixtures
    group by gender,
      upper(public.normalize_group_name(group_name)),
      least(home_team_id, away_team_id),
      greatest(home_team_id, away_team_id),
      match_round
    having count(*) > 1
  ) then
    raise exception 'Duplicate fixtures exist for groups that become equivalent after removing the optional "Group " prefix. Resolve the duplicate fixtures, then rerun this migration.';
  end if;
end;
$$;

drop index if exists public.football_fixtures_group_pair_unique;
drop index if exists public.football_fixtures_group_pair_round_unique;
create unique index football_fixtures_group_pair_round_unique
  on public.football_fixtures (
    gender,
    upper(public.normalize_group_name(group_name)),
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
      and upper(public.normalize_group_name(home_team.group_name)) = upper(public.normalize_group_name(new.group_name))
      and upper(public.normalize_group_name(away_team.group_name)) = upper(public.normalize_group_name(new.group_name))
  ) then
    raise exception 'Fixture teams must be football teams in the fixture group and gender';
  end if;
  return new;
end;
$$;

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
    target_group := upper(public.normalize_group_name(new.group_name));
    perform pg_advisory_xact_lock(hashtextextended(target_gender || '|' || target_group, 0));

    delete from public.football_fixtures
    where (home_team_id = new.id or away_team_id = new.id)
      and not (
        gender = target_gender
        and upper(public.normalize_group_name(group_name)) = target_group
      );
  else
    delete from public.football_fixtures
    where home_team_id = new.id or away_team_id = new.id;
  end if;

  return new;
end;
$$;
