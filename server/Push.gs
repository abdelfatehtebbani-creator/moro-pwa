/**
 * Push.gs – phone / computer notifications through Firebase Cloud Messaging, even with the app closed.
 *
 * A device subscribes after sign-in (push.register) and is kept in PushDevices; signing out removes it.
 * The Firebase service account (a JSON key) is a secret: it is kept in Script Properties
 * (FCM_SERVICE_ACCOUNT), set by the spreadsheet owner from the MORO menu, never in code or chat.
 * Without it push is simply off. Sending never breaks the operation that triggered it.
 */
var FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
var FCM_PROPERTY = 'FCM_SERVICE_ACCOUNT';
var PUSH_MAX_DEVICES = 10;

var Push = {
  configured: function () {
    return !!PropertiesService.getScriptProperties().getProperty(FCM_PROPERTY);
  },

  /** p: {token, device, lang} – this device now receives the signed-in user's notifications, in its language. */
  register: function (session, p) {
    var token = Push.token(p.token);
    var device = Util.clean(p.device).slice(0, 120);
    var lang = p.lang === 'en' ? 'en' : 'ar';
    return withLock(function () {
      var now = Util.nowIso();
      var cur = Repo.find('PushDevices', 'token', token);
      if (cur) {
        // a shared device signed in with another account moves to that account
        Repo.update('PushDevices', 'token', token, { user_id: session.user_id, device: device, seen_at: now, revoked_at: '', last_error: '', lang: lang });
        return { subscribed: true };
      }
      // the oldest devices of a user give way when there are too many
      var mine = Repo.all('PushDevices').filter(function (d) { return d.user_id === session.user_id && !d.revoked_at; })
        .sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
      mine.slice(0, Math.max(0, mine.length - PUSH_MAX_DEVICES + 1)).forEach(function (d) {
        Repo.update('PushDevices', 'token', d.token, { revoked_at: now, last_error: 'replaced' });
      });
      var n = 0;
      Repo.column('PushDevices', 'device_id').forEach(function (v) { n = Math.max(n, Number(String(v).slice(1)) || 0); });
      Repo.append('PushDevices', [{ device_id: 'D' + Util.pad(n + 1, 4), user_id: session.user_id, token: token, device: device,
        created_at: now, seen_at: now, lang: lang }]);
      return { subscribed: true };
    });
  },

  /** p: {token} – on sign-out; only the owner's own device. */
  unregister: function (session, p) {
    var token = Push.token(p.token);
    return withLock(function () {
      var d = Repo.find('PushDevices', 'token', token);
      if (d && d.user_id === session.user_id && !d.revoked_at) Repo.update('PushDevices', 'token', token, { revoked_at: Util.nowIso() });
      return { subscribed: false };
    });
  },

  /**
   * Sends {ar: {title, body}, en: {title, body}, page, badge} to every active device of the given users,
   * each in the language of the app on that device. Never throws. Returns the number of devices reached.
   */
  toUsers: function (userIds, msg) {
    try {
      if (!userIds.length || !Push.configured()) return 0;
      var devices = Repo.all('PushDevices').filter(function (d) { return !d.revoked_at && userIds.indexOf(d.user_id) >= 0; });
      if (!devices.length) return 0;
      var now = Util.nowIso(), sent = 0;
      ['ar', 'en'].forEach(function (lang) {
        var group = devices.filter(function (d) { return (d.lang === 'en' ? 'en' : 'ar') === lang; });
        if (!group.length) return;
        var text = msg[lang] || msg.ar || msg;
        var data = { title: String(text.title || '').slice(0, 120), body: String(text.body || '').slice(0, 240), page: msg.page || '',
                     badge: String(msg.badge || 0) };
        FcmSender.sendAll(group.map(function (d) { return d.token; }), data).forEach(function (r, i) {
          var d = group[i];
          if (r.ok) { sent++; Repo.update('PushDevices', 'token', d.token, { last_sent_at: now, last_error: '' }); }
          else Repo.update('PushDevices', 'token', d.token, r.unregistered ? { revoked_at: now, last_error: r.error } : { last_error: r.error });
        });
      });
      return sent;
    } catch (e) {
      console.error('push failed ' + (e && e.stack || e));
      return 0;
    }
  },

  /** Active users holding a permission (e.g. who approves LPOs). */
  usersWith: function (perm) {
    return Repo.all('Users').filter(function (u) { return u.active === true && Perm.permsOf(u).indexOf(perm) >= 0; })
      .map(function (u) { return u.user_id; });
  },

  token: function (v) {
    var t = String(v || '');
    Util.require(t && t.length <= 4096 && /^[A-Za-z0-9_:\-.]+$/.test(t), 'token_invalid');
    return t;
  }
};

/** The only code that talks to Firebase Cloud Messaging (HTTP v1, OAuth token from the service account). */
var FcmSender = {
  /** One data message per token. Returns [{ok, unregistered, error}] in the same order. Never throws. */
  sendAll: function (tokens, data) {
    var account, access;
    try {
      account = FcmSender.account();
      access = FcmSender.accessToken(account);
    } catch (e) {
      console.error('push not sent: ' + (e && e.message || e));
      return tokens.map(function () { return { ok: false, unregistered: false, error: 'AUTH' }; });
    }
    var url = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(account.project_id) + '/messages:send';
    var requests = tokens.map(function (token) {
      return { url: url, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + access },
        payload: JSON.stringify({ message: { token: token, data: data, webpush: { headers: { Urgency: 'high', TTL: '604800' } } } }) };
    });
    var responses;
    try { responses = UrlFetchApp.fetchAll(requests); }
    catch (e) {
      console.error('push request failed ' + (e && e.message || e));
      return tokens.map(function () { return { ok: false, unregistered: false, error: 'NETWORK' }; });
    }
    return responses.map(function (res) {
      var code = res.getResponseCode();
      if (code === 200) return { ok: true, unregistered: false, error: '' };
      var text = res.getContentText() || '';
      // the device unsubscribed or the token expired
      return { ok: false, unregistered: code === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(text), error: 'HTTP ' + code };
    });
  },

  account: function () {
    var a = JSON.parse(PropertiesService.getScriptProperties().getProperty(FCM_PROPERTY) || '{}');
    if (!a.client_email || !a.private_key || !a.project_id) throw new Error('FCM service account incomplete');
    return a;
  },

  /** OAuth access token from a service-account JWT (RS256), kept 50 minutes. */
  accessToken: function (a) {
    var cache = CacheService.getScriptCache();
    var hit = cache.get('fcm_access');
    if (hit) return hit;
    var now = Math.floor(Date.now() / 1000);
    var aud = a.token_uri || 'https://oauth2.googleapis.com/token';
    var b64 = function (v) { return Utilities.base64EncodeWebSafe(v).replace(/=+$/, ''); };
    var input = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
      b64(JSON.stringify({ iss: a.client_email, scope: FCM_SCOPE, aud: aud, iat: now, exp: now + 3600 }));
    var jwt = input + '.' + b64(Utilities.computeRsaSha256Signature(input, a.private_key));
    var res = UrlFetchApp.fetch(aud, { method: 'post', muteHttpExceptions: true,
      payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt } });
    if (res.getResponseCode() !== 200) throw new Error('FCM token request failed: HTTP ' + res.getResponseCode());
    var token = JSON.parse(res.getContentText()).access_token;
    cache.put('fcm_access', token, 3000);
    return token;
  }
};

/** MORO menu: the spreadsheet owner pastes the Firebase service account key; it is checked, then kept. */
function setupPushFromSheet() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Phone notifications (Firebase)',
    'Paste the whole content of the service account key file (.json) from Firebase → Project settings → Service accounts → Generate new private key:',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var a;
  try { a = JSON.parse(r.getResponseText()); } catch (e) { ui.alert('This is not the content of the .json key file. Nothing was saved.'); return; }
  if (!a.client_email || !a.private_key || !a.project_id) { ui.alert('The key is incomplete. Nothing was saved.'); return; }
  try {
    CacheService.getScriptCache().remove('fcm_access');
    FcmSender.accessToken(a);
  } catch (e) {
    ui.alert('Firebase refused this key (' + (e && e.message || e) + '). Nothing was saved.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty(FCM_PROPERTY, JSON.stringify(a));
  Audit.log('sheet-owner', 'push_setup', 'Settings', 'push', null, { project_id: a.project_id });
  ui.alert('Done. Notifications are on for project "' + a.project_id + '".');
}
