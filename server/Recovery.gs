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
    .addToUi();
}

var Recovery = {
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
