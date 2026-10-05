alter table public.football_fixtures
  add column if not exists match_time text not null default '',
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

grant update (match_date, match_time, match_status, home_score, away_score, scorers, assists)
  on public.football_fixtures to authenticated;
