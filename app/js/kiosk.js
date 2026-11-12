// The shared device in the factory (kiosk.html): one touch screen for every producing department.
// A name is pressed, the PIN typed on the screen's keypad, and the person works as themselves: record a production,
// hand the shop-order lines of their department, ask the store for materials. After each entry, and after a minute
// without a touch, it signs out and shows the names again. Nothing scrolls: long lists are pages.
// Saves go straight to the server (not the outbox): an entry left waiting would be sent with the next person's sign-in.
import { call, session } from './api.js';
import { Data } from './data.js';
import { kv } from './db.js';
import { getLang, setLang, applyLang, errText } from './i18n.js';
import { h } from './ui.js';
import { newId } from './components.js';

const KEY = 'moro.kiosk_key';
const IDLE_MS = 60000;
const DONE_MS = 15000;
const W = {
  ar: { setup: 'تفعيل الجهاز المشترك', setup_help: 'هذا الجهاز ليس جهازًا مشتركًا بعد. يدخل المدير باسمه ورمزه لتفعيله.', device_name: 'اسم الجهاز',
    username: 'اسم المستخدم', pin: 'الرمز', enable: 'تفعيل', not_admin: 'التفعيل للمدير فقط.', who: 'اضغط على اسمك', all: 'الكل', page: 'صفحة {a} من {b}',
    next: 'التالي', prev: 'السابق', back: 'رجوع', logout: 'خروج', type_pin: 'اكتب رمزك', production: 'تسجيل إنتاج', shop: 'طلبيات المحلات', request: 'طلب مواد',
    pick_product: 'اختر المنتج', qty_of: 'الكمية', save: 'حفظ', saved_prod: 'تم تسجيل الإنتاج', batch: 'رقم التشغيلة', again: 'عملية أخرى', home: 'القائمة',
    wanted: 'مطلوب للمحلات', no_products: 'لا منتجات لقسمك', no_lines: 'لا أسطر بانتظارك', hand: 'سلّم', cannot: 'غير متوفر', handed: 'تم التسليم',
    reason: 'السبب', r_none: 'لم يُنتج', r_stock: 'نفد المخزون', r_quality: 'مشكلة في الجودة', r_other: 'سبب آخر', saved: 'تم الحفظ', left: 'المتبقي',
    pick_dept: 'لأي قسم؟', search: 'ابحث عن مادة', kb_space: 'مسافة', kb_clear: 'مسح', kb_done: 'تم', cart: 'المطلوب', send: 'إرسال الطلب', sent: 'أُرسل الطلب إلى المخزن', empty_cart: 'لم تُضف مواد بعد',
    available: 'المتوفر', remove: 'حذف', bye: 'سيُغلق خلال {n} ث', loading: 'جارٍ التحميل…', unknown: 'الجهاز لم يعد مفعّلًا. يفعّله المدير من جديد.',
    lang: 'English', none_users: 'لا مستخدمين لهذا الجهاز بعد' },
  en: { setup: 'Set up the shared device', setup_help: 'This device is not a shared device yet. The admin signs in to set it up.', device_name: 'Device name',
    username: 'Username', pin: 'PIN', enable: 'Set up', not_admin: 'Only the admin can set it up.', who: 'Press your name', all: 'All', page: 'Page {a} of {b}',
    next: 'Next', prev: 'Back', back: 'Back', logout: 'Sign out', type_pin: 'Type your PIN', production: 'Record production', shop: 'Shop orders', request: 'Ask the store',
    pick_product: 'Choose the product', qty_of: 'Quantity', save: 'Save', saved_prod: 'Production recorded', batch: 'Batch No.', again: 'Another one', home: 'Menu',
    wanted: 'Wanted by the shops', no_products: 'No products for your department', no_lines: 'No lines waiting for you', hand: 'Hand over', cannot: 'Not available', handed: 'Handed over',
    reason: 'Reason', r_none: 'Not made', r_stock: 'Out of stock', r_quality: 'Quality problem', r_other: 'Other reason', saved: 'Saved', left: 'Left',
    pick_dept: 'For which department?', search: 'Search a material', kb_space: 'Space', kb_clear: 'Clear', kb_done: 'Done', cart: 'Asked for', send: 'Send the request', sent: 'Request sent to the store', empty_cart: 'No materials added yet',
    available: 'Available', remove: 'Remove', bye: 'Closing in {n} s', loading: 'Loading…', unknown: 'This device is no longer set up. The admin sets it up again.',
    lang: 'العربية', none_users: 'No users for this device yet' },
};
const k = (key, vars) => { let s = (W[getLang()] || W.ar)[key] || key; for (const [a, b] of Object.entries(vars || {})) s = s.replace('{' + a + '}', b); return s; };
const fmt = (n) => (Math.round(Number(n) * 1000) / 1000).toLocaleString('en-US');
// a quantity and its unit, kept in that order inside Arabic text
const qu = (n, unit) => '⁦' + fmt(n) + (unit ? ' ' + unit : '') + '⁩';
const norm = (s) => String(s || '').trim().toUpperCase();
const root = document.getElementById('k');
const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

let people = null;          // {device, users, no_pin}
let me = null;              // the signed-in person (auth.login user)
let caps = new Set();
let dataReady = null;       // the catalogue (items, recipes, balances) of the signed-in person
let idleTimer = null, tickTimer = null, idleAt = 0;

// ---------- the frame: a header, the screen, a footer; nothing larger than the device's screen
function frame(title, body, foot, opts = {}) {
  const left = me ? h('div.k-me', h('b', h('bdi', me.display_name)), h('button.k-btn.k-out', { type: 'button', onclick: signOut }, k('logout')))
    : h('button.k-btn.k-lang', { type: 'button', onclick: () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); applyLang(); if (people) names(); else setup(); } }, k('lang'));
  document.querySelectorAll('.k-kb').forEach((x) => x.remove()); document.body.classList.remove('k-kbopen');   // a new screen: the on-screen keyboard closes
  root.replaceChildren(
    h('header.k-head', h('div.k-brand', h('img', { src: 'icons/logo.png', alt: '' }), h('span', 'MORO'), people ? h('small', h('bdi', people.device)) : ''),
      opts.back ? h('button.k-btn.k-back', { type: 'button', onclick: opts.back }, '→ ' + k('back')) : '', h('h1', title), h('div.k-bye'), left),
    h('main.k-main', body),
    h('footer.k-foot', foot || ''));
}

// ---------- pages: a list shown n at a time, with Next / Back
function pager(list, perPage, draw, onPage) {
  let page = 0;
  const pages = () => Math.max(1, Math.ceil(list.length / perPage));
  const box = h('div.k-pagebox');
  const info = h('span.k-pageinfo');
  const prev = h('button.k-btn', { type: 'button', onclick: () => { if (page > 0) { page--; show(); } } }, '→ ' + k('prev'));
  const next = h('button.k-btn', { type: 'button', onclick: () => { if (page < pages() - 1) { page++; show(); } } }, k('next') + ' ←');
  const show = () => {
    page = Math.min(page, pages() - 1);
    box.replaceChildren(...draw(list.slice(page * perPage, (page + 1) * perPage)));
    info.textContent = k('page', { a: page + 1, b: pages() });
    prev.disabled = page === 0; next.disabled = page >= pages() - 1;
    if (onPage) onPage();
  };
  show();
  const nav = h('div.k-pager', prev, info, next);
  const showNav = () => { nav.style.visibility = pages() > 1 ? '' : 'hidden'; };
  showNav();
  return { box, nav, set(l) { list = l; page = 0; show(); showNav(); } };
}

// ---------- a keypad on the screen (touch: no keyboard)
function keypad(opts) {
  let val = opts.value === undefined || opts.value === null ? '' : String(opts.value);
  let fresh = val !== '';            // a suggested quantity: the first digit typed replaces it
  const out = h('div.k-display' + (opts.secret ? '.k-secret' : ''));
  const draw = () => { out.textContent = opts.secret ? '●'.repeat(val.length) || ' ' : (val || '0') + (opts.unit ? ' ' + opts.unit : ''); if (opts.onChange) opts.onChange(val); };
  const press = (x) => {
    if (fresh && x !== '⌫') { val = ''; }
    fresh = false;
    if (x === '⌫') val = val.slice(0, -1);
    else if (x === '.') { if (!opts.secret && !val.includes('.')) val = (val || '0') + '.'; }
    else if (val.length < (opts.max || 8)) val = val === '0' ? x : val + x;
    draw();
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', opts.secret ? '' : '.', '0', '⌫'];
  draw();
  return { el: h('div.k-pad', out, h('div.k-keys', keys.map((x) => x ? h('button.k-key', { type: 'button', onclick: () => press(x) }, x) : h('span')))),
    get value() { return val; }, clear() { val = ''; draw(); } };
}

// ---------- the on-screen keyboard (the device has no keyboard): opens when the field is touched, Arabic or English letters
const KB = {
  en: ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  ar: ['1234567890', 'ضصثقفغعهخحج', 'شسيبلاتنمكط', 'ئءؤرىةوزظدذ']
};
function textpad(input, onChange) {
  let layout = getLang() === 'ar' ? 'ar' : 'en';
  let box = null;
  const put = (v) => { input.value = v; onChange(); };
  const close = () => { if (box) box.remove(); box = null; input.classList.remove('k-typing'); document.body.classList.remove('k-kbopen'); };
  const draw = () => {
    const row = (keys) => h('div.k-kbrow', [...keys].map((c) => h('button.k-kbkey', { type: 'button', onclick: () => put(input.value + c) }, c)));
    box.replaceChildren(...KB[layout].map(row), h('div.k-kbrow',
      h('button.k-kbkey.k-kbwide', { type: 'button', onclick: () => { layout = layout === 'ar' ? 'en' : 'ar'; draw(); } }, layout === 'ar' ? 'EN' : 'ع'),
      h('button.k-kbkey.k-kbwide', { type: 'button', onclick: () => put('') }, k('kb_clear')),
      h('button.k-kbkey.k-kbspace', { type: 'button', onclick: () => put(input.value + ' ') }, k('kb_space')),
      h('button.k-kbkey.k-kbwide', { type: 'button', onclick: () => put(input.value.slice(0, -1)) }, '⌫'),
      h('button.k-kbkey.k-kbwide.k-kbdone', { type: 'button', onclick: close }, k('kb_done'))));
  };
  const open = () => {
    if (box) return;
    box = h('div.k-kb', { dir: 'ltr' });
    draw();
    document.body.append(box);
    document.body.classList.add('k-kbopen');
    input.classList.add('k-typing');
  };
  input.setAttribute('inputmode', 'none');   // no keyboard of the system on top of this one
  input.addEventListener('pointerdown', open);
  input.addEventListener('focus', open);
  return { close };
}
/** Search text compared loosely: case, and the forms of alef, yaa and taa marbuta. */
function fold(s) { return String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim(); }

function flashMsg(text, kind) {
  const m = h('div.k-msg' + (kind ? '.k-' + kind : ''), text);
  document.body.append(m);
  setTimeout(() => m.remove(), 3500);
}

// ---------- signed in: a minute without a touch signs out (the last 10 seconds are shown)
function touch() { idleAt = Date.now(); }
function startIdle(ms = IDLE_MS) {
  stopIdle();
  touch();
  tickTimer = setInterval(() => {
    const left = ms - (Date.now() - idleAt);
    const bye = root.querySelector('.k-bye');
    if (bye) bye.textContent = left <= 10000 ? k('bye', { n: Math.max(0, Math.ceil(left / 1000)) }) : '';
    if (left <= 0) signOut();
  }, 500);
}
function stopIdle() { clearInterval(tickTimer); clearTimeout(idleTimer); tickTimer = null; }
['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, touch, { passive: true }));

async function signOut() {
  stopIdle();
  me = null; caps = new Set(); dataReady = null;
  session.token = '';
  names();
}

// ---------- the device is not set up: the admin sets it up
function setup() {
  const user = h('input.k-input', { autocomplete: 'off', autocapitalize: 'none' });
  const pin = h('input.k-input', { type: 'password', inputmode: 'numeric', maxlength: 8 });
  const name = h('input.k-input', { value: 'Factory' });
  const err = h('p.k-err');
  const go = async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      const r = await call('auth.login', { username: user.value, pin: pin.value });
      session.token = r.token;
      if (!(r.user.caps || []).includes('users.manage')) { session.token = ''; err.textContent = k('not_admin'); return; }
      const d = await call('kiosk.enable', { name: name.value });
      session.token = '';
      try { localStorage.setItem(KEY, d.key); } catch { /* storage blocked */ }
      start();
    } catch (ex) { session.token = ''; err.textContent = errText(ex); }
  };
  frame(k('setup'), h('form.k-card', { onsubmit: go }, h('p', k('setup_help')),
    h('label', k('username'), user), h('label', k('pin'), pin), h('label', k('device_name'), name), err,
    h('button.k-btn.k-big', { type: 'submit' }, k('enable'))));
}

// ---------- the names
let deptFilter = '';
function names() {
  const users = (people && people.users) || [];
  const depts = [...new Set(users.flatMap((u) => u.depts))].sort();
  const shown = () => users.filter((u) => !deptFilter || u.depts.includes(deptFilter));
  const chips = depts.length > 1 ? h('div.k-chips', ['', ...depts].map((d) => h('button.k-chip', { type: 'button', class: d === deptFilter ? 'on' : '',
    onclick: () => { deptFilter = d; names(); } }, d ? h('bdi', d) : k('all')))) : '';
  const p = pager(shown(), 12, (list) => list.map((u) => h('button.k-tile.k-name', { type: 'button', onclick: () => askPin(u) },
    h('b', h('bdi', u.name)), h('small', h('bdi', u.depts.join('، ') || '')))));
  p.box.classList.add('k-grid', 'k-g4');
  frame(k('who'), h('div.k-col', chips, users.length ? p.box : h('p.k-empty', k('none_users'))), users.length ? p.nav : '');
}

function askPin(u) {
  if (people.no_pin) { signIn(u, ''); return; }
  const pad = keypad({ secret: true, max: 8 });
  const err = h('p.k-err');
  const ok = h('button.k-btn.k-big.k-ok', { type: 'button', onclick: async () => { if (!pad.value) return; ok.disabled = true; err.textContent = '';
    try { await signIn(u, pad.value); } catch (e) { err.textContent = errText(e); pad.clear(); ok.disabled = false; } } }, '✓');
  frame(h('span', h('bdi', u.name)), h('div.k-center', h('p.k-hint', k('type_pin')), pad.el, err), ok, { back: names });
  // a name pressed by mistake: back to the names after a while
  startIdle(30000);
}

async function signIn(u, pin) {
  const r = await call('auth.login', { username: u.username, pin });
  session.token = r.token;
  me = r.user;
  caps = new Set(r.user.caps || []);
  // the catalogue: the copy on the device at once, the person's own from the server behind it
  const cached = await kv.get('boot');
  if (cached) { Data.boot = cached; Data.index(); }
  dataReady = Data.refresh().catch(() => { if (!cached) throw new Error('offline'); });
  if (!cached) await dataReady;
  menu();
}

// ---------- signed in: what this person may do here
function menu() {
  startIdle();
  const tiles = [];
  if (caps.has('production.post')) tiles.push(h('button.k-tile.k-action', { type: 'button', onclick: production }, h('span.k-ico', '🧁'), h('b', k('production'))));
  if (caps.has('shop.hand')) tiles.push(h('button.k-tile.k-action', { type: 'button', onclick: shopLines }, h('span.k-ico', '📦'), h('b', k('shop'))));
  if (caps.has('requests.create')) tiles.push(h('button.k-tile.k-action', { type: 'button', onclick: request }, h('span.k-ico', '🛒'), h('b', k('request'))));
  frame(k('home'), h('div.k-grid.k-actions', { style: 'grid-template-columns: repeat(' + Math.max(1, tiles.length) + ', minmax(0, 340px)); justify-content: center;' }, tiles));
}

function done(title, lines) {
  startIdle(DONE_MS);
  frame(title, h('div.k-center.k-done', h('div.k-check', '✓'), ...lines.map((x) => h('p', x))),
    h('div.k-row', h('button.k-btn.k-big', { type: 'button', onclick: menu }, k('again')), h('button.k-btn.k-big.k-sec', { type: 'button', onclick: signOut }, k('logout'))));
}

// ---------- record a production
async function production() {
  startIdle();
  frame(k('production'), h('p.k-empty', k('loading')), '', { back: menu });
  try { await dataReady; } catch (e) { frame(k('production'), h('p.k-empty', errText(e)), '', { back: menu }); return; }
  // the products of the person's departments (a department head), else every product; the ones the shops wait for first
  const withRecipe = new Set(Data.recipes.filter((r) => r.cost_only !== true).map((r) => norm(r.product)));
  const head = (me.depts || []).length > 0 && me.role !== 'production';
  const mine = (it) => !head || (me.depts || []).includes(String(it.dept || ''));
  const items = Data.activeItems().filter((i) => (Data.storeOf(i) === 'FINAL' || withRecipe.has(norm(i.name))) && mine(i));
  let wanted = new Map();
  try {
    (await call('shop.list', { status: 'open', native: true })).forEach((l) => {
      if (l.special || !l.can) return;
      wanted.set(l.item_id, (wanted.get(l.item_id) || 0) + Math.max(0, l.qty - l.handed_qty - l.reserved_qty));
    });
  } catch { wanted = new Map(); }
  items.sort((a, b) => (wanted.get(b.item_id) || 0) - (wanted.get(a.item_id) || 0) || Data.nameOf(a).localeCompare(Data.nameOf(b)));
  if (!items.length) { frame(k('production'), h('p.k-empty', k('no_products')), '', { back: menu }); return; }
  const p = pager(items, 12, (list) => list.map((it) => h('button.k-tile', { type: 'button', onclick: () => prodQty(it) },
    h('b', h('bdi', Data.nameOf(it))), wanted.get(it.item_id) > 0 ? h('small.k-want', k('wanted') + ': ' + qu(wanted.get(it.item_id), it.unit)) : h('small', it.unit))));
  p.box.classList.add('k-grid', 'k-g4');
  frame(k('pick_product'), p.box, p.nav, { back: menu });

  function prodQty(it) {
    const pad = keypad({ unit: it.unit, max: 8 });
    const save = h('button.k-btn.k-big.k-ok', { type: 'button', onclick: async () => {
      const q = Number(pad.value);
      if (!(q > 0)) return;
      save.disabled = true;
      try {
        const r = await call('production.post', { product: it.name, qty: q, unit: it.unit, date: Data.todayIso(), client_id: newId() });
        done(k('saved_prod'), [Data.nameOf(it) + ' · ' + qu(q, it.unit), r.batch_no ? k('batch') + ': ' + r.batch_no : '']);
      } catch (e) { flashMsg(errText(e), 'err'); save.disabled = false; }
    } }, '✓ ' + k('save'));
    frame(h('span', h('bdi', Data.nameOf(it))), h('div.k-center', h('p.k-hint', k('qty_of')), pad.el), save, { back: production });
  }
}

// ---------- hand the shop-order lines of the person's department
async function shopLines() {
  startIdle();
  frame(k('shop'), h('p.k-empty', k('loading')), '', { back: menu });
  let lines;
  try { await dataReady; lines = await call('shop.list', { status: 'open', native: true }); }
  catch (e) { frame(k('shop'), h('p.k-empty', errText(e)), '', { back: menu }); return; }
  const shopName = (id) => (Data.parties.get(id) || {}).name || id;
  const open = lines.filter((l) => l.can && l.approved !== false && l.qty - l.handed_qty > 0 && !(l.special && l.dept === 'PURCHASE'));
  if (!open.length) { frame(k('shop'), h('p.k-empty', k('no_lines')), '', { back: menu }); return; }
  const nameOf = (l) => (l.special ? l.description : Data.nameOf(Data.items.get(l.item_id) || { name: l.item_id }));
  const p = pager(open, 8, (list) => list.map((l) => {
    const left = Math.round((l.qty - l.handed_qty) * 1e6) / 1e6;
    return h('button.k-tile.k-line', { type: 'button', onclick: () => one(l, left) }, h('b', h('bdi', nameOf(l))),
      h('span', h('bdi', shopName(l.shop_party_id)), ' · ', l.order_no), h('span.k-left', k('left') + ': ' + qu(left, l.unit)));
  }));
  p.box.classList.add('k-grid', 'k-g4');
  frame(k('shop'), p.box, p.nav, { back: menu });

  function one(l, left) {
    const start = l.special ? left : Math.min(left, l.reserved_qty) || left;
    const pad = keypad({ value: start, unit: l.unit, max: 8 });
    const hand = h('button.k-btn.k-big.k-ok', { type: 'button', onclick: async () => {
      const q = Number(pad.value);
      if (!(q > 0) || q > left + 1e-9) return;
      hand.disabled = true;
      try { await call('shop.hand', { date: Data.todayIso(), client_id: newId(), lines: [{ line_id: l.line_id, qty: q }] }); flashMsg(k('handed'), 'ok'); shopLines(); }
      catch (e) { flashMsg(errText(e), 'err'); hand.disabled = false; }
    } }, '✓ ' + k('hand'));
    const no = h('button.k-btn.k-big.k-sec', { type: 'button', onclick: () => cannot(l) }, k('cannot'));
    frame(h('span', h('bdi', nameOf(l)), ' · ', h('bdi', shopName(l.shop_party_id))), h('div.k-center', h('p.k-hint', k('left') + ': ' + qu(left, l.unit)), pad.el),
      h('div.k-row', no, hand), { back: shopLines });
  }

  function cannot(l) {
    const pick = async (why) => {
      try { await call('shop.unavailable', { line_id: l.line_id, reason: why }); flashMsg(k('saved'), 'ok'); shopLines(); }
      catch (e) { flashMsg(errText(e), 'err'); }
    };
    frame(k('reason'), h('div.k-grid.k-g2.k-reasons', ['r_none', 'r_stock', 'r_quality', 'r_other'].map((r) => h('button.k-tile', { type: 'button', onclick: () => pick(k(r)) }, h('b', k(r))))),
      '', { back: () => shopLines() });
  }
}

// ---------- ask the store for materials
async function request() {
  startIdle();
  frame(k('request'), h('p.k-empty', k('loading')), '', { back: menu });
  try { await dataReady; } catch (e) { frame(k('request'), h('p.k-empty', errText(e)), '', { back: menu }); return; }
  const sections = [...Data.parties.values()].filter((p) => p.kind === 'section' && p.active === true);
  const mineD = sections.filter((p) => (me.depts || []).includes(p.party_id));
  const choices = mineD.length ? mineD : sections;
  if (choices.length === 1) return cart(choices[0]);
  const p = pager(choices.sort((a, b) => a.name.localeCompare(b.name)), 12, (list) => list.map((d) => h('button.k-tile', { type: 'button', onclick: () => cart(d) }, h('b', h('bdi', d.name)))));
  p.box.classList.add('k-grid', 'k-g4');
  frame(k('pick_dept'), p.box, p.nav, { back: menu });

  async function cart(dept) {
    const lines = [];
    // what this department asked for before comes first (most asked first), then what the store has, then the rest
    const times = new Map();
    try { (await call('requests.list', { limit: 300 })).filter((r) => r.party_id === dept.party_id).forEach((r) => r.lines.forEach((l) => times.set(l.item_id, (times.get(l.item_id) || 0) + 1))); }
    catch { /* no history: by name */ }
    const all = Data.activeItems().filter((i) => Data.storeOf(i) !== 'FINAL').sort((a, b) => (times.get(b.item_id) || 0) - (times.get(a.item_id) || 0)
      || (Data.qty(b.item_id) > 0) - (Data.qty(a.item_id) > 0) || Data.nameOf(a).localeCompare(Data.nameOf(b)));
    const search = h('input.k-input.k-search', { type: 'search', placeholder: k('search'), autocomplete: 'off' });
    const list = () => { const q = fold(search.value); return all.filter((i) => !q || fold(i.name).includes(q) || fold(i.name_ar).includes(q)); };
    const p2 = pager(list(), 9, (ls) => ls.map((it) => h('button.k-tile.k-item', { type: 'button', onclick: () => qtyOf(it) }, h('b', h('bdi', Data.nameOf(it))),
      h('small', k('available') + ': ' + qu(Math.max(0, Data.qty(it.item_id)), it.unit)))));
    p2.box.classList.add('k-grid', 'k-g3');
    search.addEventListener('input', () => p2.set(list()));
    textpad(search, () => p2.set(list()));
    const side = h('div.k-cart');
    const drawCart = () => side.replaceChildren(h('h2', k('cart')), lines.length ? h('div.k-cartlist', lines.slice(-7).map((l) => h('div.k-cartrow',
      h('bdi', Data.nameOf(Data.items.get(l.item_id))), h('b', qu(l.qty, Data.items.get(l.item_id).unit)),
      h('button.k-x', { type: 'button', onclick: () => { lines.splice(lines.indexOf(l), 1); drawCart(); } }, '✕')))) : h('p.k-empty', k('empty_cart')),
      h('button.k-btn.k-big.k-ok', { type: 'button', disabled: !lines.length, onclick: send }, '✓ ' + k('send')));
    const page = () => frame(h('span', k('request'), ' · ', h('bdi', dept.name)), h('div.k-split', h('div.k-col', search, p2.box), side), p2.nav, { back: menu });
    drawCart();
    page();

    function qtyOf(it) {
      const pad = keypad({ unit: it.unit, max: 8 });
      const avail = Math.max(0, Data.qty(it.item_id)) - lines.filter((l) => l.item_id === it.item_id).reduce((s, l) => s + l.qty, 0);
      const add = h('button.k-btn.k-big.k-ok', { type: 'button', onclick: () => {
        const q = Number(pad.value);
        if (!(q > 0)) return;
        if (q > avail + 1e-9) { flashMsg(k('available') + ': ' + qu(avail, it.unit), 'err'); return; }
        lines.push({ item_id: it.item_id, qty: q });
        drawCart(); page();
      } }, '＋');
      frame(h('span', h('bdi', Data.nameOf(it))), h('div.k-center', h('p.k-hint', k('available') + ': ' + qu(avail, it.unit)), pad.el), add, { back: page });
    }

    async function send(e) {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await call('requests.create', { date: Data.todayIso(), party_id: dept.party_id, note: '', client_id: newId(), lines });
        done(k('sent'), [dept.name + ' · ' + lines.length]);
      } catch (ex) { flashMsg(errText(ex), 'err'); btn.disabled = false; }
    }
  }
}

// ---------- start: the device's people, or its setup
async function start() {
  applyLang();
  session.token = '';
  const key = getKey();
  if (!key) { setup(); return; }
  frame('MORO', h('p.k-empty', k('loading')));
  try { people = await call('kiosk.users', { key }); }
  catch (e) {
    if (e.code === 'kiosk_unknown') { try { localStorage.removeItem(KEY); } catch { /* ignore */ } frame('MORO', h('p.k-empty', k('unknown')), h('button.k-btn.k-big', { type: 'button', onclick: setup }, k('enable'))); return; }
    frame('MORO', h('p.k-empty', errText(e)), h('button.k-btn.k-big', { type: 'button', onclick: start }, '↻'));
    return;
  }
  names();
  // the list of names is read again now and then (new people, people switched off)
  setInterval(async () => { if (me) return; try { people = await call('kiosk.users', { key: getKey() }); if (!me && root.querySelector('.k-name')) names(); } catch { /* next time */ } }, 10 * 60000);
}

// no pinch, no double-tap zoom, no right-click menu on a touch screen
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.__moroStarted = true;
start();
