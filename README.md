# DeKUT Comrades Website

This static website uses Supabase (PostgreSQL) for shared team registrations and football fixtures. Public visitors can view teams, fixtures, group standings, and goalscorer rankings, and submit new registrations. Participant details are restricted to admins. Admins sign in at `admin.html` to review registrations, remove teams or fixtures, and manage fixture dates and results.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run all of `supabase-schema.sql`.
   For an existing database, run the migrations in this order: `supabase-admin-edit-permissions-migration.sql` so admins can save team and participant edits; `supabase-manual-fixtures-referees-migration.sql` to add referee support; `supabase-match-scheduling-migration.sql` to add stadium and scheduling fields; and `supabase-played-fixture-schedule-edit-migration.sql` to allow schedule edits after a match is played. Also run or rerun `supabase-match-results-migration.sql` to ensure match results, scorers, and assists are enabled, then run `supabase-group-stage-migration.sql` to generate missing round-robin fixtures for existing groups and install the updated fixture trigger. Finally run `supabase-group-name-normalization-migration.sql` so values such as `Group A` and `A` are treated as the same football group.
3. In **Project Settings → API**, copy the Project URL and the **publishable** key (or legacy `anon` key). Put them in `supabase-config.js`. Never put a `service_role` key in website files.
4. In **Authentication → Users**, create the admin account(s). Copy an admin's user UUID, then run this in the SQL Editor:

   ```sql
   insert into public.app_admins (user_id)
   values ('0199aa1c-0575-4c49-a1c8-65d4fc51f949');
   ```

5. Publish the files in this folder to GitHub Pages. Use the website URL for public access and append `/admin.html` for the administrator page.

Admin accounts must be created and explicitly added to `app_admins`. A normal authenticated user is not an administrator. Supabase Row Level Security keeps participant details private and restricts fixture changes and deletions to administrators.

## Notes

- The Supabase URL and publishable/anon key are intentionally client-visible; database safety depends on the included Row Level Security policies.
- Registrations submitted by visitors are shared immediately. Admins manually create football fixtures by selecting two teams from the same gender and group; duplicate pairings are prevented. Existing fixtures remain after migration; use **Clear unplayed fixtures** to remove old scheduled matchups while keeping played matches and results.
- Participant registration supports pasting a newline-separated list into a table cell or tab-separated rows copied from a spreadsheet.
- Football player student registration numbers must be unique across all football teams. Blank numbers are allowed; surrounding spaces and letter case are ignored when checking duplicates.
- Admins can add stadiums and referees, manually select fixture matchups, and assign each match a date, local time in Africa/Nairobi (EAT, UTC+3), pitch, and referee. Fixture dates, times, pitches, and referees remain editable after a match is played; team pairings remain locked. Public fixtures display the saved date, time, venue, and referee.
- Removing a team also removes its participant records and associated fixtures.
- Football fixture dates use `YYYY-MM-DD`. On or after the scheduled date, admins can record the score, goalscorers, and assists or mark the match postponed. Goalscorers and assist-makers can only be selected from the teams' registered football players. Goalscorer totals cannot exceed the score; assists cannot exceed the side's recorded non-own goals, and goals without an assist are allowed. The admin form shows how many goals were not assisted. Own goals are attributed to an opposing registered player and do not count toward the goalscorer ranking. Postponed matches do not count toward standings.
- Football group names ignore an optional `Group ` prefix and surrounding whitespace, so `A` and `Group A` are treated as the same group.
- Football fixtures are selected by admins for each group and may be assigned to rounds. Standings use 3 points for a win and 1 for a draw; the top 2 teams in each group are marked as qualifying. Admins can also schedule knockout fixtures from the qualified teams, choosing the round and the two teams to advance into the next stage.
- Public group standings and group fixtures are shown directly on the home page; group cards sit side by side when screen space permits and stack on narrow screens. The home page also displays Top Goalscorers and Top Goal Assists. If these sections report a load error, verify that the SQL migrations above have been run in the same Supabase project configured in `supabase-config.js`.
- Public football group standings use 3 points for a win, 1 for a draw, and 0 for a loss, ordered by points, goal difference, goals scored, then team name.
- The public page ranks registered players by goals and assists recorded in played fixtures; own goals are excluded from goalscorer rankings.
- Registrations stored by the earlier local-only app are not uploaded automatically. Export those registrations to CSV and submit them again on the connected website if needed.
