/**
 * Vehicles.gs – the company's vehicles, chosen when a trip is prepared (the driver's last one first).
 */
var VEHICLES_SEED = [
  ['931287', 'HYUNDAI I-10'], ['931088', 'HYUNDAI I-10'], ['931092', 'HYUNDAI I-10'], ['931096', 'HYUNDAI I-10'], ['41635', 'NISSAN URVAN'],
  ['317626', 'HYUNDAI HD65'], ['317627', 'HYUNDAI HD65'], ['28156', 'HYUNDAI HD65'], ['311292', 'HYUNDAI HD65'], ['311293', 'HYUNDAI HD66'],
  ['311294', 'HYUNDAI COUNTY'], ['247045', 'NISSAN AORVAN'], ['71211', 'NISSAN URVAN'], ['60386', 'RENAULT DOKKER'], ['15066', 'CMC'],
  ['291783', 'TOYOTA COASTER'], ['551360', 'NISSAN SENTRA'], ['096014', 'NISSAN SUNNY'], ['553283', 'MITSUBISHI LANCER'], ['531589', 'SUZUKI GRAND VITAR'],
  ['216076', 'HYUNDAI COUNTY'], ['311776', 'CHEVROLET EXPRESS'], ['311782', 'CHEVROLET EXPRESS'], ['254047', 'MITSUBISHI 200L'], ['254048', 'MITSUBISHI 200L'],
  ['652209', 'SUZUKI GRAND VITAR'], ['69603', 'ANHUI HELI MACHINEY'], ['73484', 'PROBST'], ['417497', 'MITSUBISHI LANCER'], ['338965', ''],
  ['517346', 'NISSAN SUNNY']
];

var Vehicles = {
  /** The list given by the company, once (when the table is empty). */
  seed: function () {
    if (Repo.all('Vehicles').length) return;
    Repo.append('Vehicles', VEHICLES_SEED.map(function (v) { return { plate: v[0], model: v[1], active: true, created_at: Util.nowIso() }; }));
  },

  /** p: {plate, model, active, old_plate?}: added, or changed (its plate too, given the old one). Trips keep the plate they had. */
  save: function (session, p) {
    var plate = Util.clean(p.plate).toUpperCase();
    Util.require(plate, 'vehicle_required');
    return withLock(function () {
      var old = Util.clean(p.old_plate).toUpperCase();
      var cur = Repo.find('Vehicles', 'plate', old || plate);
      if (old && old !== plate) Util.require(!Repo.find('Vehicles', 'plate', plate), 'vehicle_exists', plate);
      var row = { model: Util.clean(p.model).toUpperCase(), active: p.active !== false };
      if (cur && old && old !== plate) row.plate = plate;
      if (cur) Repo.update('Vehicles', 'plate', old || plate, row);
      else Repo.append('Vehicles', [Object.assign({ plate: plate, created_at: Util.nowIso() }, row)]);
      Audit.log(session.user_id, 'vehicle_save', 'Vehicles', plate, cur ? { model: cur.model, active: cur.active } : null, row);
      return { plate: plate, version: Version.bump() };
    });
  }
};
