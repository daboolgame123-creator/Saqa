/**
 * Phase 23/C2 — UNWIRED, internal-only bounded PDF worker launcher.
 *
 * A security-reviewed deployer must supply a fixed executable and fixed args
 * (e.g. an immutable Docker image with no network, mounts or privileges).
 * The app never accepts these values from HTTP or report data. This module
 * does not replace PDFKit, approve Docker, enable an endpoint or claim C4.
 */
import { spawn } from 'node:child_process';
import { encodeReportPdfInput } from './reportPdfInput';
import type { ReportExportModel } from './reportExport';

export class ReportPdfWorkerError extends Error {
  readonly code = 'REPORT_PDF_WORKER_UNAVAILABLE';
  constructor(reason: string) {
    super(reason);
    this.name = 'ReportPdfWorkerError';
  }
}

export interface InternalPdfWorkerConfig {
  /** Server-owned absolute executable. Not a request parameter. */
  executable: string;
  /** Server-owned immutable argv, including image digest and isolation flags. */
  args: readonly string[];
  /** Fixed finite bounds approved separately for each deployment. */
  timeoutMs: number;
  maxPdfBytes: number;
}

const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 12_000_000;
const MAX_STDERR_BYTES = 8192;

function checkedConfig(config: InternalPdfWorkerConfig): void {
  if (!config || typeof config.executable !== 'string' ||
      !config.executable.trim() || !Array.isArray(config.args) ||
      config.args.some(arg => typeof arg !== 'string' || arg.length > 4096) ||
      !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 ||
      config.timeoutMs > MAX_TIMEOUT_MS ||
      !Number.isSafeInteger(config.maxPdfBytes) || config.maxPdfBytes < 64 ||
      config.maxPdfBytes > MAX_OUTPUT_BYTES) {
    throw new ReportPdfWorkerError('Invalid server PDF worker configuration');
  }
}

/** Strict *transport* validation, not a substitute for PDF parsing/AV or
 * confinement of the renderer. Rejects success-shaped truncated output.
 */
export function validatePdfWorkerOutput(value: Buffer, maxBytes: number): Buffer {
  if (!Buffer.isBuffer(value) || value.length < 64 || value.length > maxBytes ||
      value.subarray(0, 5).toString('ascii') !== '%PDF-' ||
      !/^%PDF-[12][.][0-9]/.test(value.subarray(0, 8).toString('ascii'))) {
    throw new ReportPdfWorkerError('Invalid PDF worker output');
  }
  const tail = value.subarray(Math.max(0, value.length - 1024)).toString('latin1');
  if (!/%%EOF[\t\r\n ]*$/.test(tail)) {
    throw new ReportPdfWorkerError('Truncated PDF worker output');
  }
  return value;
}

/** Invoke an isolated preconfigured process with *data-only* JSON on stdin.
 * Never accepts template HTML, file paths or worker argv from the report.
 * The worker must emit only PDF bytes on stdout; stderr is deliberately never
 * surfaced to API callers because it could contain report data.
 */
export async function runInternalPdfWorker(
  model: ReportExportModel,
  config: InternalPdfWorkerConfig,
): Promise<Buffer> {
  // Fail closed before creating a child process.
  checkedConfig(config);
  const input = encodeReportPdfInput(model);
  return new Promise<Buffer>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(config.executable, [...config.args], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        // No inherited secrets or user environment. Deployment-specific
        // runtime environment must be provisioned out of band.
        env: {},
      });
    } catch {
      reject(new ReportPdfWorkerError('PDF worker failed to launch'));
      return;
    }
    let settled = false;
    let size = 0;
    let stderrSize = 0;
    const chunks: Buffer[] = [];
    const stop = (reason: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(new ReportPdfWorkerError(reason));
    };
    const timer = setTimeout(() => stop('PDF worker timed out'), config.timeoutMs);
    child.stdout.on('data', (raw: Buffer) => {
      if (settled) return;
      const chunk = Buffer.from(raw);
      size += chunk.length;
      if (size > config.maxPdfBytes) return stop('PDF worker output limit exceeded');
      chunks.push(chunk);
    });
    child.stderr.on('data', (raw: Buffer) => {
      stderrSize += raw.length;
      if (stderrSize > MAX_STDERR_BYTES) stop('PDF worker stderr limit exceeded');
    });
    child.stdin.on('error', () => {
      stop('PDF worker input stream failed');
    });
    child.on('error', () => {
      stop('PDF worker process error');
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new ReportPdfWorkerError('PDF worker process returned failure'));
        return;
      }
      try {
        resolve(validatePdfWorkerOutput(Buffer.concat(chunks), config.maxPdfBytes));
      } catch {
        reject(new ReportPdfWorkerError('PDF worker produced invalid or partial PDF'));
      }
    });
    child.stdin.end(input);
  });
}
