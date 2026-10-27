'use strict';
/**
 * Publishes the current app/ as the MORO DIV test app: https://abdelfatehtebbani-creator.github.io/moro-div/
 * The copy talks only to the MORO DIV server, shows a red "MORO DIV" tag and is named "MORO DIV" when installed.
 *   node tests/publish-div.js <clone of the moro-div repository>
 * The real app (GitHub Pages of moro-pwa, main branch) is not touched.
 */
const fs = require('node:fs');
const path = require('node:path');

const DIV_API = 'https://script.google.com/macros/s/AKfycbxxek05XE5aHud3jDzpP3GLpyfViaX-xIicpobOb_UGFv01qz9g8BkZqdzwBSB97MeRQg/exec';
const APP = path.join(__dirname, '..', 'app');
const OUT = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(OUT, '.git'))) { console.error('usage: node tests/publish-div.js <moro-div clone>'); process.exit(1); }

// clean the clone (keep .git), copy app/
for (const f of fs.readdirSync(OUT)) if (f !== '.git') fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
fs.cpSync(APP, OUT, { recursive: true });

const edit = (rel, fn) => { const p = path.join(OUT, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
edit('js/config.js', (s) => {
  const out = s.replace(/export const API_URL = [^\n]*/, "export const API_URL = '" + DIV_API + "';   // MORO DIV (test copy)");
  if (out === s) throw new Error('API_URL line not found');
  return out;
});
const TAG = '<div style="position:fixed;bottom:0;left:0;z-index:99999;background:#b71c1c;color:#fff;padding:3px 10px;font:600 12px sans-serif;pointer-events:none">MORO DIV · test copy</div>';
for (const page of ['index.html', 'install.html']) {
  edit(page, (s) => s.replace('</body>', TAG + '</body>').replace(/<title>([^<]*)<\/title>/, '<title>[DIV] $1</title>'));
}
edit('manifest.webmanifest', (s) => {
  const m = JSON.parse(s);
  m.name = 'MORO DIV (test copy)';
  m.short_name = 'MORO DIV';
  m.id = './?app=moro-div';
  m.theme_color = '#b71c1c';
  return JSON.stringify(m, null, 2) + '\n';
});
// Same origin as the real app (abdelfatehtebbani-creator.github.io): storage must never be shared, or the test
// copy would read the real token, cached data and unsent entries (and send them to the test server).
edit('js/db.js', (s) => { const o = s.replace("const DB_NAME = 'moro';", "const DB_NAME = 'moro-div';"); if (o === s) throw new Error('DB_NAME'); return o; });
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
for (const f of walk(path.join(OUT, 'js')).concat([path.join(OUT, 'install.html')])) {
  const s = fs.readFileSync(f, 'utf8');
  const o = s.replace(/(['"])moro\./g, '$1moro-div.');           // localStorage keys: moro.token -> moro-div.token, ...
  if (o !== s) fs.writeFileSync(f, o);
}
if (!fs.readFileSync(path.join(OUT, 'js', 'api.js'), 'utf8').includes("'moro-div.token'")) throw new Error('token key');
// the service worker: own cache name, and it only clears its own old caches (never the real app's)
edit('sw.js', (s) => {
  const o = s.replace(/const VERSION = '([^']+)';/, "const VERSION = '$1-div';")
    .replace("keys.filter((k) => k !== VERSION)", "keys.filter((k) => k !== VERSION && k.endsWith('-div'))");
  if (!o.includes("k.endsWith('-div')")) throw new Error('sw cache filter');
  return o;
});
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'README.md'), '# MORO DIV\n\nTest copy of the MORO app, talking only to the MORO DIV test server. Built from moro-pwa by tests/publish-div.js. Code only, no data.\n');
console.log('MORO DIV app written to ' + OUT);
