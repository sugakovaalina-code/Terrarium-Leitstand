-- Nur ein Konto erlaubt: weitere Registrierungen werden abgelehnt.
create or replace function public.block_extra_signups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Registrierung geschlossen';
  end if;
  return new;
end $$;
revoke execute on function public.block_extra_signups() from public, anon, authenticated;
create trigger only_one_user before insert on auth.users for each row execute function public.block_extra_signups();
