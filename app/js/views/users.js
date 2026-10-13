// Users (admin): add users, change name/role, deactivate, reset a PIN, and choose exactly what each
// user may do. A user follows the defaults of their role until the admin ticks a different set.
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtDate, trackFilled, dialog } from '../ui.js';
import { field } from '../components.js';

const ROLES = ['admin', 'storekeeper', 'purchasing', 'production'];

export async function render(root) {
  const tb = h('tbody', h('tr', h('td.empty', { colspan: 6 }, '…')));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('users')),
    h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_user'))),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('display_name')), h('th', t('username')), h('th', t('role')),
      h('th', t('permissions')), h('th', t('last_login')), h('th', ''))), tb)),
    h('small.muted', t('roles_help'))));

  async function load() {
    try {
      const users = await call('users.list');
      tb.replaceChildren(...users.map((u) => h('tr.click', { onclick: () => edit(u) }, h('td', u.display_name), h('td.num', u.username),
        h('td', t('role_' + u.role)), h('td', u.custom_caps ? h('span.pill.soon', t('custom_caps', { n: u.caps.length })) : h('span.muted', t('role_defaults'))),
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
      const capBox = h('div.caps');
      const drawCaps = () => capBox.replaceChildren(...Data.capList.map((c) => {
        const cb = h('input', { type: 'checkbox', checked: chosen.has(c) });
        cb.addEventListener('change', () => { cb.checked ? chosen.add(c) : chosen.delete(c); });
        return h('label.check.cap', cb, h('span', h('b', t('cap_' + c)), h('small.muted', t('capd_' + c))));
      }));
      role.addEventListener('change', () => { chosen = new Set(Data.roleCaps[role.value] || []); drawCaps(); });
      drawCaps();
      const reset = h('button.link', { type: 'button', onclick: () => { chosen = new Set(Data.roleCaps[role.value] || []); drawCaps(); } }, t('reset_to_role'));

      const ok = async () => {
        if (!name.value.trim()) return flash(name);
        if (!u && !user.value.trim()) return flash(user);
        if (!u && !pin.value) return flash(pin);
        const p = { display_name: name.value, role: role.value, caps: [...chosen] };
        if (u) { p.user_id = u.user_id; p.active = active.checked; } else p.username = user.value;
        if (pin.value) p.pin = pin.value;
        try {
          const saved = await call('users.save', p);
          // a new user is created with the role defaults: apply a different set right after
          if (!u && saved.user_id) await call('users.save', { user_id: saved.user_id, caps: [...chosen] });
          close(true);
        } catch (e) { err.textContent = errText(e); }
      };
      return [h('h3', u ? t('edit_user') : t('new_user')), field(t('display_name'), name), field(t('username'), user), field(t('role'), role),
        field(u ? t('reset_pin') : t('pin'), pin), u ? h('label.check', active, ' ', t('active')) : null,
        h('div.card-head', h('b', t('permissions')), reset), capBox, err,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (done) { toast(t('saved'), 'ok'); load(); }
  }

  load();
}
