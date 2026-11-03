/**
 * Photos.gs – the photos of special order lines (a birthday cake as the customer wants it…).
 *
 * The app sends each photo already made small (a JPEG data URL). It is kept in the Photos sheet, cut
 * in parts that fit a cell, so no Drive access is needed. OrderItems.photos holds the photo ids.
 */
var PHOTO_PART = 45000;
var PHOTO_MAX = 400000;

var Photos = {
  /** Saves data URLs (call inside the lock). Returns their ids. */
  add: function (session, orderId, list) {
    var now = Util.nowIso();
    return (list || []).map(function (d) {
      d = String(d || '');
      Util.require(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(d) && d.length <= PHOTO_MAX, 'photo_invalid');
      var id = 'PH' + Util.pad(Settings.next('seq_photo', 0), 6);
      var rows = [];
      for (var i = 0; i * PHOTO_PART < d.length; i++) {
        rows.push({ photo_id: id, order_id: orderId, part: i + 1, data: d.slice(i * PHOTO_PART, (i + 1) * PHOTO_PART), created_by: session.user_id, created_at: now });
      }
      Repo.append('Photos', rows);
      return id;
    });
  },

  /** p: {photo_id} → {photo_id, data}. */
  get: function (session, p) {
    var parts = Repo.all('Photos').filter(function (x) { return x.photo_id === String(p.photo_id || ''); })
      .sort(function (a, b) { return Number(a.part) - Number(b.part); });
    Util.require(parts.length, 'not_found');
    return { photo_id: parts[0].photo_id, data: parts.map(function (x) { return String(x.data); }).join('') };
  }
};
