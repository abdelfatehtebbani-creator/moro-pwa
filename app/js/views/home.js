// Home: the first screen after sign-in. The screens this user may open (the same list as the menu,
// so the same permissions), around the company's turning disc. The links are drawn at once; the disc
// (js/disc.js + css/disc.css) is fetched after them, so it never holds them up, and it is removed
// with this screen.
import { t } from '../i18n.js';
import { h, icon, toast } from '../ui.js';
import { Data } from '../data.js';
import { GROUPS, Counts, Favs, OpenGroups } from '../groups.js';

let cleanup = null;
const BADGED = ['lpo', 'requests', 'orderapprove', 'shoporders', 'orders', 'trips', 'invoices', 'returns'];

export function render(root, name, ctx) {
  dispose();
  const links = (ctx && ctx.links) || [];
  if (Data.user && Data.user.role === 'admin') return renderGrouped(root, links, ctx);
  // around the disc from three screens up (wide screens only, css); fewer stay in a row under it
  const ring = links.length >= 3;
  const rtl = document.documentElement.dir === 'rtl';
  const slot = h('div.home-disc', { 'aria-hidden': 'true' });
  const nav = h('nav.home-nav', { 'aria-label': t('home') }, links.map((r, i) => {
    // the screen left open behind the home screen (idle): marked, and brought back as it was
    const resume = ctx && ctx.resume && ctx.resume.name === r;
    const a = h('a.home-tab' + (resume ? '.resume' : ''), { href: '#/' + r, 'data-route': r, title: resume ? t('idle_resume') : null,
      onclick: resume ? (e) => { e.preventDefault(); ctx.resume.onResume(); } : null },
      h('span.home-ico', icon(r)), h('span.home-label', t(r)), BADGED.includes(r) ? h('span.badge', { hidden: true }) : null,
      resume ? h('span.home-resume', t('idle_resume')) : null);
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
  // department requests waiting for this user (the number is set with the badges)
  const note = links.includes('requests') ? h('a.home-note.home-note-req', { href: '#/requests', hidden: true }) : null;
  root.replaceChildren(h('div.home', note, h('div.home-grid', sides[0], h('div.home-stage' + (ring ? '.ring' : ''), slot, nav), sides[1])));

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

// ---------- the admin: waiting for you, favourites, then the screens in folding groups
function renderGrouped(root, links, ctx) {
  const tile = (r, fav) => {
    const resume = ctx && ctx.resume && ctx.resume.name === r;
    const star = h('button.home-star', { type: 'button', title: t('fav_toggle'), 'aria-pressed': String(Favs.list().includes(r)),
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); if (!Favs.toggle(r)) toast(t('fav_full', { n: Favs.MAX }), 'err'); draw(); } },
      Favs.list().includes(r) ? '★' : '☆');
    return h('a.home-tab' + (resume ? '.resume' : '') + (fav ? '.fav' : ''), { href: '#/' + r, 'data-route': r, title: resume ? t('idle_resume') : null,
      onclick: resume ? (e) => { e.preventDefault(); ctx.resume.onResume(); } : null },
      star, h('span.home-ico', icon(r)), h('span.home-label', t(r)),
      BADGED.includes(r) ? h('span.badge', { hidden: !(Number((Counts.now || {})[r]) > 0) }, String(Number((Counts.now || {})[r]) || '')) : null,
      resume ? h('span.home-resume', t('idle_resume')) : null);
  };
  const waitBox = h('section.home-group.home-wait', { hidden: true });
  const drawWait = () => {
    const now = Counts.now || {};
    const list = links.filter((r) => Number(now[r]) > 0);
    waitBox.hidden = !list.length;
    waitBox.replaceChildren(h('h3.home-group-title', t('grp_waiting')), h('div.home-nav', list.map((r) => {
      return tile(r);
    })));
  };
  const body = h('div.home-groups');
  function draw() {
    const open = OpenGroups.get() || {};
    const favs = Favs.list().filter((r) => links.includes(r));
    const known = new Set(GROUPS.flatMap((g) => g[1]));
    const groups = GROUPS.map(([key, rs]) => [key, rs.filter((r) => links.includes(r))])
      .concat([['grp_other', links.filter((r) => !known.has(r))]]).filter((g) => g[1].length);
    body.replaceChildren(
      favs.length ? h('section.home-group', h('h3.home-group-title', '★ ' + t('grp_favs')), h('div.home-nav', favs.map((r) => tile(r, true)))) : null,
      ...groups.map(([key, rs]) => {
        const det = h('details.home-group', { open: open[key] !== false },
          h('summary.home-group-title', t(key), ' ', h('small.muted', String(rs.length))), h('div.home-nav', rs.map((r) => tile(r))));
        det.addEventListener('toggle', () => { const o = OpenGroups.get() || {}; o[key] = det.open; OpenGroups.set(o); });
        return det;
      }));
    drawWait();
  }
  const slot = h('div.home-disc.home-disc-small', { 'aria-hidden': 'true' });
  root.replaceChildren(h('div.home.home-admin', slot, waitBox, body));
  draw();
  const onCounts = () => drawWait();
  window.addEventListener('moro:badges', onCounts);
  let alive = true, unmount = null;
  requestAnimationFrame(() => setTimeout(() => {
    if (!alive) return;
    import('../disc.js').then((m) => { if (alive) unmount = m.mountDisc(slot); }).catch(() => {});
  }, 0));
  cleanup = () => { alive = false; window.removeEventListener('moro:badges', onCounts); if (unmount) unmount(); unmount = null; };
}
