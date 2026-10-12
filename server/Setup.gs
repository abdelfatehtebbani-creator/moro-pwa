/**
 * Setup.gs – creates the database sheets (safe to run again: existing sheets and data are kept).
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#16263f').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    } else {
      // columns added in a later version are appended to the right of the existing header
      var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      cols.forEach(function (c) {
        if (head.indexOf(c) < 0) {
          head.push(c);
          sh.getRange(1, head.length).setValue(c).setFontWeight('bold').setBackground('#16263f').setFontColor('#ffffff');
        }
      });
      cols = head;
    }
    cols.forEach(function (c, i) {
      if (TEXT_COLUMNS.indexOf(c) >= 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
  // remove the empty default sheet created with the spreadsheet
  ['Sheet1', 'ورقة1', 'Feuille 1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
}
