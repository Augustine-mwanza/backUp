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

grant update (match_date, match_time, stadium_id, referee_id)
  on public.football_fixtures to authenticated;
