-- Ruft die Abruf-Funktion alle 10 Minuten auf. Vorher in Supabase unter Vault zwei Geheimnisse anlegen:
--   project_url  = https://<projekt>.supabase.co
--   cron_secret  = derselbe Wert wie das Function-Secret CRON_SECRET
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('switchbot-poll') where exists (select 1 from cron.job where jobname = 'switchbot-poll');
select cron.schedule(
  'switchbot-poll',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/switchbot-poll',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb
  );
  $$
);
