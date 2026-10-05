drop policy if exists teams_admin_update on public.teams;
create policy teams_admin_update on public.teams
for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

drop policy if exists participants_admin_insert on public.registration_participants;
create policy participants_admin_insert on public.registration_participants
for insert to authenticated with check ((select public.is_app_admin()));

drop policy if exists participants_admin_delete on public.registration_participants;
create policy participants_admin_delete on public.registration_participants
for delete to authenticated using ((select public.is_app_admin()));

grant update (team_name, gender, coach, group_name) on public.teams to authenticated;
grant select, insert, delete on public.registration_participants to authenticated;
