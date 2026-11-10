// Run only after the isolation preload, before any P0 tests/compiler/build.
const assert = require('node:assert/strict');
const net = require('node:net');
const tls = require('node:tls');
const dgram = require('node:dgram');
const pg = require('pg');

// Do not load the guard here: doing so would hide a broken NODE_OPTIONS preload.
assert.ok(require.cache[require.resolve('./reportP0Isolation.cjs')], 'Guard was not preloaded');
assert.equal(process.env.ALSQAYA_P0_ISOLATED, '1');
assert.equal(process.env.DATABASE_URL, '');
assert.equal(process.env.ATTACHMENT_STORAGE_DIR, '');
assert.equal(process.env.NODE_ENV, 'test');
assert.deepEqual(Object.keys(process.env).filter(key => /^(PG|DATABASE_|DB_)/i.test(key) && key !== 'DATABASE_URL'), []);

const hooks = [
  ['net.Socket.connect', net.Socket.prototype.connect],
  ['net.Server.listen', net.Server.prototype.listen],
  ['tls.connect', tls.connect],
  ['dgram.createSocket', dgram.createSocket],
  ['pg.Client.connect', pg.Client.prototype.connect],
  ['pg.Client.query', pg.Client.prototype.query],
  ['pg.Pool.connect', pg.Pool.prototype.connect],
  ['pg.Pool.query', pg.Pool.prototype.query],
];

// Check every hook before invoking any. No real socket, server, or DB client is
// constructed; the guard must throw even with an inert receiver and no target.
for (const [name, hook] of hooks) {
  assert.equal(typeof hook, 'function', name);
  assert.equal(hook.name, 'forbidden', `${name} is not guarded`);
  assert.equal(hook, net.Socket.prototype.connect, `${name} bypasses the guard`);
}
for (const [name, hook] of hooks) {
  assert.throws(() => Reflect.apply(hook, Object.freeze({}), []), {
    name: 'Error',
    message: 'P0 isolation: network and real database access are forbidden',
  }, name);
}

console.log(JSON.stringify({ guardPreloaded: true, blockedOperations: hooks.map(([name]) => name) }));
