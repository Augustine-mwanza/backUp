create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  activity text not null check (activity in (
    'Football', 'Rugby', 'Handball', 'Softball', 'Hockey',
    'Drama', 'Volleyball', 'Music', 'AmericanBall'
  )),
  team_name text not null check (length(btrim(team_name)) between 1 and 120),
  gender text check (gender is null or gender in ('Men', 'Women')),
  coach text not null default '' check (length(coach) <= 120),
  group_name text not null default '' check (length(group_name) <= 80),
  created_at timestamptz not null default now()
);

create table if not exists public.registration_participants (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object')
);

create table if not exists public.football_fixtures (
  id uuid primary key default gen_random_uuid(),
  gender text not null check (gender in ('Men', 'Women')),
  group_name text not null,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  match_date text not null default '',
  created_at timestamptz not null default now(),
  constraint football_fixtures_distinct_teams check (home_team_id <> away_team_id),
  constraint football_fixtures_unique_pair unique (gender, group_name, home_team_id, away_team_id)
);

alter table public.football_fixtures
  add column if not exists match_status text not null default 'scheduled'
    check (match_status in ('scheduled', 'postponed', 'played')),
  add column if not exists home_score integer check (home_score is null or home_score >= 0),
  add column if not exists away_score integer check (away_score is null or away_score >= 0),
  add column if not exists scorers jsonb not null default '{"home":[],"away":[]}'::jsonb
    check (jsonb_typeof(scorers) = 'object'),
  add column if not exists assists jsonb not null default '{"home":[],"away":[]}'::jsonb
    check (jsonb_typeof(assists) = 'object');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'football_fixtures_played_has_score'
      and conrelid = 'public.football_fixtures'::regclass
  ) then
    alter table public.football_fixtures add constraint football_fixtures_played_has_score
      check (match_status <> 'played' or (home_score is not null and away_score is not null));
  end if;
end;
$$;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.teams enable row level security;
alter table public.registration_participants enable row level security;
alter table public.football_fixtures enable row level security;
alter table public.app_admins enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;

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

    insert into public.football_fixtures
      (gender, group_name, home_team_id, away_team_id)
    select team_one.gender,
           upper(btrim(team_one.group_name)),
           team_one.id,
           team_two.id
    from public.teams as team_one
    join public.teams as team_two
      on team_two.id > team_one.id
    where team_one.activity = 'Football'
      and team_two.activity = 'Football'
      and team_one.gender = target_gender
      and team_two.gender = target_gender
      and upper(btrim(team_one.group_name)) = target_group
      and upper(btrim(team_two.group_name)) = target_group
      and not exists (
        select 1
        from public.football_fixtures as existing
        where (existing.home_team_id = team_one.id and existing.away_team_id = team_two.id)
           or (existing.home_team_id = team_two.id and existing.away_team_id = team_one.id)
      )
    on conflict (gender, group_name, home_team_id, away_team_id) do nothing;
  else
    delete from public.football_fixtures
    where home_team_id = new.id or away_team_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_group_stage_fixtures_after_team_change on public.teams;
drop trigger if exists create_football_fixtures_after_team_insert on public.teams;
create trigger sync_group_stage_fixtures_after_team_change
after insert or update of activity, gender, group_name on public.teams
for each row execute function public.sync_group_stage_fixtures_for_team();

insert into public.football_fixtures
  (gender, group_name, home_team_id, away_team_id)
select team_one.gender,
       upper(btrim(team_one.group_name)),
       team_one.id,
       team_two.id
from public.teams as team_one
join public.teams as team_two on team_two.id > team_one.id
where team_one.activity = 'Football'
  and team_two.activity = 'Football'
  and team_one.gender = team_two.gender
  and upper(btrim(team_one.group_name)) = upper(btrim(team_two.group_name))
  and length(btrim(team_one.group_name)) > 0
  and not exists (
    select 1
    from public.football_fixtures as existing
    where (existing.home_team_id = team_one.id and existing.away_team_id = team_two.id)
       or (existing.home_team_id = team_two.id and existing.away_team_id = team_one.id)
  )
on conflict (gender, group_name, home_team_id, away_team_id) do nothing;

create or replace function public.register_team(
  p_activity text,
  p_team_name text,
  p_gender text,
  p_coach text default '',
  p_group_name text default '',
  p_participants jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_team_id uuid;
  participant jsonb;
begin
  if p_activity not in (
    'Football', 'Rugby', 'Handball', 'Softball', 'Hockey',
    'Drama', 'Volleyball', 'Music', 'AmericanBall'
  ) then
    raise exception 'Invalid activity';
  end if;
  if p_team_name is null or length(btrim(p_team_name)) not between 1 and 120 then
    raise exception 'Team or activity name must be between 1 and 120 characters';
  end if;
  if p_gender is not null and p_gender not in ('Men', 'Women') then
    raise exception 'Invalid team gender';
  end if;
  if p_activity = 'Football' and p_gender is null then
    raise exception 'Football teams must choose a gender';
  end if;
  if jsonb_typeof(coalesce(p_participants, '[]'::jsonb)) <> 'array' then
    raise exception 'Participants must be a JSON array';
  end if;
  if jsonb_array_length(coalesce(p_participants, '[]'::jsonb)) > 200 then
    raise exception 'A registration cannot contain more than 200 participants';
  end if;

  insert into public.teams (activity, team_name, gender, coach, group_name)
  values (
    p_activity,
    btrim(p_team_name),
    p_gender,
    left(btrim(coalesce(p_coach, '')), 120),
    left(btrim(coalesce(p_group_name, '')), 80)
  )
  returning id into new_team_id;

  for participant in
    select value from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb))
  loop
    if jsonb_typeof(participant) <> 'object' then
      raise exception 'Each participant must be an object';
    end if;
    if pg_column_size(participant) > 8192 then
      raise exception 'Participant details are too large';
    end if;
    insert into public.registration_participants (team_id, details)
    values (new_team_id, participant);
  end loop;

  return new_team_id;
end;
$$;

revoke all on function public.register_team(text, text, text, text, text, jsonb) from public;
grant execute on function public.register_team(text, text, text, text, text, jsonb) to anon, authenticated;

drop policy if exists teams_public_read on public.teams;
create policy teams_public_read on public.teams
for select to anon, authenticated using (true);

drop policy if exists teams_admin_delete on public.teams;
create policy teams_admin_delete on public.teams
for delete to authenticated using ((select public.is_app_admin()));

drop policy if exists participants_admin_read on public.registration_participants;
create policy participants_admin_read on public.registration_participants
for select to authenticated using ((select public.is_app_admin()));

drop policy if exists fixtures_public_read on public.football_fixtures;
create policy fixtures_public_read on public.football_fixtures
for select to anon, authenticated using (true);

drop policy if exists fixtures_admin_update on public.football_fixtures;
create policy fixtures_admin_update on public.football_fixtures
for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists fixtures_admin_delete on public.football_fixtures;
create policy fixtures_admin_delete on public.football_fixtures
for delete to authenticated using ((select public.is_app_admin()));

revoke all on public.teams, public.registration_participants,
  public.football_fixtures, public.app_admins from anon, authenticated;
grant select on public.teams, public.football_fixtures to anon, authenticated;
grant delete on public.teams to authenticated;
grant select on public.registration_participants to authenticated;
grant update (match_date, match_status, home_score, away_score, scorers, assists) on public.football_fixtures to authenticated;
grant delete on public.football_fixtures to authenticated;
revoke all on public.app_admins from anon, authenticated;

do $$
declare
  fixture_row record;
  side_row record;
  normalized_scorers jsonb;
  normalized_entries jsonb;
begin
  for fixture_row in
    select fixture.id, fixture.home_team_id, fixture.away_team_id, fixture.scorers
    from public.football_fixtures as fixture
    where exists (
      select 1
      from jsonb_array_elements(coalesce(fixture.scorers -> 'home', '[]'::jsonb)) as scorer(value)
      where jsonb_typeof(scorer.value) = 'string'
    ) or exists (
      select 1
      from jsonb_array_elements(coalesce(fixture.scorers -> 'away', '[]'::jsonb)) as scorer(value)
      where jsonb_typeof(scorer.value) = 'string'
    )
  loop
    normalized_scorers := coalesce(fixture_row.scorers, '{"home":[],"away":[]}'::jsonb);

    for side_row in
      select 'home'::text as side, fixture_row.home_team_id as team_id
      union all
      select 'away'::text as side, fixture_row.away_team_id as team_id
    loop
      select coalesce(jsonb_agg(merged.entry order by merged.position), '[]'::jsonb)
      into normalized_entries
      from (
        select scorer.value as entry, scorer.ordinality as position
        from jsonb_array_elements(coalesce(normalized_scorers -> side_row.side, '[]'::jsonb))
          with ordinality as scorer(value, ordinality)
        where jsonb_typeof(scorer.value) = 'object'

        union all

        select jsonb_build_object(
          'participant_id', roster.id::text,
          'team_id', roster.team_id::text,
          'player', roster.player_name,
          'goals', legacy.goals,
          'own_goal', false
        ), legacy.first_position
        from (
          select lower(btrim(scorer.value #>> '{}')) as player_key,
            count(*)::integer as goals,
            min(scorer.ordinality) as first_position
          from jsonb_array_elements(coalesce(normalized_scorers -> side_row.side, '[]'::jsonb))
            with ordinality as scorer(value, ordinality)
          where jsonb_typeof(scorer.value) = 'string'
            and length(btrim(scorer.value #>> '{}')) > 0
          group by lower(btrim(scorer.value #>> '{}'))
        ) as legacy
        join (
          select min(participant.id) as id,
            participant.team_id,
            min(btrim(participant.details ->> 'Player Name')) as player_name,
            lower(btrim(participant.details ->> 'Player Name')) as player_key
          from public.registration_participants as participant
          where participant.team_id = side_row.team_id
            and length(btrim(coalesce(participant.details ->> 'Player Name', ''))) > 0
          group by participant.team_id, lower(btrim(participant.details ->> 'Player Name'))
          having count(*) = 1
        ) as roster on roster.player_key = legacy.player_key
      ) as merged;

      normalized_scorers := jsonb_set(
        normalized_scorers,
        array[side_row.side],
        normalized_entries,
        true
      );
    end loop;

    update public.football_fixtures
    set scorers = normalized_scorers
    where id = fixture_row.id;
  end loop;
end;
$$;
