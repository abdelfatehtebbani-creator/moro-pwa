// Placeholder for screens of later phases, so navigation already shows the final structure.
import { t } from '../i18n.js';
import { h } from '../ui.js';

const PHASE = { receive: 4, issue: 4, production: 4, requests: 4, masters: 4, users: 4, reports: 5 };

export function render(root, name) {
  root.replaceChildren(h('div.card', h('div.soon', h('b', t('soon_title')), h('span', t('soon_text', { p: PHASE[name] || 4 })))));
}
