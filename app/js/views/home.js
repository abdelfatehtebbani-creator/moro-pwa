// Home: the first screen after sign-in. The screens this user may open (the same list as the menu,
// so the same permissions), around the company's turning disc. The links are drawn at once; the disc
// (js/disc.js + css/disc.css) is fetched after them, so it never holds them up, and it is removed
// with this screen.
import { t } from '../i18n.js';
import { h, icon } from '../ui.js';

let cleanup = null;

export function render(root, name, ctx) {
  dispose();
  const links = (ctx && ctx.links) || [];
  // around the disc from three screens up (wide screens only, css); fewer stay in a row under it
  const ring = links.length >= 3;
  const rtl = document.documentElement.dir === 'rtl';
  const slot = h('div.home-disc', { 'aria-hidden': 'true' });
  const nav = h('nav.home-nav', { 'aria-label': t('home') }, links.map((r, i) => {
    const a = h('a.home-tab', { href: '#/' + r, 'data-route': r },
      h('span.home-ico', icon(r)), h('span.home-label', t(r)), r === 'lpo' ? h('span.badge', { hidden: true }) : null);
    if (ring) {
      // clockwise from the top (counter-clockwise in Arabic, so the reading order follows the language)
      const angle = ((-90 + (360 * i) / links.length) * Math.PI) / 180;
      a.style.setProperty('--x', (50 + 41 * Math.cos(angle) * (rtl ? -1 : 1)).toFixed(2) + '%');
      a.style.setProperty('--y', (50 + 41 * Math.sin(angle)).toFixed(2) + '%');
    }
    return a;
  }));
  // the user's own buttons, split between the two sides of the circle (wide screens; phones have "more")
  const acc = ctx && ctx.account;
  let sides = [null, null];
  if (acc) {
    sides = [h('div.home-side', acc.info, acc.buttons.slice(0, 2)), h('div.home-side', acc.buttons.slice(2))];
  }
  root.replaceChildren(h('div.home', h('div.home-grid', sides[0], h('div.home-stage' + (ring ? '.ring' : ''), slot, nav), sides[1])));

  let alive = true;
  let unmount = null;
  // after the links are painted: the disc, from its own files
  requestAnimationFrame(() => setTimeout(() => {
    if (!alive) return;
    import('../disc.js').then((m) => { if (alive) unmount = m.mountDisc(slot); }).catch(() => { /* no disc offline: the links work */ });
  }, 0));
  cleanup = () => { alive = false; if (unmount) unmount(); unmount = null; };
}

export function dispose() { if (cleanup) cleanup(); cleanup = null; }
