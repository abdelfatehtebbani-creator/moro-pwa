'use strict';
/**
 * Local development server: serves app/ and answers POST /api with the real server code
 * (server/*.gs) running on in-memory sheets. Loads migration/out/*.csv when present so the
 * screens show realistic data; nothing is written back anywhere.
 *   node tests/devserver.js [port]
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createGas } = require('./helpers/gas');

const PORT = Number(process.argv[2]) || 8080;
const APP = path.join(__dirname, '..', 'app');
const OUT = path.join(__dirname, '..', 'migration', 'out');
const NUMERIC = new Set(['qty', 'price', 'amount', 'discount', 'final_amount', 'min_stock', 'qty_per_unit']);

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const g = createGas();
// local only: a fixed Masar link key so the link can be tried against this server
g.run("PropertiesService.getScriptProperties().setProperty('LINK_SECRET', 'dev-link-key')");
if (fs.existsSync(OUT)) {
  for (const f of fs.readdirSync(OUT).filter((n) => n.endsWith('.csv'))) {
    const name = f.slice(0, -4);
    if (!g.spreadsheet.sheets[name]) continue;
    const [head, ...body] = parseCsv(fs.readFileSync(path.join(OUT, f), 'utf8').replace(/^\uFEFF/, ''));
    g.seed(name, body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => {
      const v = r[i] ?? '';
      if (NUMERIC.has(h) && v !== '') return [h, Number(v)];
      if (h === 'active') return [h, v.toUpperCase() === 'TRUE'];
      return [h, v];
    }))));
  }
  console.log('loaded test data from migration/out');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer((req, res) => {
  // touch tests/out/OFFLINE to make /api fail like a lost connection (offline testing)
  if (req.url === '/api' && fs.existsSync(path.join(__dirname, 'out', 'OFFLINE'))) { req.socket.destroy(); return; }
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      g.run('void 0');
      const out = JSON.parse(g.run('JSON.stringify(handle(' + JSON.stringify(body) + '))'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(APP, p);
  if (!file.startsWith(APP) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('MORO dev server on http://localhost:' + PORT));
