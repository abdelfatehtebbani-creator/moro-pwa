// Photos of special order lines (server/Photos.gs): made small on the phone before they are sent,
// and shown on demand (a button with their number opens them).
import { call } from './api.js';
import { t, errText } from './i18n.js';
import { h, toast, dialog } from './ui.js';

const MAX = 380000;          // characters of the data URL, under the server's limit

/** A picked image file → a JPEG data URL, at most 1000 px on its long side. */
export function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let side = 1000, q = 0.7, out = '';
      do {
        const k = Math.min(1, side / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', q);
        side = Math.round(side * 0.8); q = Math.max(0.4, q - 0.1);
      } while (out.length > MAX && side > 200);
      out.length > MAX ? reject(new Error('photo_invalid')) : resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('photo_invalid')); };
    img.src = url;
  });
}

/** A button "Photos (n)" for saved photo ids and/or data URLs not sent yet; null when there are none. */
export function photoButton(ids, local) {
  const all = (ids || []).length + (local || []).length;
  if (!all) return null;
  return h('button.link', { type: 'button', onclick: async () => {
    let srcs = (local || []).slice();
    try { srcs = srcs.concat((await Promise.all((ids || []).map((id) => call('photos.get', { photo_id: id })))).map((x) => x.data)); }
    catch (e) { toast(errText(e), 'err'); return; }
    dialog((close) => [h('div.photo-view', srcs.map((s) => h('img', { src: s, alt: '' }))),
      h('div.actions', h('button.btn', { type: 'button', onclick: () => close() }, t('close')))]);
  } }, t('photos_n', { n: all }));
}
