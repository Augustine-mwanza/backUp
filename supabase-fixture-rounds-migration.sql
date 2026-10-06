alter table public.football_fixtures
  add column if not exists match_round integer not null default 1 check (match_round >= 1),
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
