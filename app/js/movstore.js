// The device's copy of the movement history, used by the reports and the records lists.
// It is refreshed in the background whenever the server's data version changes, so reports
// and records still open without internet; entries still waiting in the outbox are added on top.
import { call } from './api.js';
import { kv } from './db.js';
import { Data, objects } from './data.js';
import { Outbox } from './outbox.js';

const SIGN = { RECEIPT: 1, SUPPLIER_RETURN: -1, ISSUE: -1, DEPT_RETURN: 1, DISPOSAL: -1 };
let memory = null;          // {version, list, at}
let loading = null;

async function fetchAll() {
  const res = await call('movements.query', { limit: 50000 });
  memory = { version: res.version, list: objects(res), at: new Date().toISOString() };
  await kv.set('movs', memory);
  return memory;
}

export const MovStore = {
  /** History as stored on the server (cached). stale = true when the device could not reach the server. */
  async history(force = false) {
    if (!memory) memory = (await kv.get('movs')) || null;
    if (memory && memory.version === Data.version && !force) return { list: memory.list, at: memory.at, stale: false };
    try {
      if (!loading) loading = fetchAll().finally(() => { loading = null; });
      const m = await loading;
      return { list: m.list, at: m.at, stale: false };
    } catch (e) {
      if (memory) return { list: memory.list, at: memory.at, stale: true };
      throw e;
    }
  },

  /** Movements saved on this device that are still waiting to be sent, in the same shape. */
  pending() {
    return Outbox.queued('movements.save').flatMap((job) => job.payload.movements.map((m) => ({
      ...m, movement_id: '~' + m.client_id, qty: Math.abs(Number(m.qty)) * (SIGN[m.kind] || 1), status: 'pending',
      created_by: Data.user && Data.user.user_id, final_amount: '', category: (Data.items.get(m.item_id) || {}).category || '',
      pending: true,
    })));
  },

  /** History + pending, newest first. */
  async all(force = false) {
    const h = await this.history(force);
    return { list: this.pending().concat(h.list), at: h.at, stale: h.stale };
  },

  /** Keeps the copy fresh without blocking anything (called after each sync). */
  prefetch() { this.history().catch(() => {}); },
};
