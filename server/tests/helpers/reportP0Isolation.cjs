// Preload only for approved P0 checks in a disposable copy, before app imports.
const net = require('node:net');
const tls = require('node:tls');
const dgram = require('node:dgram');
const { syncBuiltinESMExports } = require('node:module');
const pg = require('pg');

for (const key of Object.keys(process.env)) {
  if (/^(PG|DATABASE_|DB_)/i.test(key)) delete process.env[key];
}
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.ATTACHMENT_STORAGE_DIR = '';
process.env.ALSQAYA_P0_ISOLATED = '1';

function forbidden() {
  throw new Error('P0 isolation: network and real database access are forbidden');
}
net.Socket.prototype.connect = forbidden;
net.Server.prototype.listen = forbidden;
tls.connect = forbidden;
dgram.createSocket = forbidden;
pg.Client.prototype.connect = forbidden;
pg.Client.prototype.query = forbidden;
pg.Pool.prototype.connect = forbidden;
pg.Pool.prototype.query = forbidden;
syncBuiltinESMExports();
