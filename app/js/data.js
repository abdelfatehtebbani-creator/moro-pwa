// The device's copy of the master data and balances (from data.bootstrap), kept in IndexedDB so
// the app opens without internet, and refreshed whenever the server's data version changes.
import { call, session } from './api.js';
import { kv } from './db.js';
import { daysBetween } from './ui.js';

const objects = (raw) => (raw && raw.rows ? raw.rows.map((r) => Object.fromEntries(raw.columns.map((c, i) => [c, r[i]]))) : []);

/** The four stores, in the order the buttons show them. */
export const STORES = ['CHILLED', 'DRY', 'PACK', 'FINAL', 'CLEAN'];

export const Data = {
  boot: null,
  user: null,
  perms: new Set(),
  version: 0,
  items: new Map(),
  parties: new Map(),
  balances: new Map(),
  serverBalances: new Map(),
  pendingDeltas: {},
  lists: [],
  recipes: [],
  locations: [],
  units: [],
  purposes: [],
  settings: {},
  today: '',
  syncedAt: null,

  index() {
    const b = this.boot;
    this.user = b.user;
    this.userNames = b.user_names || {};
    this.perms = new Set(b.permissions);
    this.version = b.version;
    this.settings = b.settings || {};
    this.items = new Map(objects(b.items).map((i) => [i.item_id, i]));
    this.parties = new Map(objects(b.parties).map((p) => [p.party_id, p]));
    this.serverBalances = new Map(objects(b.balances).map((x) => [x.item_id, x]));
    // what is left of each expiry date: {item_id: [[expiry, qty], ...]} nearest first
    this.batches = b.batches || {};
    this.applyPending(this.pendingDeltas || {});
    this.lists = objects(b.lists);
    this.recipes = objects(b.recipes);
    this.locations = objects(b.locations);
    this.reservedQty = b.reserved || {};
    this.units = objects(b.units || { columns: [], rows: [] });
    this.purposes = objects(b.purposes);
    this.today = b.today;
    this.permTree = b.perm_tree || [];
    this.roleCaps = b.role_caps || {};
  },

  async loadCached() {
    const b = await kv.get('boot');
    // a copy without a user, or saved for another account than the one signed in, is not used
    const uid = String(session.token || '').split('.')[0];
    if (!b || !b.user || !b.user.user_id || (uid && b.user.user_id !== uid)) return false;
    this.boot = b;
    this.syncedAt = (await kv.get('boot_at')) || null;
    this.index();
    return true;
  },

  async refresh() {
    this.boot = await call('data.bootstrap');
    this.syncedAt = new Date().toISOString();
    await kv.set('boot', this.boot);
    await kv.set('boot_at', this.syncedAt);
    this.index();
    window.dispatchEvent(new CustomEvent('moro:data'));
  },

  /** Refreshes only when the server has newer data. Returns true when something changed. */
  async refreshIfChanged() {
    const { version } = await call('data.version');
    if (version === this.version) return false;
    await this.refresh();
    return true;
  },

  /** Balances = server balances + movements still waiting in the outbox. */
  applyPending(deltas) {
    this.pendingDeltas = deltas;
    const m = new Map([...this.serverBalances].map(([k, v]) => [k, { ...v }]));
    for (const [id, d] of Object.entries(deltas)) {
      const cur = m.get(id) || { item_id: id, qty: 0, unit: (this.items.get(id) || {}).unit || '', last_expiry: '' };
      cur.qty = Math.round((Number(cur.qty) + d) * 1e6) / 1e6;
      m.set(id, cur);
    }
    this.balances = m;
  },

  can(action) { return this.perms.has(action); },
  /** May this user edit / delete movement m (per screen: own entries, or anyone's)? */
  canEdit(m) {
    const s = this.screenOf(m.kind), own = m.created_by === (this.user && this.user.user_id);
    return this.can('edit_all.' + s) || (own && this.can('edit_own.' + s));
  },
  canDelete(m) {
    const s = this.screenOf(m.kind), own = m.created_by === (this.user && this.user.user_id);
    return this.can('delete.' + s) && (own || this.can('edit_all.' + s));
  },
  screenOf(kind) {
    if (kind === 'RECEIPT' || kind === 'SUPPLIER_RETURN') return 'receive';
    if (kind === 'ISSUE' || kind === 'DEPT_RETURN' || kind === 'DISPOSAL') return 'issue';
    if (kind === 'PROD_CONSUME' || kind === 'PROD_OUTPUT') return 'production';
    return 'other';
  },

  /** Store of an item or location (rows not yet sorted fall back to their category). */
  storeOf(row) {
    if (!row) return '';
    return STORES.includes(row.store) ? row.store : row.category === 'Packaging' ? 'PACK' : 'DRY';
  },
  /** Stores the user may receive / issue in (an older cached profile without stores: all). */
  myStores() {
    const s = this.user && this.user.stores;
    return Array.isArray(s) ? s.filter((x) => STORES.includes(x)) : STORES.slice();
  },
  canStore(store) { return this.myStores().includes(store); },
  /** Packaging units of an item: [{unit, factor}] (factor in stock units), from "TRAY=30, BOX=360". */
  packsOf(item) {
    // "BOX=10" or "1 BOX = 10 PC", either way round (same reading as the server's Packs.parse)
    // also a chain: "1 BOX = 12 TRAY = 360 PC"
    const stock = String((item && item.unit) || '').toUpperCase();
    return String((item && item.pack_units) || '').split(/[,;\n]/).flatMap((p) => {
      const parts = p.trim().toUpperCase().split('=');
      if (parts.length < 2) return [];
      const terms = [];
      for (let i = 0; i < parts.length; i++) {
        const m = parts[i].trim().match(/^([\d.]*)\s*([^\s\d=.]*)$/);
        if (!m) return [];
        const n = m[1] === '' ? 1 : Number(m[1]), unit = m[2] || (i === parts.length - 1 ? stock : '');
        if (!(n > 0) || !unit) return [];
        terms.push({ n, unit });
      }
      const base = terms.filter((x) => x.unit === stock);
      if (base.length !== 1) return [];
      return terms.filter((x) => x.unit !== stock).map((x) => ({ unit: x.unit, factor: base[0].n / x.n }));
    });
  },
  /** "1 BOX = 10 PC" for one packaging unit, whichever is larger. */
  packText(item, p) {
    const r = (n) => Math.round(n * 1e6) / 1e6;
    return p.factor >= 1 ? '1 ' + p.unit + ' = ' + r(p.factor) + ' ' + item.unit : '1 ' + item.unit + ' = ' + r(1 / p.factor) + ' ' + p.unit;
  },
  /** Stock units in one `unit` of the item (1 for the stock unit, null when not defined). */
  factorOf(item, unit) {
    const u = String(unit || '').trim().toUpperCase();
    if (!item || !u || u === String(item.unit).toUpperCase()) return 1;
    const p = this.packsOf(item).find((x) => x.unit === u);
    return p ? p.factor : null;
  },
  /** The units an item can be entered in: its stock unit first, then its packaging units. */
  unitsOf(item) { return item ? [String(item.unit).toUpperCase(), ...this.packsOf(item).map((p) => p.unit)] : []; },
  /** "TRAY = 30 PC · BOX = 360 PC" */
  packsText(item) { return this.packsOf(item).map((p) => this.packText(item, p)).join(' · '); },
  /** A base-unit quantity in `unit` of the item: [qty, unit] (the base unit when `unit` is not defined). */
  inUnit(item, qty, unit) {
    const f = item && unit ? this.factorOf(item, unit) : null;
    return f && f !== 1 ? [Math.round((qty / f) * 1e6) / 1e6, String(unit).toUpperCase()] : [qty, item ? item.unit : ''];
  },
  /** The storekeeper's display unit (issues and the dashboard). */
  inStoreUnit(item, qty) { return this.inUnit(item, qty, item && item.store_unit); },
  fmtStore(item, qty, fmt) { const [q, u] = this.inStoreUnit(item, qty); return fmt(q) + ' ' + u; },
  /** "12.8 BOX" for a stock-unit quantity, in the item's report unit (screens that act as reports). */
  fmtReport(item, qty, fmt) { const [q, u] = this.inReportUnit(item, qty); return fmt(q) + ' ' + u; },
  /** A stock-unit quantity in the item's report unit: [qty, unit]. */
  inReportUnit(item, qty) {
    const f = item && item.report_unit ? this.factorOf(item, item.report_unit) : null;
    return f && f !== 1 ? [Math.round((qty / f) * 1e6) / 1e6, String(item.report_unit).toUpperCase()] : [qty, item ? item.unit : ''];
  },

  /** Quantity held for shop orders, and what is left for everything else. */
  reserved(id) { return Number((this.reservedQty || {})[id]) || 0; },
  available(id) { return Math.round((this.qty(id) - this.reserved(id)) * 1e6) / 1e6; },

  /** Active units (combo options), with `extra` added when it is not in the list. */
  unitOptions(extra) {
    const list = this.units.filter((u) => u.active !== false).map((u) => String(u.unit));
    if (extra && !list.includes(extra)) list.push(extra);
    return list.sort().map((u) => ({ value: u, label: u }));
  },
  qty(itemId) { const b = this.balances.get(itemId); return b ? Number(b.qty) || 0 : 0; },
  todayIso() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date()); },

  activeItems() { return [...this.items.values()].filter((i) => i.active === true); },

  inStockCount() { return this.activeItems().filter((i) => this.qty(i.item_id) > 0).length; },

  /** Same rule as MORO v13: minimum set (> 0) and balance at or below it. */
  lowStock() {
    return this.activeItems().filter((i) => Number(i.min_stock) > 0 && this.qty(i.item_id) <= Number(i.min_stock))
      .map((i) => ({ item: i, qty: this.qty(i.item_id), min: Number(i.min_stock) }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
  },

  /** Batches of an item still in stock: [{expiry, qty}] nearest first ('' = no date). */
  batchesOf(id) {
    const list = (this.batches && this.batches[id]) || [];
    if (list.length) return list.map(([expiry, qty]) => ({ expiry, qty: Number(qty) }));
    const b = this.balances.get(id);
    return b && Number(b.qty) > 0 ? [{ expiry: b.last_expiry || '', qty: Number(b.qty) }] : [];
  },

  /** Quantities in stock whose expiry is within `days` (expired ones included), one line per expiry date. */
  expiring(days) {
    const today = this.todayIso();
    const out = [];
    for (const b of this.balances.values()) {
      const item = this.items.get(b.item_id);
      if (!item || Number(b.qty) <= 0) continue;
      for (const x of this.batchesOf(b.item_id)) {
        if (!x.expiry || !(x.qty > 0)) continue;
        const left = daysBetween(today, x.expiry);
        if (left <= days) out.push({ item, qty: x.qty, expiry: x.expiry, left });
      }
    }
    return out.sort((a, b) => a.left - b.left);
  },

  list(name) { return new Set(this.lists.filter((l) => l.list === name).map((l) => l.item_id)); },
};

export { objects };
