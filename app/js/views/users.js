// Users (admin): add users, change name/role, deactivate, reset a PIN, and choose exactly what each
// user may do. A user follows the defaults of their role until the admin ticks a different set.
import { call } from '../api.js';
import { Data, STORES, STORE_OPS } from '../data.js';
import { t, errText } from '../i18n.js';
import { IDLE_HOME_MINUTES } from '../config.js';
import { h, toast, flash, fmtDate, trackFilled, dialog } from '../ui.js';
import { field, storePill } from '../components.js';

const ROLES = ['admin', 'storekeeper', 'purchasing', 'production', 'accountant'];

export async function render(root) {
  const tb = h('tbody', h('tr', h('td.empty', { colspan: 6 }, '…')));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('users')),
    h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_user'))),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('display_name')), h('th', t('username')), h('th', t('role')),
      h('th', t('permissions')), h('th', t('last_login')), h('th', ''))), tb)),
    h('small.muted', t('roles_help'))), settingsCard());

  // general settings of the app (the admin)
  function settingsCard() {
    const cur = (Data.settings || {}).idle_home_minutes;
    const input = trackFilled(h('input.input.num#set-idle', { type: 'number', min: 0, max: 240, step: 1, inputmode: 'numeric',
      value: cur !== undefined && cur !== '' ? cur : IDLE_HOME_MINUTES }));
    const save = async () => {
      const n = Number(input.value);
      if (input.value === '' || !Number.isInteger(n) || n < 0 || n > 240) { toast(t('err.idle_minutes_invalid'), 'err'); return flash(input); }
      try { await call('settings.idle', { minutes: n }); toast(t('saved'), 'ok'); Data.refresh().catch(() => {}); }
      catch (e) { toast(errText(e), 'err'); }
    };
    return h('div.card', h('h2', t('settings_general')),
      h('div.form-grid', field(t('idle_minutes'), input), h('div.field', h('label', '\u00a0'), h('button.btn', { type: 'button', onclick: save }, t('save')))),
      h('small.muted', t('idle_minutes_help')));
  }

  async function load() {
    try {
      const users = await call('users.list');
      tb.replaceChildren(...users.map((u) => h('tr.click', { onclick: () => edit(u) }, h('td', u.display_name), h('td.num', u.username),
        h('td', t('role_' + u.role)), h('td', u.custom_caps ? h('span.pill.soon', t('custom_caps', { n: u.caps.length })) : h('span.muted', t('role_defaults')),
          ' ', ...(u.stores || []).map((s) => storePill(s))),
        h('td.num', u.last_login ? fmtDate(u.last_login.slice(0, 10)) : ''), h('td', u.active ? '' : h('span.pill.out', t('inactive'))))));
    } catch (e) { tb.replaceChildren(h('tr', h('td.empty', { colspan: 6 }, errText(e)))); }
  }

  async function edit(u) {
    const done = await dialog((close) => {
      const name = trackFilled(h('input.input#u-name', { value: u ? u.display_name : '' }));
      const user = trackFilled(h('input.input#u-user', { value: u ? u.username : '', disabled: !!u, autocapitalize: 'none' }));
      const role = h('select.input#u-role', ROLES.map((r) => h('option', { value: r }, t('role_' + r))));
      role.value = u ? u.role : 'storekeeper';
      const pin = trackFilled(h('input.input.pin#u-pin', { type: 'password', inputmode: 'numeric', maxlength: 8, autocomplete: 'new-password',
        placeholder: u ? t('pin_keep') : '' }));
      const active = h('input#u-active', { type: 'checkbox', checked: !u || u.active });
      const err = h('p.err-text', '');

      // capabilities: ticked = allowed. Changing the role resets the ticks to that role's defaults.
      let chosen = new Set(u ? u.caps : Data.roleCaps[role.value] || []);
      const capBox = h('div.perm-tree');
      const open = new Set();
      const leavesOf = (n) => (n.leaf ? [n.leaf] : n.children.flatMap(leavesOf));
      // a screen's (or tab's) buttons need its "access" leaf: ticking a button ticks access, removing access removes its buttons
      const viewOf = (n) => (n.children || []).map((c) => c.leaf).find((l) => l && /\.view$/.test(l));
      const drawCaps = () => {
        const node = (n, parent, depth) => {
          if (n.leaf) {
            const cb = h('input', { type: 'checkbox', checked: chosen.has(n.leaf) });
            cb.addEventListener('change', () => {
              const view = viewOf(parent);
              if (cb.checked) { chosen.add(n.leaf); if (view) chosen.add(view); }
              else { chosen.delete(n.leaf); if (n.leaf === view) leavesOf(parent).forEach((l) => chosen.delete(l)); }
              drawCaps();
            });
            return h('label.pt-leaf', { style: 'padding-inline-start:' + (depth * 18 + 26) + 'px' }, cb, ' ',
              h('span', { class: /\.view$/.test(n.leaf) ? 'pt-view' : '' }, t('pt_' + n.leaf)));
          }
          const all = leavesOf(n), on = all.filter((l) => chosen.has(l)).length;
          const cb = h('input', { type: 'checkbox', checked: on === all.length && on > 0 });
          cb.indeterminate = on > 0 && on < all.length;
          cb.addEventListener('change', () => { all.forEach((l) => (cb.checked ? chosen.add(l) : chosen.delete(l))); drawCaps(); });
          const isOpen = open.has(n.key);
          const toggle = h('button.pt-toggle', { type: 'button', 'aria-expanded': String(isOpen),
            onclick: () => { isOpen ? open.delete(n.key) : open.add(n.key); drawCaps(); } }, isOpen ? '▾' : (document.dir === 'rtl' ? '◂' : '▸'));
          const head = h('div.pt-head', { style: 'padding-inline-start:' + depth * 18 + 'px' }, toggle,
            h('label.pt-group', cb, ' ', h('b', t('pt_' + n.key)), h('small.muted', ' ', h('bdi', { dir: 'ltr' }, on + ' / ' + all.length))));
          return h('div.pt-node', head, isOpen ? h('div', ...n.children.map((c) => node(c, n, depth + 1))) : null);
        };
        capBox.replaceChildren(...Data.permTree.map((n) => node(n, null, 0)));
      };
      role.addEventListener('change', () => { chosen = new Set(Data.roleCaps[role.value] || []); drawCaps(); });
      drawCaps();
      const reset = h('button.link', { type: 'button', onclick: () => { chosen = new Set(Data.roleCaps[role.value] || []); drawCaps(); } }, t('reset_to_role'));

      // stores: the admin role always has all of them
      const stores = new Set(u ? u.stores || [] : STORES);
      const storeBox = h('div.caps');
      // operations allowed in each of those stores (a store not limited: every operation)
      const given = (u && u.store_ops) || {};
      const ops = new Map(STORES.map((s) => [s, new Set(Array.isArray(given[s]) ? given[s] : STORE_OPS)]));
      const opsBox = h('div.table-wrap');
      const opsHead = h('div', h('div.card-head', h('b', t('store_ops'))), h('small.muted', t('store_ops_help')));
      const drawOps = () => {
        const admin = role.value === 'admin';
        opsHead.hidden = opsBox.hidden = admin;
        const mine = STORES.filter((s) => stores.has(s));
        opsBox.replaceChildren(admin || !mine.length ? '' : h('table.store-ops', h('thead', h('tr', h('th', t('store')),
          ...STORE_OPS.map((o) => h('th', t('op_' + o))))),
          h('tbody', ...mine.map((s) => h('tr', h('td', h('b', t('store_' + s))), ...STORE_OPS.map((o) => {
            const cb = h('input', { type: 'checkbox', checked: ops.get(s).has(o), 'aria-label': t('store_' + s) + ' · ' + t('op_' + o) });
            cb.addEventListener('change', () => { cb.checked ? ops.get(s).add(o) : ops.get(s).delete(o); });
            return h('td.c', cb);
          }))))));
      };
      const drawStores = () => storeBox.replaceChildren(...STORES.map((s) => {
        const cb = h('input', { type: 'checkbox', checked: role.value === 'admin' || stores.has(s), disabled: role.value === 'admin' });
        cb.addEventListener('change', () => { cb.checked ? stores.add(s) : stores.delete(s); drawOps(); });
        return h('label.check.cap', cb, h('span', h('b', t('store_' + s))));
      }));
      role.addEventListener('change', () => { drawStores(); drawOps(); });
      drawStores();
      drawOps();
      // null when every ticked store allows every operation (not limited)
      const storeOps = () => {
        const mine = STORES.filter((s) => stores.has(s));
        if (mine.every((s) => STORE_OPS.every((o) => ops.get(s).has(o)))) return null;
        return Object.fromEntries(mine.map((s) => [s, STORE_OPS.filter((o) => ops.get(s).has(o))]));
      };

      const ok = async () => {
        if (!name.value.trim()) return flash(name);
        if (!u && !user.value.trim()) return flash(user);
        if (!u && !pin.value) return flash(pin);
        const p = { display_name: name.value, role: role.value, caps: [...chosen], stores: STORES.filter((s) => stores.has(s)), store_ops: storeOps() };
        if (u) { p.user_id = u.user_id; p.active = active.checked; } else p.username = user.value;
        if (pin.value) p.pin = pin.value;
        try {
          const saved = await call('users.save', p);
          // a new user is created with the role defaults: apply a different set right after
          if (!u && saved.user_id) await call('users.save', { user_id: saved.user_id, caps: [...chosen], stores: p.stores, store_ops: p.store_ops });
          close(true);
        } catch (e) { err.textContent = errText(e); }
      };
      return [h('h3', u ? t('edit_user') : t('new_user')), field(t('display_name'), name), field(t('username'), user), field(t('role'), role),
        field(u ? t('reset_pin') : t('pin'), pin), u ? h('label.check', active, ' ', t('active')) : null,
        h('div.card-head', h('b', t('permissions')), reset), capBox,
        h('div.card-head', h('b', t('stores'))), h('small.muted', t('stores_help')), storeBox, opsHead, opsBox, err,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (done) { toast(t('saved'), 'ok'); load(); }
  }

  load();
}
