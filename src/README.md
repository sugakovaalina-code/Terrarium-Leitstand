# Terrarium Control Center – Version 1

Veröffentlicht: https://claude.ai/artifact/WEBGxDjZh7hAhCvcaiZE1e (privat)

## Dateien
- `terrarium-app.html` – Oberfläche (Design C), Speicherung, Ansichten
- `logic.js` – reine Logik ohne DOM: Bewertung, Tag/Nacht, Validierung, Statistik, Muster, Pflege-Fälligkeit, CSV/Backup
- `test/logic.test.js` – 19 Tests, Start mit `TZ=Europe/Berlin node --test test/logic.test.js`

## Speicherung
Im claude.ai-Viewer: privater Bereich `data/users/<id>/` der Artifact-Datenbank (geräteübergreifend).
Außerhalb: localStorage des Browsers. Dokumente: `config` (Terrarien, Zielwerte, Aufgaben, Tiere),
`r-<terrarium>-<JJJJ-MM>` (Messwerte je Monat), `j-<JJJJ>` (Tiertagebuch je Jahr).

## Bewusst offen
- Zielwerte sind leer, bis Alina sie mit Quelle einträgt (keine erfundenen Haltungswerte).
- SwitchBot-Anbindung noch nicht gebaut (braucht Zwischenserver, Token nie in der geteilten Datenbank).
- Produktempfehlungen noch nicht recherchiert.
- Push-Benachrichtigungen bei geschlossener App nicht möglich, später über SwitchBot-App oder Server.


## Version 3 (26.10.2026): Leitstand fürs iPad

- Neues Design: dunkle Seitenleiste ab 900 px Breite (iPad quer), darunter Tab-Leiste unten.
- Übersicht mit Kennzahlen, drei Terrarien-Kacheln, „Als Nächstes zu tun“, Lampen und Auffälliges.
- Terrarium-Reiter: Klima, Verlauf, Einrichtung (Maße, Tierlänge, Anzahl, Zielwerte vorausgefüllt mit Quellen), Lampen, Aufgaben, Tiere.
- Lampen: Alter in Monaten eingeben, App rechnet Einbau- und Tauschdatum aus. Intervalle: T5 12 Monate (Arcadia), T8/Kompakt/Mischlicht 6, Metalldampf 18 (CTT Light, untere Grenze).
- Aufgaben je Art vorgegeben (Startwerte der App, keine Haltungsvorschrift), Datum „zuletzt erledigt“ direkt in der Liste.
- Alte Daten werden beim Start ergänzt (Schema 2), nichts wird überschrieben.
- Tests: `TZ=Europe/Berlin node --test test/logic.test.js` (33 Tests).

## Version 4: Nachtwerte und Licht je Art

- Tag- und Nachtzielwerte stehen jetzt in jeder Terrarium-Kachel und im Reiter Klima.
- Neuer Block „Welches Licht braucht dieses Tier?“ im Reiter Lampen und auf der Seite Lampen: UV-B (Ferguson-Zone und UV-Index nach Baines et al. 2016), Wärme, Lichtdauer, Nacht, mit Quellen. Die App prüft, ob UV-B-Lampe und Wärmestrahler eingetragen sind.

## Version 5: Deine Lampen und Prüfregeln

- Neue Lampenarten: Infrarot-Wärmelampe, Glühbirne/Spot, Keramikstrahler, „Birne, Art noch offen“.
- Je Lampe: Position (über Gitter / im Terrarium), Schutzkorb, UV-B-Stärke in %, Fassung, „auch nachts an“.
- Je Terrarium: Abdeckungen und Fassungen, Vorschaltgerät ja/nein.
- `lampAdvice()` prüft: fehlendes UV-B oder fehlender Wärmestrahler, rote Infrarotlampe, Lampe im Terrarium ohne Schutzkorb, Röhre ohne Vorschaltgerät, UV-B-Stärke passend zur Ferguson-Zone, Watt beim Riesengecko, Licht in der Nacht. Die Warnung erscheint schon im Formular, während man ändert.
- Schema 3.

## Version 6: Terrarien nach Fotos

- Je Terrarium eine Liste „Verbesserungen“ (`improve`) zum Abhaken, mit Quellen. Sie steht im Reiter Klima und im Reiter Lampen, offene Punkte zeigt die Übersicht an.
- Neue Prüfregel: Metalldampf-UV-B bei Kornnatter und Gecko (Zone 1–2) wird angemerkt.

## Version 7 (01.11.2026): Feinschliff nach dem Kornnattern-Eintrag

- Wärmelampen haben das Feld „Geregelt über“ (Thermostat, Dimmer, Zeitschaltuhr, gar nicht). Keramikstrahler ohne Thermostat werden angemerkt.
- Sensorwerte gelten nach 3 Stunden ohne neuen Wert als ausgefallen (Abruf läuft stündlich). Handwerte weiter nach „Wert alt nach Std.“.
- Seitenleiste zeigt, wann zuletzt ein Sensorwert kam, statt „noch manuell“.
- Mini-Diagramme zeigen Tiefst- und Höchstwert der letzten 48 Stunden.
- Jemenchamäleon: Thieme Heimtier-Info (2020) als zweite Quelle für die Nachttemperatur.
- Grammatik („2 Terrarien brauchen dich“) und Untertitel beim Messwert.
- Tests: 51.

## Version 8 (01.11.2026): Aufwärm- und Abkühlphase

- Je Terrarium „Aufwärmphase nach Licht an“ und „Abkühlphase nach Licht aus“ in Minuten (Startwert 120, 0 = aus). In diesen Phasen gilt alles zwischen Tag- und Nachtbereich als im Ziel; Werte außerhalb beider Bereiche warnen weiter.
- Kacheln zeigen „Aufwärmphase“ / „Abkühlphase“, das grüne Band im Verlauf wird in diesen Phasen breiter, die Muster („nachts zu warm“) zählen Übergangswerte nicht mehr als Fehler.
- Tests: 52.

## Version 9 (03.11.2026): Futterplan

- Neuer Bereich „Futterplan“ (Seitenleiste und Tab-Leiste „Futter“). Je Terrarium ein Plan, je Tier ein eigener Eintrag.
- Startwerte der App nach Alinas Vorgabe, keine Haltungsvorschrift, je Terrarium über „Plan“ änderbar: Kornnattern jeden Sonntag, Jemenchamäleon und Riesengecko alle 2 Tage. Möglich sind fester Wochentag, alle n Tage (1–90) oder kein Plan.
- Je Fütterung: Datum, gefüttert ja/nein, gefressen / teilweise / nicht gefressen. Was gefüttert wurde, wird bewusst nicht abgefragt. Schnellknöpfe für heute; ein zweiter Eintrag am selben Tag ersetzt den ersten (Vertippen korrigieren).
- Fälligkeit: heute fällig = gelb, überfällig = orange. Fester Wochentag: ein Eintrag bis zu drei Tage vorher zählt für den Termin. „Nicht gefüttert“ zählt als erledigt (bewusstes Auslassen).
- Ab 2-mal „nicht gefressen“ hintereinander gelber Hinweis, ab 3-mal orange, mit Prüfpunkten je Art. Ausgelassene Fütterungen unterbrechen die Zählung nicht, „teilweise“ beendet sie.
- Anzeige in Übersicht („Als Nächstes zu tun“, Hinweis-Chips), Warnungen und im Tier-Tagebuch.
- Speicherung: Fütterungen sind Tagebuch-Einträge (`type: 'feed'`) mit den neuen Feldern `fed` und `ate`, alte Einträge zählen als gefüttert. Der Plan steht in `terrarium.feed`.
- Schema 4: ergänzt den Plan und legt für Terrarien ohne Tier Platzhalter-Tiere nach „Anzahl“ an (z. B. Schlange 1–3, Namen änderbar). Nichts wird überschrieben.
- Tests: `TZ=Europe/Berlin node --test test/logic.test.js` (61 Tests).

