// Address of the Apps Script web app (server/). On localhost the app talks to the local
// development server (tests/devserver.js), which runs the same server code on test data.
const PROD_API = 'https://script.google.com/macros/s/AKfycbyVmnMLpT1Lv6vUlpKpuDT3-rwfk0DkQpMA_NSOO8B9KMSqvtO4sZb-TKY_MIPrzh3G/exec';
export const API_URL = ['localhost', '127.0.0.1'].includes(location.hostname) ? '/api' : PROD_API;
export const APP_VERSION = '0.9.4';
