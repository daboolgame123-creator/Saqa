/**
 * Phase 23 C2/C4 — INTERNAL, UNWIRED Docker PDF lifecycle adapter.
 *
 * A POSIX process-group kill does not stop a container started by Docker's
 * daemon. This bounded adapter owns a unique fixed Docker name, force-removes
 * that exact name after both success and failure, then verifies its absence.
 *
 * The image must be immutable/content-addressed; only deployer-supplied
 * configuration is accepted. This is NOT a target-host security attestation.
 * HTTP report routes remain independently disabled with 503.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { isAbsolute } from 'node:path';
import type { ReportExportModel } from './reportExport';
import { runInternalPdfWorker, ReportPdfWorkerError } from './reportPdfWorker';

export interface TrustedDockerPdfConfig {
  /** Absolute Docker CLI path from trusted local deployment configuration. */
  dockerExecutable: string;
  /** Approved registry image@sha256 digest; bare local image ID only for CI. */
  imageReference: string;
  timeoutMs: number;
  maxPdfBytes: number;
}

const DOCKER_COMMAND_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_BYTES = 8_192;
const REPOSITORY_DIGEST =
  /^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/;
const LOCAL_IMAGE_ID = /^sha256:[a-f0-9]{64}$/;

function checkConfig(config: TrustedDockerPdfConfig): void {
  if (!config || typeof config.dockerExecutable !== 'string' ||
      !isAbsolute(config.dockerExecutable) ||
      config.dockerExecutable.length > 4096 ||
      config.dockerExecutable.includes('\u0000') ||
      typeof config.imageReference !== 'string' ||
      !(REPOSITORY_DIGEST.test(config.imageReference) ||
        LOCAL_IMAGE_ID.test(config.imageReference)) ||
      !Number.isSafeInteger(config.timeoutMs) ||
      config.timeoutMs < 1 || config.timeoutMs > 60_000 ||
      !Number.isSafeInteger(config.maxPdfBytes) ||
      config.maxPdfBytes < 64 || config.maxPdfBytes > 12_000_000) {
    throw new ReportPdfWorkerError('Untrusted Docker PDF worker configuration');
  }
}

interface DockerCommandResult {
  code: number | null;
  stderr: string;
}
function dockerCommand(executable: string, args: string[]): Promise<DockerCommandResult> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, {
        shell: false, windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {},
      });
    } catch {
      reject(new ReportPdfWorkerError('Docker cleanup command could not launch'));
      return;
    }
    let done = false;
    let exceeded = false;
    let stderr = '';
    const timer = setTimeout(() => {
      exceeded = true;
      child.kill('SIGKILL');
    }, DOCKER_COMMAND_TIMEOUT_MS);
    child.stderr.on('data', (buf: Buffer) => {
      if (done) return;
      if (stderr.length + buf.length > MAX_DIAGNOSTIC_BYTES) {
        exceeded = true;
        child.kill('SIGKILL');
      } else {
        // Error text stays internal; never include it in report API results.
        stderr += buf.toString('utf8');
      }
    });
    child.on('error', () => { exceeded = true; });
    child.on('close', code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (exceeded) {
        reject(new ReportPdfWorkerError('Docker cleanup command failed'));
      } else {
        resolve({ code, stderr });
      }
    });
  });
}
const absentError = (output: string): boolean =>
  /No such (?:object|container)/i.test(output);

/** Always re-confirm absence: CLI nonzero can also mean an unreachable daemon. */
async function cleanupNamedContainer(executable: string, name: string): Promise<void> {
  // Small bounded repetition accounts for a child Docker CLI still settling
  // during a timeout/abort; a host watchdog remains mandatory for hard crashes.
  for (let attempt = 0; attempt < 3; attempt++) {
    await dockerCommand(executable, ['rm', '-f', name]);
    const inspect = await dockerCommand(executable, ['container', 'inspect', name]);
    if (inspect.code !== 0 && absentError(inspect.stderr)) return;
    if (inspect.code !== 0) {
      throw new ReportPdfWorkerError('Docker cleanup could not verify absence');
    }
    if (attempt < 2) await new Promise<void>(resolve => setTimeout(resolve, 75));
  }
  throw new ReportPdfWorkerError('Docker worker container survived forced removal');
}

/** Fixed offline container args; no HTTP, HTML, or user-provided flags. */
function fixedArgs(image: string, name: string): string[] {
  return [
    'run', '-i', '--rm', '--pull=never', '--name', name,
    '--label', 'alsqaya.c2.managed=true',
    '--network=none', '--read-only', '--user=10001:10001',
    '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=64', '--memory=768m', '--cpus=1',
    '--ulimit=nofile=1024:1024', '--ulimit=core=0:0',
    '--ulimit=fsize=12582912:12582912',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=16m,mode=1777',
    '--entrypoint=python', image, '/opt/p1k/stdinworker.py',
  ];
}

/**
 * Even a complete %PDF file is rejected if post-run container cleanup cannot
 * be independently verified. This cannot recover from Node/host crashes,
 * compromised Docker daemon, networked remote engines or host session escapes.
 */
export async function runManagedDockerPdfWorker(
  model: ReportExportModel,
  config: TrustedDockerPdfConfig,
  signal?: AbortSignal,
): Promise<Buffer> {
  checkConfig(config);
  if (signal?.aborted) throw new ReportPdfWorkerError('PDF worker cancelled');
  const name = 'alsqaya-c2-' + randomBytes(12).toString('hex');
  let content: Buffer | undefined;
  let failure: unknown;
  try {
    content = await runInternalPdfWorker(model, {
      executable: config.dockerExecutable,
      args: fixedArgs(config.imageReference, name),
      timeoutMs: config.timeoutMs,
      maxPdfBytes: config.maxPdfBytes,
    }, signal);
  } catch (error) {
    failure = error;
  }
  // The cleanup path uses ONLY a cryptographically generated container name,
  // not arbitrary Docker CLI arguments or the report/HTTP payload.
  await cleanupNamedContainer(config.dockerExecutable, name);
  if (failure !== undefined) throw failure;
  if (!content) throw new ReportPdfWorkerError('Missing Docker PDF result');
  return content;
}
