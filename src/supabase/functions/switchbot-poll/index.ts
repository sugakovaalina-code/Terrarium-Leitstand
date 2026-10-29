// Holt Temperatur und Luftfeuchte der zugeordneten SwitchBot-Sensoren und speichert sie.
// Secrets (in Supabase unter Edge Functions > Secrets, nie im Code oder Chat):
//   SWITCHBOT_TOKEN, SWITCHBOT_SECRET
// Die Besitzerin ist das älteste Konto im Projekt. Das Zeitplan-Geheimnis liegt im Vault.
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
// Aufrufe:
//   POST mit Header x-cron-secret       -> Abruf aller zugeordneten Sensoren (Zeitplan)
//   GET ?action=devices mit Login-Token -> Geräteliste für die Zuordnung in der App
//   GET ?action=test    mit Login-Token -> einmaliger Abruf, Ergebnis wird angezeigt
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const API = 'https://api.switch-bot.com/v1.1';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sbFetch(path: string) {
  const token = Deno.env.get('SWITCHBOT_TOKEN'), secret = Deno.env.get('SWITCHBOT_SECRET');
  if (!token || !secret) throw new Error('SwitchBot-Schlüssel fehlen in den Secrets.');
  const t = Date.now().toString(), nonce = crypto.randomUUID();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token + t + nonce));
  const sign = btoa(String.fromCharCode(...new Uint8Array(mac)));
  const res = await fetch(API + path, { headers: { Authorization: token, sign, t, nonce, 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.statusCode !== 100) throw new Error('SwitchBot antwortet ' + res.status + ' / ' + (body?.statusCode ?? '-') + ' ' + (body?.message ?? ''));
  return body.body;
}

// Zuordnung Terrarium -> Gerät steht in der App-Konfiguration (terrarium.sensor.deviceId)
async function assignments(db: ReturnType<typeof createClient>, uid: string) {
  const { data, error } = await db.from('app_docs').select('body').eq('user_id', uid).eq('key', 'config').maybeSingle();
  if (error) throw error;
  const terrs = (data?.body?.terrariums ?? []) as Array<{ id: string; sensor?: { type?: string; deviceId?: string } }>;
  return terrs.filter(t => t.sensor?.type === 'switchbot' && t.sensor.deviceId).map(t => ({ tid: t.id, deviceId: t.sensor!.deviceId! }));
}

async function poll(db: ReturnType<typeof createClient>, uid: string) {
  const out: unknown[] = [];
  for (const a of await assignments(db, uid)) {
    try {
      const s = await sbFetch('/devices/' + encodeURIComponent(a.deviceId) + '/status');
      const t = typeof s.temperature === 'number' ? s.temperature : null;
      const h = typeof s.humidity === 'number' ? s.humidity : null;
      if (t === null && h === null) { out.push({ ...a, ok: false, error: 'Gerät liefert keine Temperatur oder Luftfeuchte.' }); continue; }
      const bat = typeof s.battery === 'number' ? s.battery : null;
      if (t === 0 && h === 0 && (bat === 0 || bat === null)) { out.push({ ...a, ok: false, error: 'Das Gerät meldet 0 °C, 0 % und 0 % Batterie (Typ ' + (s.deviceType ?? 'unbekannt') + '). Entweder ist es kein Thermometer, oder es hat noch keine Werte an die SwitchBot-Cloud geschickt.' }); continue; }
      const row = { user_id: uid, tid: a.tid, device_id: a.deviceId, t, h, battery: typeof s.battery === 'number' ? s.battery : null };
      const { error } = await db.from('sensor_readings').insert(row);
      if (error) throw error;
      out.push({ ...a, ok: true, t, h, battery: row.battery });
    } catch (e) {
      out.push({ ...a, ok: false, error: String((e as Error).message ?? e) });
    }
  }
  return out;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Besitzerin = das älteste Konto dieses Projekts (Registrierung wird nach der Einrichtung gesperrt)
  const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
  const owner = users?.users?.[0]?.id;
  if (!owner) return json({ error: 'Noch kein Konto angelegt.' }, 409);

  // Zeitplan
  if (req.method === 'POST' && req.headers.get('x-cron-secret')) {
    const { data: cron } = await db.rpc('get_cron_secret');
    if (!cron || req.headers.get('x-cron-secret') !== cron) return json({ error: 'nicht erlaubt' }, 401);
    return json({ results: await poll(db, owner) });
  }

  // Aufrufe aus der App: nur die Besitzerin
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user || u.user.id !== owner) return json({ error: 'nicht erlaubt' }, 401);
  const action = new URL(req.url).searchParams.get('action');
  try {
    if (action === 'devices') {
      const b = await sbFetch('/devices');
      return json({ devices: (b.deviceList ?? []).map((d: Record<string, unknown>) => ({ id: d.deviceId, name: d.deviceName, type: d.deviceType })) });
    }
    if (action === 'test') return json({ results: await poll(db, owner) });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502);
  }
  return json({ error: 'unbekannte Aktion' }, 400);
});
