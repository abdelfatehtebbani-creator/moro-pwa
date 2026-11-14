// Users (admin): add users, change name/role, deactivate, reset a PIN, and choose exactly what each
// user may do. A user follows the defaults of their role until the admin ticks a different set.
import { call } from '../api.js';
import { Data, STORES, STORE_OPS } from '../data.js';
import { t, errText } from '../i18n.js';
import { IDLE_HOME_MINUTES } from '../config.js';
import { h, toast, flash, fmtDate, trackFilled, dialog } from '../ui.js';
import { field, storePill } from '../components.js';

const ROLES = ['admin', 'pdg', 'branch_manager', 'food_safety', 'storekeeper', 'purchasing', 'production', 'accountant', 'cashier', 'distribution', 'section_head', 'driver'];

export async function render(root) {
  const tb = h('tbody', h('tr', h('td.empty', { colspan: 6 }, '…')));
  // by role (with how many of each), and by name
  const roleSel = h('select.input#u-filter-role', h('option', { value: '' }, t('all_roles')));
  const search = trackFilled(h('input.input#u-search', { type: 'search', placeholder: t('user_search_hint') }));
  let all = [];
  // each card of the screen folds (the list open, the settings folded)
  root.replaceChildren(h('details.card.fold-card', { open: true }, h('summary', h('h2', t('users'))),
    h('div.card-head', h('span'), h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_user'))),
    h('div.search', roleSel, search),
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
    // the period closed for changes: no movement dated on or before it is saved, changed or deleted
    const closed = trackFilled(h('input.input#set-closed', { type: 'date', value: (Data.settings || {}).closed_until || '', max: Data.todayIso() }));
    const saveClosed = async () => {
      const d = closed.value;
      if (!(await confirmClose(d))) return;
      try { await call('settings.close', { date: d }); toast(t('saved'), 'ok'); Data.refresh().catch(() => {}); }
      catch (e) { toast(errText(e), 'err'); }
    };
    return h('details.card.fold-card', h('summary', h('h2', t('settings_general'))),
      h('details.kiosk-box', h('summary', h('b', t('idle_minutes'))),
        h('div.form-grid', field(t('idle_minutes'), input), h('div.field', h('label', '\u00a0'), h('button.btn', { type: 'button', onclick: save }, t('save')))),
        h('small.muted', t('idle_minutes_help'))),
      Data.can('settings.recipeStock') ? recipeStockBox() : null,
      Data.can('kiosk.off') ? kioskBox() : null,
      Data.can('vehicles.save') ? vehiclesBox() : null,
      Data.can('sales.setChannels') ? channelsBox() : null,
      Data.can('settings.close') ? h('details.kiosk-box', h('summary', h('b', t('closed_until'))), h('div.form-grid', field(t('closed_until'), closed), h('div.field', h('label', '\u00a0'), h('button.btn', { type: 'button', onclick: saveClosed }, t('save')))),
        h('small.muted', t('closed_until_help'))) : null);
  }

  // the company's vehicles: chosen when a trip is prepared (the driver's last one first)
  function vehiclesBox() {
    const tb = h('tbody');
    const plate = trackFilled(h('input.input#v-plate', { dir: 'ltr', placeholder: '931287' }));
    const model = trackFilled(h('input.input#v-model', { dir: 'ltr', placeholder: 'HYUNDAI I-10' }));
    const send = async (p) => { try { await call('vehicles.save', p); toast(t('saved'), 'ok'); await Data.refresh(); draw(); } catch (e) { toast(errText(e), 'err'); } };
    const draw = () => tb.replaceChildren(...Data.vehicles.slice().sort((a, b) => a.plate.localeCompare(b.plate, undefined, { numeric: true })).map((v) => {
      const on = h('input', { type: 'checkbox', checked: v.active === true, onchange: () => send({ plate: v.plate, model: v.model, active: on.checked }) });
      const row = h('tr', { class: v.active === true ? '' : 'muted' });
      // changed in place: plate and model (the trips keep the plate they had)
      const edit = () => {
        const p = trackFilled(h('input.input', { dir: 'ltr', value: v.plate }));
        const m = trackFilled(h('input.input', { dir: 'ltr', value: v.model || '' }));
        row.replaceChildren(h('td', p), h('td', m), h('td', h('button.btn', { type: 'button', onclick: () => { if (!p.value.trim()) return flash(p); send({ old_plate: v.plate, plate: p.value.trim(), model: m.value.trim(), active: v.active === true }); } }, t('save')),
          ' ', h('button.link', { type: 'button', onclick: draw }, t('cancel'))));
        p.focus();
      };
      row.append(h('td.num', h('bdi', v.plate)), h('td', h('bdi', v.model || '')),
        h('td', h('label.check', on, ' ', t('active')), ' ', h('button.link', { type: 'button', onclick: edit }, t('fam_edit'))));
      return row;
    }));
    draw();
    return h('details.kiosk-box', h('summary', h('b', t('vehicles_title')), ' ', h('small.muted', '(' + Data.vehicles.filter((v) => v.active === true).length + ')')),
      h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('vehicle_no')), h('th', t('vehicle_model')), h('th', ''))), tb)),
      h('div.form-grid', field(t('vehicle_no'), plate), field(t('vehicle_model'), model),
        h('div.field.end', h('button.btn', { type: 'button', onclick: () => { if (!plate.value.trim()) return flash(plate); send({ plate: plate.value.trim(), model: model.value.trim(), active: true }); plate.value = ''; model.value = ''; } }, t('add_line')))));
  }

  // the shared device in the factory: departments shown on it, and the cards of its menu (ticked = shown)
  function kioskBox() {
    let off = { depts: [], tiles: [] };
    try { off = Object.assign(off, JSON.parse((Data.settings || {}).kiosk_off || '{}')); } catch (e) { /* none yet */ }
    const depts = Data.producingDepts().map((d) => ({ d, box: h('input', { type: 'checkbox', checked: !(off.depts || []).includes(d.party_id) }) }));
    const tiles = ['production', 'shop', 'request'].map((k) => ({ k, box: h('input', { type: 'checkbox', checked: !(off.tiles || []).includes(k) }) }));
    const save = async () => {
      try {
        await call('kiosk.off', { depts: depts.filter((x) => !x.box.checked).map((x) => x.d.party_id), tiles: tiles.filter((x) => !x.box.checked).map((x) => x.k) });
        toast(t('saved'), 'ok'); Data.refresh().catch(() => {});
      } catch (e) { toast(errText(e), 'err'); }
    };
    return h('details.kiosk-box', h('summary', h('b', t('kiosk_settings'))), h('small.muted', t('kiosk_settings_help')),
      h('b', t('kiosk_depts')), h('div.check-grid', depts.map((x) => h('label.check', x.box, ' ', h('bdi', x.d.name)))),
      h('b', t('kiosk_tiles')), h('div.check-grid', tiles.map((x) => h('label.check', x.box, ' ', t('kiosk_tile_' + x.k)))),
      h('div.form-actions', h('button.btn', { type: 'button', onclick: save }, t('save'))));
  }

  // producing takes the recipes' ingredients from the stores, or not (off until the recipes are complete)
  function recipeStockBox() {
    const on = h('input#set-recipe-stock', { type: 'checkbox', checked: (Data.settings || {}).recipes_take_stock === '1' });
    on.addEventListener('change', async () => {
      try { await call('settings.recipeStock', { on: on.checked }); toast(t('saved'), 'ok'); Data.refresh().catch(() => {}); }
      catch (e) { on.checked = !on.checked; toast(errText(e), 'err'); }
    });
    return h('details.kiosk-box', h('summary', h('b', t('recipe_stock_title'))), h('label.check', on, ' ', h('b', t('recipe_stock_on'))), h('small.muted', t('recipe_stock_help')));
  }

  // the sales channels of the daily sales sheet: names, the shops of each (none = all), stopped or not
  function channelsBox() {
    const list = ((Data.boot || {}).sales_channels || []).map((c) => Object.assign({}, c, { shops: [...(c.shops || [])] }));
    const shops = [...Data.parties.values()].filter((p) => p.kind === 'shop' && p.active === true).sort((a, b) => a.name.localeCompare(b.name));
    const box = h('div');
    const draw = () => box.replaceChildren(...list.map((c) => {
      const ar = trackFilled(h('input.input.small', { value: c.name_ar, placeholder: 'عربي' }));
      const en = trackFilled(h('input.input.small', { value: c.name_en, placeholder: 'English' }));
      const on = h('input', { type: 'checkbox', checked: c.active !== false });
      ar.addEventListener('input', () => { c.name_ar = ar.value; }); en.addEventListener('input', () => { c.name_en = en.value; });
      on.addEventListener('change', () => { c.active = on.checked; });
      const sh = h('div.months', shops.map((s) => {
        const cb = h('input', { type: 'checkbox', checked: c.shops.includes(s.party_id) });
        cb.addEventListener('change', () => { c.shops = cb.checked ? c.shops.concat([s.party_id]) : c.shops.filter((x) => x !== s.party_id); });
        return h('label.check', cb, ' ', h('bdi', s.name));
      }));
      return h('div.req-card', h('div.form-grid', ar, en, h('label.check', on, ' ', t('active'))), h('small.muted', t('sl_ch_shops')), sh);
    }));
    draw();
    const add = () => { list.push({ id: 'ch' + Date.now().toString(36).slice(-6), name_ar: '', name_en: '', shops: [], active: true }); draw(); };
    const save = async () => {
      try { await call('sales.setChannels', { channels: list }); toast(t('saved'), 'ok'); Data.refresh().catch(() => {}); } catch (e) { toast(errText(e), 'err'); }
    };
    return h('details.fold.kiosk-box', h('summary', h('b', t('sl_channels')), ' ', h('small.muted', String(list.filter((c) => c.active !== false).length))),
      h('small.muted', t('sl_channels_help')), box,
      h('div.form-actions', h('button.btn.secondary', { type: 'button', onclick: add }, '+ ' + t('sl_ch_add')), h('button.btn', { type: 'button', onclick: save }, t('save'))));
  }

  function confirmClose(d) {
    return dialog((close) => [h('p', d ? t('close_confirm', { d }) : t('open_confirm')),
      h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close(false) }, t('cancel')), h('button.btn', { type: 'button', onclick: () => close(true) }, t('ok')))]);
  }

  async function load() {
    try {
      all = await call('users.list');
      const keep = roleSel.value;
      roleSel.replaceChildren(h('option', { value: '' }, t('all_roles') + ' (' + all.length + ')'),
        ...ROLES.filter((r) => all.some((u) => u.role === r)).map((r) => h('option', { value: r }, t('role_' + r) + ' (' + all.filter((u) => u.role === r).length + ')')));
      roleSel.value = keep;
      draw();
    } catch (e) { tb.replaceChildren(h('tr', h('td.empty', { colspan: 6 }, errText(e)))); }
  }
  roleSel.addEventListener('change', () => draw());
  search.addEventListener('input', () => draw());
  function draw() {
    const q = search.value.trim().toLowerCase();
    const users = all.filter((u) => (!roleSel.value || u.role === roleSel.value) && (!q || (u.display_name + ' ' + u.username).toLowerCase().includes(q)));
    if (!users.length) { tb.replaceChildren(h('tr', h('td.empty', { colspan: 6 }, t('no_rows')))); return; }
    tb.replaceChildren(...users.map((u) => h('tr.click', { onclick: () => edit(u) }, h('td', u.display_name), h('td.num', u.username),
      h('td', t('role_' + u.role)), h('td', u.custom_caps ? h('span.pill.soon', t('custom_caps', { n: u.caps.length })) : h('span.muted', t('role_defaults')),
        ' ', ...(u.stores || []).map((s) => storePill(s))),
      h('td.num', u.last_login ? fmtDate(u.last_login.slice(0, 10)) : ''), h('td', u.active ? '' : h('span.pill.out', t('inactive'))))));
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
      // a cashier works for one shop; a department head prepares the shop orders of their departments
      const shops = [...Data.parties.values()].filter((p) => p.kind === 'shop' && p.active === true).sort((a, b) => a.name.localeCompare(b.name));
      // optional: a cashier chooses the shop when opening the shift
      const shopSel = h('select.input#u-shop', h('option', { value: '' }, t('shop_at_shift')), shops.map((p) => h('option', { value: p.party_id }, p.name)));
      shopSel.value = u ? u.shop || '' : '';
      const shopField = field(t('cashier_shop'), shopSel);
      const depts = new Set(u ? u.depts || [] : []);
      const deptBox = h('div.caps', Data.producingDepts().map((p) => {
          const cb = h('input', { type: 'checkbox', checked: depts.has(p.party_id) });
          cb.addEventListener('change', () => {
            cb.checked ? depts.add(p.party_id) : depts.delete(p.party_id);
            // a branch manager who heads a department in their branch: the department head's screens are ticked with it
            if (cb.checked && role.value === 'branch_manager') { ['shop.view', 'shop.hand', 'shop.unavailable', 'production.view', 'production.post'].forEach((c) => chosen.add(c)); drawCaps(); }
          });
          return h('label.check.cap', cb, h('span', h('bdi', p.name)));
        }));
      const deptField = h('div', h('div.card-head', h('b', t('head_of_depts'))), h('small.muted', t('head_of_depts_help')), deptBox);
      const branches = new Set(u ? u.branches || [] : []);
      const branchBox = h('div.caps', [...Data.parties.values()].filter((p) => p.kind === 'shop' && p.active === true).sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
          const cb = h('input', { type: 'checkbox', checked: branches.has(p.party_id) });
          cb.addEventListener('change', () => { cb.checked ? branches.add(p.party_id) : branches.delete(p.party_id); });
          return h('label.check.cap', cb, h('span', h('bdi', p.name)));
        }));
      const branchField = h('div', h('div.card-head', h('b', t('manager_of_branches'))), h('small.muted', t('manager_of_branches_help')), branchBox);
      // a driver's vehicle: offered when they leave on a trip (they can change it there)
      const vehicle = trackFilled(h('input.input#u-vehicle', { type: 'text', maxlength: 30, value: u ? u.vehicle || '' : '' }));
      const vehicleField = field(t('vehicle_no'), vehicle);
      const dev = h('input', { type: 'checkbox', checked: !!(u && u.developer) });
      const devField = h('div', h('label.check', dev, ' ', t('developer_account')), h('small.muted', t('developer_help')));
      const showRoleFields = () => { shopField.hidden = role.value !== 'cashier'; deptField.hidden = role.value !== 'section_head' && role.value !== 'branch_manager'; branchField.hidden = role.value !== 'branch_manager'; devField.hidden = role.value !== 'admin'; vehicleField.hidden = role.value !== 'driver'; };
      role.addEventListener('change', showRoleFields);
      showRoleFields();

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
        const p = { display_name: name.value, role: role.value, caps: [...chosen], stores: STORES.filter((s) => stores.has(s)), store_ops: storeOps(),
          shop: role.value === 'cashier' ? shopSel.value : '', depts: role.value === 'section_head' || role.value === 'branch_manager' ? [...depts] : [], branches: role.value === 'branch_manager' ? [...branches] : [], developer: dev.checked, vehicle: role.value === 'driver' ? vehicle.value.trim() : '' };
        if (u) { p.user_id = u.user_id; p.active = active.checked; } else p.username = user.value;
        if (pin.value) p.pin = pin.value;
        try {
          const saved = await call('users.save', p);
          // a new user is created with the role defaults: apply a different set right after
          if (!u && saved.user_id) await call('users.save', { user_id: saved.user_id, caps: [...chosen], stores: p.stores, store_ops: p.store_ops, shop: p.shop, depts: p.depts, branches: p.branches, vehicle: p.vehicle });
          close(true);
        } catch (e) { err.textContent = errText(e); }
      };
      return [h('h3', u ? t('edit_user') : t('new_user')), field(t('display_name'), name), field(t('username'), user), field(t('role'), role),
        field(u ? t('reset_pin') : t('pin'), pin), u ? h('label.check', active, ' ', t('active')) : null, shopField, vehicleField, deptField, branchField, devField,
        h('div.card-head', h('b', t('permissions')), reset), capBox,
        h('div.card-head', h('b', t('stores'))), h('small.muted', t('stores_help')), storeBox, opsHead, opsBox, err,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (done) { toast(t('saved'), 'ok'); load(); }
  }

  load();
}
