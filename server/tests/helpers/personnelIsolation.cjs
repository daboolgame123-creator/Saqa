// Separate HTTP/SQL sandbox guard. The P0 no-network guard remains unchanged.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const dgram = require('node:dgram');
const { syncBuiltinESMExports } = require('node:module');
const pg = require('pg');

const root = fs.realpathSync(process.cwd());
const parent = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'opencode');
if (process.env.ALSQAYA_PERSONNEL_ISOLATED !== '1'
    || path.dirname(root).toLowerCase() !== fs.realpathSync(parent).toLowerCase()
    || !path.basename(root).startsWith('ALSQAYA-personnel-checks-')
    || !/^[\x00-\x7f]+$/.test(root)) {
  throw new Error('Personnel isolation: approved disposable ASCII workspace required');
}
const config = JSON.parse(fs.readFileSync(path.join(root, '.personnel-isolation.json'), 'utf8').replace(/^\uFEFF/, ''));
if (config.root !== root || config.database !== 'alsqaya_personnel_test'
    || config.user !== 'alsqaya_personnel_test' || !/^[a-f0-9]{32}$/.test(config.password)
    || ![config.dbPort, config.httpPort].every(p => Number.isInteger(p) && p >= 49152 && p <= 65535)
    || config.dbPort === config.httpPort) throw new Error('Invalid isolation configuration');

for (const key of Object.keys(process.env)) {
  if (/^(PG|DATABASE_|DB_|VITE_)/i.test(key)) delete process.env[key];
}
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.ATTACHMENT_STORAGE_DIR = path.join(root, '.test-attachments');

function forbidden() { throw new Error('Personnel isolation: destination forbidden'); }
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const first = values[0];
  const options = typeof first === 'object' ? first : { port: first, host: values[1] };
  if (!options || options.path || options.host !== '127.0.0.1'
      || ![config.dbPort, config.httpPort].includes(Number(options.port))) forbidden();
  return connect.apply(this, args);
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const first = args[0];
  const options = typeof first === 'object' ? first : { port: first, host: args[1] };
  if (!options || options.path || options.host !== '127.0.0.1'
      || Number(options.port) !== config.httpPort) forbidden();
  return listen.apply(this, args);
};
tls.connect = forbidden;
dgram.createSocket = forbidden;
const pgConnect = pg.Client.prototype.connect;
pg.Client.prototype.connect = function (...args) {
  const p = this.connectionParameters;
  if (p.host !== '127.0.0.1' || Number(p.port) !== config.dbPort
      || p.user !== config.user || p.password !== config.password
      || !['postgres', config.database].includes(p.database)) forbidden();
  return pgConnect.apply(this, args);
};
syncBuiltinESMExports();
module.exports = Object.freeze(config);
