// Runs every report on the migrated data (migration/out) and writes one .xlsx per report to
// tests/out/, so the numbers can be compared with MORO v13 and the files opened in Excel.
//   node tests/reports.check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.location = { hostname: 'localhost' };
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'migration', 'out');
const DEST = path.join(here, 'out');
fs.mkdirSync(DEST, { recursive: true });

function csv(name) {
  const text = fs.readFileSync(path.join(OUT, name + '.csv'), 'utf8').replace(/^﻿/, '');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  const [head, ...body] = rows;
  return { columns: head, rows: body.filter((r) => r.length > 1).map((r) => r.map((v, i) => (head[i] === 'active' ? v === 'TRUE' : ['qty', 'min_stock', 'price', 'amount', 'final_amount', 'qty_per_unit'].includes(head[i]) && v !== '' ? Number(v) : v))) };
}

const { Data, objects } = await import('../app/js/data.js');
const { REPORTS } = await import('../app/js/reports.js');
const { reportToXlsx } = await import('../app/js/xlsx.js');

Data.boot = { user: { role: 'admin', user_id: 'U001' }, permissions: [], version: 1, settings: {}, today: '2026-10-12',
  items: csv('Items'), parties: csv('Parties'), balances: csv('Balances'), lists: csv('Lists'), recipes: csv('Recipes'),
  locations: csv('Locations'), purposes: csv('Purposes') };
Data.index();
Data.todayIso = () => '2026-10-12';
const movs = objects(csv('Movements'));

const sections = new Set([...Data.parties.values()].filter((p) => p.kind === 'section').map((p) => p.party_id));
const someItems = new Set(['FLOUR NO 1 - QFM 50KG (BLUE)', 'SUGAR INDIA RENUKA 50 KG', 'SUN FLOWER OIL 4*5L']
  .map((n) => [...Data.items.values()].find((i) => i.name.toUpperCase() === n)?.item_id).filter(Boolean));
const base = { from: '2026-09-01', to: '2026-09-30', mode: 'all', detail: 'summary', days: 180, zero: false, foodOnly: false, packOnly: false,
  items: someItems, sections, zone: 'Food', year: 2026, months: new Set([9]), period: 'monthly' };

const summary = {};
for (const r of REPORTS) {
  const rep = r.build({ ...base, items: new Set(base.items) }, movs);
  summary[r.id] = { title: rep.title, rows: rep.rows.length, sample: rep.rows.slice(0, 2) };
  const blob = reportToXlsx({ ...rep, company: 'ALAKER SWEETS' });
  fs.writeFileSync(path.join(DEST, r.id + '.xlsx'), Buffer.from(await blob.arrayBuffer()));
}
console.log(JSON.stringify(summary, null, 1));
