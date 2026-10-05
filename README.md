# DeKUT Comrades Website

This static website uses Supabase (PostgreSQL) for shared team registrations and football fixtures. Public visitors can view teams, fixtures, group standings, and goalscorer rankings, and submit new registrations. Participant details are restricted to admins. Admins sign in at `admin.html` to review registrations, remove teams or fixtures, and manage fixture dates and results.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run all of `supabase-schema.sql`.
   For an existing database, run or rerun `supabase-match-results-migration.sql` to ensure match results, scorers, and assists are enabled, then run `supabase-group-stage-migration.sql` to generate missing round-robin fixtures for existing groups and install the updated fixture trigger.
3. In **Project Settings → API**, copy the Project URL and the **publishable** key (or legacy `anon` key). Put them in `supabase-config.js`. Never put a `service_role` key in website files.
4. In **Authentication → Users**, create the admin account(s). Copy an admin's user UUID, then run this in the SQL Editor:

   ```sql
   insert into public.app_admins (user_id)
   values ('PASTE_AUTH_USER_UUID_HERE');
   ```

5. Publish the files in this folder to GitHub Pages. Use the website URL for public access and append `/admin.html` for the administrator page.

Admin accounts must be created and explicitly added to `app_admins`. A normal authenticated user is not an administrator. Supabase Row Level Security keeps participant details private and restricts fixture changes and deletions to administrators.

## Notes

- The Supabase URL and publishable/anon key are intentionally client-visible; database safety depends on the included Row Level Security policies.
- Registrations submitted by visitors are shared immediately. Adding a football team automatically generates a fixture against each existing team in its gender/group.
- Participant registration supports pasting a newline-separated list into a table cell or tab-separated rows copied from a spreadsheet.
- Removing a team also removes its participant records and associated fixtures.
- Football fixtures are grouped by gender and group in the admin page. Admins can schedule a date and time, then on or after the match date save each team's score, goalscorers, and assists separately. Admins can select players from each team's registered roster or enter a name manually. Goalscorer totals cannot exceed the score; assists cannot exceed the side's recorded non-own goals. Own goals are attributed to an opposing registered player and do not count toward the goalscorer ranking. Postponed matches do not count toward standings.
- Each football group plays a round-robin group stage, where every team meets every other team in the same gender and group once. The top 2 teams in each group qualify for the knockout stages.
- Public group standings and group fixtures are shown directly on the home page; group cards sit side by side when screen space permits and stack on narrow screens. The home page also displays Top Goalscorers and Top Goal Assists. If these sections report a load error, verify that the SQL migrations above have been run in the same Supabase project configured in `supabase-config.js`.
- Public football group standings use 3 points for a win, 1 for a draw, and 0 for a loss, ordered by points, goal difference, goals scored, then team name.
- The public page ranks registered players by goals and assists recorded in played fixtures; own goals are excluded from goalscorer rankings.
- Registrations stored by the earlier local-only app are not uploaded automatically. Export those registrations to CSV and submit them again on the connected website if needed.
