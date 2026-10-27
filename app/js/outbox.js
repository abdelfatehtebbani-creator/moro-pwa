// Outbox: every save is queued on the device first, then sent in the background.
// Without internet the queue waits and is sent automatically when the connection returns.
// Each item carries client IDs, so a resend after a lost reply is recorded only once by the server.
import { call, ApiError } from './api.js';
import { kv } from './db.js';
import { Data } from './data.js';

const SIGN = { RECEIPT: 1, SUPPLIER_RETURN: -1, ISSUE: -1, DEPT_RETURN: 1, PROD_CONSUME: -1, PROD_OUTPUT: 1, DISPOSAL: -1 };
let queue = [];
let failed = [];
let busy = false;
let loaded = false;

async function load() {
  if (loaded) return;
  queue = (await kv.get('outbox')) || [];
  failed = (await kv.get('outbox_failed')) || [];
  loaded = true;
}
const persist = () => Promise.all([kv.set('outbox', queue), kv.set('outbox_failed', failed)]);
const notify = () => window.dispatchEvent(new CustomEvent('moro:outbox', { detail: { pending: queue.length, failed: failed.length } }));

/** Balance changes of movements still waiting in the queue (applied on top of the server balances). */
export function pendingDeltas() {
  const d = {};
  for (const job of queue) {
    if (job.action !== 'movements.save') continue;
    for (const m of job.payload.movements) {
      const f = Data.factorOf(Data.items.get(m.item_id), m.unit) || 1;      // typed in a packaging unit: counted in stock units
      d[m.item_id] = (d[m.item_id] || 0) + Math.abs(Number(m.qty)) * f * (SIGN[m.kind] || 1);
    }
  }
  return d;
}

export const Outbox = {
  async init() { await load(); notify(); this.flush(); },
  get pending() { return queue.length; },
  get failed() { return failed.slice(); },
  /** Jobs of one action still waiting to be sent. */
  queued(action) { return queue.filter((j) => j.action === action); },

  /** Queues a server action and returns at once; the screen does not wait for the network. */
  async add(action, payload, label) {
    await load();
    queue.push({ id: Date.now() + '-' + Math.random().toString(16).slice(2), action, payload, label: label || '', at: new Date().toISOString() });
    await persist();
    Data.applyPending(pendingDeltas());
    notify();
    this.flush();
  },

  async flush() {
    await load();
    if (busy || !queue.length) return;
    busy = true;
    let changed = false;
    try {
      while (queue.length) {
        const job = queue[0];
        let event;
        try {
          job.result = await call(job.action, job.payload);
          changed = true;
          event = new CustomEvent('moro:sent', { detail: job });
        } catch (e) {
          if (e instanceof ApiError && (e.code === 'offline' || e.code === 'busy' || e.code === 'server_error')) break;  // retry later
          if (e instanceof ApiError && (e.code === 'auth_required' || e.code === 'auth_expired')) break;           // after sign-in
          failed.push({ ...job, error: e.code || 'server_error', detail: e.detail || '' });                       // rejected by a rule
          event = new CustomEvent('moro:rejected', { detail: failed[failed.length - 1] });
        }
        queue.shift();
        await persist();
        Data.applyPending(pendingDeltas());
        notify();
        window.dispatchEvent(event);
      }
    } finally {
      busy = false;
    }
    if (changed) { try { await Data.refresh(); } catch { /* next sync */ } }
    Data.applyPending(pendingDeltas());
  },

  async dropFailed(id) { failed = failed.filter((f) => f.id !== id); await persist(); notify(); },
};

window.addEventListener('online', () => Outbox.flush());
setInterval(() => { if (queue.length) Outbox.flush(); }, 30000);
