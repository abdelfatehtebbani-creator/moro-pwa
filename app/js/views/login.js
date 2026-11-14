// Sign-in screen, and the one-time "create the admin account" screen on a fresh database.
import { call, session } from '../api.js';
import { t, errText, getLang, setLang } from '../i18n.js';
import { h, flash, trackFilled } from '../ui.js';

function field(label, input) {
  return h('div.field', h('label', { for: input.id }, label), input);
}

function shell(title, hint, body, onLang) {
  return h('div.auth',
    h('form.auth-card', { novalidate: true },
      h('img.logo', { src: 'icons/logo.png', alt: '' }),
      h('div.tagline', h('b', 'MORO'), h('span', { dir: 'ltr' }, 'Materials Operations & Records Organizer')),
      h('h1', title),
      hint ? h('p', hint) : null,
      body,
      h('button.link.lang', { type: 'button', onclick: onLang }, t('lang_other'))));
}

/** Renders the right screen into root; resolves when the user is signed in. */
export function showAuth(root, setupNeeded, noPin) {
  return new Promise((resolve) => {
    const render = () => {
      root.replaceChildren(setupNeeded ? setupForm() : loginForm());
      const first = root.querySelector('input');
      if (first) first.focus();
    };
    const toggleLang = () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); render(); };

    function loginForm() {
      const user = trackFilled(h('input.input#username', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' }));
      const pin = trackFilled(h('input.input.pin#pin', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', maxlength: 8 }));
      try { user.value = localStorage.getItem('moro.lastUser') || ''; } catch { /* ignore */ }
      user.dispatchEvent(new Event('input'));
      const err = h('p.err-text', '');
      const btn = h('button.btn.block', { type: 'submit' }, t('login'));
      // the development copy signs in with the username only (the server decides: Auth.noPin)
      // a worker on the list who has no account yet opens one with their ID card number
      const newAcc = h('button.link.block', { type: 'button', onclick: () => { root.replaceChildren(registerForm()); const f = root.querySelector('input'); if (f) f.focus(); } }, t('reg_open'));
      const form = shell(t('login_title'), noPin ? t('login_no_pin') : null, [field(t('username'), user), noPin ? null : field(t('pin'), pin), err, btn, newAcc], toggleLang);
      form.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!user.value.trim()) return flash(user);
        if (!noPin && !pin.value.trim()) return flash(pin);
        btn.disabled = true; err.textContent = '';
        try {
          const r = await call('auth.login', { username: user.value, pin: pin.value });
          session.token = r.token;
          try { localStorage.setItem('moro.lastUser', user.value.trim().toLowerCase()); } catch { /* ignore */ }
          resolve(r.user);
        } catch (ex) {
          err.textContent = errText(ex);
          flash(pin); pin.value = ''; pin.dispatchEvent(new Event('input')); pin.focus();
        } finally { btn.disabled = false; }
      });
      return form;
    }

    // a worker opens their own account: card number → their name → their department, a username and a PIN
    function registerForm() {
      const qid = trackFilled(h('input.input#reg-qid', { inputmode: 'numeric', autocomplete: 'off', maxlength: 20, dir: 'ltr' }));
      const err = h('p.err-text', '');
      const btn = h('button.btn.block', { type: 'submit' }, t('reg_next'));
      const back = h('button.link.block', { type: 'button', onclick: render }, t('reg_back'));
      const form = shell(t('reg_title'), t('reg_hint'), [field(t('reg_qid'), qid), err, btn, back], toggleLang);
      form.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (qid.value.replace(/\D/g, '').length < 6) return flash(qid);
        btn.disabled = true; err.textContent = '';
        try {
          const w = await call('workers.lookup', { qid: qid.value });
          root.replaceChildren(registerStep2(qid.value, w));
          const f = root.querySelector('select, input'); if (f) f.focus();
        } catch (ex) { err.textContent = errText(ex); flash(qid); btn.disabled = false; }
      });
      return form;
    }

    function registerStep2(qid, w) {
      const dept = h('select.input#reg-dept', h('option', { value: '' }, '—'), w.depts.map((d) => h('option', { value: d.party_id }, d.name)));
      const user = trackFilled(h('input.input#username', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', dir: 'ltr' }));
      const pin = trackFilled(h('input.input.pin#pin', { type: 'password', inputmode: 'numeric', maxlength: 8, autocomplete: 'new-password' }));
      const pin2 = trackFilled(h('input.input.pin#pin2', { type: 'password', inputmode: 'numeric', maxlength: 8, autocomplete: 'new-password' }));
      const err = h('p.err-text', '');
      const btn = h('button.btn.block', { type: 'submit' }, t('reg_create'));
      const back = h('button.link.block', { type: 'button', onclick: render }, t('reg_back'));
      const form = shell(t('reg_hello', { n: w.name }), t(w.job === 'chef' ? 'reg_job_chef' : 'reg_job_assistant'),
        [field(t('reg_dept'), dept), field(t('username'), user), h('small.muted', t('reg_user_help')), field(t('pin'), pin), field(t('pin_repeat'), pin2), err, btn, back], toggleLang);
      form.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!dept.value) return flash(dept);
        for (const f of [user, pin, pin2]) if (!f.value.trim()) return flash(f);
        if (!/^[a-z0-9._-]{3,30}$/.test(user.value.trim().toLowerCase())) { err.textContent = t('err.username_format'); return flash(user); }
        if (!/^\d{4,8}$/.test(pin.value)) { err.textContent = t('err.pin_format'); return flash(pin); }
        if (pin.value !== pin2.value) { err.textContent = t('pin_mismatch'); return flash(pin2); }
        btn.disabled = true; err.textContent = '';
        try {
          const r = await call('workers.register', { qid, dept: dept.value, username: user.value.trim().toLowerCase(), pin: pin.value });
          session.token = r.token;
          try { localStorage.setItem('moro.lastUser', user.value.trim().toLowerCase()); } catch { /* ignore */ }
          resolve(r.user);
        } catch (ex) { err.textContent = errText(ex); btn.disabled = false; }
      });
      return form;
    }

    function setupForm() {
      const name = trackFilled(h('input.input#display', { autocomplete: 'name' }));
      const user = trackFilled(h('input.input#username', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' }));
      const pin = trackFilled(h('input.input.pin#pin', { type: 'password', inputmode: 'numeric', maxlength: 8, autocomplete: 'new-password' }));
      const pin2 = trackFilled(h('input.input.pin#pin2', { type: 'password', inputmode: 'numeric', maxlength: 8, autocomplete: 'new-password' }));
      const err = h('p.err-text', '');
      const btn = h('button.btn.block', { type: 'submit' }, t('create_admin'));
      const form = shell(t('setup_title'), t('setup_hint'),
        [field(t('display_name'), name), field(t('username'), user), field(t('pin'), pin), field(t('pin_repeat'), pin2), err, btn], toggleLang);
      form.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        for (const f of [name, user, pin, pin2]) if (!f.value.trim()) return flash(f);
        if (pin.value !== pin2.value) { err.textContent = t('pin_mismatch'); return flash(pin2); }
        btn.disabled = true; err.textContent = '';
        try {
          await call('auth.setup', { username: user.value, display_name: name.value, pin: pin.value });
          const r = await call('auth.login', { username: user.value, pin: pin.value });
          session.token = r.token;
          try { localStorage.setItem('moro.lastUser', user.value.trim().toLowerCase()); } catch { /* ignore */ }
          resolve(r.user);
        } catch (ex) {
          err.textContent = errText(ex);
          if (ex.code === 'already_setup') { setupNeeded = false; setTimeout(render, 1500); }
        } finally { btn.disabled = false; }
      });
      return form;
    }

    render();
  });
}
