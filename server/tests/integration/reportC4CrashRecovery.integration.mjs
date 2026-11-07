/**
 * Phase 23 C4: synthetic GitHub-runner-only Node SIGKILL / daemon orphan proof.
 *
 * Simulates an app process that starts a constrained, labelled Docker container,
 * loses the ability to execute finally (SIGKILL), and requires a separate
 * observer to discover and remove the surviving daemon-owned container.
 *
 * This is NOT a production watchdog, target-host security certification,
 * image/font provenance or permission to activate HTTP report routes.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const MANAGED_LABEL = 'alsqaya.c2.managed=true';
const TEST_LABEL = 'alsqaya.c4.crash-ci=true';
const NAME_RE = /^alsqaya-c2-c4-ci-[a-f0-9]{24}$/;
const IMAGE_RE = /^sha256:[a-f0-9]{64}$/;
const MAX_COMMAND_MS = 15_000;

function docker(bin, args) {
  const result = spawnSync(bin, args, {
    env: {}, encoding: 'utf8', timeout: MAX_COMMAND_MS,
    maxBuffer: 128 * 1024, shell: false, windowsHide: true,
  });
  if (result.error) throw new Error('C4 docker command failed or timed out');
  return { code: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function imageId(bin) {
  const result = docker(bin, ['image', 'inspect', '--format', '{{.Id}}',
    'alsqaya-p1k-weasyprint-isolated:ci']);
  assert.equal(result.code, 0, 'CI-only PDF image is not available');
  assert.match(result.stdout, IMAGE_RE, 'CI image must be a local content-addressed ID');
  return result.stdout;
}

function containerState(bin, name) {
  const r = docker(bin, ['container', 'inspect', '--format',
    '{{.State.Running}}', name]);
  return r.code === 0 ? r.stdout : 'absent';
}

function managedC4Names(bin) {
  const result = docker(bin, ['ps', '-a', '--format', '{{.Names}}',
    '--filter', 'label=' + MANAGED_LABEL,
    '--filter', 'label=' + TEST_LABEL]);
  assert.equal(result.code, 0, 'Could not enumerate test-labelled containers');
  return result.stdout ? result.stdout.split('\n') : [];
}

function reaperAfterCrash(bin, expectedName) {
  // A DIFFERENT process from the killed supervisor. Constrain discovery to
  // BOTH labels and an exact nonce-name match; never prune general containers.
  const candidates = managedC4Names(bin);
  assert.deepEqual(candidates, [expectedName],
    'Expected exactly one independently discovered C4 orphan');
  for (const name of candidates) {
    assert.match(name, NAME_RE);
    const inspect = docker(bin, ['container', 'inspect', '--format',
      '{{json .Config.Labels}}', name]);
    assert.equal(inspect.code, 0, 'C4 labelled container disappeared before inspection');
    const labels = JSON.parse(inspect.stdout);
    assert.equal(labels['alsqaya.c2.managed'], 'true');
    assert.equal(labels['alsqaya.c4.crash-ci'], 'true');
    const removed = docker(bin, ['rm', '-f', name]);
    assert.equal(removed.code, 0, 'Separate reaper could not remove the orphan');
  }
}

if (process.argv[2] === '--child') {
  // Dedicated application-like process. Parent will SIGKILL this Node process,
  // so its normal finally/cleanup CANNOT run.
  const [, , , name, image, dockerBin] = process.argv;
  if (!NAME_RE.test(name || '') || !IMAGE_RE.test(image || '') ||
      !isAbsolute(dockerBin || '')) process.exit(2);
  const child = spawn(dockerBin, [
    'run', '-i', '--rm', '--pull=never', '--name', name,
    '--label', MANAGED_LABEL, '--label', TEST_LABEL,
    '--network=none', '--read-only', '--user=10001:10001',
    '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=64', '--memory=768m', '--cpus=1',
    '--ulimit=nofile=1024:1024', '--ulimit=core=0:0',
    '--ulimit=fsize=12582912:12582912',
    '--tmpfs=/tmp:rw,nosuid,nodev,size=16m,mode=1777',
    '--entrypoint=python', image, '-c', 'import time; time.sleep(90)',
  ], { stdio: 'ignore', env: {}, shell: false, windowsHide: true });
  child.on('error', () => { process.exitCode = 2; });
  child.on('close', () => { process.exitCode = 3; });
} else {
  test('C4 actual daemon orphan survives Node SIGKILL, independent labelled reaper removes it',
    { timeout: 120_000 }, async () => {
      assert.equal(process.platform, 'linux', 'C4 real Docker proof requires Linux');
      assert.equal(process.env.CI, 'true', 'C4 real Docker proof is restricted to CI');
      const bin = process.env.C4_DOCKER_BIN;
      assert.ok(bin && isAbsolute(bin), 'CI must provide absolute Docker executable');
      const image = imageId(bin);
      const name = 'alsqaya-c2-c4-ci-' + randomBytes(12).toString('hex');
      assert.match(name, NAME_RE);
      assert.deepEqual(managedC4Names(bin), [],
        'Unexpected old C4 synthetic containers on the disposable runner');

      const supervisor = spawn(process.execPath, [
        new URL(import.meta.url).pathname, '--child', name, image, bin,
      ], { stdio: 'ignore', shell: false, env: {}, windowsHide: true });
      let spawnError = null;
      supervisor.on('error', error => { spawnError = error; });
      try {
        let running = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          if (spawnError) throw spawnError;
          if (containerState(bin, name) === 'true') {
            running = true;
            break;
          }
          if (supervisor.exitCode !== null || supervisor.signalCode !== null) break;
          await delay(100);
        }
        assert.ok(running, 'The daemon container must start before SIGKILL');
        assert.equal(supervisor.kill('SIGKILL'), true,
          'Failed to SIGKILL the Node supervisor');
        for (let attempt = 0; attempt < 50 &&
            supervisor.signalCode !== 'SIGKILL'; attempt++) await delay(50);
        assert.equal(supervisor.signalCode, 'SIGKILL',
          'Simulated Node process did not die by SIGKILL');

        // This is the crucial negative proof: a killed Node supervisor has no
        // finally path, but a daemon-owned container still exists and runs.
        assert.equal(containerState(bin, name), 'true',
          'No orphan survived the supervisor crash; test did not exercise recovery');
        reaperAfterCrash(bin, name);
        for (let attempt = 0; attempt < 30 &&
            containerState(bin, name) !== 'absent'; attempt++) await delay(100);
        assert.equal(containerState(bin, name), 'absent');
        assert.deepEqual(managedC4Names(bin), [],
          'Labelled C4 orphan remains after independent reaping');
      } finally {
        if (supervisor.exitCode === null && supervisor.signalCode === null) {
          supervisor.kill('SIGKILL');
        }
        // Emergency cleanup is *test-only* and never masks a failed assertion.
        docker(bin, ['rm', '-f', name]);
      }
    });
}
