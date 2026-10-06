do $$
declare
  duplicate_numbers text;
begin
  select string_agg(
    format('%s (%s records)', duplicates.registration_number, duplicates.record_count),
    ', '
  )
  into duplicate_numbers
  from (
    select lower(btrim(details ->> 'Student Registration Number')) as registration_number,
      count(*) as record_count
    from public.registration_participants
    where nullif(btrim(details ->> 'Student Registration Number'), '') is not null
    group by lower(btrim(details ->> 'Student Registration Number'))
    having count(*) > 1
    order by registration_number
    limit 20
  ) as duplicates;

  if duplicate_numbers is not null then
    raise exception 'Cannot enforce unique student registration numbers until existing duplicates are resolved: %', duplicate_numbers;
  end if;
end;
$$;

create unique index if not exists registration_participants_student_registration_number_unique
  on public.registration_participants (lower(btrim(details ->> 'Student Registration Number')))
  where nullif(btrim(details ->> 'Student Registration Number'), '') is not null;
