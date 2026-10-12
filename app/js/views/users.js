// Users (admin only): add users with a role, change name/role, deactivate, reset a PIN.
// The admin types a first PIN for a new user; the user can change it later (More → change PIN).
import { call } from '../api.js';
import { Data } from '../data.js';
import { t, errText } from '../i18n.js';
import { h, toast, flash, fmtDate, trackFilled, dialog } from '../ui.js';
import { field } from '../components.js';

const ROLES = ['admin', 'storekeeper', 'purchasing', 'production'];

export async function render(root) {
  const tb = h('tbody', h('tr', h('td.empty', { colspan: 5 }, '…')));
  root.replaceChildren(h('div.card', h('div.card-head', h('h2', t('users')),
    h('button.btn', { type: 'button', onclick: () => edit(null) }, '+ ' + t('new_user'))),
    h('div.table-wrap', h('table', h('thead', h('tr', h('th', t('display_name')), h('th', t('username')), h('th', t('role')), h('th', t('last_login')), h('th', ''))), tb)),
    h('small.muted', t('roles_help'))));

  async function load() {
    try {
      const users = await call('users.list');
      tb.replaceChildren(...users.map((u) => h('tr.click', { onclick: () => edit(u) }, h('td', u.display_name), h('td.num', u.username),
        h('td', t('role_' + u.role)), h('td.num', u.last_login ? fmtDate(u.last_login.slice(0, 10)) : ''), h('td', u.active ? '' : h('span.pill.out', t('inactive'))))));
    } catch (e) { tb.replaceChildren(h('tr', h('td.empty', { colspan: 5 }, errText(e)))); }
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
      const ok = async () => {
        if (!name.value.trim()) return flash(name);
        if (!u && !user.value.trim()) return flash(user);
        if (!u && !pin.value) return flash(pin);
        const p = { display_name: name.value, role: role.value };
        if (u) { p.user_id = u.user_id; p.active = active.checked; } else p.username = user.value;
        if (pin.value) p.pin = pin.value;
        try { await call('users.save', p); close(true); } catch (e) { err.textContent = errText(e); }
      };
      return [h('h3', u ? t('edit_user') : t('new_user')), field(t('display_name'), name), field(t('username'), user), field(t('role'), role),
        field(u ? t('reset_pin') : t('pin'), pin), u ? h('label.check', active, ' ', t('active')) : null, err,
        h('div.actions', h('button.btn.secondary', { type: 'button', onclick: () => close() }, t('cancel')), h('button.btn', { type: 'button', onclick: ok }, t('save')))];
    });
    if (done) { toast(t('saved'), 'ok'); load(); }
  }

  load();
  if (!Data.user) return;
}
