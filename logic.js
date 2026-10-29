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


  /* Einkaufshilfe: Was zum Tier passt. Nur Bauarten und Marken, die in den Quellen stehen. Die Amazon-Links sind Suchanfragen, keine Produktempfehlungen mit Preis. */
  const SHOP = {
    kn: [
      { title: 'UV-B-Röhre T5, schwach (2,4 % oder 6 %)', why: 'Passt zu Ferguson-Zone 1–2. Nur über einen Teil des Terrariums, damit es Schatten gibt.', q: 'UVB T5 Röhre 6% Terrarium', sources: ['baines', 'rsZ1', 'rsZ2'] },
      { title: 'Halogenstrahler für den Sonnenplatz, dimmbar', why: 'Weißes Licht am Tag statt Infrarot. Mit Thermostat oder Dimmer und Schutzkorb.', q: 'Halogen Wärmespot Terrarium Reptilien', sources: ['dtschbKn', 'biodudeRed'] },
      { title: 'Keramikstrahler ohne Licht', why: 'Nur falls es nachts unter 18 °C fällt. Immer mit Thermostat.', q: 'Keramik Wärmestrahler Terrarium Thermostat', sources: ['biodudeRed'] }
    ],
    jc: [
      { title: 'UV-B-Röhre T5 mit 12 %', why: 'Passt zu Ferguson-Zone 3. Reptile Systems nennt das Jemenchamäleon als Beispiel dafür.', q: 'UVB T5 Röhre 12% Terrarium Chamäleon', sources: ['baines', 'rsZ3', 'dtschbJc'] },
      { title: 'Wärmespot, dimmbar', why: 'Lokale Wärme bis etwa 40 °C am Sonnenplatz, mit Schutzgitter. UV-B und Wärme sollen auf denselben Ast treffen.', q: 'Halogen Spot Terrarium Wärme dimmbar', sources: ['dtschbJc'] }
    ],
    rg: [
      { title: 'Arcadia ShadeDweller (schwache T5-UV-B-Röhre)', why: 'The Bio Dude nennt sie für diese Art.', q: 'Arcadia ShadeDweller T5', brand: true, sources: ['biodude'] },
      { title: 'Zoo Med 5.0 (schwache UV-B-Röhre)', why: 'Sundown Reptiles nennt sie als Beispiel.', q: 'Zoo Med 5.0 UVB Röhre', brand: true, sources: ['sundown'] },
      { title: 'Kleiner Halogenstrahler am Dimmer (25–50 W)', why: 'Sonnenplatz von etwa 28–31 °C. Gedimmt betreiben.', q: 'Halogen Strahler 50W Terrarium Dimmer', sources: ['biodude', 'sundown'] }
    ]
  };
  /** Exo-Terra-Abdeckungen nehmen nur Exo-Terra-Leuchtmittel auf. Lampenschirme mit freier Fassung nehmen jede Marke mit passender Fassung. */
  function hasExoCover(t) { return /exo\s*-?\s*terra/i.test(t && t.equip && t.equip.covers || '') || ((t && t.equip && t.equip.sockets) || []).some(x => x.kind === 'exo'); }
  /** Plätze für Leuchtmittel: Exo-Terra-Abdeckung (nur Exo Terra) und Fassung mit Schirm (jede Marke). Fest eingebaute LEDs zählen nicht. */
  function slotUse(t, lampList) {
    const ss = t && t.equip && Array.isArray(t.equip.sockets) && t.equip.sockets.length ? t.equip.sockets : null;
    const sl = ss ? { exo: ss.filter(x => x.kind === 'exo').length, shade: ss.filter(x => x.kind !== 'exo').length } : (t && t.equip && t.equip.slots || {});
    const out = { exo: { total: Number.isFinite(sl.exo) ? sl.exo : null, used: 0 }, shade: { total: Number.isFinite(sl.shade) ? sl.shade : null, used: 0 } };
    (lampList || []).filter(l => l.tid === t.id && l.type !== 'led').forEach(l => {
      const f = String(l.fixture || '');
      if (/exo\s*-?\s*terra/i.test(f)) out.exo.used++; else if (/schirm|fassung/i.test(f)) out.shade.used++;
    });
    ['exo', 'shade'].forEach(k => { out[k].free = out[k].total === null ? null : Math.max(0, out[k].total - out[k].used); });
    return out;
  }
  const AMAZON = 'https://www.amazon.de/s?s=review-rank&k=';
  function shopLink(q) { return AMAZON + encodeURIComponent(q); }

  /* ---------- Fassungen und Lampenkatalog ----------
     Nur Angaben, die auf den verlinkten Seiten stehen. base null heißt: Die Produktseite nennt die Sockelgröße nicht, bitte vor dem Kauf prüfen.
     fit je Art: [Stufe, Begründung]. Stufe 2 = passt, 1 = bedingt, 0 = eher nicht. Begründungen, die aus Quellen abgeleitet sind, sind so markiert. */
  Object.assign(SOURCES, {
    exoUvb: { label: 'Exo Terra, Datenblatt Reptile UVB100 und UVB200', url: 'https://legacy.exo-terra.com/download/sales_sheets/Sales_Sheet_Reptile_UVB_NA-EU.pdf' },
    exoUvb100E27: { label: 'Olibetta, Exo Terra Reptile UVB 100, 25 W/E27', url: 'https://www.olibetta.ch/en-CH/exo-terra/reptile-uvb-100' },
    hpIntense: { label: 'Hugglepets, Exo Terra Intense Basking Spot (25–150 W)', url: 'https://www.hugglepets.co.uk/product/exo-terra-intense-basking-spot/' },
    hpDaytime: { label: 'Hugglepets, Exo Terra Daytime Heat Lamp (15–150 W)', url: 'https://hugglepets.co.uk/product/exo-terra-daytime-heat-lamp' },
    luckyDesert: { label: 'Reptile Centre, Lucky Reptile Bright Sun UV Desert (E27, mit Vorschaltgerät)', url: 'https://reptilecentre.com/products/lucky-reptile-bright-sun-uv-desert' },
    luckyJungle: { label: 'Testsieger.de, Lucky Reptile Bright Sun UV Jungle 35 W (E27, Thermo Socket und Bright Control nötig)', url: 'https://www.testsieger.de/moebel-und-accessoires/70AMA9GHGWXBK-lucky-reptile-bright-sun-uv-jungle-wattstaerke35-watt.html' },
    luckyBrosch: { label: 'Lucky Reptile, Broschüre Bright Sun UV (Vergleichstabelle Jungle 50 W)', url: 'https://lucky-reptile.de/media/pdf/fa/42/bf/Broschu-re-Bright-Sun-DE.pdf' },
    luckyManual: { label: 'Lucky Reptile, Bedienungsanleitung Bright Sun UV (Abstände, Vorschaltgerät)', url: 'https://lucky-reptile.de/media/pdf/g0/da/61/Bright-Sun-UV.pdf' },
    rfVeiled: { label: 'ReptiFiles, Veiled Chameleon Care Sheet (Jemenchamäleon)', url: 'https://reptifiles.com/wp-content/uploads/2021/09/Veiled-Chameleon-Care-Sheet-ReptiFiles.pdf' },
    rfLeachie: { label: 'ReptiFiles, Leachie Gecko Care Sheet (Neukaledonischer Riesengecko)', url: 'https://reptifiles.com/wp-content/uploads/2022/06/Leachie-Gecko-Care-Sheet-ReptiFiles-PDF.pdf' },
    zenCorn: { label: 'Zen Habitats, Corn Snake Care Guide (Madeline Smith)', url: 'https://zenhabitats.com/blogs/reptile-care-sheets-resources/corn-snake-essential-care-information' }
  });
  const CATALOG = [
    { id: 'exoUvb100', brand: 'Exo Terra', model: 'Reptile UVB100 (tropisch)', kind: 'uvb', watts: [13, 25], base: 'E27', ballast: 'none', q: 'Exo Terra Reptile UVB100 25W',
      facts: 'Kompakte Spirallampe mit Schraubsockel, „ideal für tropische und subtropische Reptilien“. Wirkt laut Hersteller bis 40 cm. UV-B in 10 cm Abstand: 105 µW/cm² (13 W), 170 µW/cm² (25 W).',
      fit: { kn: [2, 'Die schwächere Lampenreihe passt zu Ferguson-Zone 1–2 (abgeleitet). Nur über einem Teil des Terrariums, damit es Schatten gibt.'], jc: [1, 'Das Jemenchamäleon steht in Ferguson-Zone 3. Die „tropische“ Reihe ist schwächer als die Wüstenreihe, daher nur mit UV-Index-Messgerät (abgeleitet).'], rg: [2, 'Zone 1–2 laut Ableitung aus den Verwandten. Eine schwache Stufe, mit Abstand und Schatten.'] },
      pick: { kn: [13, 25], jc: [25], rg: [13, 25] }, sources: ['exoUvb', 'exoUvb100E27', 'baines'] },
    { id: 'exoUvb200', brand: 'Exo Terra', model: 'Reptile UVB200 (Wüste, hohe Leistung)', kind: 'uvb', watts: [13, 25], base: null, ballast: 'none', q: 'Exo Terra Reptile UVB200 25W',
      facts: 'Kompakte Spirallampe mit Schraubsockel für „Reptilien mit sehr hohem UV-Bedarf“, für Wüsten und höhere Terrarien. UV-B in 10 cm Abstand: 130 µW/cm² (13 W), 225 µW/cm² (25 W).',
      fit: { kn: [1, 'Für Zone 1–2 eher zu stark (abgeleitet). Nur mit viel Abstand und großem Schattenbereich, am besten mit UV-Index-Messgerät.'], jc: [2, 'Zone 3 braucht mehr UV-B (Baines). Die Hochleistungsreihe passt dazu. Abstand per UV-Index-Messgerät einstellen.'], rg: [0, 'Zu stark für eine Art mit Zone 1–2 (abgeleitet).'] },
      pick: { kn: [13], jc: [25], rg: [] }, sources: ['exoUvb', 'baines'] },
    { id: 'exoIntense', brand: 'Exo Terra', model: 'Intense Basking Spot', kind: 'heat', watts: [25, 50, 75, 100, 150], base: null, ballast: 'none', q: 'Exo Terra Intense Basking Spot',
      facts: 'Wärmespot für den Sonnenplatz. Händlerangabe: „Creates a basking area for thermoregulation“.',
      fit: { kn: [2, 'Wärme für den Sonnenplatz. Für Kornnattern nennt keine gesammelte Quelle eine Wattzahl. Starte mit der kleinsten Stufe und miss die Temperatur am Platz.'], jc: [2, 'ReptiFiles nennt für das Jemenchamäleon „ein paar weiße 50-W-Wärmelampen“, darunter diesen Spot.'], rg: [2, 'The Bio Dude: 50 W am Dimmer, Sundown Reptiles: 25 W gedimmt.'] },
      pick: { kn: [25], jc: [50], rg: [25, 50] }, sources: ['hpIntense', 'rfVeiled', 'biodude', 'sundown'] },
    { id: 'exoDaytime', brand: 'Exo Terra', model: 'Daytime Heat Lamp', kind: 'heat', watts: [15, 25, 40, 60, 100, 150], base: null, ballast: 'none', q: 'Exo Terra Daytime Heat Lamp',
      facts: 'Tageslicht-Wärmelampe mit Neodymglas, „schafft Wärmegefälle“. Händlerangabe: kombinierbar mit Nacht-Wärmelampe.',
      fit: { kn: [2, 'Sanfte Wärme für den Sonnenplatz. Keine Wattangabe aus Quellen für Kornnattern, daher klein anfangen.'], jc: [1, 'Gut als Zusatzwärme. Für den Sonnenplatz nennt ReptiFiles 50 W.'], rg: [2, 'Niedrige Stufen passen zu 25 W gedimmt (Sundown Reptiles).'] },
      pick: { kn: [15, 25], jc: [25], rg: [25] }, sources: ['hpDaytime', 'sundown'] },
    { id: 'zmPower', brand: 'Zoo Med', model: 'PowerSun UV (selbstvorschaltend)', kind: 'both', watts: [80, 100, 160], base: null, ballast: 'none', q: 'Zoo Med PowerSun UV',
      facts: 'Quecksilberdampflampe mit eingebautem Vorschaltgerät: UV-A, UV-B und Wärme in einer Lampe, „passt in eine normale Keramikfassung“. Nicht dimmbar. Nicht bewegen oder erschüttern. Nach 12 Monaten tauschen.',
      fit: { kn: [1, 'Viel Leistung für wenig UV-B-Bedarf. Nur in größeren Terrarien mit viel Abstand.'], jc: [1, 'Liefert Wärme und UV in einem. Keine UV-B-Zahl angegeben, daher nur mit UV-Index-Messgerät.'], rg: [0, 'Zu stark und nicht dimmbar. Die Quellen nennen für diese Art 25–50 W gedimmt.'] },
      pick: { kn: [80], jc: [80], rg: [] }, sources: ['zoomedPS'] },
    { id: 'arcCeramic', brand: 'Arcadia', model: 'Ceramic Heater IR-C (Keramikstrahler)', kind: 'heat', watts: [50], base: 'E27', ballast: 'none', q: 'Arcadia Ceramic Heater 50W E27',
      facts: 'Keramikstrahler ohne Licht, Infrarot C, E27, 50 W (Angabe auf der Verpackung). Gibt Wärme, aber kein sichtbares Licht und kein UV.',
      fit: { kn: [2, 'The Bio Dude nennt Keramikstrahler ohne Licht für nächtliche Zusatzwärme, immer mit Thermostat. Nachts passt er zum Ziel 18–20 °C.'], jc: [1, 'Nur als Zusatzwärme, immer mit Thermostat. Der Sonnenplatz braucht weißes Licht und UV-B.'], rg: [2, 'The Bio Dude: Zusätzliche Wärme nachts nur, wenn es unter etwa 18 °C fällt, ohne Licht.'] },
      pick: { kn: [50], jc: [50], rg: [50] }, sources: ['biodudeRed', 'biodude'] },
    { id: 'lrDesert', brand: 'Lucky Reptile', model: 'Bright Sun UV Desert', kind: 'both', watts: [35, 50, 70, 100], base: 'E27', ballast: 'needs', q: 'Lucky Reptile Bright Sun UV Desert 35W',
      facts: 'Metalldampflampe mit Tageslichtspektrum (6000 K) für Wüstenarten. Passt in eine E27-Porzellanfassung, braucht ein Vorschaltgerät „wie das Lucky Reptile Bright Control“. Hersteller empfiehlt jährlichen Tausch.',
      fit: { kn: [1, 'Der Tierschutzbund nennt Metalldampf für Sonnenplätze besser als Halogen. Die Wüstenvariante ist für Zone 1–2 aber stark, mit Abstand einsetzen.'], jc: [2, 'Tageslicht, UV und Wärme für Zone 3. Hohe Leistung, Abstand per UV-Index-Messgerät einstellen.'], rg: [0, 'Zu stark für diese Art (abgeleitet).'] },
      pick: { kn: [35], jc: [35, 50], rg: [] }, sources: ['luckyDesert', 'dtschbKn'] },
    { id: 'lrJungle', brand: 'Lucky Reptile', model: 'Bright Sun UV Jungle', kind: 'both', watts: [35, 50], base: 'E27', ballast: 'own', q: 'Lucky Reptile Bright Sun UV Jungle 35W',
      facts: 'Metalldampflampe für tropische Arten mit E27-Gewinde. Händlerangabe: „Lucky Reptile Thermo Socket und Bright Control Vorschaltgerät erforderlich“. Keine UV-Zahlen angegeben. Die 50-W-Stufe steht auf der Verpackung („Vorschaltgerät erforderlich“). Herstellerwerte für 50 W: UV-B 180 µW/cm² in 20 cm (Mindestabstand), 80 µW/cm² in 30 cm (empfohlen), 29 µW/cm² in 50 cm; Temperatur dort 50, 41 und 30 °C. Optimaler Abstand laut Anleitung 25–35 cm. Ein UV-B-Prozentwert wird nicht angegeben.',
      fit: { kn: [2, 'Der Tierschutzbund nennt Metalldampf für Sonnenplätze besser als Halogen. Tropische Variante passt zu Zone 1–2 (abgeleitet).'], jc: [1, 'Tropische Variante, für Zone 3 eher schwächer (abgeleitet). Nur mit UV-Index-Messgerät.'], rg: [1, 'Für diese Art nennen die Quellen Halogen am Dimmer. Metalldampf ist dort nicht belegt, nur mit UV-Index-Messgerät.'] },
      pick: { kn: [35], jc: [35], rg: [35] }, sources: ['luckyJungle', 'luckyBrosch', 'luckyManual', 'dtschbKn'] }
  ];
  function socketsOf(t) { return t && t.equip && Array.isArray(t.equip.sockets) ? t.equip.sockets : []; }
  /** Welche Lampen passen in eine Fassung? Sortiert nach Eignung für die Art. */
  function socketRecs(t, s) {
    const out = [];
    CATALOG.forEach(it => {
      const f = it.fit[t.species]; if (!f || f[0] === 0) return;
      const notes = [];
      if (s.role === 'uvb' && it.kind === 'heat') return;
      if (s.role === 'heat' && it.kind === 'uvb') return;
      if (s.kind === 'exo' && it.brand !== 'Exo Terra') return;
      if (s.ballast === true && it.ballast === 'none') return;
      if (s.ballast === false && it.ballast !== 'none') return;
      if (s.base && it.base && s.base !== it.base) return;
      let watts = it.watts.slice();
      if (Number.isFinite(s.maxW)) watts = watts.filter(w => w <= s.maxW);
      if (s.ballast === true && Number.isFinite(s.ballastW)) watts = watts.filter(w => w === s.ballastW);
      if (!watts.length) return;
      if (s.ballast === true && it.ballast === 'own' && s.ballastModel && !/lucky|bright\s*control/i.test(s.ballastModel)) return;
      if (s.ballast === true && it.ballast === 'own') notes.push('Braucht das Lucky-Reptile-System (Thermo Socket und Bright Control). Das passt nur, wenn dein Vorschaltgerät genau das ist.');
      else if (s.ballast === true) notes.push(Number.isFinite(s.ballastW) ? 'Nur die ' + s.ballastW + '-W-Stufe passt zu deinem Vorschaltgerät.' : 'Das Vorschaltgerät muss zur Lampe und zur Wattzahl passen. Trag Watt und Typ deines Geräts ein, dann filtert die App genau.');
      if (!it.base) notes.push('Die Produktseite nennt die Sockelgröße nicht. Prüfe vor dem Kauf, dass es E27 ist.');
      if (it.id === 'zmPower') notes.push('Die Produktseite nennt „Keramikfassung“, aber nicht E26 oder E27. Prüfe das vor dem Kauf.');
      if (s.cage && it.kind !== 'uvb') notes.push('Lampe im Käfig, dann bleibt sie außer Reichweite des Tieres.');
      let pw = ((it.pick && it.pick[t.species]) || []).filter(w => watts.includes(w));
      if (!pw.length) {
        const want = (it.pick && it.pick[t.species]) || [];
        const lo = watts.filter(w => w <= Math.max.apply(null, want.length ? want : [watts[watts.length - 1]]));
        pw = lo.length ? [lo[lo.length - 1]] : [watts[0]];
        if (want.length) notes.push('Die Quelle nennt ' + want.join(' oder ') + ' W. In diese Fassung passen höchstens ' + watts[watts.length - 1] + ' W, daher ist diese Lampe schwächer.');
      }
      out.push({ item: it, watts, pickW: pw, fit: f[0], why: f[1], notes });
    });
    return out.sort((a, b) => b.fit - a.fit || (a.item.kind === 'both') - (b.item.kind === 'both'));
  }
  /** Bester Vorschlag je Fassung: erst UV-B, dann Wärme abdecken, dann das nächstbeste. */
  function lampPlan(t) {
    const socks = socketsOf(t).map(s => ({ s, recs: socketRecs(t, s) }));
    const need = LIGHTING[t.species] ? ['uvb', 'heat'] : [];
    socks.slice().sort((a, b) => a.recs.length - b.recs.length).forEach(x => {
      let top = x.recs.find(r => r.fit >= 1 && (r.item.kind === 'both' ? need.length : need.includes(r.item.kind)) && need.length);
      if (top) { const k = top.item.kind; if (k === 'both') need.length = 0; else need.splice(need.indexOf(k), 1); }
      x.top = top || x.recs[0] || null;
    });
    return socks;
  }

  /* ---------- Substrat ----------
     Nur Werte aus den Quellen. min/max in cm Schichthöhe, null = die Quelle nennt keine Zahl. */
  const SUBSTRATE = {
    kn: { depth: { min: 7.5, max: 10, src: ['zenCorn'], text: '3–4 Zoll (7,5–10 cm)' },
      change: { ok: 120, max: 182, text: 'alle 3–4 Monate (Zen Habitats), etwa zweimal im Jahr (Tierschutzbund)', src: ['zenCorn', 'dtschbKn'] },
      mix: [['Oberboden (Erde)', 40], ['Torf', 20], ['Sand', 30], ['Ton', 10]],
      mixSrc: ['zenCorn', 'dtschbKn'],
      points: [['Mischung', 'Erde, Sand, Ton und Torf. Der Tierschutzbund nennt dazu optional dünn Rindenmulch. Zen Habitats: 40 % Oberboden, 20 % Torf, 30 % Sand, 10 % Ton.', ['dtschbKn', 'zenCorn']], ['Feuchte', 'Ein Bereich feucht, nicht alles nass. Zu nasses Substrat kann Schuppenfäule auslösen. Zusätzlich eine Feuchtbox mit feuchtem Moos.', ['dtschbKn', 'zenCorn']], ['Graben', 'Teile des Substrats erhöhen, Kornnattern graben gern. Laub obenauf hält die Feuchte.', ['dtschbKn', 'zenCorn']], ['Wechsel', 'Der Tierschutzbund: etwa zweimal im Jahr. Zen Habitats: alle 3–4 Monate, Kot sofort entfernen.', ['dtschbKn', 'zenCorn']]],
      buy: { title: 'Selbst mischen', text: 'Eine fertige Mischung mit Markennamen für Kornnattern nennt keine der gesammelten Quellen. Darum mischst du aus vier Zutaten, die Mengen in Litern stehen oben. Mische sie trocken und feuchte danach einen Bereich an.', src: ['zenCorn', 'dtschbKn'] },
      shop: [['Terrarium-Erde, ohne Zusätze', 'Terrarium Bodengrund Erde Schlange'], ['Spielsand', 'Spielsand ungefärbt'], ['Torf', 'Torf Gartentorf'], ['Tonerde', 'Tonerde Pulver Terrarium'], ['Laub und Rindenmulch', 'Terrarium Laub Rindenmulch Reptilien']] },
    jc: { depth: { min: null, max: null, src: [], text: 'Die gesammelten Quellen nennen keine Schichthöhe.' },
      mix: [],
      mixSrc: ['dtschbJc', 'rfVeiled'],
      points: [['Mischung', 'Der Tierschutzbund nennt Sand und Erde, die Wasser aufnimmt. Verhältnis steht nicht dabei.', ['dtschbJc']], ['Drainage', 'ReptiFiles: Eine normale Substratschicht wird schnell nass. Empfohlen ist ein Bodenablauf, zum Beispiel selbst gebaut mit Eimer. Dann bleibt unten kein Wasser stehen.', ['rfVeiled']], ['Pflanzen', 'Dichte Bepflanzung mit Ficus, Farnen, Sukkulenten und Bromelien. Die brauchen Erde mit Wasserabzug.', ['dtschbJc']]],
      buy: { title: 'Erde und Sand, mit Bodenablauf', text: 'Eine Marke für das Jemenchamäleon nennen die gesammelten Quellen nicht. Der Tierschutzbund nennt Sand und Erde, die Wasser aufnimmt, ReptiFiles einen Bodenablauf statt einer dicken Schicht. Die Einzelteile findest du hier.', src: ['dtschbJc', 'rfVeiled'] },
      shop: [['Terrarium-Erde', 'Terrarium Bodengrund Erde Chamäleon'], ['Spielsand', 'Spielsand ungefärbt'], ['Wasserablauf für Terrarien', 'Terrarium Bodenablauf Chamäleon']] },
    rg: { depth: { min: 7.5, max: null, src: ['rfLeachie'], text: 'mindestens 3 Zoll (7,5 cm)' },
      change: { ok: 120, max: 150, text: 'alle 3–4 Monate komplett (ReptiFiles)', src: ['rfLeachie'] },
      mix: [['Oberboden (Erde)', 60], ['Kokosfaser', 40]],
      mixSrc: ['rfLeachie'],
      points: [['Mischung', 'ReptiFiles: 60 % Oberboden und 40 % Kokosfaser, oder Zoo Med Reptisoil, Zoo Med Eco Earth, Exo Terra Plantation Soil oder The Bio Dude Terra Fauna.', ['rfLeachie']], ['Bioaktiv', 'The Bio Dude: tiefes, gut drainiertes Substrat mit Drainageschicht und Bodentieren. Riesengeckos erzeugen viel Abfall. Die Quelle nennt keine Dicke der Drainageschicht.', ['biodude']], ['Laub', 'Eine großzügige Schicht Laub obenauf.', ['rfLeachie']], ['Wechsel', 'Kot und Urate täglich entfernen. Substrat alle 3–4 Monate komplett tauschen.', ['rfLeachie']]],
      buy: { title: 'Fertig kaufen oder selbst mischen', text: 'Meine Wahl nach den Quellen: The Bio Dude Terra Fauna, das bioaktive Substrat der Firma, die auch das Pflegeblatt für die Art schreibt (ReptiFiles nennt es für den Riesengecko). Günstiger: Zoo Med Eco Earth, Zoo Med Reptisoil oder Exo Terra Plantation Soil, die ReptiFiles ebenfalls nennt. Oder selbst mischen: 60 % Oberboden und 40 % Kokosfaser.', src: ['rfLeachie', 'biodude'] },
      shop: [['The Bio Dude Terra Fauna', 'The Bio Dude Terra Fauna bioaktiv'], ['Zoo Med Eco Earth', 'Zoo Med Eco Earth Kokos'], ['Zoo Med Reptisoil', 'Zoo Med Reptisoil'], ['Exo Terra Plantation Soil', 'Exo Terra Plantation Soil'], ['Laub für Terrarien', 'Terrarium Laub Buchenlaub']] }
  };
  /** Bewertung des letzten Substratwechsels aus dem Protokoll t.subLog [{date, product, depth, note}]. */
  function substrateStatus(t, nowMs) {
    const sb = SUBSTRATE[t && t.species], log = (t && t.subLog || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!sb || !log.length) return null;
    const last = log[0], days = Math.floor((nowMs - Date.parse(last.date)) / DAY);
    const out = { last, days, level: 'none', text: '', src: [] };
    if (sb.change) {
      out.src = sb.change.src;
      if (days <= sb.change.ok) { out.level = 'green'; out.text = 'Vor ' + days + ' Tagen. Quelle: ' + sb.change.text + '.'; }
      else if (days <= sb.change.max) { out.level = 'yellow'; out.text = 'Vor ' + days + ' Tagen. Bald wechseln, Quelle: ' + sb.change.text + '.'; }
      else { out.level = 'orange'; out.text = 'Vor ' + days + ' Tagen. Überfällig, Quelle: ' + sb.change.text + '.'; }
    } else out.text = 'Vor ' + days + ' Tagen. Die Quellen nennen für diese Art keinen Wechselrhythmus.';
    const d = parseNum(last.depth);
    if (d !== null && sb.depth.min !== null && d < sb.depth.min) { out.depthNote = 'Eingefüllt ' + d + ' cm, die Quelle nennt ' + sb.depth.text + '.'; if (out.level === 'green') out.level = 'yellow'; }
    return out;
  }
  /** Menge Substrat in Litern aus Grundfläche und Schichthöhe. depthOverride in cm ersetzt die Quellenwerte. */
  function substrateNeed(t, depthOverride) {
    const sb = SUBSTRATE[t && t.species]; if (!sb) return null;
    const sz = t.size || {}, l = Number(sz.l), b = Number(sz.b);
    const dep = Number.isFinite(depthOverride) && depthOverride > 0 ? { min: depthOverride, max: depthOverride, own: true } : { min: sb.depth.min, max: sb.depth.max === null ? sb.depth.min : sb.depth.max, own: false };
    const res = { sb, depth: dep, area: null, litersMin: null, litersMax: null, parts: [], missing: [] };
    if (!(l > 0 && b > 0)) res.missing.push('size');
    if (dep.min === null) res.missing.push('depth');
    if (res.missing.length) return res;
    res.area = l * b;
    const r = x => Math.round(x * 10) / 10;
    res.litersMin = r(l * b * dep.min / 1000); res.litersMax = r(l * b * dep.max / 1000);
    res.parts = sb.mix.map(([name, pct]) => ({ name, pct, min: r(res.litersMin * pct / 100), max: r(res.litersMax * pct / 100) }));
    return res;
  }

  /** Empfohlene Lichtdauer pro Tag. Jemenchamäleon: Sommer April bis September, sonst Winter (abgeleitet aus „im Sommer / im Winter“). */
  function lightHours(species, nowMs) {
    if (species === 'kn') return { min: 12, max: 14, text: '12–14 Stunden', src: ['dtschbKn'] };
    if (species === 'jc') { const m = new Date(nowMs === undefined ? Date.now() : nowMs).getMonth(); return m >= 3 && m <= 8 ? { min: 12, max: 14, text: '12–14 Stunden (Sommer)', src: ['dtschbJc'] } : { min: 8, max: 10, text: '8–10 Stunden (Winter)', src: ['dtschbJc'] }; }
    if (species === 'rg') return { min: 12, max: 12, text: '12 Stunden', src: ['biodude'], tol: 1 };
    return null;
  }
  /** Brenndauer in Stunden: aus Ein- und Ausschaltzeit (auch über Mitternacht), sonst aus „Stunden pro Tag“. */
  function lampSpan(l) {
    const a = hhmmToMin(l.onTime), b = hhmmToMin(l.offTime);
    if (a !== null && b !== null && a !== b) return { on: a, off: b, hours: ((b - a + 1440) % 1440) / 60 };
    return { on: null, off: null, hours: parseNum(l.hoursPerDay) };
  }
  function spanParts(on, off) { return off > on ? [[on, off]] : [[on, 1440], [0, off]]; }
  /** Lichtplan: Zeiten je Lampe, Gesamt-Lichtdauer (alle Lampen zusammen) und Kontrolle gegen Quelle und Tag/Nacht-Zeiten. */
  function lightPlan(t, lampList, nowMs) {
    const r = lightHours(t.species, nowMs); if (!r) return null;
    const li = LIGHTING[t.species] || {}, tol = r.tol || 0;
    const dS = hhmmToMin(t.dayStart), dE = hhmmToMin(t.dayEnd);
    const dayParts = dS !== null && dE !== null && dS !== dE ? spanParts(dS, dE) : null;
    const rows = (lampList || []).filter(l => l.tid === t.id).map(l => {
      const sp = lampSpan(l), g = (LAMP_TYPES[l.type] || {}).group;
      const rated = g === 'uvb' || g === 'light' || l.type === 'uvbMV' || l.type === 'uvbMH';
      const issues = [];
      if (l.night) issues.push({ level: 'orange', text: 'Als Nachtlampe eingetragen. Nachts sollen Licht und Wärmestrahler aus sein.' });
      if (sp.on !== null && dayParts) {
        let out = 0;
        spanParts(sp.on, sp.off).forEach(([a, b]) => { let inside = 0; dayParts.forEach(([c, d]) => { inside += Math.max(0, Math.min(b, d) - Math.max(a, c)); }); out += (b - a) - inside; });
        if (out > 0) issues.push({ level: 'orange', text: 'Läuft ' + Math.round(out) + ' Minuten außerhalb der Tagzeit (' + t.dayStart + '–' + t.dayEnd + ').' });
      }
      if (rated && sp.hours !== null) {
        if (sp.hours < r.min - tol) issues.push({ level: 'yellow', text: 'Kürzer als die Quelle nennt (' + r.text + ').' });
        else if (sp.hours > r.max + tol) issues.push({ level: 'yellow', text: 'Länger als die Quelle nennt (' + r.text + ').' });
      }
      const order = { orange: 2, yellow: 1 };
      const level = issues.length ? issues.sort((x, y) => order[y.level] - order[x.level])[0].level : (sp.hours === null ? 'none' : rated ? 'green' : 'none');
      return { l, on: sp.on, off: sp.off, hours: sp.hours, rated, issues, level };
    });
    // Gesamt-Lichtdauer: Vereinigung der Zeiten aller Lampen, die Licht geben und eine Zeit haben
    let mins = 0; const cover = new Array(1440).fill(false); let any = false;
    rows.filter(x => x.on !== null && !x.l.night && x.l.type !== 'ir' && x.l.type !== 'chc').forEach(x => { any = true; spanParts(x.on, x.off).forEach(([a, b]) => { for (let m = a; m < b; m++) cover[m] = true; }); });
    if (any) mins = cover.filter(Boolean).length;
    const day = any ? mins / 60 : null;
    const dayLevel = day === null ? 'none' : day < r.min - tol || day > r.max + tol ? 'yellow' : 'green';
    return { range: r, rows, day, dayLevel, night: li.night || '', src: li.sources || [] };
  }
  /** Bewertung der Brenndauer je Lampe (ohne Nachtlampen und ohne Wärmestrahler, die sich nach der Temperatur richten). */
  function hoursCheck(t, lampList, nowMs) {
    const r = lightHours(t.species, nowMs); if (!r) return null;
    const tol = r.tol || 0;
    const rows = (lampList || []).filter(l => l.tid === t.id && !l.night).map(l => {
      const h = lampSpan(l).hours, g = (LAMP_TYPES[l.type] || {}).group;
      const rated = g === 'uvb' || g === 'light' || l.type === 'uvbMV' || l.type === 'uvbMH';
      let level = 'none', text = 'Wärmelampe: richtet sich nach der Temperatur am Sonnenplatz.';
      if (rated && h !== null) {
        if (h < r.min - tol) { level = 'yellow'; text = 'Kürzer als die Quelle nennt (' + r.text + ').'; }
        else if (h > r.max + tol) { level = 'yellow'; text = 'Länger als die Quelle nennt (' + r.text + '). Das Tier braucht eine Nacht.'; }
        else { level = 'green'; text = 'Passt zu ' + r.text + '.'; }
      } else if (rated) text = 'Brenndauer fehlt.';
      return { l, h, level, text };
    });
    const day = rows.filter(x => x.h !== null).reduce((m, x) => Math.max(m, x.h), 0);
    return { range: r, rows, day, dayLevel: day === 0 ? 'none' : day < r.min - tol || day > r.max + tol ? 'yellow' : 'green' };
  }
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
    const hc = hoursCheck(t, lampList);
    if (hc) hc.rows.filter(x => x.level === 'yellow').forEach(x => add('yellow', nm(x.l) + ' brennt ' + x.h + ' Std. pro Tag. ' + x.text, x.l.id, hc.range.src));
    if (ballast === true && !uvb.some(l => l.type === 'uvbT5' || l.type === 'uvbT8' || l.type === 'uvbMH')) add('yellow', 'Ein Vorschaltgerät ist vorhanden, aber keine Röhre eingetragen. Steckt in der Abdeckung vielleicht eine UV-B-Röhre? Dann trag sie ein.');
    if (unknown.length) add('none', unknown.length + (unknown.length === 1 ? ' Birne ist' : ' Birnen sind') + ' noch ohne Art. Trag Art und Watt ein, dann prüft die App sie.');
    for (const l of own) {
      const hot = grp(l) === 'heat' || ['uvbMV', 'uvbMH', 'unknown'].includes(l.type);
      if (l.type === 'ir') add(l.night ? 'orange' : 'yellow', nm(l) + ': Rotes Infrarotlicht. Reptilien sehen Rot, nachts stört es den Tag-Nacht-Rhythmus. Für den Sonnenplatz am Tag ist ein weißer Strahler üblich, für Wärme in der Nacht ein Keramikstrahler ohne Licht.', l.id, ['biodudeRed']);
      if (l.night && l.type !== 'chc' && l.type !== 'ir') add('orange', nm(l) + ' ist auch nachts an. ' + (li ? li.night : 'Nachts sollte es dunkel sein.'), l.id, li ? li.sources.slice(0, 1) : []);
      if (hot && l.pos === 'inside' && l.guard !== true) add(l.guard === false ? 'red' : 'orange', nm(l) + ' hängt im Terrarium' + (l.guard === false ? ' ohne Schutzkorb' : '; ist ein Schutzkorb drum?') + ' Wärmelampen müssen außer Reichweite oder gesichert sein, sonst drohen Verbrennungen.', l.id, t.species === 'jc' ? ['dtschbJc'] : ['dtschbKn']);
      if ((l.type === 'uvbT5' || l.type === 'uvbT8') && ballast === false) add('red', nm(l) + ' ist eine Röhre. Röhren leuchten nur mit Vorschaltgerät, und hier ist keins eingetragen. Ohne Vorschaltgerät gehen ein Röhren-Komplettset mit eingebautem Vorschaltgerät oder eine selbstvorschaltende UV-B-Mischlichtlampe für eine Keramikfassung.', l.id, ['zoomedPS']);
      const txt = ((l.brand || '') + ' ' + (l.model || '')).toLowerCase();
      const fromTxt = re => { const m = re.exec(txt); return m ? parseNum(m[1]) : null; };
      const pct = parseNum(l.uvbPct) !== null ? parseNum(l.uvbPct) : fromTxt(/(\d+(?:[.,]\d+)?)\s*%/);
      if (l.brand && /exo\s*-?\s*terra/i.test(l.fixture || '') && !/exo\s*-?\s*terra/i.test(txt)) add('orange', nm(l) + ' sitzt in einer Exo-Terra-Abdeckung, ist aber von „' + l.brand + '“. Du hast geschrieben, dass dort nur Exo-Terra-Leuchtmittel passen. Prüf, ob die Lampe wirklich hineinpasst.', l.id);
      if (t.species === 'jc' && grp(l) === 'uvb' && /shade\s*-?\s*dweller/.test(txt)) add('yellow', nm(l) + ': Die ShadeDweller ist laut The Bio Dude eine schwache Röhre. Für das Jemenchamäleon (Ferguson-Zone 3) nennt Reptile Systems 12 %.', l.id, ['biodude', 'rsZ3']);
      if (grp(l) === 'uvb' && !l.brand && !l.model) add('none', nm(l) + ': Hersteller und Modell fehlen noch. Mit Angabe prüft die App genauer.', l.id);
      if (grp(l) === 'uvb' && parseNum(l.uvbPct) === null && pct !== null) add('none', nm(l) + ': Die App liest ' + fmt(pct, pct % 1 ? 1 : 0) + ' % aus Hersteller und Modell. Trag die Stärke zur Sicherheit auch im Feld UV-B-Stärke ein.', l.id);
      if (grp(l) === 'uvb' && pct !== null) {
        if (t.species === 'jc' && pct < 10) add('yellow', nm(l) + ' hat ' + fmt(pct, pct % 1 ? 1 : 0) + ' %. Für das Jemenchamäleon (Ferguson-Zone 3) nennt Reptile Systems eine 12-%-Röhre.', l.id, ['baines', 'rsZ3']);
        if ((t.species === 'kn' || t.species === 'rg') && pct > 6) add('yellow', nm(l) + ' hat ' + fmt(pct, pct % 1 ? 1 : 0) + ' %. Für Zone 1–2 werden 2,4–6 % angeboten. Stärker geht nur mit viel Abstand und einem Schattenbereich, am besten nachmessen.', l.id, ['baines', 'rsZ1', 'rsZ2']);
      }
      if (l.type === 'uvbMH' && (t.species === 'kn' || t.species === 'rg')) add('yellow', nm(l) + ': Metalldampflampen sind starke UV-B-Strahler. Für Zone 1–2 liegt der UV-Index am Liegeplatz laut Baines höchstens bei 1,1–3,0. Mit viel Abstand, Schattenbereichen und einer Messung am Liegeplatz sicherstellen.', l.id, ['baines']);
      if (grp(l) === 'uvb' && (l.type === 'uvbT5' || l.type === 'uvbT8') && pct === null) add('none', nm(l) + ': Stärke in Prozent fehlt (steht auf der Röhre, z. B. 6 % oder 12 %).', l.id);
      const w = parseNum(l.watt) !== null ? parseNum(l.watt) : fromTxt(/(\d+(?:[.,]\d+)?)\s*w(?:att)?\b/);
      if (t.species === 'rg' && grp(l) === 'heat' && w !== null && w > 50) add('yellow', nm(l) + ' hat ' + w + ' W. Die Leitfäden für Riesengeckos nennen 25–50 W, gedimmt. Mit Thermostat oder Dimmer arbeiten.', l.id, ['biodude', 'sundown']);
      if (w === null && l.type !== 'unknown') add('none', nm(l) + ': Watt fehlt noch.', l.id);
    }
    const su = slotUse(t, lampList);
    [['exo', 'Exo-Terra-Abdeckungen'], ['shade', 'Fassungen mit Schirm']].forEach(([k, n]) => {
      if (su[k].total !== null && su[k].used > su[k].total) add('yellow', 'Es sind ' + su[k].used + ' Lampen für ' + n + ' eingetragen, aber nur ' + su[k].total + ' Plätze. Stimmt die Platzzahl unter „Abdeckung und Technik“?');
    });
    const order = { red: 0, orange: 1, yellow: 2, none: 3, green: 4 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }


  /* ---------- Wissen: Artenprofile, Lexikon, Einrichtungs-Checkliste ----------
     Alles aus den genannten Quellen. Fahrenheit-Werte aus The Bio Dude sind umgerechnet (gerundet). */
  const K = (text, src) => ({ text, src: [].concat(src) });
  const KNOWLEDGE = {
    kn: {
      note: 'Quelle: Deutscher Tierschutzbund. Er weist auf Tierschutzprobleme bei Futtertieren hin und rät vom Kauf von Wildfängen ab.',
      sections: [
        { id: 'ueber', title: 'Überblick', items: [K('Länge bis 180 cm, die meisten Tiere bleiben unter 150 cm.', 'dtschbKn'), K('Lebenserwartung über 20 Jahre, meist 12–15 Jahre.', 'dtschbKn')] },
        { id: 'terr', title: 'Terrarium', items: [K('Mindestgröße für bis zu zwei Tiere: Länge der längsten Schlange × halbe Länge × Länge. Beispiel bei 130 cm Schlange: 130 × 65 × 130 cm. Je weiteres Tier 20 % mehr Bodenfläche.', 'dtschbKn'), K('Für zwei erwachsene Tiere empfiehlt der Tierschutzbund 150 × 100 × 150 cm.', 'dtschbKn'), K('Drei Seiten blickdicht. Das Terrarium gut sichern, Kornnattern drücken unverschlossene Türen auf.', 'dtschbKn')] },
        { id: 'einr', title: 'Einrichtung', items: [K('Mehrere höhlenartige Verstecke.', 'dtschbKn'), K('Klettermöglichkeiten auf mehreren Ebenen und ein erhöhter Aussichts- und Sonnenplatz.', 'dtschbKn'), K('Eine Häutungshilfe (Ast oder raue Steine).', 'dtschbKn'), K('Eine Badeschale, groß genug für die ganze Schlange.', 'dtschbKn'), K('Ein Eiablagekasten mit leicht feuchtem Substrat, auch für einzelne Weibchen.', 'dtschbKn'), K('Mit Thermometer ohne Quecksilber und Hygrometer im Terrarium. Außen angebrachte sind zu ungenau.', 'dtschbKn')] },
        { id: 'sub', title: 'Substrat', items: [K('Erde, Sand, Ton und Torf, dazu optional dünn Rindenmulch. Ein Bereich feucht, nicht alles nass (sonst Bakterien und Pilze).', 'dtschbKn'), K('Teile des Substrats erhöhen, Kornnattern graben gern.', 'dtschbKn'), K('Substrat etwa zweimal im Jahr wechseln. Zeitung nur kurz oder in der Quarantäne.', 'dtschbKn')] },
        { id: 'klima', title: 'Klima', items: [K('Tag 24–28 °C, am Sonnenplatz lokal 28 bis über 35 °C.', 'dtschbKn'), K('Nacht 18–20 °C.', 'dtschbKn'), K('Luftfeuchte 50–70 %, durch regelmäßiges Sprühen oder eine Beregnung. Dazu eine Feuchtbox mit feuchtem Moos.', 'dtschbKn')] },
        { id: 'licht', title: 'Licht', items: [K('12–14 Stunden Licht am Tag, außerhalb der Winterruhe.', 'dtschbKn'), K('UV-Licht ist für Wohlbefinden und Aktivität empfohlen. Für die Sonnenplätze ist Metalldampf besser als Halogen.', 'dtschbKn'), K('Lampen außer Reichweite oder mit Schutzkorb, sonst drohen Verbrennungen.', 'dtschbKn'), K('Ferguson-Zone 1–2, UV-Index am Liegeplatz höchstens 1,1–3,0.', 'baines')] },
        { id: 'futter', title: 'Wasser und Futter', items: [K('Jeden Tag frisches Trinkwasser. Wasser- und Badeschalen täglich reinigen.', 'dtschbKn'), K('Passende Mäuse, kleine Ratten oder Küken. Erwachsene etwa 1–3 Mäuse alle 2–3 Wochen, Jungtiere wöchentlich.', 'dtschbKn'), K('Einzeln außerhalb des Terrariums füttern.', 'dtschbKn'), K('Die Verdauung beginnt ab 10 °C und läuft bei 30 °C am besten. Zu kalt kann Erbrechen auslösen, zu heiß Blähungen.', 'dtschbKn')] },
        { id: 'winter', title: 'Winterruhe', items: [K('Etwa zwei Monate, Oktober bis März, bei 8–12 °C in völliger Dunkelheit.', 'dtschbKn'), K('4–5 Wochen vorher nicht mehr füttern. Kotproben davor und danach. Nur gesunde Tiere.', 'dtschbKn'), K('Licht langsam reduzieren und wieder steigern.', 'dtschbKn')] },
        { id: 'ges', title: 'Gesundheit', items: [K('Häufig: Häutungsprobleme, Milben, Fressstörungen und Veränderungen von Kot und Schleimhaut.', 'dtschbKn'), K('Einmal pro Woche wiegen. Bei Verdacht auf Krankheit zum Tierarzt.', 'dtschbKn'), K('Neue Tiere mindestens sechs Wochen in Quarantäne, mit zwei negativen Kotproben.', 'dtschbKn'), K('Kornnattern tragen oft Salmonellen: Hände waschen, Futter- und Wassergefäße getrennt von der Küche halten. Vorsicht bei kleinen Kindern, Schwangeren und geschwächter Abwehr.', 'dtschbKn'), K('Qualzuchten meiden: schuppenlose Tiere und „Sunkissed“ (kann zum Sterngucker-Syndrom führen).', 'dtschbKn')] }
      ]
    },
    jc: {
      note: 'Quelle: Deutscher Tierschutzbund. Er nennt das Jemenchamäleon stressempfindlich und nicht für Anfänger und rät von Wildfängen ab. Die Art steht in Anhang B der EU-Artenschutzverordnung: meldepflichtig, Herkunftsnachweis nötig.',
      sections: [
        { id: 'ueber', title: 'Überblick', items: [K('Bis 50 cm lang, Lebenserwartung etwa 7 Jahre. Stammt von der Arabischen Halbinsel und ist tagaktiv.', 'dtschbJc'), K('Strenger Einzelgänger. Schon der Anblick eines Artgenossen kann Stress auslösen.', 'dtschbJc')] },
        { id: 'terr', title: 'Terrarium', items: [K('Mindestens 200 × 100 × 150 cm für ein Tier. Die Höhe ist wichtig, weil es ein Kletterer ist.', 'dtschbJc'), K('Drei Seiten blickdicht, zum Beispiel mit Korkwänden. Blickkontakt zu anderen Chamäleons, Tieren und Menschen vermeiden.', 'dtschbJc'), K('Viel Frischluft, zum Beispiel ein Gaze- oder Netzterrarium. Gute Luft zeigt sich daran, dass es nach dem Sprühen schnell abtrocknet.', 'dtschbJc')] },
        { id: 'einr', title: 'Einrichtung', items: [K('Viele Verstecke aus Steinen, Wurzeln, Ästen und Zweigen.', 'dtschbJc'), K('Dichte Bepflanzung, zum Beispiel Ficus benjamina, Farne, Sukkulenten, Bromelien und Tillandsien.', 'dtschbJc'), K('Substrat aus Sand und Erde, das Wasser aufnimmt.', 'dtschbJc')] },
        { id: 'klima', title: 'Klima', items: [K('Lufttemperatur 25–28 °C, lokal bis 40 °C.', 'dtschbJc'), K('Nachts mindestens 20 °C, ein deutlicher Unterschied zum Tag ist erwünscht.', 'dtschbJc'), K('Luftfeuchte 60–90 %.', 'dtschbJc')] },
        { id: 'licht', title: 'Licht', items: [K('Sommer 12–14 Stunden Licht, Winter etwa 8–10 Stunden.', 'dtschbJc'), K('UV-A und UV-B sind nötig. Als Beispiel nennt der Tierschutzbund eine 300-W-Lampe (Osram Ultra-Vitalux oder Radium Sanolux) aus 60–80 cm Abstand, höchstens 30 Minuten pro Tag.', 'dtschbJc'), K('Ferguson-Zone 3, UV-Index am Sonnenplatz 2,9–7,4.', 'baines'), K('Lampen in hitzefesten Porzellanfassungen, Schutzgitter um die Strahler.', 'dtschbJc')] },
        { id: 'wasser', title: 'Wasser', items: [K('Chamäleons erkennen stehendes Wasser nicht, sie trinken Tautropfen. Mindestens täglich sprühen, nach dem Tierschutzbund ein- bis zweimal.', 'dtschbJc'), K('Besser sind Tropftränke oder eine Benebelung. Stehendes Wasser kann Bakterien enthalten.', 'dtschbJc')] },
        { id: 'futter', title: 'Futter', items: [K('Grillen, Heimchen, kleine Heuschrecken und Schaben. Dazu Pflanzen wie Löwenzahn, Gurke und Sukkulenten.', 'dtschbJc'), K('Erwachsene: 3–4 Insekten, zwei- bis dreimal pro Woche, damit sie nicht verfetten.', 'dtschbJc'), K('Jungtiere: die ersten acht Monate täglich, mit gelegentlichen Fastentagen, dann zwei- bis dreimal pro Woche.', 'dtschbJc'), K('Vitamin D und Mineralien: Insekten damit bestäuben und die Futtertiere selbst gut füttern.', 'dtschbJc')] },
        { id: 'winter', title: 'Winterruhe', items: [K('Etwa November bis März, rund zwei Monate: Licht 8–10 Stunden, tags 20 °C, nachts 12–16 °C, etwa ein Insekt pro Woche, frisches Wasser weiter anbieten.', 'dtschbJc')] },
        { id: 'ges', title: 'Gesundheit', items: [K('Mangel an Vitamin D oder Calcium zeigt sich in unkoordinierten Bewegungen und Rachitis.', 'dtschbJc'), K('Legenot kann tödlich sein. Ursachen sind fehlende Ablageplätze, Mangel, Infektionen oder Stress.', 'dtschbJc'), K('Zu fettes oder eiweißreiches Futter kann die Organe verfetten, bei Wassermangel droht Gicht.', 'dtschbJc'), K('Häutungsprobleme hängen oft mit zu niedriger Luftfeuchte zusammen.', 'dtschbJc'), K('Neue Tiere auf Parasiten untersuchen lassen.', 'dtschbJc')] }
      ]
    },
    rg: {
      note: 'Quelle: The Bio Dude. Die Seite nennt trotz ihrer Rubrik keine Belege, und bei Terrariengrößen und UV-B-Stärke widerspricht sie sich. Prüf wichtige Werte zusätzlich bei einer tierärztlichen Quelle. Fahrenheit-Werte sind in °C umgerechnet.',
      sections: [
        { id: 'ueber', title: 'Überblick', items: [K('Länge 14–20+ Zoll, also etwa 36–51 cm. Lebenserwartung weit über 40 Jahre.', 'biodude'), K('Meist leicht zu handhaben, aber nur kurze Sitzungen. Große Tiere „von Hand zu Hand“ führen. Bei Störung rufen und bellen sie.', 'biodude')] },
        { id: 'terr', title: 'Terrarium', items: [K('Erwachsene mindestens 36 × 18 × 36 Zoll, also etwa 91 × 46 × 91 cm. Größer ist besser. Die Quelle widerspricht sich bei den Maßen für Jungtiere.', 'biodude')] },
        { id: 'klima', title: 'Klima', items: [K('Sonnenplatz 86–88 °F, also etwa 30–31 °C. Kühle Seite 72–78 °F, etwa 22–26 °C.', 'biodude'), K('Nachts 66–72 °F, etwa 19–22 °C. Nachtwärme nur, wenn es unter 65 °F (etwa 18 °C) fällt.', 'biodude'), K('Wärmequelle: 50-W-Strahler an Dimmer und Zeitschaltuhr, mehr Leistung nur bei Bedarf.', 'biodude'), K('Luftfeuchte 60–80 %. Zweimal täglich sprühen, morgens und abends. Zwei Hygrometer: oben an kühler Stelle, unten am Boden.', 'biodude')] },
        { id: 'licht', title: 'Licht', items: [K('Dämmerungsaktiv. Die Quelle empfiehlt dennoch UV-A und UV-B für Verdauung, Calcium- und D3-Stoffwechsel und gegen Knochenerkrankungen. Genannt wird eine 12-Zoll-Arcadia-ShadeDweller mit 2,4 % (an anderer Stelle 7 %).', 'biodude'), K('Sonnenast etwa 6 Zoll (15 cm) von der Lampe, 12 Stunden am Tag. UV-B alle 8–12 Monate tauschen und das Einbaudatum notieren.', 'biodude'), K('Sundown Reptiles hält UV-B für möglich, aber nicht nötig.', 'sundown'), K('Ferguson-Zone 1–2 ist abgeleitet, die Art steht nicht in der Studie.', 'baines')] },
        { id: 'einr', title: 'Einrichtung', items: [K('Tiefes, gut drainiertes Substrat mit Drainageschicht (bioaktiv mit Bodentieren). Riesengeckos erzeugen viel Abfall.', 'biodude'), K('Stabile Äste und Baumstämme, die nicht kippen. Mehrere Korkröhren.', 'biodude'), K('Pflanzen wie Ficus und Schefflera. Wasser speichernde Pflanzen wie Bromelien und Bogenhanf. Viele Verstecke.', 'biodude'), K('Eine flache, breite Wasserschale, keine Wasserfälle.', 'biodude')] },
        { id: 'futter', title: 'Futter', items: [K('Basis ist Fertigfutter wie Repashy oder Pangea. Dazu Grillen und Dubia-Schaben, nur für Zuchtweibchen gelegentlich ein Pinkie.', 'biodude'), K('Erwachsene: 1,5–2 oz (etwa 43–57 g) Fertigbrei alle 1–2 Tage, abends füttern.', 'biodude'), K('Flache, breite Schale, mit Magnet fixiert, damit schwere Tiere sie nicht umwerfen.', 'biodude'), K('Futterinsekten mit Calcium und Multivitamin bestäuben und vorher gut füttern.', 'biodude')] },
        { id: 'ges', title: 'Gesundheit', items: [K('UV-B hilft, Knochenerkrankungen vorzubeugen. Passende Luftfeuchte hilft bei der Häutung.', 'biodude')] }
      ]
    }
  };

  const LEXICON = [
    { term: 'UV-Index (UVI)', text: 'Misst, wie stark UV-Strahlung ist. Am Sonnenplatz brauchst du ein UV-Index-Messgerät, um zu wissen, was wirklich ankommt. Baines et al. geben die Werte je Art als Bereich an.', src: ['baines'] },
    { term: 'Ferguson-Zonen', text: 'Einteilung der Arten nach ihrem UV-Bedarf. In Baines et al. (2016) liegen Kornnatter in Zone 1–2 und Jemenchamäleon in Zone 3. Je höher die Zone, desto mehr UV am Sonnenplatz.', src: ['baines'] },
    { term: 'UV-A und UV-B', text: 'UV-B braucht das Tier für Vitamin D3 und damit für Calcium und Knochen. LED, Glühbirne und Infrarotlampe geben kein UV-B.', src: ['biodude', 'arcadia'] },
    { term: 'T5- und T8-Röhre', text: 'Leuchtstoffröhren mit UV-B in Prozent (zum Beispiel 6 % oder 12 %). Sie brauchen ein Vorschaltgerät. Arcadia nennt für T5 12 Monate bis zum Tausch, CTT Light für T8 sechs Monate.', src: ['arcadia', 'ctt'] },
    { term: 'Vorschaltgerät', text: 'Steuert Röhren und Metalldampflampen. Ohne Vorschaltgerät leuchten sie nicht. Komplettsets haben eines eingebaut.', src: ['zoomedPS'] },
    { term: 'Metalldampflampe (HID)', text: 'Starker Strahler mit Licht, Wärme und UV-B. Braucht ein eigenes Vorschaltgerät. Für Zone 1–2 nur mit viel Abstand und Schattenbereichen. Tausch nach 18–24 Monaten laut CTT Light, die App nimmt die untere Grenze.', src: ['ctt', 'baines'] },
    { term: 'Mischlichtlampe', text: 'UV-B-Lampe mit Quecksilberdampf, die selbst vorschaltend in eine normale Fassung passt, zum Beispiel Zoo Med PowerSun UV. Richtwert 6–12 Monate laut CTT Light.', src: ['zoomedPS', 'ctt'] },
    { term: 'Infrarot- und Keramikstrahler', text: 'Infrarotlampen (rot) geben Licht ab, das Reptilien sehen. Nachts stört das den Rhythmus. Ein Keramikstrahler gibt nur Wärme und braucht einen Thermostat.', src: ['biodudeRed'] },
    { term: 'Tag-Nacht-Gefälle', text: 'Der Temperaturunterschied zwischen Tag und Nacht. Beim Jemenchamäleon ist ein deutlicher Abfall erwünscht, nachts aber nicht unter 20 °C.', src: ['dtschbJc'] },
    { term: 'Photoperiode', text: 'Wie viele Stunden am Tag das Licht an ist. Kornnatter 12–14 Stunden, Jemenchamäleon im Sommer 12–14 und im Winter 8–10 Stunden, Riesengecko 12 Stunden.', src: ['dtschbKn', 'dtschbJc', 'biodude'] },
    { term: 'Hygrometer und Thermometer', text: 'Messen Luftfeuchte und Temperatur. Der Tierschutzbund rät zu Thermometern ohne Quecksilber im Terrarium, außen angebrachte sind zu ungenau.', src: ['dtschbKn'] },
    { term: 'Quarantäne', text: 'Neue Tiere kommen erst allein unter. Der Tierschutzbund nennt für Kornnattern mindestens sechs Wochen und zwei negative Kotproben.', src: ['dtschbKn'] },
    { term: 'Winterruhe', text: 'Eine kühle, dunkle Ruhephase. Kornnattern etwa zwei Monate bei 8–12 °C, Jemenchamäleons mit kürzerem Licht und kühleren Nächten (12–16 °C).', src: ['dtschbKn', 'dtschbJc'] },
    { term: 'Bioaktives Substrat', text: 'Tiefes Substrat mit Drainage, in dem Bodentiere (zum Beispiel Springschwänze und Asseln) Abfall abbauen. The Bio Dude empfiehlt es für Riesengeckos.', src: ['biodude'] }
  ];

  /** Einrichtungs-Checkliste je Art: Punkte aus den Artenprofilen, mit Quelle. */
  const SETUP_CHECK = {
    kn: [['hide', 'Mehrere höhlenartige Verstecke', 'dtschbKn'], ['climb', 'Klettermöglichkeiten und erhöhter Sonnenplatz', 'dtschbKn'], ['shed', 'Häutungshilfe (Ast oder raue Steine)', 'dtschbKn'], ['bath', 'Badeschale, groß genug für die ganze Schlange', 'dtschbKn'], ['wet', 'Feuchtbox mit Moos', 'dtschbKn'], ['egg', 'Eiablagekasten mit leicht feuchtem Substrat', 'dtschbKn'], ['therm', 'Thermometer ohne Quecksilber und Hygrometer im Terrarium', 'dtschbKn'], ['guard', 'Wärmelampen außer Reichweite oder mit Schutzkorb', 'dtschbKn'], ['uvb', 'UV-B-Lampe passend zu Zone 1–2', 'baines'], ['secure', 'Terrarium gut gesichert, Türen verschlossen', 'dtschbKn']],
    jc: [['gauze', 'Gaze- oder Netzterrarium mit viel Frischluft', 'dtschbJc'], ['block', 'Drei Seiten blickdicht, kein Sichtkontakt zu anderen Tieren', 'dtschbJc'], ['plants', 'Dichte Bepflanzung und viele Kletteräste', 'dtschbJc'], ['hide', 'Verstecke aus Steinen, Wurzeln und Zweigen', 'dtschbJc'], ['drip', 'Tropftränke oder Benebelung für Tautropfen', 'dtschbJc'], ['uvb', 'UV-B-Lampe passend zu Zone 3, über dem Sonnenplatz', 'baines'], ['guard', 'Schutzgitter um die Strahler, Porzellanfassungen', 'dtschbJc'], ['night', 'Nachts alle Lampen aus, mindestens 20 °C', 'dtschbJc'], ['suppl', 'Vitamin- und Mineralpulver für Futterinsekten', 'dtschbJc']],
    rg: [['dim', 'Wärmestrahler an Dimmer und Zeitschaltuhr', 'biodude'], ['hygro', 'Zwei Hygrometer, oben und unten', 'biodude'], ['mist', 'Zweimal täglich sprühen', 'biodude'], ['water', 'Flache, breite Wasserschale', 'biodude'], ['cork', 'Mehrere Korkröhren und stabile, kippsichere Äste', 'biodude'], ['plants', 'Pflanzen, die Wasser speichern', 'biodude'], ['drain', 'Tiefes, gut drainiertes Substrat', 'biodude'], ['uvb', 'Schwache UV-B-Röhre über dem Sonnenast', 'biodude'], ['dark', 'Nachts kein Licht', 'biodude'], ['dish', 'Breite, kippsichere Futterschale', 'biodude']]
  };

  /** Prüft eine Lampe, die noch nicht eingebaut ist (zum Beispiel im Internet gefunden), für ein Terrarium.
   *  replaceId: eine vorhandene Lampe, die sie ersetzen soll. */
  function candidateCheck(t, cand, lampList, replaceId) {
    const tmp = Object.assign({ hoursPerDay: null }, cand, { id: '_check', tid: t.id });
    const list = (lampList || []).filter(l => l.id !== replaceId).concat(tmp);
    const items = lampAdvice(t, list).filter(a => a.lid === '_check' || !a.lid);
    const bad = items.filter(a => a.level !== 'none');
    return { level: bad.length ? bad[0].level : 'green', items };
  }

  /** Kennzahlen für den Steckbrief eines Tieres aus dem Tagebuch. */
  function animalStats(a, journal, nowMs) {
    const j = (journal || []).filter(e => e.aid === a.id).slice().sort((x, y) => y.ts - x.ts);
    const last = type => j.find(e => e.type === type) || null;
    const ws = j.filter(e => e.type === 'weight' && Number.isFinite(parseNum(e.value))).map(e => ({ ts: e.ts, w: parseNum(e.value) }));
    const w = ws.length ? ws[0] : null, prev = ws.length > 1 ? ws[1] : null;
    const hatch = a.hatch ? Date.parse(a.hatch) : NaN;
    const daysSince = e => e ? Math.max(0, Math.floor((nowMs - e.ts) / DAY)) : null;
    return {
      weight: w, prevWeight: prev,
      weightDelta: w && prev ? round1(w.w - prev.w) : null,
      weightPct: w && prev && prev.w ? round1((w.w - prev.w) / prev.w * 100) : null,
      daysSinceFeed: daysSince(last('feed')), daysSinceShed: daysSince(last('shed')), daysSincePoop: daysSince(last('poop')), daysSinceVet: daysSince(last('vet')),
      ageDays: Number.isFinite(hatch) && hatch <= nowMs ? Math.floor((nowMs - hatch) / DAY) : null,
      entries: j.length
    };
  }
  /** Alter als Text: Tage, Monate oder Jahre. */
  function ageLabel(days) {
    if (days === null || days === undefined) return null;
    if (days < 60) return days + ' Tage';
    if (days < 730) return Math.round(days / 30.44) + ' Monate';
    const y = Math.floor(days / 365.25), m = Math.floor((days - y * 365.25) / 30.44);
    return y + ' Jahre' + (m ? ' ' + m + ' Monate' : '');
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
    kn: [['water', 'Wasser wechseln, Napf reinigen', 2], ['spray', 'Düsen der Beregnung entkalken', 30], ['soil', 'Substrat komplett wechseln', 90], ['clean', 'Einrichtung reinigen und desinfizieren', 180], ['batt', 'Sensor-Batterie prüfen', 90]],
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
    if (l.type === 'led') return { level: 'none', label: 'LED, keine Lebensdauer nötig', pct: null, daysLeft: null };
    const inst = l.installed ? Date.parse(l.installed) : NaN;
    if (!Number.isFinite(inst)) return { level: 'none', label: 'Einbaudatum fehlt', pct: null, daysLeft: null };
    const months = parseNum(l.lifeMonths), hours = parseNum(l.lifeHours), hpd = parseNum(l.hoursPerDay);
    let dueAt = null;
    if (months && months > 0) dueAt = addMonths(inst, months);
    else if (hours && hours > 0 && hpd && hpd > 0) dueAt = inst + Math.round(hours / hpd) * DAY;
    if (dueAt === null && l.type === 'chc') return { level: 'none', label: 'Keine feste Austauschfrist', pct: null, daysLeft: null, ageDays: Math.floor((now - inst) / DAY) };
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
    SOURCES, PRESETS, SIZE_RULES, LIGHTING, SHOP, shopLink, lightHours, hoursCheck, lampSpan, lightPlan, CATALOG, socketsOf, socketRecs, lampPlan, SUBSTRATE, substrateNeed, substrateStatus, hasExoCover, slotUse, lightCheck, lampAdvice, candidateCheck, animalStats, ageLabel, KNOWLEDGE, LEXICON, SETUP_CHECK, minSize, checkSize, LAMP_TYPES, DEFAULT_TASKS, DEFAULT_LAMPS,
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
