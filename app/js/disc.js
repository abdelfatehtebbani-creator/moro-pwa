// The turning disc of the home screen: the company logo on the front, the app name on the back.
// CSS 3D only (perspective, preserve-3d, rotateY, backface-visibility, keyframes): the browser turns it
// on the GPU, with no JavaScript loop and nothing redrawn. Its look and speed: HOME_DISC in config.js.
import { HOME_DISC } from './config.js';
import { t } from './i18n.js';
import { h } from './ui.js';

const EDGE_LAYERS = 14; // stacked circles that give the disc its thickness

let sheet = null;
function styles() {
  if (!sheet) {
    sheet = new Promise((done) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/disc.css';
      link.onload = done;
      link.onerror = done;
      document.head.append(link);
    });
  }
  return sheet;
}

/** Puts the disc in `host`; returns the function that takes it away (and stops it). */
export function mountDisc(host) {
  let gone = false;
  // a hidden tab or a phone in the pocket: the disc stands still
  const onVisible = () => host.classList.toggle('paused', document.hidden);
  styles().then(() => {
    if (gone) return;
    const edge = Array.from({ length: EDGE_LAYERS }, (_, i) => h('i.disc-edge', { style: '--i:' + i / (EDGE_LAYERS - 1) }));
    host.replaceChildren(h('div.disc-scene', { style: '--turn:' + Number(HOME_DISC.secondsPerTurn || 14) + 's' },
      h('div.disc-shadow'),
      h('div.disc', edge,
        h('div.disc-face.disc-front', h('img', { src: HOME_DISC.logo, alt: '', decoding: 'async', draggable: 'false' })),
        h('div.disc-face.disc-back', h('b', t(HOME_DISC.nameKey)), h('small', t(HOME_DISC.taglineKey))))));
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    requestAnimationFrame(() => { if (!gone) host.classList.add('on'); });
  });
  return () => {
    gone = true;
    document.removeEventListener('visibilitychange', onVisible);
    host.classList.remove('on', 'paused');
    host.replaceChildren();
  };
}
