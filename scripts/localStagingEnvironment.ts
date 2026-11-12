import type { PoolConfig } from 'pg';

export const STAGING_CONFIRMATION = 'CREATE SYNTHETIC ADMIN IN alsqaya_staging';
export const STAGING_BADGE = 'SYNTHETIC-STAGING-ADMIN';
export const STAGING_NAME = 'Synthetic staging administrator - NOT REAL PERSONNEL';

/** No I/O and no application imports: fail before pg/config/vault initialization. */
export function stagingDatabaseConfig(env: NodeJS.ProcessEnv): PoolConfig {
  if (env.NODE_ENV !== 'test') throw new Error('NODE_ENV=test is required.');
  const key = env.AUTH_SECRET_KEY ?? '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key) ||
      Buffer.from(key, 'base64').length !== 32 ||
      Buffer.from(key, 'base64').toString('base64') !== key) {
    throw new Error('A persistent canonical 32-byte AUTH_SECRET_KEY is required.');
  }
  // Avoid libpq/pg environment defaults, including service/options/host overrides.
  if (Object.keys(env).some(name => /^PG/i.test(name) && env[name] !== undefined)) {
    throw new Error('Remove PG* environment overrides for this command.');
  }
  const raw = env.DATABASE_URL ?? '';
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid staging database URL.'); }
  if (raw !== raw.trim() || /[\s\\]/.test(raw) ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' || url.port !== '5433' ||
      url.pathname !== '/alsqaya_staging' || url.search !== '' || url.hash !== '' ||
      raw.includes('?') || raw.includes('#') || !url.username || !url.password) {
    throw new Error('Only 127.0.0.1:5433/alsqaya_staging without URL options is allowed.');
  }
  let user: string;
  let password: string;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch { throw new Error('Invalid encoded database credentials.'); }
  if (/[\x00-\x1f\x7f]/.test(user + password)) throw new Error('Invalid database credentials.');
  return {
    host: '127.0.0.1', port: 5433, database: 'alsqaya_staging', user, password,
    ssl: false, max: 1, connectionTimeoutMillis: 5000,
    statement_timeout: 10000, lock_timeout: 5000,
    application_name: 'alsqaya_synthetic_staging_admin',
    options: '-c client_encoding=UTF8 -c search_path=public,pg_catalog',
  };
}

export function authorizeStagingConsole(
  argv: readonly string[], env: NodeJS.ProcessEnv, attended: boolean,
): void {
  stagingDatabaseConfig(env);
  if (argv.length !== 1 || argv[0] !== '--execute' || !attended || env.CI) {
    throw new Error('Use --execute from an attended local terminal, without CI or redirection.');
  }
}
