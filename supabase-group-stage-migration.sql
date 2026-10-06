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

drop trigger if exists create_football_fixtures_after_team_insert on public.teams;
drop trigger if exists sync_group_stage_fixtures_after_team_change on public.teams;
create trigger sync_group_stage_fixtures_after_team_change
after insert or update of activity, gender, group_name on public.teams
for each row execute function public.sync_group_stage_fixtures_for_team();
