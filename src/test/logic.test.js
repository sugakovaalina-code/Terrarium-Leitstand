const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('../logic.js');

const T0 = new Date(2026, 9, 26, 14, 0).getTime(); // 26.10.2026 14:00 Ortszeit

function terr(over) {
  const t = TL.newTerrarium('jc', 'Test');
  t.day.temp = { min: 26, max: 30 }; t.day.hum = { min: 40, max: 60 };
  t.night.temp = { min: 18, max: 22 }; t.night.hum = { min: 60, max: 85 };
  return Object.assign(t, over || {});
}

test('parseNum akzeptiert Komma und lehnt Unsinn ab', () => {
  assert.equal(TL.parseNum('24,5'), 24.5);
  assert.equal(TL.parseNum(' 60 '), 60);
  assert.equal(TL.parseNum('-3'), -3);
  assert.equal(TL.parseNum(''), null);
  assert.equal(TL.parseNum('abc'), null);
  assert.equal(TL.parseNum('1e3'), null);
  assert.equal(TL.parseNum(NaN), null);
});

test('assess: grün, gelb am Rand, orange und rot außerhalb', () => {
  const r = { min: 26, max: 30 };
  assert.equal(TL.assess(28, r, 'temp').level, 'green');
  assert.equal(TL.assess(26.2, r, 'temp').level, 'yellow');
  assert.equal(TL.assess(29.8, r, 'temp').level, 'yellow');
  assert.equal(TL.assess(31.5, r, 'temp').level, 'orange');
  assert.equal(TL.assess(32, r, 'temp').level, 'orange');
  assert.equal(TL.assess(32.1, r, 'temp').level, 'red');
  assert.equal(TL.assess(23, r, 'temp').level, 'red');
  assert.equal(TL.assess(23, r, 'temp').dir, -1);
  assert.equal(TL.assess(50, { min: 40, max: 60 }, 'hum').level, 'green');
  assert.equal(TL.assess(65, { min: 40, max: 60 }, 'hum').level, 'orange');
  assert.equal(TL.assess(75, { min: 40, max: 60 }, 'hum').level, 'red');
});

test('assess ohne Bereich oder Wert ergibt keine Bewertung', () => {
  assert.equal(TL.assess(28, { min: null, max: null }, 'temp').level, 'none');
  assert.equal(TL.assess(null, { min: 1, max: 2 }, 'temp').level, 'none');
});

test('eigene Toleranzen werden beachtet', () => {
  const r = { min: 26, max: 30 };
  assert.equal(TL.assess(31, r, 'temp', { tempOrange: 0.5 }).level, 'red');
});

test('phaseAt: normaler Tag und Tagphase über Mitternacht', () => {
  const t = terr();
  assert.equal(TL.phaseAt(t, new Date(2026, 9, 26, 7, 59).getTime()), 'night');
  assert.equal(TL.phaseAt(t, new Date(2026, 9, 26, 8, 0).getTime()), 'day');
  assert.equal(TL.phaseAt(t, new Date(2026, 9, 26, 20, 0).getTime()), 'night');
  const w = terr({ dayStart: '22:00', dayEnd: '06:00' });
  assert.equal(TL.phaseAt(w, new Date(2026, 9, 26, 23, 0).getTime()), 'day');
  assert.equal(TL.phaseAt(w, new Date(2026, 9, 26, 12, 0).getTime()), 'night');
});

test('assessTerrarium nutzt Nachtwerte nachts', () => {
  const t = terr();
  const night = new Date(2026, 9, 26, 23, 0).getTime();
  const a = TL.assessTerrarium(t, { ts: night, t: 20, h: 70 }, night + 60000);
  assert.equal(a.phase, 'night');
  assert.equal(a.level, 'green');
  const b = TL.assessTerrarium(t, { ts: night, t: 28, h: 70 }, night + 60000);
  assert.equal(b.level, 'red');
});

test('veralteter Messwert wird mindestens gelb', () => {
  const t = terr();
  const a = TL.assessTerrarium(t, { ts: T0 - 30 * TL.HOUR, t: 28, h: 50 }, T0);
  assert.equal(a.stale, true);
  assert.equal(a.level, 'yellow');
});

test('ohne Zielwerte keine Ampel, aber Hinweis', () => {
  const t = TL.newTerrarium('kn');
  const a = TL.assessTerrarium(t, { ts: T0, t: 28, h: 50 }, T0);
  assert.equal(a.level, 'none');
  assert.equal(a.reason, 'noprofile');
  assert.match(TL.adviceFor(a)[0], /Zielwerte/);
});

test('Hinweise passen zur Richtung der Abweichung', () => {
  const t = terr();
  const hot = TL.assessTerrarium(t, { ts: T0, t: 33, h: 50 }, T0);
  assert.ok(TL.adviceFor(hot).some(s => /Thermostat/.test(s)));
  const dry = TL.assessTerrarium(t, { ts: T0, t: 28, h: 20 }, T0);
  assert.ok(TL.adviceFor(dry).some(s => /Düsen/.test(s)));
  assert.ok(TL.adviceFor(dry).some(s => /Tierarzt/.test(s)));
});

test('validateReading prüft Plausibilität', () => {
  assert.equal(TL.validateReading({ t: '26,4', h: '55', ts: T0 }, T0).ok, true);
  assert.deepEqual(TL.validateReading({ t: '26,4', h: '55', ts: T0 }, T0).value, { t: 26.4, h: 55, ts: T0 });
  assert.ok(TL.validateReading({ t: '80', h: '55', ts: T0 }, T0).errors.t);
  assert.ok(TL.validateReading({ t: '25', h: '120', ts: T0 }, T0).errors.h);
  assert.ok(TL.validateReading({ t: '', h: '', ts: T0 }, T0).errors.form);
  assert.ok(TL.validateReading({ t: '25', h: '', ts: T0 + TL.HOUR }, T0).errors.ts);
  assert.equal(TL.validateReading({ t: '25', h: '', ts: T0 }, T0).value.h, null);
});

test('validateProfile erkennt vertauschte und halbe Bereiche', () => {
  const p = terr();
  assert.equal(TL.validateProfile(p).ok, true);
  const bad = terr(); bad.day.temp = { min: 30, max: 26 };
  assert.ok(TL.validateProfile(bad).errors['day.temp']);
  const half = terr(); half.night.hum = { min: 60, max: '' };
  assert.ok(TL.validateProfile(half).errors['night.hum']);
  const empty = TL.newTerrarium('kn');
  assert.equal(TL.validateProfile(empty).ok, true);
});

test('stats berechnet Zeit im Zielbereich', () => {
  const t = terr();
  const rows = [
    { ts: new Date(2026, 9, 26, 12).getTime(), t: 28, h: 50 },
    { ts: new Date(2026, 9, 26, 13).getTime(), t: 33, h: 50 },
    { ts: new Date(2026, 9, 26, 23).getTime(), t: 20, h: 90 },
    { ts: new Date(2026, 9, 27, 1).getTime(), t: 19, h: 70 }
  ];
  const s = TL.stats(t, rows);
  assert.equal(s.count, 4);
  assert.equal(s.inRange.temp, 75);
  assert.equal(s.inRange.hum, 75);
  assert.equal(s.temp.max, 33);
});

test('patterns findet wiederholte Abweichungen nachts', () => {
  const t = terr();
  const rows = [];
  for (let d = 1; d <= 4; d++) rows.push({ ts: new Date(2026, 9, 26 - d, 23).getTime(), t: 16, h: 70 });
  const p = TL.patterns(t, rows, T0, 7);
  assert.equal(p.list.length, 1);
  assert.equal(p.list[0].phase, 'night');
  assert.equal(p.list[0].days, 4);
  assert.equal(p.list[0].level, 'orange');
  assert.match(p.list[0].text, /Nachts an 4 Tagen zu kalt/);
});

test('dueInfo: fällig, bald fällig, überfällig', () => {
  const day = n => TL.isoDay(T0 - n * TL.DAY);
  assert.equal(TL.dueInfo({ every: 7, last: day(1) }, T0).level, 'green');
  assert.equal(TL.dueInfo({ every: 7, last: day(5) }, T0).level, 'yellow');
  assert.equal(TL.dueInfo({ every: 7, last: day(7) }, T0).label, 'Heute fällig');
  assert.equal(TL.dueInfo({ every: 30, last: day(32) }, T0).level, 'orange');
  assert.equal(TL.dueInfo({ every: 7, last: day(20) }, T0).level, 'red');
  assert.equal(TL.dueInfo({ every: 7, last: '' }, T0).level, 'none');
});

test('validateTask und validateJournal', () => {
  assert.equal(TL.validateTask({ title: 'Düsen entkalken', every: '30', last: '' }).ok, true);
  assert.ok(TL.validateTask({ title: '', every: '30' }).errors.title);
  assert.ok(TL.validateTask({ title: 'x', every: '2,5' }).errors.every);
  assert.equal(TL.validateJournal({ type: 'weight', value: '142', ts: TL.isoDay(T0) }, T0).ok, true);
  assert.ok(TL.validateJournal({ type: 'weight', value: '', ts: TL.isoDay(T0) }, T0).errors.value);
});

test('CSV mit Semikolon, Komma-Dezimal und BOM', () => {
  const t = terr({ id: 'tA', name: 'Chamäleon; groß' });
  const csv = TL.readingsCsv([t], [{ tid: 'tA', ts: T0, t: 26.5, h: 55, src: 'manual', n: 'nach "Sprühen"' }]);
  assert.ok(csv.startsWith('﻿'));
  const line = csv.split('\r\n')[1];
  assert.match(line, /^"Chamäleon; groß";2026-10-26;14:00;26,5;55,0;Manuell;"nach ""Sprühen"""$/);
});

test('Backup wird erkannt und fremde Dateien abgelehnt', () => {
  const docs = { config: TL.defaultConfig() };
  const b = TL.buildBackup(docs, T0);
  assert.equal(TL.checkBackup(JSON.parse(JSON.stringify(b))).ok, true);
  assert.equal(TL.checkBackup({ app: 'x' }).ok, false);
  assert.equal(TL.checkBackup(Object.assign({}, b, { schema: 99 })).ok, false);
  assert.equal(TL.checkBackup(Object.assign({}, b, { docs: { config: docs.config, 'a/b': {} } })).ok, false);
});

test('Monatsdokumente und Sammeln der Messwerte', () => {
  const k = TL.readingDocKey('tA', T0);
  assert.equal(k, 'r-tA-2026-10');
  const rows = TL.collectReadings({ [k]: { tid: 'tA', rows: [{ id: 'm2', ts: 2 }, { id: 'm1', ts: 1 }] }, config: {} });
  assert.deepEqual(rows.map(r => r.id), ['m1', 'm2']);
  assert.equal(rows[0].tid, 'tA');
});

test('Beispieldaten sind vollständig und gekennzeichnet', () => {
  const docs = TL.demoData(T0);
  const cfg = docs.config;
  assert.equal(cfg.terrariums.length, 3);
  assert.ok(cfg.terrariums.every(t => TL.profileComplete(t) && t.source.startsWith('Vorschlag')));
  assert.ok(TL.collectReadings(docs).length > 300);
  assert.ok(cfg.tasks.every(t => t.note === 'Beispiel'));
});

test('Vorschläge sind vollständig und gültig', () => {
  for (const k of ['kn', 'jc', 'rg']) {
    const t = TL.newTerrarium(k);
    const pr = TL.PRESETS[k];
    t.day = pr.day; t.night = pr.night;
    assert.equal(TL.profileComplete(t), true, k);
    assert.equal(TL.validateProfile(t).ok, true, k);
    assert.ok(pr.sources.every(s => TL.SOURCES[s] && TL.SOURCES[s].url.startsWith('https://')));
  }
});

test('Mindestmaße Kornnatter nach Gesamtlänge', () => {
  assert.deepEqual(TL.minSize('kn', 130, 1), { l: 130, b: 65, h: 130, basis: 'GL' });
  const three = TL.minSize('kn', 130, 3);
  assert.ok(three.l > 130 && three.h > 130);
});

test('Mindestmaße Jemenchamäleon mit Tierschutzbund-Untergrenze', () => {
  assert.deepEqual(TL.minSize('jc', 20, 1), { l: 200, b: 100, h: 150, basis: 'KRL' });
  assert.deepEqual(TL.minSize('jc', 60, 1), { l: 240, b: 150, h: 240, basis: 'KRL' });
});

test('checkSize erkennt zu kleine Terrarien und getauschte Maße', () => {
  const ok = TL.checkSize('kn', { l: 65, b: 130, h: 130 }, 130, 1);
  assert.equal(ok.ok, true);
  const bad = TL.checkSize('rg', { l: 60, b: 60, h: 90 }, 20, 1);
  assert.equal(bad.ok, false);
  assert.equal(bad.issues.length, 3);
  assert.equal(TL.checkSize('other', { l: 1, b: 1, h: 1 }, 10, 1), null);
});

test('validateProfile prüft Maße und Anzahl', () => {
  const t = TL.newTerrarium('kn');
  t.size = { l: '5', b: '', h: '' };
  assert.ok(TL.validateProfile(t).errors.size);
  t.size = { l: '', b: '', h: '' }; t.count = '0';
  assert.ok(TL.validateProfile(t).errors.count);
});

test('Standard-Einstellungen sind vorausgefüllt', () => {
  const c = TL.defaultConfig();
  assert.equal(c.v, TL.SCHEMA);
  assert.ok(c.terrariums.every(t => TL.profileComplete(t)));
  assert.equal(c.terrariums[0].day.temp.min, 24);
  assert.ok(c.tasks.length >= 15 && c.tasks.every(k => k.preset && k.every > 0 && k.last === ''));
  assert.equal(c.lamps.length, 6);
});

test('Migration füllt alte Daten auf, ohne eigene Werte zu überschreiben', () => {
  const old = { v: 1, terrariums: [TL.newTerrarium('kn'), TL.newTerrarium('jc')], animals: [], tasks: [], settings: {} };
  old.terrariums[1].day.temp = { min: 27, max: 29 };
  delete old.terrariums[0].size;
  assert.equal(TL.migrateConfig(old), true);
  assert.equal(old.terrariums[0].day.temp.min, 24);
  assert.equal(old.terrariums[1].day.temp.min, 27);
  assert.equal(old.terrariums[1].night.temp.min, null);
  assert.ok(old.terrariums[0].size);
  assert.ok(old.tasks.length > 0 && old.lamps.length === 4);
  assert.equal(TL.migrateConfig(old), false);
});

test('lampInfo: Monate, Stunden und fehlende Angaben', () => {
  const day = n => TL.isoDay(T0 - n * TL.DAY);
  assert.equal(TL.lampInfo({ installed: '', lifeMonths: 12 }, T0).label, 'Einbaudatum fehlt');
  assert.equal(TL.lampInfo({ installed: day(30), lifeMonths: 12 }, T0).level, 'green');
  assert.equal(TL.lampInfo({ installed: day(340), lifeMonths: 12 }, T0).level, 'yellow');
  assert.equal(TL.lampInfo({ installed: day(400), lifeMonths: 12 }, T0).level, 'red');
  const h = TL.lampInfo({ installed: day(190), lifeMonths: null, lifeHours: 2000, hoursPerDay: 10 }, T0);
  assert.equal(h.daysLeft, 10);
  assert.equal(h.level, 'orange');
  assert.equal(TL.lampInfo({ installed: day(10), lifeMonths: null, lifeHours: null, hoursPerDay: 10 }, T0).label, 'Lebensdauer fehlt');
});

test('Lampenalter wird zu Einbaudatum', () => {
  assert.equal(TL.installedFromAge('6', new Date(2026, 9, 26).getTime()), '2026-04-26');
  assert.equal(TL.installedFromAge('abc', T0), null);
  assert.equal(TL.addMonths(new Date(2026, 0, 31).getTime(), 1), new Date(2026, 1, 28).getTime());
});

test('validateLamp', () => {
  assert.equal(TL.validateLamp({ name: 'UV-B', type: 'uvbT5', installed: '2026-01-01', lifeMonths: '12', lifeHours: '', hoursPerDay: '12', watt: '24' }, T0).ok, true);
  const bad = TL.validateLamp({ name: '', type: 'x', installed: '2030-01-01', lifeMonths: 'abc', lifeHours: '', hoursPerDay: '30' }, T0);
  assert.ok(bad.errors.name && bad.errors.type && bad.errors.installed && bad.errors.lifeMonths && bad.errors.hoursPerDay);
});

test('Licht: Bedarf je Art und Abgleich', () => {
  for (const k of ['kn', 'jc', 'rg']) { const li = TL.LIGHTING[k]; assert.ok(li.uvb && li.heat && li.night && li.sources.length); li.sources.forEach(s => assert.ok(TL.SOURCES[s], s)); }
  assert.equal(TL.LIGHTING.jc.uviMax, '2,9–7,4');
  const c = TL.defaultConfig(); const t = c.terrariums[1];
  assert.deepEqual(TL.lightCheck(t, c.lamps).issues, []);
  assert.equal(TL.lightCheck(t, []).issues.length, 2);
  assert.equal(TL.lightCheck(TL.newTerrarium('other'), []).known, false);
});

test('Lampenprüfung: Warnungen für typische Fehler', () => {
  const t = TL.newTerrarium('jc', 'Cham'); t.equip.ballast = false;
  const L = (o) => Object.assign({ id: TL.uid('l'), tid: t.id, name: 'X', type: 'led', watt: null, pos: '', guard: null, uvbPct: null, night: false }, o);
  let a = TL.lampAdvice(t, [L({ type: 'led', watt: 10 })]);
  assert.equal(a[0].level, 'red'); assert.match(a[0].text, /Keine UV-B/);
  a = TL.lampAdvice(t, [L({ type: 'uvbT5', uvbPct: 6, watt: 24 }), L({ type: 'ir', pos: 'inside', guard: false, watt: 50, night: true })]);
  const txt = a.map(x => x.level + ':' + x.text).join('|');
  assert.match(txt, /red:.*Röhre.*Vorschaltgerät/);
  assert.match(txt, /red:.*ohne Schutzkorb/);
  assert.match(txt, /orange:.*Rotes Infrarotlicht/);
  assert.match(txt, /yellow:.*12-%-Röhre/);
  const k = TL.newTerrarium('kn', 'Korn'); k.equip.ballast = true;
  a = TL.lampAdvice(k, [Object.assign(L({ type: 'uvbT5', uvbPct: 12, watt: 24 }), { tid: k.id }), Object.assign(L({ type: 'incand', watt: 50, pos: 'above' }), { tid: k.id })]);
  assert.ok(a.some(x => x.level === 'yellow' && /2,4–6 %/.test(x.text)));
  assert.ok(!a.some(x => /Vorschaltgerät ist vorhanden/.test(x.text)));
  const ok = TL.lampAdvice(k, [Object.assign(L({ type: 'uvbT5', uvbPct: 6, watt: 24 }), { tid: k.id }), Object.assign(L({ type: 'incand', watt: 50 }), { tid: k.id })]);
  assert.equal(ok.filter(x => x.level !== 'none').length, 0);
});

test('Migration auf Schema 3 ergänzt Technik-Felder', () => {
  const c = TL.defaultConfig(); c.v = 2; delete c.terrariums[0].equip; delete c.lamps[0].pos;
  assert.equal(TL.migrateConfig(c), true);
  assert.deepEqual(c.terrariums[0].equip, { covers: '', ballast: null, notes: '' });
  assert.equal(c.lamps[0].pos, '');
  assert.equal(c.v, TL.SCHEMA);
});

test('Lampenprüfung: Metalldampf bei Zone 1–2 wird angemerkt', () => {
  const k = TL.newTerrarium('kn', 'Korn');
  const l = { id: 'x1', tid: k.id, name: 'UV', type: 'uvbMH', watt: 35, pos: 'above', guard: null, uvbPct: null, night: false };
  assert.ok(TL.lampAdvice(k, [l]).some(a => a.level === 'yellow' && /Metalldampf/.test(a.text)));
  const j = TL.newTerrarium('jc', 'Cham'); l.tid = j.id;
  assert.ok(!TL.lampAdvice(j, [l]).some(a => /Metalldampf/.test(a.text)));
});

test('Einkaufshilfe: Suchlinks und Quellen sind gültig', () => {
  for (const sp of ['kn', 'jc', 'rg']) {
    assert.ok(TL.SHOP[sp].length >= 2);
    for (const x of TL.SHOP[sp]) {
      assert.ok(TL.shopLink(x.q).startsWith('https://www.amazon.de/s?'));
      for (const k of x.sources) assert.ok(TL.SOURCES[k], 'Quelle fehlt: ' + k);
    }
  }
});

test('Einkaufshilfe: Exo-Terra-Abdeckung wird erkannt', () => {
  assert.equal(TL.hasExoCover({ equip: { covers: 'Exo Terra Abdeckung groß' } }), true);
  assert.equal(TL.hasExoCover({ equip: { covers: 'Lampenschirm' } }), false);
  assert.equal(TL.hasExoCover({}), false);
});

test('Plätze: belegte und freie Fassungen', () => {
  const t = { id: 'a', equip: { slots: { exo: 2, shade: 2 } } };
  const ls = [
    { tid: 'a', type: 'uvbCompact', fixture: 'Exo Terra Abdeckung klein' },
    { tid: 'a', type: 'other', fixture: 'Exo Terra Abdeckung klein' },
    { tid: 'a', type: 'led', fixture: 'LED-Leuchte' },
    { tid: 'a', type: 'incand', fixture: 'Lampenschirm' },
    { tid: 'b', type: 'incand', fixture: 'Lampenschirm' }
  ];
  const u = TL.slotUse(t, ls);
  assert.deepEqual([u.exo.used, u.exo.free, u.shade.used, u.shade.free], [2, 0, 1, 1]);
  assert.equal(TL.slotUse({ id: 'a' }, ls).exo.free, null);
});

test('Lampenprüfung: Hersteller und Modell', () => {
  const t = TL.newTerrarium('jc', 'Test'); t.id = 'a'; t.equip = { covers: '', ballast: true, notes: '', slots: { exo: 1, shade: 1 } };
  const base = { tid: 'a', type: 'uvbT5', hoursPerDay: 12, uvbPct: '', watt: null };
  const fremd = TL.lampAdvice(t, [Object.assign({ id: 'x', name: 'UV', brand: 'Arcadia', model: 'ShadeDweller T5 2,4 %', fixture: 'Exo Terra Abdeckung' }, base)]);
  const txt = fremd.map(a => a.text).join(' | ');
  assert.match(txt, /nur Exo-Terra-Leuchtmittel/);
  assert.match(txt, /ShadeDweller ist laut The Bio Dude/);
  assert.match(txt, /2,4 %/);
  const ok = TL.lampAdvice(t, [Object.assign({ id: 'y', name: 'UV', brand: 'Exo Terra', model: 'T5 12 %', fixture: 'Exo Terra Abdeckung' }, base)]);
  assert.ok(!ok.some(a => /nur Exo-Terra-Leuchtmittel/.test(a.text)));
  assert.ok(!ok.some(a => a.level === 'yellow' && /12-%-Röhre/.test(a.text)));
  const voll = TL.lampAdvice(t, [1, 2].map(i => ({ id: 'z' + i, tid: 'a', type: 'incand', name: 'W' + i, hoursPerDay: 12, fixture: 'Lampenschirm' })));
  assert.ok(voll.some(a => /nur 1 Plätze/.test(a.text)));
});

test('Lampen-Check: Kandidat gegen Tier prüfen', () => {
  const t = TL.newTerrarium('jc', 'Cham'); t.id = 'a'; t.equip = { covers: 'Exo Terra', ballast: true, notes: '' };
  const schwach = TL.candidateCheck(t, { type: 'uvbT5', brand: 'Arcadia', model: 'ShadeDweller T5 2,4 %', name: 'x' }, [{ id: 'h', tid: 'a', type: 'heat', name: 'Spot', hoursPerDay: 12 }], null);
  assert.equal(schwach.level, 'yellow');
  const gut = TL.candidateCheck(t, { type: 'uvbT5', brand: 'Exo Terra', model: 'T5 12 %', name: 'y', fixture: 'Exo Terra Abdeckung' }, [{ id: 'h', tid: 'a', type: 'heat', name: 'Spot', hoursPerDay: 12 }], null);
  assert.equal(gut.level, 'green');
  const led = TL.candidateCheck(t, { type: 'led', name: 'led' }, [], null);
  assert.equal(led.level, 'red');
  const rep = TL.candidateCheck(t, { type: 'led', name: 'led' }, [{ id: 'u', tid: 'a', type: 'uvbT5', uvbPct: 12, name: 'UV', hoursPerDay: 12 }, { id: 'h', tid: 'a', type: 'heat', name: 'Spot', hoursPerDay: 12 }], 'u');
  assert.equal(rep.level, 'red');
});

test('Steckbrief: Kennzahlen aus dem Tagebuch', () => {
  const now = Date.parse('2026-10-27T12:00:00Z'), D = 86400000;
  const a = { id: 'a1', hatch: '2025-10-27' };
  const j = [
    { aid: 'a1', type: 'weight', ts: now - 10 * D, value: 100 }, { aid: 'a1', type: 'weight', ts: now - 3 * D, value: 110 },
    { aid: 'a1', type: 'feed', ts: now - 2 * D }, { aid: 'a1', type: 'shed', ts: now - 20 * D }, { aid: 'x', type: 'feed', ts: now - 1 * D }
  ];
  const s = TL.animalStats(a, j, now);
  assert.equal(s.weight.w, 110); assert.equal(s.weightDelta, 10); assert.equal(s.weightPct, 10);
  assert.equal(s.daysSinceFeed, 2); assert.equal(s.daysSinceShed, 20); assert.equal(s.daysSinceVet, null);
  assert.equal(s.ageDays, 365); assert.equal(TL.ageLabel(365), '12 Monate');
  assert.equal(TL.ageLabel(null), null); assert.equal(TL.ageLabel(20), '20 Tage'); assert.equal(TL.ageLabel(800), '2 Jahre 2 Monate');
});

test('Wissen: alle Quellen existieren, jeder Eintrag hat Text', () => {
  const check = src => src.forEach(k => assert.ok(TL.SOURCES[k], 'Quelle fehlt: ' + k));
  for (const sp of ['kn', 'jc', 'rg']) {
    assert.ok(TL.KNOWLEDGE[sp].sections.length >= 6);
    TL.KNOWLEDGE[sp].sections.forEach(sec => sec.items.forEach(i => { assert.ok(i.text.length > 10); check(i.src); }));
    TL.SETUP_CHECK[sp].forEach(([id, label, src]) => { assert.ok(id && label); check([src]); });
  }
  TL.LEXICON.forEach(e => { assert.ok(e.term && e.text); check(e.src); });
});

test('Fassungen: Exo-Abdeckung nur Exo Terra und höchstens 26 W', () => {
  const t = TL.newTerrarium('jc', 'C');
  const exo = { id: 's1', kind: 'exo', base: 'E27', ballast: false, maxW: 26, role: 'any' };
  const r = TL.socketRecs(t, exo);
  assert.ok(r.length >= 2);
  r.forEach(x => { assert.equal(x.item.brand, 'Exo Terra'); assert.ok(x.watts.every(w => w <= 26)); });
  assert.ok(r.every(x => x.fit >= 1));
  const heat = r.find(x => x.item.id === 'exoIntense');
  assert.deepEqual(heat.pickW, [25]);
  assert.ok(heat.notes.some(n => /höchstens 25 W/.test(n)));
});

test('Fassungen: mit Vorschaltgerät nur Metalldampf, ohne nur selbstvorschaltend oder Halogen', () => {
  const t = TL.newTerrarium('kn', 'K');
  const mit = TL.socketRecs(t, { id: 'a', kind: 'free', base: 'E27', ballast: true, role: 'any' });
  assert.ok(mit.length >= 1); mit.forEach(x => assert.ok(x.item.ballast !== 'none'));
  const ohne = TL.socketRecs(t, { id: 'b', kind: 'free', base: 'E27', ballast: false, role: 'heat', cage: true });
  assert.ok(ohne.length >= 1); ohne.forEach(x => { assert.equal(x.item.ballast, 'none'); assert.notEqual(x.item.kind, 'uvb'); });
  const fremd = TL.socketRecs(t, { id: 'c', kind: 'free', base: 'E27', ballast: true, ballastModel: 'Osram Tischgerät', role: 'any' });
  assert.ok(fremd.every(x => x.item.ballast !== 'own'));
  const w = TL.socketRecs(t, { id: 'd', kind: 'free', base: 'E27', ballast: true, ballastW: 70, role: 'any' });
  w.forEach(x => assert.deepEqual(x.watts, [70]));
});

test('Fassungen: Riesengecko bekommt keine starke UV-B-Lampe', () => {
  const t = TL.newTerrarium('rg', 'G');
  const r = TL.socketRecs(t, { id: 'g', kind: 'free', base: 'E27', ballast: false, role: 'any' });
  assert.ok(!r.some(x => x.item.id === 'exoUvb200' || x.item.id === 'zmPower'));
});

test('Lampenplan deckt UV-B und Wärme ab, wenn Fassungen da sind', () => {
  const t = TL.newTerrarium('jc', 'C');
  t.equip = { sockets: [{ id: 'e1', kind: 'exo', base: 'E27', ballast: false, maxW: 26, role: 'any' }, { id: 'e2', kind: 'exo', base: 'E27', ballast: false, maxW: 26, role: 'any' }, { id: 'f', kind: 'free', base: 'E27', ballast: false, role: 'any' }] };
  const p = TL.lampPlan(t);
  assert.equal(p.length, 3);
  const kinds = p.map(x => x.top && x.top.item.kind);
  assert.ok(kinds.some(k => k === 'uvb' || k === 'both')); assert.ok(kinds.some(k => k === 'heat' || k === 'both'));
});

test('Substrat: Liter aus Grundfläche und Schichthöhe', () => {
  const t = TL.newTerrarium('kn', 'K'); t.size = { l: 120, b: 60, h: 60 };
  const n = TL.substrateNeed(t);
  assert.equal(n.litersMin, 54); assert.equal(n.litersMax, 72);
  assert.equal(n.parts.find(p => p.name === 'Sand').min, 16.2);
  assert.equal(TL.substrateNeed(t, 5).litersMin, 36);
  const jc = TL.newTerrarium('jc', 'C'); jc.size = { l: 60, b: 60, h: 120 };
  assert.deepEqual(TL.substrateNeed(jc).missing, ['depth']);
  assert.equal(TL.substrateNeed(jc, 10).litersMin, 36);
  const no = TL.newTerrarium('rg', 'G'); no.size = {};
  assert.deepEqual(TL.substrateNeed(no).missing, ['size']);
});

test('Katalog und Substrat: alle Quellen existieren', () => {
  TL.CATALOG.forEach(it => { it.sources.forEach(k => assert.ok(TL.SOURCES[k], k)); for (const sp of ['kn', 'jc', 'rg']) assert.ok(it.fit[sp], it.id + sp); });
  for (const sp of ['kn', 'jc', 'rg']) { const s = TL.SUBSTRATE[sp]; s.points.forEach(p => p[2].forEach(k => assert.ok(TL.SOURCES[k], k))); s.mixSrc.forEach(k => assert.ok(TL.SOURCES[k], k)); }
});

test('Brenndauer und LED', () => {
  const kn = TL.newTerrarium('kn', 'K');
  const lamps = [{ id: 'a', tid: kn.id, type: 'uvbT5', hoursPerDay: 8, name: 'UV' }, { id: 'b', tid: kn.id, type: 'led', hoursPerDay: 13, name: 'LED' }, { id: 'c', tid: kn.id, type: 'heat', hoursPerDay: 5, name: 'Spot' }];
  const h = TL.hoursCheck(kn, lamps, Date.parse('2026-10-27'));
  assert.equal(h.rows.find(x => x.l.id === 'a').level, 'green'); // UV-B darf kürzer brennen
  const lang = TL.hoursCheck(kn, [{ id: 'z', tid: kn.id, type: 'uvbT5', hoursPerDay: 18, name: 'UV' }], Date.parse('2026-10-27'));
  assert.equal(lang.rows[0].level, 'yellow');
  assert.equal(h.rows.find(x => x.l.id === 'b').level, 'green');
  assert.equal(h.rows.find(x => x.l.id === 'c').level, 'none');
  assert.equal(h.day, 13); assert.equal(h.dayLevel, 'green');
  assert.ok(!TL.lampAdvice(kn, lamps).some(a => a.lid === 'a' && /brennt 8 Std/.test(a.text)));
  assert.ok(TL.lampAdvice(kn, [{ id: 'z', tid: kn.id, type: 'led', hoursPerDay: 5, name: 'LED' }]).some(a => a.lid === 'z' && /5 Std/.test(a.text)));
  assert.equal(TL.lampInfo({ type: 'led', installed: '', hoursPerDay: 12 }, Date.now()).level, 'none');
  assert.equal(TL.lightHours('jc', Date.parse('2026-10-27')).min, 8);
  assert.equal(TL.lightHours('jc', Date.parse('2026-06-27')).min, 12);
});

test('Substratwechsel bewerten', () => {
  const t = TL.newTerrarium('kn', 'K'); const now = Date.parse('2026-11-01');
  t.subLog = [{ date: '2026-10-25', product: 'Mix', depth: 8 }];
  assert.equal(TL.substrateStatus(t, now).level, 'green');
  t.subLog = [{ date: '2026-10-25', product: 'Mix', depth: 3 }]; assert.equal(TL.substrateStatus(t, now).level, 'yellow');
  t.subLog = [{ date: '2026-02-01', depth: 8 }]; assert.equal(TL.substrateStatus(t, now).level, 'orange');
  assert.equal(TL.substrateStatus(TL.newTerrarium('kn', 'K'), now), null);
});

test('Lichtplan: Zeiten, Gesamtdauer und Nachtkontrolle', () => {
  const kn = TL.newTerrarium('kn', 'K'); kn.dayStart = '08:00'; kn.dayEnd = '20:00';
  const L = [{ id: 'a', tid: kn.id, type: 'uvbT5', name: 'UV', onTime: '08:00', offTime: '20:00' }, { id: 'b', tid: kn.id, type: 'led', name: 'LED', onTime: '07:00', offTime: '21:00' }, { id: 'c', tid: kn.id, type: 'heat', name: 'Spot', onTime: '10:00', offTime: '23:00' }];
  const p = TL.lightPlan(kn, L, Date.parse('2026-10-27'));
  assert.equal(p.rows[0].level, 'green'); assert.equal(p.rows[0].hours, 12);
  assert.equal(p.rows[1].level, 'orange'); assert.ok(/120 Minuten/.test(p.rows[1].issues[0].text));
  assert.equal(p.rows[2].level, 'orange');
  assert.equal(p.day, 16); assert.equal(p.dayLevel, 'yellow');
  assert.equal(TL.lampSpan({ onTime: '22:00', offTime: '06:00' }).hours, 8);
  assert.equal(TL.lampSpan({ hoursPerDay: 10 }).hours, 10);
});

test('Sensor-Ausfall: Sensorwerte gelten nach 3 Stunden als veraltet, Handwerte erst nach staleHours', () => {
  const t = terr({ staleHours: 24 });
  const sens = TL.assessTerrarium(t, { ts: T0 - 4 * TL.HOUR, t: 28, h: 50, src: 'sensor' }, T0);
  assert.equal(sens.stale, true); assert.equal(sens.sensorStale, true); assert.equal(sens.level, 'yellow');
  assert.match(TL.adviceFor(sens)[0], /Sensor hat seit 4 Stunden/);
  const frisch = TL.assessTerrarium(t, { ts: T0 - 2 * TL.HOUR, t: 28, h: 50, src: 'sensor' }, T0);
  assert.equal(frisch.stale, false);
  const hand = TL.assessTerrarium(t, { ts: T0 - 4 * TL.HOUR, t: 28, h: 50, src: 'manual' }, T0);
  assert.equal(hand.stale, false); assert.equal(hand.sensorStale, false);
  const kurz = TL.assessTerrarium(terr({ staleHours: 1 }), { ts: T0 - 2 * TL.HOUR, t: 28, h: 50, src: 'sensor' }, T0);
  assert.equal(kurz.stale, true);
});

test('Wärmelampen: Regelung über Thermostat wird geprüft', () => {
  const k = TL.newTerrarium('kn', 'Korn'); k.equip.ballast = true;
  const L = (o) => Object.assign({ id: TL.uid('l'), tid: k.id, name: 'X', type: 'chc', watt: 50, pos: 'above', guard: null, uvbPct: null, night: true }, o);
  const uv = L({ type: 'uvbT5', uvbPct: 6, watt: 24, night: false });
  const lv = (ctrl, type) => TL.lampAdvice(k, [uv, L({ ctrl, type: type || 'chc' })]).filter(a => /Thermostat|geregelt/.test(a.text)).map(a => a.level);
  assert.deepEqual(lv('thermostat'), []);
  assert.deepEqual(lv(''), ['yellow']);
  assert.deepEqual(lv('timer'), ['orange']);
  assert.deepEqual(lv('none'), ['orange']);
  assert.deepEqual(lv('dimmer'), ['orange']);
  assert.deepEqual(lv('dimmer', 'heat'), []);
  assert.deepEqual(lv('none', 'heat'), ['orange']);
  assert.deepEqual(lv('', 'heat'), ['none']);
  assert.equal(TL.validateLamp({ name: 'a', type: 'chc', ctrl: 'quatsch', hoursPerDay: 12 }, T0).errors.ctrl !== undefined, true);
  assert.equal(TL.validateLamp({ name: 'a', type: 'chc', ctrl: 'thermostat', hoursPerDay: 12 }, T0).ok, true);
});

test('Aufwärm- und Abkühlphase: Übergangswerte gelten als im Ziel', () => {
  const t = TL.newTerrarium('kn', 'Korn');
  t.dayStart = '08:00'; t.dayEnd = '20:00';
  t.day.temp = { min: 24, max: 28 }; t.night.temp = { min: 18, max: 20 };
  t.day.hum = { min: 50, max: 70 }; t.night.hum = { min: 50, max: 70 };
  const at = (h, m) => new Date(2026, 10, 1, h, m || 0).getTime();
  assert.equal(TL.rampAt(t, at(8, 30)), 'up');
  assert.equal(TL.rampAt(t, at(10, 0)), null);
  assert.equal(TL.rampAt(t, at(21, 0)), 'down');
  assert.equal(TL.rampAt(t, at(23, 0)), null);
  // 21 °C am Morgen: im Übergang grün, nach der Aufwärmphase nicht mehr
  assert.equal(TL.assessTerrarium(t, { ts: at(9, 0), t: 21, h: 60 }, at(9, 0)).level, 'green');
  assert.equal(TL.assessTerrarium(t, { ts: at(9, 0), t: 21, h: 60 }, at(9, 0)).ramp, 'up');
  assert.notEqual(TL.assessTerrarium(t, { ts: at(11, 0), t: 21, h: 60 }, at(11, 0)).level, 'green');
  // 23 °C am Abend: in der Abkühlphase grün, um Mitternacht zu warm
  assert.equal(TL.assessTerrarium(t, { ts: at(21, 0), t: 23, h: 60 }, at(21, 0)).level, 'green');
  assert.equal(TL.assessTerrarium(t, { ts: at(0, 0), t: 23, h: 60 }, at(0, 0)).level, 'red');
  // Auch im Übergang: außerhalb von Tag- und Nachtbereich bleibt es eine Warnung
  assert.equal(TL.assessTerrarium(t, { ts: at(9, 0), t: 31, h: 60 }, at(9, 0)).level, 'red');
  assert.equal(TL.assessTerrarium(t, { ts: at(21, 0), t: 15, h: 60 }, at(21, 0)).level, 'red');
  // 0 schaltet ab, alte Terrarien ohne Feld bekommen den Startwert
  t.rampUp = 0; assert.equal(TL.rampAt(t, at(8, 30)), null);
  delete t.rampDown; assert.equal(TL.rampAt(t, at(21, 0)), 'down');
  // Muster: Abendwerte in der Abkühlphase zählen nicht mehr als „nachts zu warm“
  t.rampUp = 120; t.rampDown = 180;
  const rows = [];
  for (let d = 0; d < 4; d++) for (const [h, v] of [[20, 24], [21, 23], [22, 21.5]]) rows.push({ ts: new Date(2026, 9, 27 + d, h, 0).getTime(), t: v, h: 60 });
  const pat = TL.patterns(t, rows, new Date(2026, 9, 31, 23, 0).getTime(), 7);
  assert.ok(!pat.list.some(x => x.phase === 'night' && x.kind === 'temp' && x.dir > 0));
  t.rampDown = 0;
  assert.ok(TL.patterns(t, rows, new Date(2026, 9, 31, 23, 0).getTime(), 7).list.some(x => x.phase === 'night' && x.kind === 'temp' && x.dir > 0));
  // Validierung
  const base = { name: 'x', dayStart: '08:00', dayEnd: '20:00', day: t.day, night: t.night, count: 1, staleHours: 24 };
  assert.equal(TL.validateProfile(Object.assign({}, base, { rampUp: 400 })).errors.rampUp !== undefined, true);
  assert.equal(TL.validateProfile(Object.assign({}, base, { rampUp: 90, rampDown: 0 })).ok, true);
});

/* ---------- Futterplan ---------- */

// 01.11.2026 ist ein Sonntag, 03.11.2026 ein Dienstag.
const SUN = new Date(2026, 10, 1, 10, 0).getTime();
const TUE = new Date(2026, 10, 3, 10, 0).getTime();
const at = (base, days) => base + days * TL.DAY;
const feed = (aid, ts, fed, ate) => ({ id: TL.uid('j'), aid, type: 'feed', ts, value: '', fed, ate: ate || '', note: '' });

test('Futterplan: Startwerte je Art (Kornnatter Sonntag, Chamäleon und Gecko alle 2 Tage)', () => {
  assert.deepEqual(TL.feedPlanOf(TL.newTerrarium('kn')).mode, 'weekday');
  assert.equal(TL.feedPlanOf(TL.newTerrarium('kn')).weekday, 0);
  assert.equal(TL.feedPlanLabel(TL.newTerrarium('kn')), 'Jeden Sonntag');
  assert.equal(TL.feedPlanLabel(TL.newTerrarium('jc')), 'Alle 2 Tage');
  assert.equal(TL.feedPlanLabel(TL.newTerrarium('rg')), 'Alle 2 Tage');
  assert.equal(TL.feedPlanLabel(TL.newTerrarium('other')), 'Kein Futterplan');
});

test('Migration auf Schema 4: Futterplan und Platzhalter-Tiere, vorhandene Tiere bleiben', () => {
  const c = TL.defaultConfig(); c.v = 3;
  c.terrariums.forEach(t => delete t.feed);
  c.terrariums[0].count = 3;
  c.animals = [{ id: 'a1', tid: c.terrariums[1].id, name: 'Kiwi' }];
  assert.equal(TL.migrateConfig(c), true);
  assert.equal(c.v, TL.SCHEMA);
  assert.ok(c.terrariums.every(t => t.feed && t.feed.preset));
  const snakes = c.animals.filter(a => a.tid === c.terrariums[0].id);
  assert.deepEqual(snakes.map(a => a.name), ['Schlange 1', 'Schlange 2', 'Schlange 3']);
  assert.deepEqual(c.animals.filter(a => a.tid === c.terrariums[1].id).map(a => a.name), ['Kiwi']);
  assert.deepEqual(c.animals.filter(a => a.tid === c.terrariums[2].id).map(a => a.name), ['Gecko']);
  // Eigener Plan wird nicht überschrieben
  const d = TL.defaultConfig(); d.v = 3; d.terrariums[1].feed = { mode: 'every', every: 3, weekday: 0 };
  TL.migrateConfig(d);
  assert.equal(d.terrariums[1].feed.every, 3);
  assert.equal(TL.migrateConfig(d), false);
});

test('Futterplan Sonntag: heute fällig, erledigt, überfällig', () => {
  const t = TL.newTerrarium('kn'); const a = { id: 's1', tid: t.id };
  // Noch nichts eingetragen, heute Sonntag
  let s = TL.feedStatus(t, a, [], SUN);
  assert.equal(s.level, 'yellow'); assert.equal(s.label, 'Heute füttern');
  // Sonntag gefüttert: nächster Termin in 7 Tagen
  s = TL.feedStatus(t, a, [feed('s1', SUN, 'yes', 'yes')], SUN);
  assert.equal(s.level, 'green'); assert.equal(s.daysLeft, 7);
  // Dienstag, Sonntag nicht eingetragen, letzte Fütterung eine Woche davor: 2 Tage überfällig
  s = TL.feedStatus(t, a, [feed('s1', at(SUN, -7), 'yes', 'yes')], TUE);
  assert.equal(s.level, 'orange'); assert.equal(s.daysLeft, -2); assert.match(s.label, /Seit 2 Tagen überfällig/);
  assert.ok(s.warnings.some(w => w.level === 'orange'));
  // Samstag davor gefüttert zählt für Sonntag
  s = TL.feedStatus(t, a, [feed('s1', at(SUN, -1), 'yes', 'yes')], TUE);
  assert.equal(s.level, 'green'); assert.equal(s.daysLeft, 5);
  // Bewusst nicht gefüttert zählt als erledigt
  s = TL.feedStatus(t, a, [feed('s1', SUN, 'no')], TUE);
  assert.equal(s.level, 'green'); assert.equal(s.lastFed, null);
  // Ohne Eintrag und Termin vorbei: nächster Sonntag, keine Bewertung
  s = TL.feedStatus(t, a, [], TUE);
  assert.equal(s.level, 'none'); assert.equal(s.daysLeft, 5);
});

test('Futterplan alle 2 Tage: Fälligkeit ab letztem Eintrag', () => {
  const t = TL.newTerrarium('rg'); const a = { id: 'g1', tid: t.id };
  assert.equal(TL.feedStatus(t, a, [], TUE).label, 'Wann zuletzt gefüttert? Eintragen');
  assert.equal(TL.feedStatus(t, a, [feed('g1', at(TUE, -1), 'yes', 'yes')], TUE).daysLeft, 1);
  assert.equal(TL.feedStatus(t, a, [feed('g1', at(TUE, -2), 'yes', 'yes')], TUE).level, 'yellow');
  const late = TL.feedStatus(t, a, [feed('g1', at(TUE, -5), 'yes', 'yes')], TUE);
  assert.equal(late.level, 'orange'); assert.equal(late.daysLeft, -3);
  // Eigenes Intervall
  t.feed = { mode: 'every', every: 5, weekday: 0 };
  assert.equal(TL.feedStatus(t, a, [feed('g1', at(TUE, -5), 'yes', 'yes')], TUE).level, 'yellow');
  // Plan aus
  t.feed = { mode: 'off', every: 2, weekday: 0 };
  assert.equal(TL.feedStatus(t, a, [], TUE).level, 'none');
});

test('Futterplan: jedes Tier einzeln, wer hat gefressen und wer nicht', () => {
  const c = TL.defaultConfig(); c.terrariums[0].count = 3; c.animals = TL.placeholderAnimals({ terrariums: c.terrariums, animals: [] });
  const sn = c.animals.filter(a => a.tid === c.terrariums[0].id);
  assert.equal(sn.length, 3);
  const j = [feed(sn[0].id, SUN, 'yes', 'yes'), feed(sn[1].id, SUN, 'yes', 'part'), feed(sn[2].id, SUN, 'yes', 'no')];
  const ov = TL.feedOverview(c, j, TUE).filter(x => x.t.id === c.terrariums[0].id);
  const byName = Object.fromEntries(ov.map(x => [x.a.name, x.s.last.ate]));
  assert.deepEqual(byName, { 'Schlange 1': 'yes', 'Schlange 2': 'part', 'Schlange 3': 'no' });
  assert.ok(ov.every(x => x.s.level === 'green'));
});

test('Futterplan: wiederholt nicht gefressen warnt (2 gelb, 3 orange), Auslassen unterbricht nicht', () => {
  const t = TL.newTerrarium('kn'); const a = { id: 's1', tid: t.id };
  const one = [feed('s1', SUN, 'yes', 'no'), feed('s1', at(SUN, -7), 'yes', 'yes')];
  assert.equal(TL.feedStatus(t, a, one, TUE).warnings.length, 0);
  const two = [feed('s1', SUN, 'yes', 'no'), feed('s1', at(SUN, -7), 'no'), feed('s1', at(SUN, -14), 'yes', 'no')];
  let s = TL.feedStatus(t, a, two, TUE);
  assert.equal(s.streak, 2); assert.equal(s.top, 'yellow');
  assert.ok(s.warnings[0].tips.some(x => /Häutung/.test(x)));
  const three = two.concat(feed('s1', at(SUN, -21), 'yes', 'no'));
  s = TL.feedStatus(t, a, three, TUE);
  assert.equal(s.streak, 3); assert.equal(s.top, 'orange');
  // Teilweise gefressen beendet die Serie
  assert.equal(TL.refuseStreak(TL.feedEntries([feed('s1', SUN, 'yes', 'no'), feed('s1', at(SUN, -7), 'yes', 'part'), feed('s1', at(SUN, -14), 'yes', 'no')], 's1')), 1);
});

test('Futterplan: alte Tagebuch-Fütterungen ohne Angaben zählen als gefüttert', () => {
  const e = TL.feedEntries([{ id: 'x', aid: 'g1', type: 'feed', ts: TUE, value: '', note: '' }], 'g1');
  assert.equal(e[0].fed, 'yes'); assert.equal(e[0].ate, '');
  const t = TL.newTerrarium('rg');
  assert.equal(TL.feedStatus(t, { id: 'g1' }, [{ id: 'x', aid: 'g1', type: 'feed', ts: at(TUE, -1) }], TUE).streak, 0);
});

test('Futterplan: Eingaben werden geprüft', () => {
  assert.equal(TL.validateFeeding({ aid: 'a', ts: TUE, fed: 'yes', ate: 'yes' }, TUE).ok, true);
  assert.equal(TL.validateFeeding({ aid: 'a', ts: TUE, fed: 'no', ate: '' }, TUE).ok, true);
  assert.ok(TL.validateFeeding({ aid: 'a', ts: TUE, fed: 'yes', ate: '' }, TUE).errors.ate);
  assert.ok(TL.validateFeeding({ aid: 'a', ts: TUE, fed: 'no', ate: 'yes' }, TUE).errors.ate);
  assert.ok(TL.validateFeeding({ aid: 'a', ts: TUE, fed: 'vielleicht', ate: '' }, TUE).errors.fed);
  assert.ok(TL.validateFeeding({ aid: 'a', ts: at(TUE, 2), fed: 'yes', ate: 'yes' }, TUE).errors.ts);
  assert.ok(TL.validateFeeding({ aid: 'a', ts: 'kein Datum', fed: 'yes', ate: 'yes' }, TUE).errors.ts);
  assert.ok(TL.validateFeeding({ aid: '', ts: TUE, fed: 'yes', ate: 'yes' }, TUE).errors.aid);
  assert.equal(TL.validateFeedPlan({ mode: 'weekday', weekday: 0 }).ok, true);
  assert.equal(TL.validateFeedPlan({ mode: 'every', every: '2' }).ok, true);
  assert.ok(TL.validateFeedPlan({ mode: 'every', every: '0' }).errors.every);
  assert.ok(TL.validateFeedPlan({ mode: 'every', every: '1,5' }).errors.every);
  assert.ok(TL.validateFeedPlan({ mode: 'weekday', weekday: 7 }).errors.weekday);
  assert.ok(TL.validateFeedPlan({ mode: 'irgendwas' }).errors.mode);
});

test('Beispieldaten enthalten drei Kornnattern mit unterschiedlichem Fressverhalten', () => {
  const docs = TL.demoData(TUE);
  const c = docs.config, j = TL.collectJournal(docs);
  const ov = TL.feedOverview(c, j, TUE);
  assert.equal(ov.filter(x => x.t.species === 'kn').length, 3);
  assert.ok(ov.some(x => x.s.streak >= 2));
});
