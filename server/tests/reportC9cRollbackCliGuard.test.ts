/** Phase 23 C9c: destructive DB rollback CLI refusal before any Pool creation. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCliRollbackAllowed, parseArgs, runCli } from '../src/database/cli';

test('C9c CLI refuses default down without explicit confirmation even in development', () => {
  const parsed = parseArgs(['down']);
  assert.deepEqual(parsed,{command:'down',steps:1,confirmDestructive:false});
  assert.throws(() => assertCliRollbackAllowed(parsed,'development'), /confirm-destructive/);
  assert.throws(() => assertCliRollbackAllowed(parsed,undefined), /confirm-destructive/);
});

test('C9c production rollback is forbidden EVEN with explicit confirmation and steps', () => {
  const parsed = parseArgs(['down','--confirm-destructive','--steps','15']);
  assert.equal(parsed.steps,15);
  assert.equal(parsed.confirmDestructive,true);
  assert.throws(() => assertCliRollbackAllowed(parsed,'production'), /محظور/);
});

test('C9c nonproduction confirmed down is developer-only; read-only status/up unaffected', () => {
  assert.doesNotThrow(() => assertCliRollbackAllowed(
    parseArgs(['down','--steps','2','--confirm-destructive']), 'test',
  ));
  assert.doesNotThrow(() => assertCliRollbackAllowed(parseArgs(['up']),'production'));
  assert.doesNotThrow(() => assertCliRollbackAllowed(parseArgs(['status']),'production'));
});

test('C9c rejects unknown, duplicate and malformed arguments rather than ignoring', () => {
  for (const args of [
    ['down','--steps'],['down','--steps','0'],['down','--steps','-1'],
    ['down','--steps','1.5'],['down','--steps','1e2'],['down','--steps','NaN'],
    ['down','--steps','9007199254740992'],['down','--steps','1','--steps','2'],
    ['down','--confirm-destructive','--confirm-destructive'],
    ['down','--unknown'],['up','--confirm-destructive'],['status','--steps','1'],
  ]) {
    assert.throws(() => parseArgs(args), 'Reject: '+args.join(' '));
  }
});

test('C9c runCli actually denies production or unconfirmed down without DB connection', async () => {
  const oldUrl=process.env.DATABASE_URL, oldEnv=process.env.NODE_ENV;
  const oldError=console.error;
  const lines:string[]=[];
  try {
    // A nonexistent host: any accidental DB connection would make this test fail/hang.
    process.env.DATABASE_URL='postgres://forbidden:forbidden@127.0.0.1:1/no_real_db';
    console.error=(...items:unknown[])=>{lines.push(items.join(' '));};
    process.env.NODE_ENV='production';
    assert.equal(await runCli(['down','--confirm-destructive']),1);
    assert.ok(lines.at(-1)?.includes('محظور'));
    process.env.NODE_ENV='development';
    assert.equal(await runCli(['down']),1);
    assert.ok(lines.at(-1)?.includes('--confirm-destructive'));
  } finally {
    if (oldUrl===undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL=oldUrl;
    if (oldEnv===undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV=oldEnv;
    console.error=oldError;
  }
});
