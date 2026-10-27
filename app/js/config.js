// Address of the Apps Script web app (server/). On localhost the app talks to the local
// development server (tests/devserver.js), which runs the same server code on test data.
const PROD_API = 'https://script.google.com/macros/s/AKfycbyVmnMLpT1Lv6vUlpKpuDT3-rwfk0DkQpMA_NSOO8B9KMSqvtO4sZb-TKY_MIPrzh3G/exec';
export const API_URL = ['localhost', '127.0.0.1'].includes(location.hostname) ? '/api' : PROD_API;
export const APP_VERSION = '0.8.36';

// The home screen's turning disc: the logo on its front, the app name and its line (i18n keys) on its back,
// and the seconds it takes to turn once.
export const HOME_DISC = { logo: 'icons/logo.png', nameKey: 'app_name', taglineKey: 'app_sub', secondsPerTurn: 14 };
// Firebase web config and the public VAPID key, for phone / computer notifications (public by design;
// the secret service-account key is kept in the server's Script Properties). null = notifications off.
export const FIREBASE = {
  apiKey: 'AIzaSyAfVDvdNrXo8Ewa6pB4KTs_9vQEpVcle8A',
  authDomain: 'moro-6b92f.firebaseapp.com',
  projectId: 'moro-6b92f',
  storageBucket: 'moro-6b92f.firebasestorage.app',
  messagingSenderId: '745158233810',
  appId: '1:745158233810:web:86196e8534f7e9471aa70b',
  vapidKey: 'BGxyyy10bsBEd4SJzrZmNvT-uxd6fy9AlezX7Q0_H6QofTG7hliUVXxWG4oicTxm1A0gmYZREO-fmpCzS6inFiM', // Cloud Messaging → Web Push certificates (public)
};
