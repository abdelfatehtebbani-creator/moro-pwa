// The customers' page (order.html): choose the trays (the required products), add the rest, a note, the details,
// the review with the fees and the terms, then follow the order. No account: the details, the catalogue, the photos
// and the orders sent are kept on the phone, so the page opens at once and asks the server only what changed.
import { API_URL } from './config.js';

const T = {
  ar: {
    brand: 'حلويات العكر', tagline: 'صواني ساخنة إلى بابك', mine: '🧾 طلباتي', lang: 'EN', step_of: 'الخطوة {a} من 5',
    s1: 'اختر صينيتك', s1_sub: 'الحد الأدنى للطلبية {n} صينية، ثم أكمل.', s2: 'أضف معها', s2_sub: 'اختياري: أصناف أخرى مع طلبيتك.',
    s3: 'ملاحظاتك على الطلبية', s3_sub: 'شروطك أو ما تريد تحسينه (مثلًا: أقل سكر، قطع صغيرة، بلا فستق).', s3_ph: 'اكتب ملاحظتك هنا (اختياري)',
    s4: 'بياناتك', s5: 'مراجعة الطلبية', next: 'التالي', back: 'رجوع', send: 'أرسل الطلبية', sending: 'يُرسل…',
    trays: 'صواني', items: 'أصناف', min_left: 'باقي {n} للحد الأدنى', add: 'أضف', sold_out: 'نفد اليوم', qr: 'ر.ق',
    name: 'الاسم', phone: 'رقم الجوال', address: 'العنوان', address_ph: 'المنطقة، الشارع، رقم المبنى، أي وصف يساعد السائق', loc: '📍 موقعي الحالي',
    loc_ok: 'أُضيف موقعك ✓', loc_fail: 'تعذر تحديد الموقع، اكتب العنوان', date: 'يوم التسليم', time: 'وقت التسليم', closed_day: 'لا توصيل في هذا اليوم',
    no_time: 'لا وقت متاح في هذا اليوم، اختر يومًا آخر', pay: 'الدفع نقدًا عند الاستلام.', loc_saved: 'موقعك المحفوظ ✓', loc_new: '📍 حدّث إلى موقعي الحالي', loc_del: 'احذف الموقع', loc_hint: 'للتوصيل إلى مكان آخر: عدّل العنوان، ثم حدّث الموقع وأنت هناك أو احذفه.', yes: 'نعم، ألغِ', no: 'لا',
    goods: 'المنتجات', fees: 'الرسوم', total: 'المجموع', deposit_note: 'منها تأمين مسترد {d} ر.ق يُرد عند إرجاع الصواني إلى أي محل خلال {n} يوم.',
    terms_title: 'الشروط', terms_def: 'تأمين الصواني يُرد عند إرجاعها إلى أي فرع خلال {n} يوم من التسليم، وبعدها يُحتسب ثمنًا للصينية.',
    agree: 'قرأت الشروط وأوافق عليها', your_note: 'ملاحظتك',
    done: 'وصلتنا طلبيتك', done_sub: 'سيتصل بك المحل لتأكيدها. احفظ رقم طلبيتك:', follow: 'تابع طلبيتك', new_order: 'طلبية جديدة',
    st_new: 'قيد المراجعة', st_new_sub: 'سيتصل بك المحل للتأكيد', st_accepted: 'مقبولة – قيد التجهيز', st_out: 'في الطريق إليك', st_delivered: 'سُلّمت',
    st_rejected: 'تعذر تنفيذ الطلبية', st_cancelled: 'ألغيت الطلبية', reason: 'السبب', wa: 'تواصل معنا على واتساب', cancel: 'ألغِ الطلبية',
    cancel_q: 'إلغاء الطلبية؟', updating: 'يُحدَّث…', cancelling: 'يُلغى…', refresh: 'تحديث', order_no: 'رقم الطلبية', when: 'التسليم', no_orders: 'لا طلبات بعد', home: '🛍️ اطلب من جديد',
    closed: 'الطلب غير متاح الآن، حاول لاحقًا', offline: 'لا اتصال بالإنترنت، حاول مرة أخرى',
    err: { customer_required: 'اكتب اسمك', online_phone_invalid: 'رقم الجوال غير صحيح', address_required: 'اكتب العنوان', online_terms_required: 'وافق على الشروط',
      online_blocked: 'لا يمكن قبول طلبات من هذا الرقم، تواصل مع المحل', delivery_date_invalid: 'اختر اليوم والوقت', online_outside_hours: 'الوقت خارج ساعات التوصيل',
      online_too_soon: 'الوقت قريب جدًا، اختر وقتًا بعد {d} دقيقة على الأقل', online_item_gone: 'صنف لم يعد متاحًا: {d}', online_min_req: 'اختر {d} صينية على الأقل',
      online_too_many: 'لديك طلبيات مفتوحة، انتظر حتى تُنفّذ', online_closed: 'الطلب غير متاح الآن', online_cancel_late: 'قُبلت الطلبية، تواصل مع المحل لإلغائها',
      not_found: 'لم نجد الطلبية', qty_invalid: 'كمية غير صحيحة', nothing_to_save: 'اختر صنفًا', busy: 'ضغط على الخادم، حاول بعد لحظات' },
  },
  en: {
    brand: 'Alaker Sweets', tagline: 'Hot trays to your door', mine: '🧾 My orders', lang: 'ع', step_of: 'Step {a} of 5',
    s1: 'Choose your tray', s1_sub: 'An order holds at least {n} tray(s), then go on.', s2: 'Add with it', s2_sub: 'Optional: other products with your order.',
    s3: 'Your notes on the order', s3_sub: 'Your wishes (less sugar, small pieces, no pistachio…).', s3_ph: 'Write your note (optional)',
    s4: 'Your details', s5: 'Review the order', next: 'Next', back: 'Back', send: 'Send the order', sending: 'Sending…',
    trays: 'trays', items: 'items', min_left: '{n} more to the minimum', add: 'Add', sold_out: 'Sold out today', qr: 'QR',
    name: 'Name', phone: 'Mobile', address: 'Address', address_ph: 'Area, street, building, anything that helps the driver', loc: '📍 My location',
    loc_ok: 'Location added ✓', loc_fail: 'Could not get the location, write the address', date: 'Delivery day', time: 'Delivery time', closed_day: 'No delivery that day',
    no_time: 'No time left that day, choose another day', pay: 'Pay cash on delivery.', loc_saved: 'Your saved location ✓', loc_new: '📍 Update to my location now', loc_del: 'Remove the location', loc_hint: 'To deliver somewhere else: change the address, then update the location while there, or remove it.', yes: 'Yes, cancel', no: 'No',
    goods: 'Products', fees: 'Fees', total: 'Total', deposit_note: 'Of it, a refundable deposit of {d} QR, paid back when the trays come back to any shop within {n} days.',
    terms_title: 'Terms', terms_def: 'The trays’ deposit is paid back when they are returned to any shop within {n} days of delivery; after that it is kept as the tray’s price.',
    agree: 'I have read the terms and agree', your_note: 'Your note',
    done: 'We have your order', done_sub: 'The shop will call you to confirm it. Keep your order number:', follow: 'Follow your order', new_order: 'New order',
    st_new: 'Being reviewed', st_new_sub: 'The shop will call you to confirm', st_accepted: 'Accepted – being prepared', st_out: 'On its way to you', st_delivered: 'Delivered',
    st_rejected: 'The order could not be made', st_cancelled: 'The order was cancelled', reason: 'Reason', wa: 'Contact us on WhatsApp', cancel: 'Cancel the order',
    cancel_q: 'Cancel the order?', updating: 'updating…', cancelling: 'Cancelling…', refresh: 'Refresh', order_no: 'Order No.', when: 'Delivery', no_orders: 'No orders yet', home: '🛍️ Order again',
    closed: 'Ordering is not open now, try later', offline: 'No internet connection, try again',
    err: { customer_required: 'Write your name', online_phone_invalid: 'The mobile number is not valid', address_required: 'Write the address', online_terms_required: 'Agree to the terms',
      online_blocked: 'Orders from this number cannot be taken, contact the shop', delivery_date_invalid: 'Choose the day and time', online_outside_hours: 'The time is outside the delivery hours',
      online_too_soon: 'Too soon: choose a time at least {d} minutes from now', online_item_gone: 'No longer available: {d}', online_min_req: 'Choose at least {d} tray(s)',
      online_too_many: 'You have open orders, wait until they are done', online_closed: 'Ordering is not open now', online_cancel_late: 'Accepted: contact the shop to cancel',
      not_found: 'Order not found', qty_invalid: 'Quantity not valid', nothing_to_save: 'Choose a product', busy: 'The server is busy, try again in a moment' },
  },
};

// ---------- small helpers
const root = document.getElementById('o');
const store = {
  get(k, d) { try { const v = localStorage.getItem('moro.order.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('moro.order.' + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};
let lang = store.get('lang', (navigator.language || 'ar').startsWith('ar') ? 'ar' : 'en');
const tx = (k, vars) => { let s = (T[lang][k] !== undefined ? T[lang][k] : T.ar[k]) || k; Object.entries(vars || {}).forEach(([a, b]) => { s = s.replace('{' + a + '}', b); }); return s; };
const errText = (e) => { const s = T[lang].err[e.code]; return s ? s.replace('{d}', e.detail || '') : e.code === 'offline' ? tx('offline') : (e.code || 'error'); };
function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className += ' ' + v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const money = (n) => (Math.round(n * 100) / 100).toLocaleString('en-US') + ' ' + tx('qr');
const nameOf = (it) => (lang === 'ar' && it.name_ar ? it.name_ar : it.name);
/** A question in the page itself (not the browser's box with the site's address). Resolves true or false. */
function ask(q, yes, no) {
  return new Promise((resolve) => {
    const back = h('div.o-sheet-back');
    const done = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => { if (e.target === back) done(false); });
    back.append(h('div.o-sheet', h('p', q), h('div.o-sheet-btns', h('button.o-btn.sec', { type: 'button', onclick: () => done(false) }, no),
      h('button.o-btn.danger', { type: 'button', onclick: () => done(true) }, yes))));
    document.body.append(back);
  });
}
function toast(msg, err) {
  const m = h('div.o-toast' + (err ? '.err' : ''), msg);
  document.body.append(m);
  setTimeout(() => m.remove(), 3500);
}

class ApiError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail; } }
async function api(action, payload = {}) {
  let res;
  try {
    res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload }) });
  } catch { throw new ApiError('offline'); }
  let body;
  try { body = await res.json(); } catch { throw new ApiError('offline'); }
  if (!body.ok) throw new ApiError(body.error.code, body.error.detail);
  // the shop's notifications go out with a second call, so the customer does not wait for them
  if (body.push) api('online.flush').catch(() => {});
  return body.data;
}

// ---------- the catalogue: the copy on the phone at once, the server asked only whether it changed
let cat = store.get('cat', null);
const params = new URLSearchParams(location.search);
if (params.get('shop')) store.set('from', params.get('shop'));
const from = store.get('from', '');
let cart = store.get('cart', {});
let note = store.get('note', '');
let step = 1;
const saveCart = () => store.set('cart', cart);

async function loadCatalog() {
  try {
    const r = await api('online.catalog', { v: cat ? cat.v : '' });
    if (!r.same) { cat = r; store.set('cat', cat); return true; }
  } catch (e) { if (!cat) throw e; }
  return false;
}

// photos: kept in the phone's cache after the first time; those missing are asked for together in one call,
// all of them as soon as the catalogue is known, so the next steps show them at once
const photoCache = 'moro.order-photos';   // kept by the service worker across releases
const photoUrls = {}, photoReady = {};          // one object URL per photo while the page is open
const photoKey = (id) => new Request(location.origin + '/__online_photo/' + id);
let queue = {}, queueTimer = null;
function photoUrl(id) {
  if (!photoUrls[id]) photoUrls[id] = new Promise((resolve) => { queue[id] = resolve; clearTimeout(queueTimer); queueTimer = setTimeout(fetchQueued, 20); })
    .then((u) => { if (u) photoReady[id] = u; else delete photoUrls[id]; return u; });
  return photoUrls[id];
}
async function fetchQueued() {
  const q = queue; queue = {};
  let c = null;
  try { c = await caches.open(photoCache); } catch { /* no cache storage: from the server each time */ }
  const missing = [];
  await Promise.all(Object.keys(q).map(async (id) => {
    const hit = c && await c.match(photoKey(id)).catch(() => null);
    if (hit) q[id](URL.createObjectURL(await hit.blob())); else missing.push(id);
  }));
  if (!missing.length) return;
  let got = {};
  try { got = await api('online.photos', { ids: missing }); } catch { /* offline: the placeholders stay */ }
  await Promise.all(missing.map(async (id) => {
    if (!got[id]) return q[id]('');
    try {
      const blob = await (await fetch(got[id])).blob();
      if (c) c.put(photoKey(id), new Response(blob, { headers: { 'Content-Type': blob.type } })).catch(() => {});
      q[id](URL.createObjectURL(blob));
    } catch { q[id](got[id]); }
  }));
}
function prefetchPhotos() { items().forEach((i) => { if (i.photo) photoUrl(i.photo); }); }
function photo(it) {
  if (photoReady[it.photo]) return h('div.o-ph', h('img', { src: photoReady[it.photo], alt: '' }));
  const box = h('div.o-ph', it.photo ? h('span.o-shimmer') : '🍰');
  if (it.photo) photoUrl(it.photo).then((u) => box.replaceChildren(u ? h('img', { src: u, alt: '', class: 'o-fade' }) : '🍰'));
  return box;
}

// ---------- the frame
function head() {
  return h('header.o-head', h('img', { src: 'icons/icon-192.png', alt: '' }), h('h1', tx('brand'), h('small', tx('tagline'))),
    h('button.o-link', { type: 'button', onclick: showMine }, tx('mine')),
    h('button.o-link', { type: 'button', onclick: () => { lang = lang === 'ar' ? 'en' : 'ar'; store.set('lang', lang); applyLang(); render(); } }, tx('lang')));
}
function applyLang() { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }
let shown = null;
let current = null;            // the screen shown, drawn again when the language or the catalogue changes
function render() { if (current) current(); else if (cat) step1(); }
function frame(main, bar, withSteps = true) {
  root.replaceChildren(...[head(), withSteps ? [h('div.o-steps', [1, 2, 3, 4, 5].map((i) => h('span', { class: i <= step ? 'on' : '' }))), h('div.o-stepof', tx('step_of', { a: step }))] : '', h('main.o-main', main),
    bar ? h('div.o-bar', h('div.o-bar-in', bar)) : ''].flat());
  // to the top only on a new screen (adding a product draws the same screen again in place)
  if (shown !== current) { shown = current; window.scrollTo(0, 0); }
}

const items = () => (cat ? cat.items : []);
const trays = () => items().filter((i) => i.req).reduce((s, i) => s + (cart[i.id] || 0), 0);
const goods = () => items().reduce((s, i) => s + (cart[i.id] || 0) * i.price, 0);
const count = () => items().reduce((s, i) => s + (cart[i.id] || 0), 0);

function card(it, onChange) {
  const q = cart[it.id] || 0;
  const set = (n) => { if (n > 0) cart[it.id] = n; else delete cart[it.id]; saveCart(); onChange(); };
  return h('div.o-card', { class: (q ? 'picked ' : '') + (it.out ? 'off' : '') }, photo(it),
    h('div.o-card-b', h('b', nameOf(it)), h('span.o-price', money(it.price)), it.out ? h('span.o-soldout', tx('sold_out'))
      : q ? h('div.o-qty', h('button', { type: 'button', onclick: () => set(q - 1), 'aria-label': '-' }, '−'), h('span', q), h('button.add', { type: 'button', onclick: () => set(q + 1), 'aria-label': '+' }, '+'))
        : h('button.o-add', { type: 'button', onclick: () => set(1) }, '+ ' + tx('add'))));
}

// ---------- 1. the trays (the required products)
function step1() {
  step = 1; current = step1;
  const min = cat.cfg.min_req || 0;
  if (!items().some((i) => i.req)) return frame(h('div.o-done', h('div.o-check-big', { style: 'background:#c9a27e' }, '⏳'), h('p.o-sub', tx('closed'))), null, false);
  const grid = h('div.o-grid', items().filter((i) => i.req).map((it) => card(it, step1)));
  const left = Math.max(0, min - trays());
  frame([h('h2.o-title', tx('s1')), h('p.o-sub', tx('s1_sub', { n: min })), grid],
    [h('div.o-bar-info', h('b', trays() + ' ' + tx('trays')), left ? tx('min_left', { n: left }) : money(goods())),
     h('button.o-btn', { type: 'button', disabled: left > 0 || !trays(), onclick: step2 }, tx('next'))]);
}

// ---------- 2. the other products
function step2() {
  step = 2; current = step2;
  const others = items().filter((i) => !i.req);
  if (!others.length) return step3();
  frame([h('h2.o-title', tx('s2')), h('p.o-sub', tx('s2_sub')), h('div.o-grid', others.map((it) => card(it, step2)))],
    [h('button.o-btn.sec', { type: 'button', onclick: step1 }, tx('back')), h('div.o-bar-info', h('b', money(goods())), count() + ' ' + tx('items')),
     h('button.o-btn', { type: 'button', onclick: step3 }, tx('next'))]);
}

// ---------- 3. the note
function step3() {
  step = 3; current = step3;
  const ta = h('textarea.o-in', { placeholder: tx('s3_ph'), maxlength: 600 });
  ta.value = note;
  ta.addEventListener('input', () => { note = ta.value; store.set('note', note); });
  frame([h('h2.o-title', tx('s3')), h('p.o-sub', tx('s3_sub')), ta],
    [h('button.o-btn.sec', { type: 'button', onclick: () => (items().some((i) => !i.req) ? step2() : step1()) }, tx('back')), h('div.o-bar-info'),
     h('button.o-btn', { type: 'button', onclick: step4 }, tx('next'))]);
}

// ---------- 4. the details: name, mobile, address (with the location), day and time
const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const [a, b] = String(t || '').split(':').map(Number); return a * 60 + b; };
const isoDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
/** The times offered on a day: every half hour in its hours, and not before the notice. */
function timesOf(day) {
  const d = new Date(day + 'T12:00:00');
  const hrs = (cat.cfg.hours || {})[d.getDay()] || {};
  if (hrs.off) return null;
  const now = new Date();
  const earliest = now.getTime() + (cat.cfg.lead_min || 0) * 60000;
  const out = [];
  for (let m = Math.ceil(toMin(hrs.from) / 30) * 30; m <= toMin(hrs.to); m += 30) {
    const t = pad(Math.floor(m / 60)) + ':' + pad(m % 60);
    if (new Date(day + 'T' + t + ':00').getTime() >= earliest) out.push(t);
  }
  return out;
}
let details = store.get('me', { name: '', phone: '', address: '', map: '' });
let when = { date: '', time: '' };
function step4() {
  step = 4; current = step4;
  const inp = (k, attrs) => { const i = h('input.o-in', Object.assign({ value: details[k] || '' }, attrs)); i.addEventListener('input', () => { details[k] = i.value; store.set('me', details); }); return i; };
  const name = inp('name', { autocomplete: 'name' });
  const phone = inp('phone', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', dir: 'ltr' });
  const address = h('textarea.o-in', { placeholder: tx('address_ph') });
  address.value = details.address || '';
  address.addEventListener('input', () => { details.address = address.value; store.set('me', details); });
  // the location is kept for the next order; it can be updated (standing at the new place) or removed
  const locMsg = h('div.o-locmsg');
  const loc = h('button.o-loc', { type: 'button' });
  const drawLoc = (msg) => {
    loc.textContent = details.map ? tx('loc_new') : tx('loc');
    locMsg.replaceChildren(...[msg ? h('small', msg) : '', details.map ? [h('small.ok', msg ? '' : tx('loc_saved')),
      h('button.o-linkbtn', { type: 'button', onclick: () => { details.map = ''; store.set('me', details); drawLoc(); } }, '✕ ' + tx('loc_del')),
      h('small.o-hint', tx('loc_hint'))] : ''].flat());
  };
  loc.addEventListener('click', () => {
    if (!navigator.geolocation) { drawLoc(tx('loc_fail')); return; }
    loc.disabled = true;
    navigator.geolocation.getCurrentPosition((p) => {
      details.map = 'https://maps.google.com/?q=' + p.coords.latitude.toFixed(6) + ',' + p.coords.longitude.toFixed(6);
      store.set('me', details); loc.disabled = false; drawLoc(tx('loc_ok'));
    }, () => { loc.disabled = false; drawLoc(tx('loc_fail')); }, { enableHighAccuracy: true, timeout: 10000 });
  });
  drawLoc();
  // the next 14 days that have delivery hours
  const days = [];
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); const iso = isoDay(d); const ts = timesOf(iso); if (ts && ts.length) days.push(iso); }
  if (!when.date || !days.includes(when.date)) when.date = days[0] || '';
  const daySel = h('select.o-in', days.map((d) => h('option', { value: d }, new Date(d + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-QA-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))));
  daySel.value = when.date;
  const timeSel = h('select.o-in');
  const fillTimes = () => {
    const ts = timesOf(daySel.value) || [];
    timeSel.replaceChildren(...(ts.length ? ts.map((t) => h('option', { value: t }, t)) : [h('option', { value: '' }, tx('no_time'))]));
    if (ts.includes(when.time)) timeSel.value = when.time; else when.time = ts[0] || '';
  };
  daySel.addEventListener('change', () => { when.date = daySel.value; fillTimes(); });
  timeSel.addEventListener('change', () => { when.time = timeSel.value; });
  fillTimes();
  const err = h('p.o-err');
  const go = () => {
    if (!String(details.name || '').trim()) { err.textContent = T[lang].err.customer_required; return name.focus(); }
    if (String(details.phone || '').replace(/\D/g, '').length < 8) { err.textContent = T[lang].err.online_phone_invalid; return phone.focus(); }
    if (!String(details.address || '').trim()) { err.textContent = T[lang].err.address_required; return address.focus(); }
    if (!when.date || !when.time) { err.textContent = T[lang].err.delivery_date_invalid; return; }
    step5();
  };
  frame([h('h2.o-title', tx('s4')), h('div.o-form',
      h('div.o-field', h('label', tx('name')), name), h('div.o-field', h('label', tx('phone')), phone),
      h('div.o-field', h('label', tx('address')), address, loc, locMsg),
      h('div.o-row', h('div.o-field', h('label', tx('date')), daySel), h('div.o-field', h('label', tx('time')), timeSel)),
      h('p.o-pay', '💵 ' + tx('pay')), err)],
    [h('button.o-btn.sec', { type: 'button', onclick: step3 }, tx('back')), h('div.o-bar-info'), h('button.o-btn', { type: 'button', onclick: go }, tx('next'))]);
}

// ---------- 5. the review: the lines, the fees, the total, the terms
let clientId = store.get('cid', '') || newId();
function newId() { const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)); store.set('cid', id); return id; }
function step5() {
  step = 5; current = step5;
  const lines = items().filter((i) => cart[i.id]);
  const fees = (cat.cfg.fees || []).map((f) => ({ ...f, n: f.per === 'tray' ? trays() : 1 })).map((f) => ({ ...f, total: f.amount * f.n })).filter((f) => f.total > 0);
  const feeSum = fees.reduce((s, f) => s + f.total, 0), deposit = fees.filter((f) => f.refundable).reduce((s, f) => s + f.total, 0);
  const days = cat.cfg.return_days || 0;
  const terms = String((lang === 'ar' ? cat.cfg.terms_ar : cat.cfg.terms_en) || cat.cfg.terms_ar || '').trim() || tx('terms_def', { n: days });
  const agree = h('input', { type: 'checkbox' });
  const err = h('p.o-err');
  const btn = h('button.o-btn', { type: 'button', onclick: send, disabled: true }, tx('send'));
  agree.addEventListener('change', () => { btn.disabled = !agree.checked; if (agree.checked) err.textContent = ''; });
  async function send() {
    if (!agree.checked) { err.textContent = T[lang].err.online_terms_required; return; }
    btn.disabled = true; btn.classList.add('busy'); btn.textContent = tx('sending'); err.textContent = '';
    try {
      const r = await api('online.order', { client_id: clientId, from, name: details.name, phone: details.phone, address: details.address, map: details.map,
        date: when.date, time: when.time, note, lines: lines.map((i) => ({ id: i.id, qty: cart[i.id] })), terms: true, pay: 'delivery' });
      const mine = store.get('orders', []);
      if (r.token) mine.unshift({ no: r.no, token: r.token, date: when.date, time: when.time, total: r.total });
      // what the order looks like now, so following it opens at once (the server's answer replaces it)
      if (r.token) store.set('t.' + r.no, { no: r.no, status: 'new', reason: '', date: when.date, time: when.time, whatsapp: cat.cfg.whatsapp,
        lines: lines.map((i) => ({ qty: cart[i.id], name: i.name, name_ar: i.name_ar, price: i.price })), fees: fees.map((f) => ({ ...f, qty: f.n })), total: r.total });
      store.set('orders', mine.slice(0, 30));
      cart = {}; saveCart(); note = ''; store.set('note', ''); clientId = newId();
      done(r);
    } catch (e) {
      err.textContent = errText(e); btn.disabled = false; btn.classList.remove('busy'); btn.textContent = tx('send');
      if (e.code === 'online_item_gone') loadCatalog().catch(() => {});
    }
  }
  frame([h('h2.o-title', tx('s5')),
    h('div.o-box', h('div.o-lines',
      lines.map((i) => h('div.o-line', h('span', cart[i.id] + ' × ' + nameOf(i)), h('span', money(cart[i.id] * i.price)))),
      h('div.o-line.sub', h('span', tx('goods')), h('span', money(goods()))),
      fees.map((f) => h('div.o-line.sub', h('span', (lang === 'ar' ? f.name_ar || f.name_en : f.name_en || f.name_ar) + (f.n > 1 ? ' × ' + f.n : '')), h('span', money(f.total)))),
      h('div.o-line.total', h('span', tx('total')), h('span', money(goods() + feeSum))))),
    deposit ? h('p.o-sub', tx('deposit_note', { d: deposit, n: days })) : '',
    note ? h('div.o-box', h('b', tx('your_note')), h('div', note)) : '',
    h('div.o-box', h('b', details.name), h('div', details.address), h('div', { dir: 'ltr', style: 'text-align:start' }, details.phone),
      h('div', '⏰ ', h('bdi', { dir: 'ltr' }, when.date + ' ' + when.time))),
    h('h3', tx('terms_title')), h('div.o-terms', terms),
    h('label.o-check', agree, h('span', tx('agree'))), h('p.o-pay', '💵 ' + tx('pay')), err],
    [h('button.o-btn.sec', { type: 'button', onclick: step4 }, tx('back')), h('div.o-bar-info', h('b', money(goods() + feeSum))), btn]);
}

function done(r) {
  current = () => done(r);
  frame(h('div.o-done', h('div.o-check-big', '✓'), h('h2.o-title', tx('done')), h('p.o-sub', tx('done_sub')), h('div.o-no', r.no),
    h('button.o-btn.block', { type: 'button', onclick: () => track(store.get('orders', []).find((x) => x.no === r.no)) }, tx('follow')),
    h('button.o-btn.ghost', { type: 'button', onclick: () => { step = 1; step1(); } }, tx('new_order'))), null, false);
}

// ---------- following an order, and the orders sent from this phone
const STAGES = ['new', 'accepted', 'out', 'delivered'];
const FINAL = ['delivered', 'rejected', 'cancelled'];
// the last answer for each order is kept: the order shows at once, and is read again in the background
const lastTrack = (no) => store.get('t.' + no, null);
function keepTrack(t) {
  store.set('t.' + t.no, t);
  const mine = store.get('orders', []);
  const m = mine.find((x) => x.no === t.no);
  if (m && m.status !== t.status) { m.status = t.status; store.set('orders', mine); }
}
let tracking = null, trackTimer = null;
function trackScreen() { track(tracking); }
async function track(o, fresh) {
  if (!o) return showMine();
  tracking = o; current = trackScreen;
  clearInterval(trackTimer);
  const t = lastTrack(o.no);
  if (t) drawTrack(o, t, true); else frame(h('div.o-skel', [1, 2, 3].map(() => h('span.o-shimmer'))), null, false);
  const read = async () => {
    try {
      const n = await api('online.track', { token: o.token });
      keepTrack(n);
      if (current === trackScreen && tracking === o) drawTrack(o, n, false);
      if (FINAL.includes(n.status)) clearInterval(trackTimer);
    } catch (e) {
      if (current !== trackScreen || tracking !== o) return;
      if (lastTrack(o.no)) { const u = root.querySelector('.o-upd'); if (u) u.textContent = errText(e); }
      else frame([h('p.o-err', errText(e)), h('button.o-btn.sec', { type: 'button', onclick: () => track(o) }, tx('refresh'))], null, false);
    }
  };
  if (fresh !== false) read();
  // while the page is open: read again every 30 seconds until it is done
  trackTimer = setInterval(() => {
    if (current !== trackScreen || tracking !== o) return clearInterval(trackTimer);
    if (document.visibilityState === 'visible') read();
  }, 30000);
}
function drawTrack(o, t, stale) {
  const at = STAGES.indexOf(t.status);
  const bad = t.status === 'rejected' || t.status === 'cancelled';
  const wa = t.whatsapp ? 'https://wa.me/974' + t.whatsapp + '?text=' + encodeURIComponent(tx('order_no') + ' ' + t.no) : '';
  frame([h('h2.o-title', tx('order_no') + ' ', h('span', { dir: 'ltr' }, t.no)), h('p.o-sub', tx('when') + ': ', h('bdi', { dir: 'ltr' }, t.date + ' ' + t.time),
      h('small.o-upd', stale ? ' · ' + tx('updating') : '')),
    bad ? h('div.o-bad', tx('st_' + t.status), t.reason && t.reason !== 'customer' ? h('div', tx('reason') + ': ' + t.reason) : '')
      : h('div.o-track', STAGES.map((s, i) => h('div.o-st', { class: i < at ? 'done' : i === at ? 'now' : '' }, h('span.o-dot', i < at ? '✓' : ''),
        h('div', h('b', tx('st_' + s)), s === 'new' && i === at ? h('small', tx('st_new_sub')) : '')))),
    h('div.o-box', h('div.o-lines', t.lines.map((l) => h('div.o-line', h('span', l.qty + ' × ' + nameOf(l)), h('span', money(l.qty * l.price)))),
      t.fees.map((f) => h('div.o-line.sub', h('span', (lang === 'ar' ? f.name_ar || f.name_en : f.name_en || f.name_ar) + (f.qty > 1 ? ' × ' + f.qty : '')), h('span', money(f.total)))),
      h('div.o-line.total', h('span', tx('total')), h('span', money(t.total))))),
    h('div.o-form', wa && !FINAL.includes(t.status) ? h('a.o-btn.wa.block', { href: wa, target: '_blank', rel: 'noopener' }, '💬 ' + tx('wa')) : '',
      t.status === 'new' ? h('button.o-btn.ghost.block.o-cancel', { type: 'button', onclick: async (e) => {
        const b = e.currentTarget;
        if (!(await ask(tx('cancel_q'), tx('yes'), tx('no')))) return;
        b.disabled = true; b.textContent = tx('cancelling');
        try { const r = await api('online.cancel', { token: o.token }); keepTrack(Object.assign({}, t, { status: r.status || 'cancelled', reason: 'customer' })); drawTrack(o, lastTrack(o.no), false); }
        catch (ex) { toast(errText(ex), true); b.disabled = false; b.textContent = tx('cancel'); }
      } }, tx('cancel')) : '',
      h('button.o-btn.sec.block', { type: 'button', onclick: () => { step = 1; step1(); } }, tx('home')))], null, false);
}
function showMine() {
  current = showMine;
  const mine = store.get('orders', []);
  frame([h('h2.o-title', tx('mine')), mine.length ? h('div.o-mine', mine.map((o) => { const st = o.status || (lastTrack(o.no) || {}).status || 'new';
    return h('button', { type: 'button', onclick: () => track(o) },
      h('span', h('b', { dir: 'ltr' }, o.no), ' ', h('span.o-pill', { class: st }, tx('st_' + st)), h('br'), h('small', h('bdi', { dir: 'ltr' }, o.date + ' ' + o.time))),
      h('span.o-mine-total', money(o.total), h('span.o-chev', lang === 'ar' ? '‹' : '›'))); }))
    : h('p.o-sub', tx('no_orders')), h('button.o-btn.sec.block', { type: 'button', onclick: () => { step = 1; step1(); } }, tx('home'))], null, false);
}

// ---------- start: from the phone's copy at once, then what changed
async function start() {
  applyLang();
  if (params.get('track')) { const o = store.get('orders', []).find((x) => x.no === params.get('track')); if (o) { track(o); return; } }
  if (cat) { step1(); prefetchPhotos(); } else frame([h('div.o-skel-title', h('span.o-shimmer')), h('div.o-grid', [1, 2, 3, 4].map(() => h('div.o-card', h('div.o-ph', h('span.o-shimmer')), h('div.o-card-b', h('span.o-shimmer.line'), h('span.o-shimmer.line.short')))))], null, true);
  try {
    const changed = await loadCatalog();
    if (changed || !current) { render(); prefetchPhotos(); }
  } catch (e) {
    if (!cat) frame([h('p.o-err', errText(e)), h('button.o-btn', { type: 'button', onclick: start }, tx('refresh'))], null, false);
  }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
start();
