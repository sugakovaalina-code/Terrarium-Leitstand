#!/bin/sh
# Baut die eigenständige Web-App (GitHub Pages) aus terrarium-app.html.
set -e
cd "$(dirname "$0")"
OUT=web
mkdir -p $OUT
cp logic.js $OUT/
{
  printf '%s\n' '<!doctype html><html lang="de"><head><meta charset="utf-8">'
  printf '%s\n' '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  printf '%s\n' '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
  printf '%s\n' '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Terrarium">'
  printf '%s\n' '<meta name="theme-color" content="#121A17"><link rel="manifest" href="manifest.webmanifest">'
  printf '%s\n' '<link rel="apple-touch-icon" href="icon-180.png"><link rel="icon" href="icon-192.png">'
  printf '%s\n' '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>'
  printf '%s\n' '<script src="config.js"></script>'
  printf '%s\n' '</head><body>'
  sed '/<meta name="claude:viewport-fit-sides"/d' terrarium-app.html
  printf '%s\n' '<script>if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});</script>'
  printf '%s\n' '</body></html>'
} > $OUT/index.html
[ -f $OUT/config.js ] || printf '%s\n' '/* Wird beim Einrichten mit den Werten des Supabase-Projekts gefüllt. Der anon-Key ist öffentlich, die Daten schützt die Zeilen-Sicherheit. */' 'window.TCC_SUPABASE = null;' > $OUT/config.js
