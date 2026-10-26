-- Terrarium Leitstand: Datenmodell für Supabase.
-- app_docs spiegelt die bisherigen Dokumente der App (config, r-<tid>-<monat>, j-<jahr>).
-- sensor_readings nimmt die automatisch abgerufenen SwitchBot-Werte auf.

create table if not exists public.app_docs (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z0-9_.:@+~-]{1,200}$'),
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.sensor_readings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tid text not null,
  device_id text not null,
  ts timestamptz not null default now(),
  t numeric(5,1),
  h numeric(5,1),
  battery smallint
);
create index if not exists sensor_readings_user_tid_ts on public.sensor_readings (user_id, tid, ts desc);

alter table public.app_docs enable row level security;
alter table public.sensor_readings enable row level security;

-- Jede Person sieht und ändert nur ihre eigenen Daten.
create policy "eigene Dokumente lesen" on public.app_docs for select using (auth.uid() = user_id);
create policy "eigene Dokumente anlegen" on public.app_docs for insert with check (auth.uid() = user_id);
create policy "eigene Dokumente ändern" on public.app_docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "eigene Dokumente löschen" on public.app_docs for delete using (auth.uid() = user_id);
-- Sensorwerte schreibt nur die Abruf-Funktion (Service-Rolle). Die App liest sie und darf einzelne löschen.
create policy "eigene Sensorwerte lesen" on public.sensor_readings for select using (auth.uid() = user_id);
create policy "eigene Sensorwerte löschen" on public.sensor_readings for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists app_docs_touch on public.app_docs;
create trigger app_docs_touch before update on public.app_docs for each row execute function public.touch_updated_at();

-- Live-Aktualisierung in der App
alter publication supabase_realtime add table public.app_docs;
alter publication supabase_realtime add table public.sensor_readings;
