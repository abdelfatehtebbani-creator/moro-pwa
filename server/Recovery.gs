/**
 * Recovery.gs – reset a forgotten PIN from the "MORO Data" spreadsheet.
 *
 * Only someone who can open and edit the spreadsheet (its Google account owner) sees the "MORO"
 * menu, so the Google sign-in is what proves the right to reset. The new PIN is typed by that
 * person in the dialog; it is stored hashed, like every PIN, and the reset is written to Audit.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('MORO')
    .addItem('Reset a user PIN', 'resetPinFromSheet')
    .addItem('Apply store changes made in the sheet', 'applyStoresFromSheet')
    .addItem('Create the Masar link key', 'newLinkKeyFromSheet')
    .addItem('Set up phone notifications (Firebase)', 'setupPushFromSheet')
    .addItem('Check for duplicate numbers', 'checkDuplicatesFromSheet')
    .addToUi();
}

// the keys that must be unique in each sheet (several columns: unique together)
var UNIQUE_KEYS = [
  ['Items', ['item_id']], ['Parties', ['party_id']], ['Locations', ['location_id']], ['Purposes', ['purpose_id']],
  ['Movements', ['movement_id']], ['Balances', ['item_id']], ['Requests', ['request_id']], ['RequestLines', ['request_id', 'line_no']],
  ['ShopOrderLines', ['line_id']], ['SpecialRequests', ['request_id']], ['Users', ['user_id']], ['Users', ['username']],
  ['Counts', ['count_id']], ['LPOs', ['lpo_id']], ['LPOs', ['lpo_no']], ['LPOLines', ['lpo_id', 'line']], ['CashSheets', ['sheet_id']],
  ['CashFloat', ['entry_id']], ['CoffeeBatches', ['batch_id']], ['Audit', ['audit_id']],
  ['Orders', ['order_id']], ['Orders', ['order_no']], ['OrderItems', ['order_id', 'line_no']], ['Trips', ['trip_id']],
  ['TripStops', ['trip_id', 'order_id']], ['Invoices', ['invoice_id']], ['Invoices', ['invoice_no']], ['Invoices', ['order_id']],
  ['InvoiceItems', ['invoice_id', 'line_no']], ['Returns', ['return_id']]
];

var Recovery = {
  /**
   * Reads every sheet and lists the values used more than once where they must be unique.
   * Changes nothing. Returns [{sheet, key, value, rows: [sheet row numbers], status: [status of each row]}].
   */
  duplicates: function () {
    var out = [];
    UNIQUE_KEYS.forEach(function (u) {
      var rows;
      try { rows = Repo.all(u[0]); } catch (e) { return; }          // a sheet this copy does not have yet
      var seen = {};
      rows.forEach(function (r, i) {
        var v = u[1].map(function (c) { return String(r[c] === undefined ? '' : r[c]).trim(); });
        if (v.every(function (x) { return x === ''; })) return;     // an empty row
        var k = v.join(' / ');
        (seen[k] = seen[k] || []).push({ row: i + 2, status: r.status === undefined ? '' : String(r.status) });
      });
      Object.keys(seen).forEach(function (k) {
        if (seen[k].length < 2) return;
        out.push({ sheet: u[0], key: u[1].join(' + '), value: k,
          rows: seen[k].map(function (x) { return x.row; }), status: seen[k].map(function (x) { return x.status; }) });
      });
    });
    return out;
  },

  /** Sets a new PIN for a user, re-activates the account and lifts a login lock. Returns the user. */
  resetPin: function (username, pin) {
    var name = Util.clean(username).toLowerCase();
    var u = Repo.find('Users', 'username', name);
    Util.require(u, 'not_found', name);
    Auth.checkPinFormat(pin);
    return withLock(function () {
      Auth.setPin(u.user_id, String(pin));
      if (u.active !== true) Repo.update('Users', 'user_id', u.user_id, { active: true });
      CacheService.getScriptCache().remove('login_fail_' + name);
      Audit.log('sheet-owner', 'pin_reset_owner', 'Users', u.user_id, null, null);
      return Auth.publicUser(Repo.find('Users', 'user_id', u.user_id));
    });
  }
};

function checkDuplicatesFromSheet() {
  var ui = SpreadsheetApp.getUi();
  try {
    var d = Recovery.duplicates();
    if (!d.length) { ui.alert('Check for duplicate numbers', 'No duplicates: every number is used once. Nothing was changed.', ui.ButtonSet.OK); return; }
    var text = d.slice(0, 40).map(function (x) {
      var st = x.status.some(function (s) { return s; }) ? ' (status: ' + x.status.map(function (s) { return s || '-'; }).join(', ') + ')' : '';
      return x.sheet + ' · ' + x.key + ' = ' + x.value + ' · rows ' + x.rows.join(', ') + st;
    }).join('\n');
    if (d.length > 40) text += '\n... and ' + (d.length - 40) + ' more';
    ui.alert('Check for duplicate numbers', d.length + ' value(s) used more than once. Nothing was changed.\n\n' + text, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Not checked: ' + (e && e.code ? e.code : e));
  }
}

function applyStoresFromSheet() {
  var ui = SpreadsheetApp.getUi();
  try {
    var n = Stores.applySheetEdits();
    ui.alert('Done. Stores are now in use on every device (' + n.items + ' item and ' + n.locations + ' location cells corrected).');
  } catch (e) {
    ui.alert('Not applied: ' + (e && e.code ? e.code : e));
  }
}

function newLinkKeyFromSheet() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert('Create the Masar link key', 'A new key replaces the old one: Masar stops reaching MORO until it gets the new key. Continue?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  ui.alert('Masar link key', 'Copy this key into Masar (Script Properties → MORO_LINK_KEY):\n\n' + Link.newSecret(), ui.ButtonSet.OK);
}

function resetPinFromSheet() {
  var ui = SpreadsheetApp.getUi();
  var users = Repo.all('Users').map(function (u) { return u.username + ' (' + u.display_name + ')'; }).join('\n');
  var a = ui.prompt('Reset a user PIN', 'Username:\n' + users, ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var b = ui.prompt('Reset a user PIN', 'New PIN for "' + a.getResponseText().trim() + '" (4 to 8 digits):', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  var c = ui.prompt('Reset a user PIN', 'Type the new PIN again:', ui.ButtonSet.OK_CANCEL);
  if (c.getSelectedButton() !== ui.Button.OK) return;
  if (b.getResponseText().trim() !== c.getResponseText().trim()) { ui.alert('The two PINs are different. Nothing was changed.'); return; }
  try {
    var u = Recovery.resetPin(a.getResponseText(), b.getResponseText().trim());
    ui.alert('Done. ' + u.display_name + ' can sign in with the new PIN. Other devices of this user will ask to sign in again.');
  } catch (e) {
    var why = { not_found: 'No user with this username.', pin_format: 'The PIN must be 4 to 8 digits.', busy: 'The system is busy. Try again.' };
    ui.alert((e && why[e.code]) || 'Not changed: ' + (e && e.code ? e.code : e));
  }
}
