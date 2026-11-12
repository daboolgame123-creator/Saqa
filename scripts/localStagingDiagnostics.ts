// Local attended-tool diagnostics only. Never serialize an exception or its message/cause.
const stages = [
  'preflight', 'confirmation', 'config', 'dependencies', 'migration_files', 'pool', 'connect',
  'begin', 'identity', 'migration_ledger', 'lock', 'empty_users', 'encryption',
  'employee_insert', 'account_insert', 'employee_audit', 'account_audit', 'commit',
  'rollback', 'release', 'pool_end', 'secret_output',
] as const;
export type StagingStage = typeof stages[number];
type Outcome = 'NOT_STARTED' | 'ROLLED_BACK' | 'UNKNOWN' | 'COMMITTED';
type Cleanup = 'rollback' | 'release' | 'pool_end';

const guardCodes = [
  'ENV_REJECTED', 'KEY_INVALID', 'PG_OVERRIDE', 'URL_INVALID', 'DESTINATION_REJECTED',
  'CREDENTIALS_INVALID', 'CONSOLE_REQUIRED', 'CONFIRMATION_REQUIRED', 'CONFIG_MISMATCH',
  'IDENTITY_MISMATCH', 'MIGRATION_MISMATCH', 'USERS_NOT_EMPTY',
] as const;
type GuardCode = typeof guardCodes[number];
const guarded = new WeakMap<object, GuardCode>();
const failures = new WeakMap<object, { context: StagingDiagnosticContext; stage: StagingStage }>();

export function stagingGuardError(code: GuardCode, message: string): Error {
  const error = new Error(message);
  guarded.set(error, code);
  return error;
}

/** Finite allowlist, not a regex over arbitrary driver-provided values. */
const driverCodes = new Set([
  '28P01', '28000', '42501', '42P01', '42703', '23505', '23514', '23502', '23503',
  '55P03', '57014', '3D000', '08006', '53300', '57P01',
  'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOENT', 'EACCES', 'EPERM',
  'ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND',
]);

function isObject(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function safeCode(error: unknown): string {
  if (!isObject(error)) return 'UNEXPECTED';
  const guard = guarded.get(error);
  if (guard) return guard;
  // Read only an own data property. Do not invoke getters, toString or inspect.
  try {
    const code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
    if (typeof code === 'string' && driverCodes.has(code)) return code;
  } catch { /* A hostile proxy is still an opaque failure. */ }
  return 'UNEXPECTED';
}

export class StagingDiagnosticContext {
  stage: StagingStage = 'preflight';
  outcome: Outcome = 'NOT_STARTED';
  readonly cleanupFailures = new Set<Cleanup>();
  private failed = false;

  capture(error: unknown): unknown {
    this.failed = true;
    // Primitive throws have no identity to annotate; replace without coercing or
    // retaining their potentially sensitive value so the core stage is not lost.
    if (!isObject(error)) error = new Error('Staging operation failed.');
    // Preserve exact original driver error identity, including frozen errors.
    if (isObject(error) && !failures.has(error)) failures.set(error, { context: this, stage: this.stage });
    return error;
  }

  async cleanup(stage: Cleanup, action: () => unknown | Promise<unknown>): Promise<void> {
    try { await action(); }
    catch (error) {
      this.cleanupFailures.add(stage);
      if (!this.failed) {
        this.stage = stage;
        throw this.capture(error);
      }
    }
  }
}

export function formatStagingFailure(error: unknown, fallback = new StagingDiagnosticContext()): string {
  const failure = isObject(error) ? failures.get(error) : undefined;
  const context = failure?.context ?? fallback;
  const stage = failure?.stage ?? context.stage;
  return `Staging setup stopped. stage=${stage} code=${safeCode(error)} outcome=${context.outcome}` +
    ` cleanup=${[...context.cleanupFailures].join(',') || 'none'}. No automatic retry.\n`;
}
