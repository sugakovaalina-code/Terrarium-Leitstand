/* Terrarium Control Center: reine Logik ohne DOM.
   Läuft im Browser (window.TL) und in Node (module.exports) für die Tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TL = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA = 3;
  const DAY = 86400000;
  const HOUR = 3600000;

  const SPECIES = {
    kn: { name: 'Kornnatter', plural: 'Kornnattern', latin: 'Pantherophis guttatus' },
    jc: { name: 'Jemenchamäleon', plural: 'Jemenchamäleons', latin: 'Chamaeleo calyptratus' },
    rg: { name: 'Neukaledonischer Riesengecko', plural: 'Riesengeckos', latin: 'Rhacodactylus leachianus' },
    other: { name: 'Andere Art', plural: 'Andere', latin: '' }
  };

  const LEVELS = ['none', 'green', 'yellow', 'orange', 'red'];
  const LEVEL_INFO = {
    green: { label: 'Im Zielbereich', short: 'OK', sym: '✓' },
    yellow: { label: 'Beobachten', short: 'Beobachten', sym: '!' },
    orange: { label: 'Handeln', short: 'Handeln', sym: '▲' },
    red: { label: 'Sofort handeln', short: 'Kritisch', sym: '✕' },
    none: { label: 'Keine Bewertung', short: 'Offen', sym: '–' }
  };

  const LIMITS = { temp: { min: -10, max: 60 }, hum: { min: 0, max: 100 } };

  const DEFAULT_TOL = { tempNear: 0.5, tempOrange: 2, humNear: 2, humOrange: 10 };

  const TASK_KINDS = {
    lamp: 'Lampe', uvb: 'UV-B-Lampe', spray: 'Beregnung / Düsen', water: 'Wasser', soil: 'Substrat',
    clean: 'Reinigung', plants: 'Pflanzen', batt: 'Sensor / Batterie', other: 'Sonstiges'
  };

  const TASK_TEMPLATES = [
    { kind: 'uvb', title: 'UV-B-Lampe tauschen' },
    { kind: 'lamp', title: 'Wärmelampe prüfen' },
    { kind: 'spray', title: 'Düsen entkalken' },
    { kind: 'spray', title: 'Wassertank der Beregnung füllen' },
    { kind: 'water', title: 'Wassernapf reinigen' },
    { kind: 'soil', title: 'Substrat wechseln' },
    { kind: 'clean', title: 'Scheiben reinigen' },
    { kind: 'plants', title: 'Pflanzen kontrollieren' },
    { kind: 'batt', title: 'Sensor-Batterie prüfen' }
  ];

  const JOURNAL_TYPES = {
    feed: { label: 'Fütterung', unit: '' },
    weight: { label: 'Gewicht', unit: 'g' },
    shed: { label: 'Häutung', unit: '' },
    poop: { label: 'Kot', unit: '' },
    vet: { label: 'Tierarzt', unit: '' },
    note: { label: 'Notiz', unit: '' }
  };

  /* ---------- Belegte Vorschläge je Art ----------
     Nur Werte aus den genannten Quellen. Abgeleitete Grenzen sind als solche markiert. */
  const SOURCES = {
    dtschbKn: { label: 'Deutscher Tierschutzbund, Steckbrief Kornnatter', url: 'https://www.tierschutzbund.de/en/about-us/material/profile-corn-snake/' },
    dtschbJc: { label: 'Deutscher Tierschutzbund, Steckbrief Jemenchamäleon', url: 'https://www.tierschutzbund.de/fileadmin/Seiten/tierschutzbund.de/Downloads/Steckbriefe_Infos/Steckbrief_Jemenchamaeleon_DTSchB.pdf' },
    bmel97: { label: 'BMEL-Gutachten Mindestanforderungen an die Haltung von Reptilien (1997)', url: 'https://lau.sachsen-anhalt.de/fileadmin/Bibliothek/Politik_und_Verwaltung/MLU/LAU/Cites/Dateien/Gutachten_Reptilien.pdf' },
    biodude: { label: 'The Bio Dude, Leachianus Caresheet', url: 'https://www.thebiodude.com/blogs/reptile-and-amphibian-caresheets-with-cited-veterinary-and-herpetology-sources/rhacodactylus-leachianus-new-caledonian-giant-gecko-caresheet-and-bioactive-maintenance' },
    sundown: { label: 'Sundown Reptiles, Leachianus Care Guide', url: 'https://www.sundownreptiles.com/pages/leachianus-gecko-rhacodactylus-leachianus-care' },
    arcadia: { label: 'Arcadia D3 Forest T5 UVB, Produktangabe „12-Month Lifespan“', url: 'https://www.amazon.com/Arcadia-Reptile-Daylight-lamp-inch/dp/B007UMU5PG' },
    ctt: { label: 'CTT Light: How Often Should You Replace a Reptile UVB Bulb?', url: 'https://www.cttlight.com/post/how-often-replace-reptile-uvb-bulb' },
    baines: { label: 'Baines et al. (2016): How much UV-B does my reptile need? Journal of Zoo and Aquarium Research 4(1)', url: 'https://jzar.org/jzar/article/view/150' },
    rsZ1: { label: 'Reptile Systems T5 „Ferguson Zone 1“ 2,4 % (Produktseite)', url: 'https://www.reptilecentre.com/products/reptile-systems-eco-t5-unit-ferguson-zone-1-24' },
    rsZ2: { label: 'Reptile Systems T5 „Ferguson Zone 2“ 6 % (Produktseite)', url: 'https://www.reptilecentre.com/products/reptile-systems-eco-t5-unit-ferguson-zone-2-6' },
    biodudeRed: { label: 'The Bio Dude: Red Bulbs and Reptiles', url: 'https://thebiodude.com/blogs/helpful-husbandry-faqs/red-bulbs-and-reptiles-why-they-are-detrimental-and-can-harm-your-pets-photoperiod' },
    zoomedPS: { label: 'Zoo Med PowerSun UV: selbstvorschaltende Mischlichtlampe, kein Vorschaltgerät nötig', url: 'https://zoomed.com/?p=1792' },
    rsZ3: { label: 'Reptile Systems T5 „Ferguson Zone 3“ 12 %, nennt das Jemenchamäleon als Beispiel (Produktseite)', url: 'https://www.reptilecentre.com/products/reptile-systems-eco-t5-unit-ferguson-zone-3-12' }
  };

  /* Licht je Art. Nur Angaben aus den genannten Quellen. */
  const LIGHTING = {
    kn: {
      zone: '1–2', uviRange: '0–0,7', uviMax: '1,1–3,0',
      uvb: 'Schwache UV-B-Röhre (T5) über einem Teil des Terrariums, damit es Schatten gibt. Hersteller, die nach Ferguson-Zonen einteilen, bieten dafür 2,4 % (Zone 1) oder 6 % (Zone 2) an.',
      uvbNeed: 'Der Tierschutzbund schreibt: UV-Licht fördert Wohlbefinden und Aktivität. Eine Pflicht nennt er nicht.',
      heat: 'Sonnenplatz mit Halogenstrahler oder besser Metalldampflampe, lokal 28 bis über 35 °C. Lampen außer Reichweite oder mit Schutzkorb.',
      hours: '12–14 Stunden Licht am Tag (außerhalb der Winterruhe).',
      night: 'Nachts Licht und Wärmestrahler aus. Die Temperatur sinkt auf 18–20 °C.',
      sources: ['dtschbKn', 'baines', 'rsZ1', 'rsZ2']
    },
    jc: {
      zone: '3', uviRange: '1,0–2,6', uviMax: '2,9–7,4',
      uvb: 'Kräftige UV-B-Lampe über dem Sonnenplatz, zum Beispiel eine T5-Röhre mit 12 % (Reptile Systems nennt das Jemenchamäleon als Beispiel für Zone 3). Der Rest des Terrariums bleibt schwächer bestrahlt.',
      uvbNeed: 'Der Tierschutzbund schreibt: UV-A- und UV-B-Versorgung muss gegeben sein. Er nennt als Beispiel noch eine 300-Watt-Mischlichtlampe (Osram Ultra-Vitalux) aus 60–80 cm Abstand, höchstens 30 Minuten am Tag.',
      heat: 'Wärmestrahler für eine lokale Erwärmung bis 40 °C. Wichtig ist ein deutliches Gefälle zwischen Tag und Nacht. Schutzgitter um die Strahler.',
      hours: 'Im Sommer 12–14 Stunden, im Winter etwa 8–10 Stunden Licht.',
      night: 'Nachts alle Lampen aus. Mindestens 20 °C, ein deutlicher Abfall zur Tagestemperatur ist erwünscht.',
      sources: ['dtschbJc', 'baines', 'rsZ3']
    },
    rg: {
      zone: '1–2 (abgeleitet)', uviRange: null, uviMax: null,
      uvb: 'Schwache UV-B-Röhre, zum Beispiel Arcadia ShadeDweller (The Bio Dude) oder eine schwache Röhre wie Zoo Med 5.0 (Sundown Reptiles).',
      uvbNeed: 'Die Studie von Baines nennt diese Art nicht. Die nahen Verwandten Kronengecko (Zone 1) und Höckerkopfgecko (Zone 2) stehen darin, daher Zone 1–2 als Ableitung. Sundown Reptiles hält UV-B für möglich, aber nicht nötig. The Bio Dude empfiehlt sie.',
      heat: 'Kleiner Halogenstrahler am Dimmer für einen Sonnenplatz von etwa 28–31 °C (The Bio Dude: 50 W mit Dimmer, Sundown: 25 W gedimmt).',
      hours: '12 Stunden Licht, 12 Stunden dunkel.',
      night: 'Nachts kein Licht. Zusätzliche Wärme laut The Bio Dude nur, wenn es unter etwa 18 °C fällt.',
      sources: ['baines', 'biodude', 'sundown']
    }
  };

  /** Prüft die Lampen eines Terrariums gegen den Bedarf der Art. Gibt Hinweise mit Stufe zurück, schlimmste zuerst. */
  function lampAdvice(t, lampList) {
    const out = [];
    const add = (level, text, lid, sources) => out.push({ level, text, lid: lid || null, sources: sources || [] });
    const li = LIGHTING[t.species];
    const own = (lampList || []).filter(l => l.tid === t.id);
    const grp = l => (LAMP_TYPES[l.type] || {}).group;
    const nm = l => '„' + (l.name || 'Lampe') + '“';
    const ballast = t.equip ? t.equip.ballast : null;
    const uvb = own.filter(l => grp(l) === 'uvb');
    const heat = own.filter(l => grp(l) === 'heat' || l.type === 'uvbMV' || l.type === 'uvbMH');
    const unknown = own.filter(l => l.type === 'unknown');
    if (li) {
      if (!uvb.length) add(t.species === 'jc' ? (unknown.length ? 'orange' : 'red') : 'yellow', 'Keine UV-B-Lampe eingetragen. LED, Glühbirne und Infrarotlampe geben kein UV-B.' + (unknown.length ? ' Falls eine der offenen Birnen eine UV-B-Lampe ist, trag ihre Art ein.' : ''), null, li.sources);
      if (!heat.length) add(unknown.length ? 'yellow' : 'orange', 'Kein Wärmestrahler für den Sonnenplatz eingetragen.', null, li.sources);
    }
    if (ballast === true && !uvb.some(l => l.type === 'uvbT5' || l.type === 'uvbT8' || l.type === 'uvbMH')) add('yellow', 'Ein Vorschaltgerät ist vorhanden, aber keine Röhre eingetragen. Steckt in der Abdeckung vielleicht eine UV-B-Röhre? Dann trag sie ein.');
    if (unknown.length) add('none', unknown.length + (unknown.length === 1 ? ' Birne ist' : ' Birnen sind') + ' noch ohne Art. Trag Art und Watt ein, dann prüft die App sie.');
    for (const l of own) {
      const hot = grp(l) === 'heat' || ['uvbMV', 'uvbMH', 'unknown'].includes(l.type);
      if (l.type === 'ir') add(l.night ? 'orange' : 'yellow', nm(l) + ': Rotes Infrarotlicht. Reptilien sehen Rot, nachts stört es den Tag-Nacht-Rhythmus. Für den Sonnenplatz am Tag ist ein weißer Strahler üblich, für Wärme in der Nacht ein Keramikstrahler ohne Licht.', l.id, ['biodudeRed']);
      if (l.night && l.type !== 'chc' && l.type !== 'ir') add('orange', nm(l) + ' ist auch nachts an. ' + (li ? li.night : 'Nachts sollte es dunkel sein.'), l.id, li ? li.sources.slice(0, 1) : []);
      if (hot && l.pos === 'inside' && l.guard !== true) add(l.guard === false ? 'red' : 'orange', nm(l) + ' hängt im Terrarium' + (l.guard === false ? ' ohne Schutzkorb' : '; ist ein Schutzkorb drum?') + ' Wärmelampen müssen außer Reichweite oder gesichert sein, sonst drohen Verbrennungen.', l.id, t.species === 'jc' ? ['dtschbJc'] : ['dtschbKn']);
      if ((l.type === 'uvbT5' || l.type === 'uvbT8') && ballast === false) add('red', nm(l) + ' ist eine Röhre. Röhren leuchten nur mit Vorschaltgerät, und hier ist keins eingetragen. Ohne Vorschaltgerät gehen ein Röhren-Komplettset mit eingebautem Vorschaltgerät oder eine selbstvorschaltende UV-B-Mischlichtlampe für eine Keramikfassung.', l.id, ['zoomedPS']);
      const pct = parseNum(l.uvbPct);
      if (grp(l) === 'uvb' && pct !== null) {
        if (t.species === 'jc' && pct < 10) add('yellow', nm(l) + ' hat ' + fmt(pct, pct % 1 ? 1 : 0) + ' %. Für das Jemenchamäleon (Ferguson-Zone 3) nennt Reptile Systems eine 12-%-Röhre.', l.id, ['baines', 'rsZ3']);
        if ((t.species === 'kn' || t.species === 'rg') && pct > 6) add('yellow', nm(l) + ' hat ' + fmt(pct, pct % 1 ? 1 : 0) + ' %. Für Zone 1–2 werden 2,4–6 % angeboten. Stärker geht nur mit viel Abstand und einem Schattenbereich, am besten nachmessen.', l.id, ['baines', 'rsZ1', 'rsZ2']);
      }
      if (l.type === 'uvbMH' && (t.species === 'kn' || t.species === 'rg')) add('yellow', nm(l) + ': Metalldampflampen sind starke UV-B-Strahler. Für Zone 1–2 liegt der UV-Index am Liegeplatz laut Baines höchstens bei 1,1–3,0. Mit viel Abstand, Schattenbereichen und einer Messung am Liegeplatz sicherstellen.', l.id, ['baines']);
      if (grp(l) === 'uvb' && (l.type === 'uvbT5' || l.type === 'uvbT8') && pct === null) add('none', nm(l) + ': Stärke in Prozent fehlt (steht auf der Röhre, z. B. 6 % oder 12 %).', l.id);
      const w = parseNum(l.watt);
      if (t.species === 'rg' && grp(l) === 'heat' && w !== null && w > 50) add('yellow', nm(l) + ' hat ' + w + ' W. Die Leitfäden für Riesengeckos nennen 25–50 W, gedimmt. Mit Thermostat oder Dimmer arbeiten.', l.id, ['biodude', 'sundown']);
      if (w === null && l.type !== 'unknown') add('none', nm(l) + ': Watt fehlt noch.', l.id);
    }
    const order = { red: 0, orange: 1, yellow: 2, none: 3, green: 4 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  /** Vergleicht eingetragene Lampen mit dem Bedarf der Art. */
  function lightCheck(t, lampList) {
    const li = LIGHTING[t.species];
    const own = (lampList || []).filter(l => l.tid === t.id);
    const hasUvb = own.some(l => (LAMP_TYPES[l.type] || {}).group === 'uvb');
    const hasHeat = own.some(l => (LAMP_TYPES[l.type] || {}).group === 'heat' || l.type === 'uvbMV' || l.type === 'uvbMH');
    const issues = [];
    if (li && !hasUvb) issues.push('Keine UV-B-Lampe eingetragen.');
    if (li && !hasHeat) issues.push('Kein Wärmestrahler eingetragen.');
    return { known: !!li, hasUvb, hasHeat, issues };
  }

  /* Lampenarten. months = Richtwert zum Austausch, nur wo eine Quelle ihn nennt (untere Grenze bei Spannen). */
  const LAMP_TYPES = {
    uvbT5: { label: 'UV-B-Röhre T5', group: 'uvb', months: 12, sources: ['arcadia', 'ctt'], note: 'Arcadia gibt für T5-Röhren 12 Monate an.' },
    uvbT8: { label: 'UV-B-Röhre T8', group: 'uvb', months: 6, sources: ['ctt'], note: 'Laut CTT Light für Arcadia und ReptiSun T8 alle 6 Monate.' },
    uvbCompact: { label: 'UV-B-Kompaktlampe', group: 'uvb', months: 6, sources: ['ctt'], note: 'Richtwert 6–8 Monate laut CTT Light, Hersteller prüfen.' },
    uvbMV: { label: 'UV-B-Mischlicht (Quecksilberdampf)', group: 'uvb', months: 6, sources: ['ctt'], note: 'Richtwert 6–12 Monate laut CTT Light, Hersteller prüfen. Die App nimmt die untere Grenze.' },
    uvbMH: { label: 'UV-B-Metalldampflampe (HID)', group: 'uvb', months: 18, sources: ['ctt'], note: 'Richtwert 18–24 Monate laut CTT Light, Hersteller prüfen. Die App nimmt die untere Grenze.' },
    heat: { label: 'Wärmelampe (Halogen)', group: 'heat', months: null, sources: [], note: 'Keine feste Austauschfrist. Trag die Lebensdauer in Stunden von der Verpackung ein.' },
    led: { label: 'LED (Lampe, Leiste oder Spot)', group: 'light', months: null, sources: [], note: 'LEDs geben Licht, aber kein UV-B und kaum Wärme. Lebensdauer in Stunden laut Hersteller.' },
    incand: { label: 'Glühbirne / Spotstrahler', group: 'heat', months: null, sources: [], note: 'Weißer Strahler für den Sonnenplatz. Lebensdauer in Stunden von der Packung.' },
    ir: { label: 'Infrarot-Wärmelampe (rot)', group: 'heat', months: null, sources: ['biodudeRed'], note: 'Gibt rotes Licht ab. Reptilien sehen Rot, deshalb stört sie nachts den Tag-Nacht-Rhythmus.' },
    chc: { label: 'Keramikstrahler (ohne Licht)', group: 'heat', months: null, sources: ['biodudeRed'], note: 'Gibt nur Wärme ab, kein Licht. Gut für Wärme in der Nacht, nur mit Thermostat.' },
    unknown: { label: 'Birne, Art noch offen', group: 'unknown', months: null, sources: [], note: 'Trag später ein, was genau es ist, dann kann die App prüfen.' },
    other: { label: 'Andere Lampe', group: 'other', months: null, sources: [], note: '' }
  };

  /* Vorgegebene Aufgaben je Art. Intervalle sind Startwerte der App, keine Haltungsvorgabe. */
  const DEFAULT_TASKS = {
    kn: [['water', 'Wasser wechseln, Napf reinigen', 2], ['clean', 'Kot entfernen', 3], ['clean', 'Scheiben reinigen', 14], ['soil', 'Substrat komplett wechseln', 90], ['clean', 'Einrichtung reinigen und desinfizieren', 180], ['batt', 'Sensor-Batterie prüfen', 90]],
    jc: [['spray', 'Düsen entkalken', 30], ['spray', 'Wassertank der Beregnung füllen', 7], ['plants', 'Pflanzen gießen und kontrollieren', 7], ['clean', 'Kot und Futterreste entfernen', 3], ['clean', 'Scheiben reinigen', 14], ['soil', 'Substrat wechseln', 90], ['batt', 'Sensor-Batterie prüfen', 90]],
    rg: [['water', 'Wasser wechseln, Napf reinigen', 2], ['clean', 'Futterschälchen reinigen', 2], ['spray', 'Düsen entkalken', 30], ['plants', 'Pflanzen kontrollieren', 14], ['clean', 'Scheiben reinigen', 14], ['soil', 'Substrat wechseln', 90], ['batt', 'Sensor-Batterie prüfen', 90]],
    other: [['water', 'Wasser wechseln', 2], ['clean', 'Scheiben reinigen', 14]]
  };

  const DEFAULT_LAMPS = {
    kn: [['uvbT5', 'UV-B-Röhre T5 (schwach, 2,4–6 %)'], ['heat', 'Wärmestrahler Sonnenplatz']],
    jc: [['uvbT5', 'UV-B-Röhre T5 (12 %)'], ['heat', 'Wärmestrahler Sonnenplatz']],
    rg: [['uvbT5', 'UV-B-Röhre T5 (schwach)'], ['heat', 'Wärmestrahler am Dimmer']],
    other: []
  };

  const PRESETS = {
    kn: {
      day: { temp: { min: 24, max: 28 }, hum: { min: 50, max: 70 } },
      night: { temp: { min: 18, max: 20 }, hum: { min: 50, max: 70 } },
      hotspot: '28 bis über 35 °C lokal (Sonnenplatz)',
      notes: ['Luftfeuchte gibt die Quelle ohne Tag/Nacht-Unterschied an, deshalb nachts gleich.', 'Winterruhe laut Quelle: zwei Monate zwischen Oktober und März bei 8–12 °C im Dunkeln. In dieser Zeit gelten diese Zielwerte nicht.', 'Das BMEL-Gutachten 1997 nennt ähnlich 22–28 °C am Tag und 18–20 °C nachts.'],
      sources: ['dtschbKn', 'bmel97']
    },
    jc: {
      day: { temp: { min: 25, max: 28 }, hum: { min: 60, max: 90 } },
      night: { temp: { min: 20, max: 23 }, hum: { min: 60, max: 90 } },
      hotspot: 'bis 40 °C lokal unter dem Wärmestrahler',
      notes: ['Nachts nennt der Tierschutzbund nur „mindestens 20 °C“. Die Obergrenze 23 °C ist abgeleitet: Das BMEL-Gutachten empfiehlt für viele Chamäleons eine Nachtabsenkung um 5–8 °C.', 'Luftfeuchte gibt die Quelle ohne Tag/Nacht-Unterschied an.'],
      sources: ['dtschbJc', 'bmel97']
    },
    rg: {
      day: { temp: { min: 22, max: 26 }, hum: { min: 60, max: 80 } },
      night: { temp: { min: 19, max: 22 }, hum: { min: 60, max: 80 } },
      hotspot: 'etwa 28–31 °C am Sonnenplatz',
      notes: ['Für diese Art habe ich keine deutsche Fachbehörde mit Klimawerten gefunden. Die Werte stammen aus zwei englischen Pflegeleitfäden von Züchtern (umgerechnet aus °F) und überlappen sich in diesem Bereich.', 'Sundown Reptiles nennt nachts im Winter auch Mitte 60 °F (etwa 18 °C).'],
      sources: ['biodude', 'sundown']
    }
  };

  /* Mindestmaße nach BMEL-Gutachten 1997 (Kornnatter zusätzlich Tierschutzbund).
     basis: 'GL' = Gesamtlänge (Schlangen), 'KRL' = Kopf-Rumpf-Länge (Echsen). */
  const SIZE_RULES = {
    kn: { basis: 'GL', f: [1, 0.5, 1], base: 2, extra: { kind: 'volume', pct: 20 }, src: 'bmel97', text: 'Länge × halbe Länge × Länge der längsten Schlange, für bis zu zwei Tiere. Je weiteres Tier etwa 20 % mehr Volumen. Bis zu 10 % Unterschreitung sind laut Gutachten möglich.' },
    jc: { basis: 'KRL', f: [4, 2.5, 4], base: 1, extra: { kind: 'floor', pct: 20 }, src: 'bmel97', text: '4 × 2,5 × 4 Kopf-Rumpf-Längen. Für ein Paar 20 % mehr Grundfläche. Der Tierschutzbund empfiehlt für ein Tier mindestens 200 × 100 × 150 cm.', absMin: [200, 100, 150] },
    rg: { basis: 'KRL', f: [6, 6, 8], base: 2, extra: { kind: 'floor', pct: 15 }, src: 'bmel97', text: '6 × 6 × 8 Kopf-Rumpf-Längen für ein Paar (Gutachten-Zeile Rhacodactylus). Je weiteres Tier 15 % mehr Grundfläche.' }
  };

  /** Mindestmaße in cm für Art, Tierlänge (cm) und Anzahl. */
  function minSize(species, len, count) {
    const rule = SIZE_RULES[species];
    const L = parseNum(len), n = Math.max(1, Math.round(parseNum(count) || 1));
    if (!rule || L === null || L <= 0) return null;
    let [l, b, h] = rule.f.map(x => x * L);
    const extra = Math.max(0, n - rule.base);
    if (extra > 0) {
      if (rule.extra.kind === 'floor') { const k = Math.sqrt(1 + extra * rule.extra.pct / 100); l *= k; b *= k; }
      else { const k = Math.cbrt(1 + extra * rule.extra.pct / 100); l *= k; b *= k; h *= k; }
    }
    if (rule.absMin && n <= 1) { l = Math.max(l, rule.absMin[0]); b = Math.max(b, rule.absMin[1]); h = Math.max(h, rule.absMin[2]); }
    return { l: Math.ceil(l), b: Math.ceil(b), h: Math.ceil(h), basis: rule.basis };
  }

  /** Vergleicht Terrarienmaße mit den Mindestmaßen. Höhe und Grundfläche getrennt, Länge/Breite dürfen getauscht sein. */
  function checkSize(species, size, len, count) {
    const m = minSize(species, len, count);
    const l = parseNum(size && size.l), b = parseNum(size && size.b), h = parseNum(size && size.h);
    if (!m || l === null || b === null || h === null) return null;
    const long = Math.max(l, b), short = Math.min(l, b);
    const mLong = Math.max(m.l, m.b), mShort = Math.min(m.l, m.b);
    const issues = [];
    if (long < mLong) issues.push('Länge ' + Math.round(long) + ' cm statt mindestens ' + mLong + ' cm');
    if (short < mShort) issues.push('Tiefe ' + Math.round(short) + ' cm statt mindestens ' + mShort + ' cm');
    if (h < m.h) issues.push('Höhe ' + Math.round(h) + ' cm statt mindestens ' + m.h + ' cm');
    return { ok: issues.length === 0, min: m, issues };
  }

  function defaultTasksFor(t) {
    return (DEFAULT_TASKS[t.species] || DEFAULT_TASKS.other).map(([kind, title, every]) => ({ id: uid('k'), tid: t.id, kind, title, every, last: '', note: '', log: [], preset: true }));
  }
  function defaultLampsFor(t) {
    return (DEFAULT_LAMPS[t.species] || []).map(([type, name]) => ({ id: uid('l'), tid: t.id, type, name, model: '', watt: null, installed: '', lifeMonths: LAMP_TYPES[type].months, lifeHours: null, hoursPerDay: 12, log: [], pos: '', guard: null, uvbPct: null, night: false, fixture: '' }));
  }
  function applyPreset(t) {
    const pr = PRESETS[t.species];
    if (!pr) return t;
    for (const ph of ['day', 'night']) for (const k of ['temp', 'hum']) t[ph][k] = { min: pr[ph][k].min, max: pr[ph][k].max };
    t.source = 'Vorschlag: ' + pr.sources.map(k => SOURCES[k].label).join('; ');
    return t;
  }

  /** Bringt gespeicherte Einstellungen auf den aktuellen Stand. Gibt true zurück, wenn etwas geändert wurde. */
  function migrateConfig(c) {
    if (!c || (c.v || 1) >= SCHEMA) return false;
    c.terrariums.forEach(t => {
      if (!profileAnySet(t)) applyPreset(t);
      if (!t.size) t.size = { l: null, b: null, h: null };
      if (t.animalLen === undefined) t.animalLen = null;
      if (!t.count) t.count = 1;
    });
    if (!Array.isArray(c.lamps)) c.lamps = [];
    if (!c.lamps.length) c.terrariums.forEach(t => { c.lamps.push(...defaultLampsFor(t)); });
    if (!c.tasks.length) c.terrariums.forEach(t => { c.tasks.push(...defaultTasksFor(t)); });
    c.terrariums.forEach(t => { if (!t.equip) t.equip = { covers: '', ballast: null, notes: '' }; });
    c.lamps.forEach(l => { if (l.pos === undefined) l.pos = ''; if (l.guard === undefined) l.guard = null; if (l.uvbPct === undefined) l.uvbPct = null; if (l.night === undefined) l.night = false; if (l.fixture === undefined) l.fixture = ''; });
    c.v = SCHEMA;
    return true;
  }

  function addMonths(ts, m) {
    const d = new Date(ts);
    const day = d.getDate();
    d.setMonth(d.getMonth() + m);
    if (d.getDate() < day) d.setDate(0);
    return d.getTime();
  }

  /** Restlaufzeit einer Lampe. */
  function lampInfo(l, now) {
    const inst = l.installed ? Date.parse(l.installed) : NaN;
    if (!Number.isFinite(inst)) return { level: 'none', label: 'Einbaudatum fehlt', pct: null, daysLeft: null };
    const months = parseNum(l.lifeMonths), hours = parseNum(l.lifeHours), hpd = parseNum(l.hoursPerDay);
    let dueAt = null;
    if (months && months > 0) dueAt = addMonths(inst, months);
    else if (hours && hours > 0 && hpd && hpd > 0) dueAt = inst + Math.round(hours / hpd) * DAY;
    if (dueAt === null) return { level: 'none', label: 'Lebensdauer fehlt', pct: null, daysLeft: null, ageDays: Math.floor((now - inst) / DAY) };
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const dd = new Date(dueAt); dd.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((dd - startToday) / DAY);
    const pct = Math.max(0, Math.min(100, Math.round((now - inst) / (dueAt - inst) * 100)));
    let level = 'green', label;
    if (daysLeft < 0) { level = 'red'; label = 'Seit ' + (-daysLeft) + (daysLeft === -1 ? ' Tag' : ' Tagen') + ' fällig'; }
    else if (daysLeft <= 14) { level = 'orange'; label = daysLeft === 0 ? 'Heute tauschen' : 'In ' + daysLeft + (daysLeft === 1 ? ' Tag' : ' Tagen') + ' tauschen'; }
    else if (daysLeft <= 45) { level = 'yellow'; label = 'In ' + daysLeft + ' Tagen tauschen'; }
    else label = 'Noch ' + (daysLeft >= 60 ? Math.round(daysLeft / 30.4) + ' Monate' : daysLeft + ' Tage');
    return { level, label, pct, daysLeft, dueAt, ageDays: Math.floor((now - inst) / DAY) };
  }

  function validateLamp(l, now) {
    const errors = {};
    if (!String(l.name || '').trim()) errors.name = 'Bitte einen Namen eingeben.';
    if (!LAMP_TYPES[l.type]) errors.type = 'Bitte eine Lampenart wählen.';
    if (l.installed) {
      const t = Date.parse(l.installed);
      if (!Number.isFinite(t)) errors.installed = 'Bitte ein gültiges Datum wählen.';
      else if (t > now + DAY) errors.installed = 'Das Datum liegt in der Zukunft.';
    }
    const m = l.lifeMonths === '' || l.lifeMonths === null || l.lifeMonths === undefined ? null : parseNum(l.lifeMonths);
    const h = l.lifeHours === '' || l.lifeHours === null || l.lifeHours === undefined ? null : parseNum(l.lifeHours);
    if (m !== null && (m <= 0 || m > 120)) errors.lifeMonths = 'Bitte 1 bis 120 Monate.';
    if ((l.lifeMonths !== '' && l.lifeMonths !== null && l.lifeMonths !== undefined) && m === null) errors.lifeMonths = 'Bitte eine Zahl eingeben.';
    if (h !== null && (h <= 0 || h > 100000)) errors.lifeHours = 'Bitte 1 bis 100000 Stunden.';
    const hpd = parseNum(l.hoursPerDay);
    if (hpd === null || hpd <= 0 || hpd > 24) errors.hoursPerDay = 'Bitte 1 bis 24 Stunden pro Tag.';
    if (l.watt !== '' && l.watt !== null && l.watt !== undefined) { const w = parseNum(l.watt); if (w === null || w <= 0 || w > 2000) errors.watt = 'Bitte Watt als Zahl.'; }
    return { ok: Object.keys(errors).length === 0, errors };
  }

  /** Einbaudatum aus dem Alter in Monaten. */
  function installedFromAge(ageMonths, now) {
    const a = parseNum(ageMonths);
    if (a === null || a < 0 || a > 240) return null;
    const whole = Math.floor(a);
    const ts = addMonths(now, -whole) - Math.round((a - whole) * 30.4) * DAY;
    return isoDay(ts);
  }

  /* ---------- Hilfen ---------- */

  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function parseNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim().replace(',', '.');
    if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function fmt(n, digits) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '–';
    return n.toLocaleString('de-DE', { minimumFractionDigits: digits ?? 1, maximumFractionDigits: digits ?? 1 });
  }

  function hhmmToMin(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function monthKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* ---------- Terrarium und Profile ---------- */

  function emptyRange() { return { min: null, max: null }; }

  function newTerrarium(species, name) {
    return {
      id: uid('t'),
      name: name || SPECIES[species]?.name || 'Terrarium',
      species: species || 'other',
      dayStart: '08:00',
      dayEnd: '20:00',
      day: { temp: emptyRange(), hum: emptyRange() },
      night: { temp: emptyRange(), hum: emptyRange() },
      tol: Object.assign({}, DEFAULT_TOL),
      staleHours: 24,
      sensor: { type: 'manual', deviceId: '' },
      source: '',
      size: { l: null, b: null, h: null },
      animalLen: null,
      count: 1,
      equip: { covers: '', ballast: null, notes: '' }
    };
  }

  function defaultConfig() {
    const terrariums = [newTerrarium('kn', 'Kornnattern'), newTerrarium('jc', 'Jemenchamäleon'), newTerrarium('rg', 'Riesengecko')];
    terrariums.forEach(applyPreset);
    const tasks = [], lamps = [];
    terrariums.forEach(t => { tasks.push(...defaultTasksFor(t)); lamps.push(...defaultLampsFor(t)); });
    return { v: SCHEMA, terrariums, animals: [], tasks, lamps, settings: { dueSoonDays: 2 } };
  }

  function rangeSet(r) { return !!r && r.min !== null && r.max !== null && Number.isFinite(r.min) && Number.isFinite(r.max); }

  function profileComplete(t) {
    return rangeSet(t.day.temp) && rangeSet(t.day.hum) && rangeSet(t.night.temp) && rangeSet(t.night.hum);
  }

  function profileAnySet(t) {
    return rangeSet(t.day.temp) || rangeSet(t.day.hum) || rangeSet(t.night.temp) || rangeSet(t.night.hum);
  }

  /** Tag oder Nacht für einen Zeitpunkt. Tagphase darf über Mitternacht laufen. */
  function phaseAt(t, ts) {
    const s = hhmmToMin(t.dayStart), e = hhmmToMin(t.dayEnd);
    if (s === null || e === null || s === e) return 'day';
    const d = new Date(ts);
    const m = d.getHours() * 60 + d.getMinutes();
    const inDay = s < e ? (m >= s && m < e) : (m >= s || m < e);
    return inDay ? 'day' : 'night';
  }

  function rangesAt(t, ts) {
    const phase = phaseAt(t, ts);
    return { phase, temp: t[phase].temp, hum: t[phase].hum };
  }

  /* ---------- Bewertung ---------- */

  /** Bewertet einen Wert gegen einen Bereich. kind: 'temp' oder 'hum'. */
  function assess(value, range, kind, tol) {
    const T = Object.assign({}, DEFAULT_TOL, tol || {});
    if (value === null || value === undefined || !Number.isFinite(value) || !rangeSet(range)) {
      return { level: 'none', dir: 0, dev: 0 };
    }
    const near = kind === 'temp' ? T.tempNear : T.humNear;
    const orange = kind === 'temp' ? T.tempOrange : T.humOrange;
    if (value < range.min) {
      const dev = round1(range.min - value);
      return { level: dev <= orange ? 'orange' : 'red', dir: -1, dev };
    }
    if (value > range.max) {
      const dev = round1(value - range.max);
      return { level: dev <= orange ? 'orange' : 'red', dir: 1, dev };
    }
    if (value - range.min < near) return { level: 'yellow', dir: -1, dev: 0, edge: true };
    if (range.max - value < near) return { level: 'yellow', dir: 1, dev: 0, edge: true };
    return { level: 'green', dir: 0, dev: 0 };
  }

  function worst(levels) {
    let best = 'none';
    for (const l of levels) if (LEVELS.indexOf(l) > LEVELS.indexOf(best)) best = l;
    return best;
  }

  /** Gesamtbewertung des letzten Messwerts eines Terrariums. */
  function assessTerrarium(t, reading, now) {
    if (!reading) {
      return { level: 'none', reason: 'nodata', temp: { level: 'none' }, hum: { level: 'none' }, phase: phaseAt(t, now), stale: false };
    }
    const r = rangesAt(t, reading.ts);
    const temp = assess(reading.t, r.temp, 'temp', t.tol);
    const hum = assess(reading.h, r.hum, 'hum', t.tol);
    const ageH = (now - reading.ts) / HOUR;
    const stale = ageH > (t.staleHours || 24);
    let level = worst([temp.level, hum.level]);
    if (stale && LEVELS.indexOf(level) < LEVELS.indexOf('yellow')) level = 'yellow';
    if (!profileAnySet(t)) level = stale ? 'yellow' : 'none';
    return { level, temp, hum, phase: r.phase, ranges: r, stale, ageH, reason: stale ? 'stale' : (profileAnySet(t) ? 'ok' : 'noprofile') };
  }

  /** Empfohlene Prüfschritte. Bewusst als Prüfungen formuliert, nicht als Haltungsvorgaben. */
  function adviceFor(a) {
    const out = [];
    if (!a || a.reason === 'nodata') return ['Trage einen ersten Messwert ein oder verbinde später einen Sensor.'];
    if (a.reason === 'noprofile') return ['Lege für dieses Terrarium Zielwerte für Tag und Nacht fest. Erst dann kann die App bewerten.'];
    if (a.stale) out.push('Der letzte Messwert ist älter als ' + Math.round(a.ageH) + ' Stunden. Miss neu oder prüfe den Sensor.');
    if (a.temp.dir > 0 && a.temp.level !== 'green' && !a.temp.edge) {
      out.push('Prüfe den Sollwert am Thermostat und ob der Thermostat-Fühler richtig sitzt.');
      out.push('Prüfe die Raumtemperatur. Im Sommer kann der Raum das Terrarium mit aufheizen.');
      out.push('Ändere die Wärmequelle nicht nur nach Watt. Entscheidend ist die gemessene Temperatur am Platz.');
    }
    if (a.temp.dir < 0 && a.temp.level !== 'green' && !a.temp.edge) {
      out.push('Prüfe, ob Wärmelampe oder Heizung laufen und nicht defekt sind.');
      out.push('Prüfe Zeitschaltuhr und Thermostat: Schalten sie zur richtigen Zeit?');
      if (a.phase === 'night') out.push('Nachts kühlt der Raum oft stärker ab. Prüfe die Raumtemperatur in der Nacht.');
    }
    if (a.hum.dir < 0 && a.hum.level !== 'green' && !a.hum.edge) {
      out.push('Prüfe Beregnungsanlage und Düsen. Verkalkte Düsen sprühen weniger.');
      out.push('Prüfe den Wasserstand im Tank und die Sprühzeiten.');
      out.push('Prüfe, ob die Lüftung stärker ist als sonst.');
    }
    if (a.hum.dir > 0 && a.hum.level !== 'green' && !a.hum.edge) {
      out.push('Prüfe die Lüftung. Staunässe und Schimmel vermeiden.');
      out.push('Prüfe Sprühintervall und -dauer der Beregnung.');
      out.push('Prüfe, ob der Sensor nass geworden ist. Direktes Sprühwasser verfälscht den Wert.');
    }
    if ((a.temp.edge || a.hum.edge) && out.length === 0) out.push('Der Wert liegt knapp am Rand des Zielbereichs. Beobachte die nächsten Messungen.');
    if (a.level === 'red') out.push('Beobachte dein Tier. Wenn es sich auffällig verhält, frag deine Tierärztin oder deinen Tierarzt.');
    return out;
  }

  /* ---------- Messwerte ---------- */

  function validateReading(input, now) {
    const errors = {};
    const t = parseNum(input.t);
    const h = parseNum(input.h);
    if (input.t === '' || input.t === null || input.t === undefined) {
      if (input.h === '' || input.h === null || input.h === undefined) errors.form = 'Trage mindestens Temperatur oder Luftfeuchte ein.';
    } else if (t === null) errors.t = 'Bitte eine Zahl eingeben, zum Beispiel 26,5.';
    else if (t < LIMITS.temp.min || t > LIMITS.temp.max) errors.t = 'Das ist kein realistischer Wert. Erlaubt sind ' + LIMITS.temp.min + ' bis ' + LIMITS.temp.max + ' °C.';
    if (!(input.h === '' || input.h === null || input.h === undefined)) {
      if (h === null) errors.h = 'Bitte eine Zahl eingeben, zum Beispiel 60.';
      else if (h < LIMITS.hum.min || h > LIMITS.hum.max) errors.h = 'Luftfeuchte geht nur von 0 bis 100 %.';
    }
    const ts = typeof input.ts === 'number' ? input.ts : Date.parse(input.ts);
    if (!Number.isFinite(ts)) errors.ts = 'Bitte Datum und Uhrzeit wählen.';
    else if (ts > now + 5 * 60000) errors.ts = 'Der Zeitpunkt liegt in der Zukunft.';
    const ok = Object.keys(errors).length === 0;
    return { ok, errors, value: ok ? { t: t === null ? null : round1(t), h: h === null ? null : round1(h), ts } : null };
  }

  function validateProfile(p) {
    const errors = {};
    if (!String(p.name || '').trim()) errors.name = 'Bitte einen Namen eingeben.';
    if (hhmmToMin(p.dayStart) === null) errors.dayStart = 'Uhrzeit im Format 08:00.';
    if (hhmmToMin(p.dayEnd) === null) errors.dayEnd = 'Uhrzeit im Format 20:00.';
    for (const phase of ['day', 'night']) {
      for (const kind of ['temp', 'hum']) {
        const r = p[phase][kind];
        const key = phase + '.' + kind;
        const lim = LIMITS[kind];
        const mnRaw = r.min, mxRaw = r.max;
        const mn = parseNum(mnRaw), mx = parseNum(mxRaw);
        const emptyMin = mnRaw === '' || mnRaw === null || mnRaw === undefined;
        const emptyMax = mxRaw === '' || mxRaw === null || mxRaw === undefined;
        if (emptyMin && emptyMax) continue;
        if (emptyMin || emptyMax) { errors[key] = 'Bitte beide Werte eintragen oder beide leer lassen.'; continue; }
        if (mn === null || mx === null) { errors[key] = 'Bitte Zahlen eingeben.'; continue; }
        if (mn < lim.min || mx > lim.max) { errors[key] = 'Werte außerhalb von ' + lim.min + ' bis ' + lim.max + '.'; continue; }
        if (mn >= mx) errors[key] = 'Der Mindestwert muss kleiner als der Höchstwert sein.';
      }
    }
    for (const k of ['l', 'b', 'h']) {
      const raw = p.size ? p.size[k] : null;
      if (raw === '' || raw === null || raw === undefined) continue;
      const v = parseNum(raw);
      if (v === null || v < 10 || v > 1000) errors.size = 'Maße bitte in cm zwischen 10 und 1000.';
    }
    if (!(p.animalLen === '' || p.animalLen === null || p.animalLen === undefined)) {
      const v = parseNum(p.animalLen);
      if (v === null || v < 2 || v > 400) errors.animalLen = 'Tierlänge bitte in cm zwischen 2 und 400.';
    }
    const cnt = parseNum(p.count);
    if (cnt === null || cnt < 1 || cnt > 20 || Math.round(cnt) !== cnt) errors.count = 'Anzahl bitte als ganze Zahl von 1 bis 20.';
    const sh = parseNum(p.staleHours);
    if (sh === null || sh < 1 || sh > 720) errors.staleHours = 'Bitte 1 bis 720 Stunden.';
    return { ok: Object.keys(errors).length === 0, errors };
  }

  /** Statistik über Messwerte eines Zeitraums. */
  function stats(t, readings) {
    const out = { count: readings.length, temp: null, hum: null, inRange: { temp: null, hum: null } };
    const ts = readings.filter(r => Number.isFinite(r.t)).map(r => r.t);
    const hs = readings.filter(r => Number.isFinite(r.h)).map(r => r.h);
    const agg = a => a.length ? { min: Math.min(...a), max: Math.max(...a), avg: round1(a.reduce((x, y) => x + y, 0) / a.length) } : null;
    out.temp = agg(ts); out.hum = agg(hs);
    for (const kind of ['temp', 'hum']) {
      let n = 0, ok = 0;
      for (const r of readings) {
        const v = kind === 'temp' ? r.t : r.h;
        const range = rangesAt(t, r.ts)[kind];
        if (!Number.isFinite(v) || !rangeSet(range)) continue;
        n++;
        if (v >= range.min && v <= range.max) ok++;
      }
      out.inRange[kind] = n ? Math.round(ok / n * 100) : null;
    }
    return out;
  }

  /** Muster in den letzten Tagen: wie oft zu warm/kalt/trocken/feucht, getrennt nach Tag und Nacht. */
  function patterns(t, readings, now, days) {
    const from = now - (days || 7) * DAY;
    const buckets = {};
    let considered = 0;
    for (const r of readings) {
      if (r.ts < from || r.ts > now) continue;
      const rg = rangesAt(t, r.ts);
      for (const kind of ['temp', 'hum']) {
        const v = kind === 'temp' ? r.t : r.h;
        const a = assess(v, rg[kind], kind, t.tol);
        if (a.level === 'none') continue;
        considered++;
        if (a.dir === 0 || a.edge) continue;
        const key = rg.phase + ':' + kind + ':' + (a.dir > 0 ? 'high' : 'low');
        const day = new Date(r.ts).toDateString();
        buckets[key] = buckets[key] || { phase: rg.phase, kind, dir: a.dir, n: 0, days: new Set(), maxDev: 0 };
        buckets[key].n++;
        buckets[key].days.add(day);
        buckets[key].maxDev = Math.max(buckets[key].maxDev, a.dev);
      }
    }
    const words = { 'temp:high': 'zu warm', 'temp:low': 'zu kalt', 'hum:high': 'zu feucht', 'hum:low': 'zu trocken' };
    const tips = {
      'day:temp:high': 'Prüfe Thermostat-Sollwert, Lampenabstand und Raumtemperatur am Tag.',
      'day:temp:low': 'Prüfe, ob die Wärmequelle lang genug läuft und der Thermostat richtig regelt.',
      'night:temp:high': 'Prüfe, ob eine Wärmequelle nachts weiterläuft (Zeitschaltuhr).',
      'night:temp:low': 'Prüfe die nächtliche Raumtemperatur und ob eine Nachtabsenkung zu stark ist.',
      'day:hum:high': 'Prüfe Lüftung und Beregnungsdauer am Tag.',
      'day:hum:low': 'Prüfe Düsen, Wassertank und Sprühzeiten am Tag.',
      'night:hum:high': 'Prüfe, ob nachts zu viel beregnet wird oder die Lüftung zu schwach ist.',
      'night:hum:low': 'Prüfe, ob eine Sprühzeit am Abend oder in der Nacht fehlt.'
    };
    const list = Object.values(buckets)
      .map(b => {
        const k = b.kind + ':' + (b.dir > 0 ? 'high' : 'low');
        return {
          phase: b.phase, kind: b.kind, dir: b.dir, count: b.n, days: b.days.size, maxDev: round1(b.maxDev),
          text: (b.phase === 'day' ? 'Tagsüber' : 'Nachts') + ' an ' + b.days.size + (b.days.size === 1 ? ' Tag ' : ' Tagen ') + words[k] + ' (bis ' + fmt(b.maxDev) + (b.kind === 'temp' ? ' °C' : ' %') + ' daneben).',
          tip: tips[b.phase + ':' + k],
          level: b.days.size >= 3 ? 'orange' : 'yellow'
        };
      })
      .sort((a, b) => b.days - a.days || b.count - a.count);
    return { considered, list };
  }

  /* ---------- Pflege ---------- */

  function dueInfo(task, now, dueSoonDays) {
    const every = parseNum(task.every);
    if (!every || every <= 0) return { level: 'none', daysLeft: null, label: 'Kein Intervall' };
    const last = task.last ? Date.parse(task.last) : null;
    if (!Number.isFinite(last)) return { level: 'none', daysLeft: null, label: 'Wann zuletzt? Datum eintragen' };
    const dueAt = last + every * DAY;
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const dueDay = new Date(dueAt); dueDay.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((dueDay - startToday) / DAY);
    let level = 'green', label;
    if (daysLeft < 0) { level = daysLeft < -Math.max(2, every * 0.25) ? 'red' : 'orange'; label = 'Seit ' + (-daysLeft) + (daysLeft === -1 ? ' Tag' : ' Tagen') + ' überfällig'; }
    else if (daysLeft === 0) { level = 'orange'; label = 'Heute fällig'; }
    else if (daysLeft <= (dueSoonDays ?? 2)) { level = 'yellow'; label = 'In ' + daysLeft + (daysLeft === 1 ? ' Tag' : ' Tagen') + ' fällig'; }
    else label = 'In ' + daysLeft + ' Tagen';
    return { level, daysLeft, label, dueAt };
  }

  function validateTask(p) {
    const errors = {};
    if (!String(p.title || '').trim()) errors.title = 'Bitte einen Namen eingeben.';
    const ev = parseNum(p.every);
    if (ev === null || ev < 1 || ev > 3650 || Math.round(ev) !== ev) errors.every = 'Bitte ganze Tage zwischen 1 und 3650.';
    if (p.last && !Number.isFinite(Date.parse(p.last))) errors.last = 'Bitte ein gültiges Datum wählen.';
    return { ok: Object.keys(errors).length === 0, errors };
  }

  function isoDay(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- Tiere und Tagebuch ---------- */

  function validateJournal(p, now) {
    const errors = {};
    if (!JOURNAL_TYPES[p.type]) errors.type = 'Bitte eine Art wählen.';
    const ts = Date.parse(p.ts);
    if (!Number.isFinite(ts)) errors.ts = 'Bitte ein Datum wählen.';
    else if (ts > now + 5 * 60000) errors.ts = 'Das Datum liegt in der Zukunft.';
    if (p.type === 'weight') {
      const w = parseNum(p.value);
      if (w === null || w <= 0 || w > 20000) errors.value = 'Bitte das Gewicht in Gramm eingeben.';
    }
    if (p.type === 'note' && !String(p.note || '').trim()) errors.note = 'Bitte einen Text eingeben.';
    return { ok: Object.keys(errors).length === 0, errors };
  }

  /* ---------- Export und Backup ---------- */

  function csvEscape(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function readingsCsv(terrariums, readings) {
    const names = Object.fromEntries(terrariums.map(t => [t.id, t.name]));
    const rows = [['Terrarium', 'Datum', 'Uhrzeit', 'Temperatur °C', 'Luftfeuchte %', 'Quelle', 'Notiz']];
    for (const r of readings.slice().sort((a, b) => a.ts - b.ts)) {
      const d = new Date(r.ts);
      rows.push([names[r.tid] || r.tid, isoDay(r.ts), String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
        r.t === null ? '' : fmt(r.t), r.h === null ? '' : fmt(r.h), r.src === 'sensor' ? 'Sensor' : 'Manuell', r.n || '']);
    }
    return '﻿' + rows.map(r => r.map(csvEscape).join(';')).join('\r\n');
  }

  function buildBackup(docs, exportedAt) {
    return { app: 'terrarium-control-center', schema: SCHEMA, exportedAt: new Date(exportedAt).toISOString(), docs };
  }

  function checkBackup(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'Die Datei ist kein gültiges Backup.' };
    if (obj.app !== 'terrarium-control-center') return { ok: false, error: 'Die Datei stammt nicht aus dieser App.' };
    if (typeof obj.schema !== 'number' || obj.schema > SCHEMA) return { ok: false, error: 'Das Backup ist neuer als diese App-Version.' };
    if (!obj.docs || typeof obj.docs !== 'object' || !obj.docs.config) return { ok: false, error: 'Im Backup fehlen die Einstellungen.' };
    const cfg = obj.docs.config;
    if (!Array.isArray(cfg.terrariums)) return { ok: false, error: 'Im Backup fehlen die Terrarien.' };
    for (const k of Object.keys(obj.docs)) if (!/^[A-Za-z0-9_.:@+~-]+$/.test(k)) return { ok: false, error: 'Das Backup enthält ungültige Einträge.' };
    return { ok: true };
  }

  /** Alle Messwerte aus den Monatsdokumenten. */
  function collectReadings(docs) {
    const out = [];
    for (const [k, d] of Object.entries(docs)) {
      if (!k.startsWith('r-') || !d || !Array.isArray(d.rows)) continue;
      for (const r of d.rows) out.push(Object.assign({ tid: d.tid }, r));
    }
    return out.sort((a, b) => a.ts - b.ts);
  }

  function collectJournal(docs) {
    const out = [];
    for (const [k, d] of Object.entries(docs)) {
      if (!k.startsWith('j-') || !d || !Array.isArray(d.rows)) continue;
      for (const r of d.rows) out.push(r);
    }
    return out.sort((a, b) => b.ts - a.ts);
  }

  function readingDocKey(tid, ts) { return 'r-' + tid + '-' + monthKey(ts); }
  function journalDocKey(ts) { return 'j-' + new Date(ts).getFullYear(); }

  /* ---------- Beispieldaten (nur Anzeige, nie gespeichert) ---------- */

  function demoData(now) {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const cfg = defaultConfig();
    const ids = cfg.terrariums.map(t => t.id);
    cfg.terrariums.forEach((t, i) => { t.size = [{ l: 120, b: 60, h: 120 }, { l: 120, b: 60, h: 150 }, { l: 60, b: 60, h: 90 }][i]; t.animalLen = [130, 25, 22][i]; t.count = 1; });
    const docs = { config: cfg };
    for (let i = 0; i < 3; i++) {
      const t = cfg.terrariums[i];
      for (let h = 24 * 14; h >= 0; h -= 3) {
        const ts = now - h * HOUR - 7 * 60000;
        const rg = rangesAt(t, ts);
        const mid = (rg.temp.min + rg.temp.max) / 2;
        const hm = (rg.hum.min + rg.hum.max) / 2;
        let tv = mid + (rnd() - 0.5) * 3.2;
        let hv = hm + (rnd() - 0.5) * 18;
        if (i === 1 && rg.phase === 'night' && h % 2 === 0 && h < 24 * 6) tv = rg.temp.min - 1 - rnd();
        if (i === 2 && h < 9) hv = rg.hum.min - 12;
        const key = readingDocKey(t.id, ts);
        docs[key] = docs[key] || { tid: t.id, month: monthKey(ts), rows: [] };
        docs[key].rows.push({ id: uid('m'), ts, t: round1(tv), h: Math.round(hv), src: 'manual' });
      }
    }
    const d = n => isoDay(now - n * DAY);
    const lastDays = [1, 2, 9, 40, 100, 30, 33, 6, 5, 1, 10, 40, 30, 1, 0, 3, 12, 15, 60, 20];
    cfg.tasks.forEach((k, i) => { k.last = d(lastDays[i % lastDays.length]); k.note = 'Beispiel'; });
    const lampAge = [300, 400, 350, 100, 120, 700];
    cfg.lamps.forEach((l, i) => { l.installed = d(lampAge[i]); l.model = 'Beispiel'; if (l.type === 'heat') { l.lifeHours = 2000; l.hoursPerDay = 10; } });
    cfg.animals = [
      { id: uid('a'), tid: ids[0], name: 'Mais', sex: 'w', hatch: '' },
      { id: uid('a'), tid: ids[1], name: 'Kiwi', sex: 'm', hatch: '' },
      { id: uid('a'), tid: ids[2], name: 'Brocken', sex: '', hatch: '' }
    ];
    const jr = [];
    [0, 1, 2].forEach(k => {
      for (let w = 8; w >= 0; w--) jr.push({ id: uid('j'), aid: cfg.animals[k].id, type: 'weight', ts: now - w * 7 * DAY, value: [310, 142, 265][k] + (8 - w) * [3, 1.5, 2][k] + Math.round(rnd() * 4), note: '' });
    });
    jr.push({ id: uid('j'), aid: cfg.animals[0].id, type: 'feed', ts: now - 3 * DAY, value: '', note: 'Beispiel' });
    jr.push({ id: uid('j'), aid: cfg.animals[0].id, type: 'shed', ts: now - 12 * DAY, value: '', note: 'Vollständig, Beispiel' });
    jr.push({ id: uid('j'), aid: cfg.animals[1].id, type: 'feed', ts: now - 1 * DAY, value: '', note: 'Beispiel' });
    for (const r of jr) {
      const key = journalDocKey(r.ts);
      docs[key] = docs[key] || { year: new Date(r.ts).getFullYear(), rows: [] };
      docs[key].rows.push(r);
    }
    return docs;
  }

  return {
    SOURCES, PRESETS, SIZE_RULES, LIGHTING, lightCheck, lampAdvice, minSize, checkSize, LAMP_TYPES, DEFAULT_TASKS, DEFAULT_LAMPS,
    defaultTasksFor, defaultLampsFor, applyPreset, migrateConfig, lampInfo, validateLamp, installedFromAge, addMonths,
    SCHEMA, DAY, HOUR, SPECIES, LEVELS, LEVEL_INFO, LIMITS, DEFAULT_TOL, TASK_KINDS, TASK_TEMPLATES, JOURNAL_TYPES,
    uid, parseNum, round1, fmt, hhmmToMin, monthKey, isoDay,
    newTerrarium, defaultConfig, rangeSet, profileComplete, profileAnySet, phaseAt, rangesAt,
    assess, worst, assessTerrarium, adviceFor,
    validateReading, validateProfile, validateTask, validateJournal,
    stats, patterns, dueInfo,
    readingsCsv, buildBackup, checkBackup, collectReadings, collectJournal, readingDocKey, journalDocKey,
    demoData
  };
});
