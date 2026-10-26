// Phone / computer notifications (Firebase Cloud Messaging): this device gets a token from Firebase and
// gives it to the server, which sends to it when an LPO waits for approval or was decided – even with the
// app closed. The service worker (sw.js) shows the notification. Without FIREBASE in config.js push is off.
import { call } from './api.js';
import { FIREBASE } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const TOKEN_KEY = 'moro.push_token';
const read = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const write = (v) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.append(s);
  });
}

function deviceName() {
  const ua = navigator.userAgent;
  return /Android/.test(ua) ? 'Android' : isIos() ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Browser';
}

export const Push = {
  /** This browser can receive notifications (an iPhone only once the app is on the home screen). */
  supported() {
    return !!(FIREBASE && FIREBASE.vapidKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) &&
      (!isIos() || standalone());
  },
  /** 'on' | 'ask' (a tap can turn it on) | 'blocked' | 'off' (not available here). */
  state() {
    if (!this.supported()) return 'off';
    if (Notification.permission === 'granted') return read() ? 'on' : 'ask';
    return Notification.permission === 'denied' ? 'blocked' : 'ask';
  },

  /** Gets this device's token and gives it to the server. Needs the permission already granted. */
  async subscribe() {
    if (!window.firebase) {
      await loadScript(SDK + 'firebase-app-compat.js');
      await loadScript(SDK + 'firebase-messaging-compat.js');
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE);
    const registration = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey: FIREBASE.vapidKey, serviceWorkerRegistration: registration });
    if (!token) throw new Error('no token');
    await call('push.register', { token, device: deviceName() });
    write(token);
  },

  /** Tap on "Turn on notifications": asks the browser, then subscribes. Returns the new state. */
  async enable() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return this.state();
    await this.subscribe();
    return 'on';
  },

  /** After sign-in: a device that already allowed notifications keeps its token fresh. */
  refresh() {
    if (this.supported() && Notification.permission === 'granted') this.subscribe().catch(() => { /* push stays off; the app works */ });
  },

  /** Sign-out: this device stops receiving the user's notifications. */
  async signOut() {
    const token = read();
    write('');
    this.badge(0);
    if (token) await call('push.unregister', { token }).catch(() => {});
  },

  /** The number on the app icon (where the system supports it). */
  badge(n) {
    try {
      if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n);
      else if (navigator.clearAppBadge) navigator.clearAppBadge();
    } catch { /* badges are optional */ }
  },
};
