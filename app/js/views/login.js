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
export function showAuth(root, setupNeeded) {
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
      const form = shell(t('login_title'), null, [field(t('username'), user), field(t('pin'), pin), err, btn], toggleLang);
      form.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!user.value.trim()) return flash(user);
        if (!pin.value.trim()) return flash(pin);
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
