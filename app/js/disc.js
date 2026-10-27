// The turning disc of the home screen: the company logo on the front, the app name on the back.
// CSS 3D only (perspective, preserve-3d, rotateY, backface-visibility, keyframes): the browser turns it
// on the GPU, with no JavaScript loop and nothing redrawn. Its look and speed: HOME_DISC in config.js.
import { HOME_DISC } from './config.js';
import { t } from './i18n.js';
import { h } from './ui.js';

const EDGE_LAYERS = 14; // stacked circles that give the disc its thickness
const SVG = 'http://www.w3.org/2000/svg';

/**
 * Hour, minute and second hands behind the disc, on its centre, showing the device's time. Each hand turns
 * with a CSS animation (12 h, 1 h, 1 min) started at the current time through a negative delay: smooth,
 * no JavaScript loop. `sync` sets them again (when the tab comes back, the device clock may have moved).
 */
function clockHands() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'home-clock');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.setAttribute('aria-hidden', 'true');
  const hands = ['hour', 'minute', 'second'].map((k) => {
    const g = document.createElementNS(SVG, 'g');
    g.setAttribute('class', 'hand hand-' + k);
    const line = document.createElementNS(SVG, 'line');
    // a unit segment, placed and stretched in disc.css: from just outside the disc to the hand's tip
    line.setAttribute('x1', '0'); line.setAttribute('y1', '0'); line.setAttribute('x2', '0'); line.setAttribute('y2', '-1');
    g.append(line);
    svg.append(g);
    return g;
  });
  const sync = () => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() * 60 + s;
    const hr = (d.getHours() % 12) * 3600 + m;
    [hr, m, s].forEach((elapsed, i) => { hands[i].style.animationDelay = -elapsed + 's'; });
  };
  sync();
  return { svg, sync };
}

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
  let clock = null;
  const onVisible = () => { host.classList.toggle('paused', document.hidden); if (clock && !document.hidden) clock.sync(); };
  styles().then(() => {
    if (gone) return;
    const edge = Array.from({ length: EDGE_LAYERS }, (_, i) => h('i.disc-edge', { style: '--i:' + i / (EDGE_LAYERS - 1) }));
    clock = clockHands();
    host.replaceChildren(clock.svg, h('div.disc-scene', { style: '--turn:' + Number(HOME_DISC.secondsPerTurn || 14) + 's' },
      h('div.disc-shadow'),
      h('div.disc', edge,
        h('div.disc-face.disc-front', h('img', { src: HOME_DISC.logo, alt: '', decoding: 'async', draggable: 'false' })),
        h('div.disc-face.disc-back', h('b', t(HOME_DISC.nameKey)), h('small', t(HOME_DISC.taglineKey))))));
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    // the hands start turning once drawn: set to the exact time again then
    requestAnimationFrame(() => { if (!gone) { host.classList.add('on'); clock.sync(); } });
  });
  return () => {
    gone = true;
    document.removeEventListener('visibilitychange', onVisible);
    host.classList.remove('on', 'paused');
    host.replaceChildren();
  };
}
