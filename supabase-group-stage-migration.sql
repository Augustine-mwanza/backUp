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
    join public.teams as team_two on team_two.id > team_one.id
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

drop trigger if exists create_football_fixtures_after_team_insert on public.teams;
drop trigger if exists sync_group_stage_fixtures_after_team_change on public.teams;
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
