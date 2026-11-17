// The driver's position while delivering (a trip of shop orders that left, or a customer's order on its way):
// sent to the server every 20 seconds while the app is open (a web page cannot share its position from the
// background). The server says when there is nothing to share any more, and it stops.
import { call } from './api.js';

let watch = null, last = 0, onState = null;

export const Gps = {
  get on() { return watch !== null; },
  /** Called when something may have started a delivery; the server decides whether to keep sharing. */
  start() {
    if (watch !== null || !navigator.geolocation) return;
    watch = navigator.geolocation.watchPosition((p) => {
      if (Date.now() - last < 20000) return;
      last = Date.now();
      call('online.where', { lat: p.coords.latitude, lng: p.coords.longitude })
        .then((r) => { if (!r.sharing) Gps.stop(); }).catch(() => { /* offline: the next position tries again */ });
    }, () => { Gps.stop(); if (onState) onState('denied'); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    if (onState) onState('on');
  },
  stop() {
    if (watch === null) return;
    navigator.geolocation.clearWatch(watch);
    watch = null;
    if (onState) onState('off');
  },
  /** The screen showing the sharing line follows its state ('on' | 'off' | 'denied'). */
  onChange(fn) { onState = fn; },
};
