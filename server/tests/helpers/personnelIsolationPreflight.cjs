// No connection is attempted: every negative probe must throw synchronously.
const assert = require('node:assert/strict');
const net = require('node:net');
const tls = require('node:tls');
const dgram = require('node:dgram');
const pg = require('pg');
const config = require('./personnelIsolation.cjs');
for (const options of [
  { host: '127.0.0.1', port: 5432 },
  { host: '127.0.0.1', port: 5440 },
  { host: '192.0.2.1', port: config.dbPort },
  { path: 'forbidden.sock' },
]) assert.throws(() => new net.Socket().connect(options), /destination forbidden/);
assert.throws(() => net.createServer().listen(0), /destination forbidden/);
assert.throws(() => tls.connect({ host: '127.0.0.1', port: config.dbPort }), /destination forbidden/);
assert.throws(() => dgram.createSocket('udp4'), /destination forbidden/);
assert.throws(() => new pg.Client({
  host: '127.0.0.1', port: config.dbPort, user: config.user,
  password: config.password, database: 'production',
}).connect(), /destination forbidden/);
assert.equal(process.env.DATABASE_URL, '');
console.log('Personnel isolation negative preflight passed (no connections)');
