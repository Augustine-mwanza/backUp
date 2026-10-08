# Copilot instructions for this repository

## Project overview

This repo is a static web application for the DeKUT Comrades sports and activities platform. The public site (`index.html`) renders shared registrations, football standings, fixture lists, and goalscorer/assist rankings from Supabase. The admin site (`admin.html` + `admin.js`) authenticates an admin user and lets them manage teams, participants, fixtures, stadiums, referees, and results.

The system is intentionally split between:

- `index.html` and `app.js`: public-facing website UI and data rendering
- `admin.html` and `admin.js`: authenticated admin dashboard and management workflows
- `supabase-config.js`: runtime Supabase URL and published anon key
- `supabase-*.sql` files: database schema, policies, migrations, and fixture/standings logic
- `styles.css`: shared visual styling for both public and admin views

## Setup and verification

No build toolchain, package manifest, or test runner is committed in this repo. There is no `package.json`, no `pytest`, no Jest/Vitest, and no lint configuration to run.

Use the repo as a static site and validate in a browser via a local web server, for example:

```bash
cd "C:\Users\PC\OneDrive\Desktop\backUp (2)"
python -m http.server 8000
```

Then open:

- `http://localhost:8000/` for the public website
- `http://localhost:8000/admin.html` for the admin dashboard

There is no single automated test command to run for this project. When verifying a change, check the exact UI path affected by the edit (for example public standings, team registration, or admin fixture controls) in a browser.

## Supabase and database workflow

This project depends on a Supabase project and SQL migrations. The README is the source of truth for setup:

1. Create a Supabase project.
2. Run the schema and migrations in order from the root SQL files.
3. Put the project URL and the publishable/anon key into `supabase-config.js`.
4. Create the admin account(s) in Supabase Authentication.
5. Add the admin user ID to `public.app_admins` using SQL.

Key repo-specific rules from the README:

- Never put a service-role key in website files.
- Admins must be explicitly added to `app_admins`; a normal authenticated user is not an admin.
- RLS policies protect participant data and restrict fixture changes/deletions to admins.
- Football group names normalize an optional `Group ` prefix, so `A` and `Group A` should be treated as the same group.
- Match fixtures and standings are tied to group, gender, schedule date, and match status in the database; do not bypass the enforced validation by making client-only changes.

Use the existing SQL migration ordering and naming conventions rather than inventing a one-off database setup.

## Architecture notes that matter for edits

### Public website (`index.html` + `app.js`)

`app.js` keeps a client-side `state` object (`teams`, `fixtures`, `stadiums`, `referees`, etc.) and renders derived data such as:

- football standings by gender and group
- fixtures by group and round
- goalscorer and assist rankings from played matches
- activity registration UI for sports and cultural activities

The public page relies on `window.supabase.createClient` and many `supabaseClient.from('...').select(...)` calls. Most data transformations are done in the browser, especially for standings and rankings. Preserve the existing normalization helpers like `normalizeGroupName()` and the ranking logic when changing fixture or group behavior.

### Admin site (`admin.html` + `admin.js`)

The admin dashboard is a single-page interface that:

- authenticates using Supabase Auth
- verifies that the signed-in account is an app admin
- loads teams, participants, fixtures, stadiums, and referees
- renders editable tables for team and fixture management
- supports generating round-robin and knockout football fixtures
- saves match dates, times, venues, referees, scores, goalscorers, and assists

This means admin logic is heavily form-driven and stateful. If you change the data schema or a fixture shape, update the matching selectors and renderers in `admin.js` as a unit.

### Database and migrations

The repository includes a number of SQL migration files rather than generated schema snapshots. Several are intentionally ordered and cumulative because they add behaviors such as:

- admin edit permissions
- referee support
- scheduling and stadium support
- played-fixture schedule edits
- match results and scorer/assist tracking
- group-stage fixture generation
- group-name normalization

When changing DB-related behavior, prefer updating or adding the appropriate migration file rather than patching only the runtime UI.

## Key conventions specific to this codebase

- Keep the public and admin pages aligned with the database field names already used in the Supabase queries (`team_name`, `group_name`, `match_status`, `home_score`, `away_score`, `scorers`, `assists`, etc.).
- Preserve the existing group normalization pattern: an optional `Group ` prefix and surrounding whitespace should not create separate groups.
- Match and standings logic assumes standard football rules: 3 points for a win, 1 for a draw, 0 for a loss; the top 2 teams in a group qualify.
- Goal/assist validation is tied to registered players and match results. Do not loosen or bypass the existing validation rules without updating the related SQL and UI logic together.
- Keep the admin workflow consistent with the README’s expectations: data changes happen through Supabase and are guarded by Row Level Security; client code is not a substitute for DB policy enforcement.
- Use the same `window.SUPABASE_CONFIG` pattern for project configuration; do not add additional configuration files unless the project explicitly requires them.

## Repository-specific contribution guidance

- Prefer editing the existing static files and SQL migrations in place rather than introducing a framework or build system.
- If a change affects a public page and an admin page, update both together when they share the same underlying data contract.
- For new database functionality, match the repo’s naming conventions and keep migration ordering in mind.
- When debugging data issues, inspect both the browser-side state logic and the corresponding SQL/trigger behavior, because game logic and UI rendering are tightly coupled in this project.

## Minimal local checks

If you change JavaScript or HTML behavior, do a focused browser check on the relevant page section after serving the repo locally. If you change SQL, validate that the schema or migration still matches the README’s sequence and that the public/admin flows still read the expected columns.
