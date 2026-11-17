// The drivers on the road on a map (distribution and the admin: every driver; a branch manager: the drivers coming
// to their shops). Leaflet with OpenStreetMap's map, loaded only when the map is opened; read again every 20 s.
import { call } from './api.js';
import { t, errText } from './i18n.js';
import { h } from './ui.js';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
let loading = null;
function loadLeaflet() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.append(css);
    const s = document.createElement('script'); s.src = LEAFLET + 'leaflet.min.js'; s.onload = resolve; s.onerror = () => { loading = null; reject(new Error('map')); };
    document.head.append(s);
  });
  return loading;
}
const ago = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(String(iso).length === 19 ? iso + '+03:00' : iso)) / 1000));
  return s < 60 ? t('dm_ago_s', { n: s }) : s < 3600 ? t('dm_ago_m', { n: Math.round(s / 60) }) : t('dm_ago_h', { n: Math.round(s / 360) / 10 });
};

/** Draws the map in `box` and keeps it fresh while it is on the screen. Returns nothing; stops by itself. */
export function driverMap(box, opts = {}) {
  const canvas = h('div.dm-canvas');
  const list = h('div.dm-list');
  box.replaceChildren(canvas, list);
  let map = null;
  const marks = {};
  const draw = (d) => {
    const drivers = d.drivers || [];
    if (opts.onCount) opts.onCount(drivers.length);
    list.replaceChildren(...(drivers.length ? drivers.map((x) => h('div.dm-row', { onclick: () => { if (map && x.pos) map.setView([x.pos.lat, x.pos.lng], 15); } },
      h('div.dm-who', h('b', '🚚 ', h('bdi', x.name)), x.vehicle ? h('span.muted', ' · ' + x.vehicle) : '',
        h('small', { class: x.pos ? '' : 'dm-none' }, x.pos ? t('dm_last', { t: ago(x.pos.at) }) : t('dm_no_pos'))),
      h('div.dm-stops', x.trips.map((tr) => h('div', h('span.muted', tr.trip_id + ': '),
        tr.stops.map((s, i) => h('span', { class: 'dm-stop' + (s.delivered ? ' done' : '') }, (i ? ' ← ' : ''), (s.delivered ? '✓ ' : ''), h('bdi', s.shop))))),
        x.online.length ? h('div', h('span.muted', t('dm_customers') + ': '), x.online.join('، ')) : '')))
      : [h('p.empty', t(opts.empty || 'dm_none'))]));
    if (!drivers.some((x) => x.pos)) { canvas.hidden = true; return; }
    canvas.hidden = false;
    loadLeaflet().then(() => {
      const L = window.L;
      if (!map) {
        map = L.map(canvas, { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      }
      const seen = {};
      const pts = [];
      drivers.filter((x) => x.pos).forEach((x) => {
        seen[x.id] = true;
        const p = [x.pos.lat, x.pos.lng];
        pts.push(p);
        const label = '<span class="dm-pin">🚚</span><span class="dm-tag">' + String(x.name).replace(/[<>&]/g, '') + '</span>';
        if (marks[x.id]) marks[x.id].setLatLng(p);
        else marks[x.id] = L.marker(p, { icon: L.divIcon({ html: label, className: 'dm-mark', iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(map);
      });
      Object.keys(marks).forEach((id) => { if (!seen[id]) { map.removeLayer(marks[id]); delete marks[id]; } });
      if (!map._fitted && pts.length) { map.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 14 }); map._fitted = true; }
      setTimeout(() => map.invalidateSize(), 50);
    }).catch(() => { canvas.replaceChildren(h('p.empty', t('dm_map_fail'))); });
  };
  const load = () => call('trips.map').then((d) => { if (box.isConnected) draw(d); }).catch((e) => { if (box.isConnected && !list.children.length) list.replaceChildren(h('p.empty', errText(e))); });
  list.replaceChildren(h('p.empty', '…'));
  load();
  const timer = setInterval(() => { if (!box.isConnected) { clearInterval(timer); return; } if (document.visibilityState === 'visible') load(); }, 20000);
}
