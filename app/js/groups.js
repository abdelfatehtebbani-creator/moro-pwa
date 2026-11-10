// The admin's screens in groups (home and menu): many screens read better by the work they belong to.
// Counts holds the numbers on the menu (set with the badges), for "waiting for you" on the home screen.
export const GROUPS = [
  ['grp_stores', ['receive', 'issue', 'production', 'batches', 'requests', 'counts', 'coffee']],
  ['grp_orders', ['orders', 'orderapprove', 'shoporders', 'trips', 'returns', 'invoices']],
  ['grp_finance', ['lpo', 'accounts']],
  ['grp_follow', ['exec', 'branches', 'dashboard', 'reports']],
  ['grp_admin', ['masters', 'users', 'guide']],
];

export const Counts = { now: {} };

const FAV = 'moro.home.favs';
const OPEN = 'moro.home.open';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export const Favs = {
  MAX: 6,
  list: () => read(FAV, []),
  toggle(r) {
    const l = Favs.list();
    const i = l.indexOf(r);
    if (i >= 0) l.splice(i, 1); else if (l.length < Favs.MAX) l.push(r); else return false;
    write(FAV, l);
    return true;
  },
};

export const OpenGroups = {
  get: () => read(OPEN, null),
  set: (v) => write(OPEN, v),
};

// the differences in shift takings the admin has seen (the newest received_at seen, on this device)
const DIFF_SEEN = 'moro.takings.diffSeen';
export const DiffSeen = {
  get: () => read(DIFF_SEEN, ''),
  set: (v) => write(DIFF_SEEN, v),
  /** How many differences arrived after the last look. */
  unseen: (list) => { const s = DiffSeen.get(); return (list || []).filter((x) => String(x) > s).length; },
};
