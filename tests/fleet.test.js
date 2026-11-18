'use strict';
// The vehicles day to day: the driver records a check, a refill, a fault on a vehicle; the car park manager
// sees each vehicle's figures and the open problems, and closes them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas');

test('fleet: the driver records on a vehicle; the car park manager follows and closes the problems', () => {
  const g = createGas();
  g.api('auth.setup', { username: 'admin', display_name: 'Admin', pin: '1234' });
  const admin = g.api('auth.login', { username: 'admin', pin: '1234' }).data.token;
  const user = (username, role) => { g.api('users.save', { username, display_name: username, role, pin: '5678' }, admin); return g.api('auth.login', { username, pin: '5678' }).data.token; };
  const drv = user('drv1', 'driver');
  const mgr = user('fleet1', 'fleet');
  g.api('vehicles.save', { plate: 'Q100', model: 'HD65' }, admin);
  assert.equal(g.api('fleet.add', { kind: 'fuel', plate: 'Q100', odometer: 1000, data: { liters: 40, amount: 80 } }, mgr).error.code, 'forbidden', 'the manager follows, the driver records');
  assert.equal(g.api('fleet.add', { kind: 'check', plate: 'NOPE', odometer: 1000 }, drv).error.code, 'vehicle_required');
  g.api('fleet.add', { client_id: 'a', kind: 'check', plate: 'Q100', odometer: 1000, data: { tyres: 'ok', oil: 'ok', cooling: 'ok', clean: 'ok', fuel: 3 } }, drv);
  assert.equal(g.api('fleet.add', { client_id: 'a', kind: 'check', plate: 'Q100', odometer: 1000 }, drv).data.duplicate, true);
  assert.equal(g.api('fleet.add', { kind: 'fuel', plate: 'Q100', odometer: 900, data: { liters: 40, amount: 80 } }, drv).error.code, 'fleet_odometer_back');
  g.api('fleet.add', { kind: 'fuel', plate: 'Q100', odometer: 1000, data: { liters: 50, amount: 100 } }, drv);
  g.api('fleet.add', { kind: 'fuel', plate: 'Q100', odometer: 1500, data: { liters: 60, amount: 120 } }, drv);
  g.api('fleet.add', { kind: 'issue', plate: 'Q100', data: { text: 'Brakes noise', urgent: true } }, drv);
  const mine = g.api('fleet.mine', {}, drv).data;
  assert.deepEqual([mine.plate, mine.checked_today, mine.last_odo], ['Q100', true, 1500]);
  const l = g.api('fleet.list', {}, mgr).data;
  const car = l.cars.find((c) => c.plate === 'Q100');
  assert.deepEqual([car.odometer, car.per100, car.open, car.checked_today], [1500, 12, 1, true], '60 L over 500 km = 12 L/100 km');
  assert.equal(g.api('data.bootstrap', {}, mgr).data.fleet_open, 1);
  const issue = l.logs.find((x) => x.kind === 'issue');
  g.api('fleet.close', { log_id: issue.log_id, note: 'fixed' }, mgr);
  assert.equal(g.api('fleet.list', {}, mgr).data.cars.find((c) => c.plate === 'Q100').open, 0);
  assert.equal(g.api('fleet.list', {}, drv).error.code, 'forbidden');
  // the shift: from its start the driver's phone shares its position; at its end the car's place is kept
  assert.equal(g.api('online.where', { lat: 25.3, lng: 51.5 }, drv).data.sharing, 0, 'not on shift, no trip: nothing shared');
  g.api('fleet.add', { client_id: 's1', kind: 'start', plate: 'Q100', data: { lat: 25.29, lng: 51.53 } }, drv);
  assert.equal(g.api('fleet.add', { client_id: 's2', kind: 'start', plate: 'Q100' }, drv).error.code, 'fleet_on_shift');
  assert.equal(g.api('online.where', { lat: 25.3, lng: 51.5 }, drv).data.sharing, 1);
  let m = g.api('trips.map', {}, mgr).data;
  assert.deepEqual([m.drivers.length, m.drivers[0].vehicle, m.parked.length], [1, 'Q100', 0], 'on shift: on the map with its vehicle');
  g.api('fleet.add', { client_id: 'e1', kind: 'end', plate: 'Q100', data: { lat: 25.31, lng: 51.52 } }, drv);
  m = g.api('trips.map', {}, mgr).data;
  assert.deepEqual([m.drivers.length, m.parked.length, m.parked[0].pos.lat], [0, 1, 25.31], 'shift ended: the car shows where it was left');
  assert.equal(g.api('online.where', { lat: 25.3, lng: 51.5 }, drv).data.sharing, 0);
});
