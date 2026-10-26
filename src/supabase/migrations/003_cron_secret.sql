-- Das Zeitplan-Geheimnis liegt im Vault; nur die Abruf-Funktion (service_role) darf es lesen.
create or replace function public.get_cron_secret() returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1
$$;
revoke all on function public.get_cron_secret() from public, anon, authenticated;
grant execute on function public.get_cron_secret() to service_role;
