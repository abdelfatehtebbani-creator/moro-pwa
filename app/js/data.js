// The device's copy of the master data and balances (from data.bootstrap), kept in IndexedDB so
// the app opens without internet, and refreshed whenever the server's data version changes.
import { call } from './api.js';
import { kv } from './db.js';
import { daysBetween } from './ui.js';

const objects = (raw) => (raw && raw.rows ? raw.rows.map((r) => Object.fromEntries(raw.columns.map((c, i) => [c, r[i]]))) : []);

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
  purposes: [],
  settings: {},
  today: '',
  syncedAt: null,

  index() {
    const b = this.boot;
    this.user = b.user;
    this.perms = new Set(b.permissions);
    this.version = b.version;
    this.settings = b.settings || {};
    this.items = new Map(objects(b.items).map((i) => [i.item_id, i]));
    this.parties = new Map(objects(b.parties).map((p) => [p.party_id, p]));
    this.serverBalances = new Map(objects(b.balances).map((x) => [x.item_id, x]));
    this.applyPending(this.pendingDeltas || {});
    this.lists = objects(b.lists);
    this.recipes = objects(b.recipes);
    this.locations = objects(b.locations);
    this.purposes = objects(b.purposes);
    this.today = b.today;
    this.capList = b.cap_list || [];
    this.roleCaps = b.role_caps || {};
  },

  async loadCached() {
    const b = await kv.get('boot');
    if (!b) return false;
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

  /** Items with stock whose last expiry is within `days` (expired ones included). */
  expiring(days) {
    const today = this.todayIso();
    const out = [];
    for (const b of this.balances.values()) {
      const item = this.items.get(b.item_id);
      if (!item || !b.last_expiry || Number(b.qty) <= 0) continue;
      const left = daysBetween(today, b.last_expiry);
      if (left <= days) out.push({ item, qty: Number(b.qty), expiry: b.last_expiry, left });
    }
    return out.sort((a, b) => a.left - b.left);
  },

  list(name) { return new Set(this.lists.filter((l) => l.list === name).map((l) => l.item_id)); },
};

export { objects };
