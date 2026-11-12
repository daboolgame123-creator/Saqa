// Local smoke-test entrypoint: existing Express routes/middleware, loopback only, no scheduled jobs.
import { stagingDatabaseConfig } from './localStagingEnvironment';

async function main(): Promise<void> {
  stagingDatabaseConfig(process.env);
  const [{ createApp }, { config }, { closeSharedPool }] = await Promise.all([
    import('../server/src/app'), import('../server/src/config'), import('../server/src/database'),
  ]);
  const server = createApp().listen(config.port, '127.0.0.1', () => {
    console.log(`Local staging Express listening on 127.0.0.1:${config.port}`);
  });
  server.on('error', () => { console.error('Local staging listener failed.'); process.exitCode = 1; });
  const stop = () => server.close(() => { void closeSharedPool(); });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
void main().catch(() => { console.error('Local staging preflight failed.'); process.exitCode = 1; });
