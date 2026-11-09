// The user guide (app/js/guide.js): the chapters of the user's role first, the basics, and a search. Opened from the menu,
// or from the "?" of a screen (#/guide?s=<screen>), which puts the chapter that explains that screen first.
import { Data } from '../data.js';
import { t, getLang } from '../i18n.js';
import { h } from '../ui.js';
import { GUIDE } from '../guide.js';

const ROLE_KEYS = ['admin', 'pdg', 'branch_manager', 'distribution', 'cashier', 'driver', 'section_head', 'production', 'storekeeper', 'purchasing', 'accountant'];
let pick = '';

export function render(root) {
  const me = (Data.user || {}).role || '';
  const screen = (location.hash.split('?s=')[1] || '').split('&')[0];
  const all = me === 'admin';
  if (!pick) pick = all ? 'all' : me;
  const lang = getLang();
  const body = h('div.guide-body');
  const search = h('input.input#g-search', { type: 'search', placeholder: t('guide_search') });
  // the admin may read every role's chapter; the others read theirs and the shared ones
  const chips = all ? h('div.guide-roles', ['all'].concat(ROLE_KEYS).map((r) => h('button', { type: 'button', class: 'fu-chip' + (pick === r ? ' on' : ''),
    onclick: () => { pick = r; draw(); [...chips.children].forEach((b, i) => b.classList.toggle('on', (['all'].concat(ROLE_KEYS))[i] === r)); } },
    h('span', r === 'all' ? t('all_roles') : t('role_' + r))))) : null;

  const mine = (c) => c.roles.includes('all') || pick === 'all' || c.roles.includes(pick);
  const html = (c) => (lang === 'en' && c.en ? c.en : c.ar);
  function draw() {
    const q = search.value.trim().toLowerCase();
    let list = GUIDE.filter(mine);
    // the "?" of a screen: the chapter that explains it (for this role when there is one) comes first
    const here = screen ? (list.find((c) => c.screens.includes(screen) && c.roles.includes(me)) || list.find((c) => c.screens.includes(screen))) : null;
    // then the role's chapters, and the shared ones (basics, the order cycle, reports, terms) last
    const shared = (c) => c.roles.includes('all');
    list = (here ? [here] : []).concat(list.filter((c) => c !== here && !shared(c)), list.filter((c) => c !== here && shared(c)));
    if (q) list = list.filter((c) => (c.ar + ' ' + c.en).toLowerCase().includes(q));
    body.replaceChildren(...(list.length ? list.map((c) => {
      const box = h('section', { class: 'guide-ch' + (c === here ? ' here' : ''), dir: lang === 'en' && c.en ? 'ltr' : 'rtl' });
      box.innerHTML = html(c);           // the guide's own text, written with the app
      if (c === here) box.prepend(h('div.guide-here', '📍 ', t('guide_this_screen'), ': ', h('b', t(screen))));
      if (lang === 'en' && !c.en) box.prepend(h('p.guide-note', t('guide_not_translated')));
      return box;
    }) : [h('p.empty', t('no_rows'))]));
  }
  search.addEventListener('input', draw);
  root.replaceChildren(h('div.card.guide', h('div.card-head', h('h2', t('guide'))), h('small.muted', t('guide_help')), chips, search, body));
  draw();
}
