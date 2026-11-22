/**
 * Phase 4 — validate structured transaction metadata at the HTTP boundary.
 *
 * PostgreSQL protects document DATE and TIMESTAMPTZ, but JSONB columns do not
 * enforce the business shapes defined in the shared Transaction model.
 * Validate them before any write, rather than persisting malformed payloads.
 */
import { isValidDateOnly } from '../../database/dateTime';
import {
  invalidOutcome, issue, validOutcome,
  type Validator,
} from '../../validation/validationTypes';
import type {
  DirectorDirective,
  TransactionReminder,
} from '../../../../src/core/models/transaction';

const UTC_OR_OFFSET_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = UTC_OR_OFFSET_TIMESTAMP.exec(value);
  if (!match || !isValidDateOnly(match[1])) return false;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  if (hours > 23 || minutes > 59 || seconds > 59) return false;
  if (match[5] !== 'Z') {
    const offsetHours = Number(match[5].slice(1, 3));
    const offsetMinutes = Number(match[5].slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

/** PostgreSQL TIMESTAMPTZ input: explicit timezone required to prevent ambiguity. */
export function transactionTimestamp(field: string): Validator<unknown, string> {
  return (input) => isValidTimestamp(input)
    ? validOutcome(input)
    : invalidOutcome([issue(field, 'مطلوب توقيت ISO 8601 صحيح مع منطقة زمنية صريحة.')]);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unknownProperties(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  const keys = new Set(allowed);
  return Object.keys(value).filter((name) => !keys.has(name));
}

export const transactionReminder: Validator<unknown, TransactionReminder> = (input) => {
  if (!plainObject(input)) {
    return invalidOutcome([issue('reminder', 'بيانات التذكير يجب أن تكون كائناً.')]);
  }
  const errors = [];
  if (typeof input.enabled !== 'boolean') {
    errors.push(issue('reminder.enabled', 'قيمة التفعيل يجب أن تكون منطقية.'));
  }
  if (!isValidTimestamp(input.remindAt)) {
    errors.push(issue('reminder.remindAt', 'مطلوب توقيت تذكير صحيح مع منطقة زمنية.'));
  }
  if (typeof input.note !== 'string' || input.note.trim().length === 0) {
    errors.push(issue('reminder.note', 'نص التذكير مطلوب.'));
  }
  for (const key of unknownProperties(input, ['enabled', 'remindAt', 'note'])) {
    errors.push(issue(`reminder.${key}`, 'حقل غير معتمد في التذكير.'));
  }
  return errors.length ? invalidOutcome(errors) : validOutcome(input as unknown as TransactionReminder);
};

export const transactionDirective: Validator<unknown, DirectorDirective> = (input) => {
  if (!plainObject(input)) {
    return invalidOutcome([issue('directorDirective', 'التوجيه يجب أن يكون كائناً.')]);
  }
  const errors = [];
  if (typeof input.text !== 'string' || input.text.trim().length === 0) {
    errors.push(issue('directorDirective.text', 'نص التوجيه مطلوب.'));
  }
  if (!((typeof input.date === 'string' && isValidDateOnly(input.date))
    || isValidTimestamp(input.date))) {
    errors.push(issue('directorDirective.date', 'تاريخ التوجيه غير صالح.'));
  }
  if (input.actionRequired !== undefined && typeof input.actionRequired !== 'boolean') {
    errors.push(issue('directorDirective.actionRequired', 'مطلوب قيمة منطقية.'));
  }
  for (const key of unknownProperties(input, ['text', 'date', 'actionRequired'])) {
    errors.push(issue(`directorDirective.${key}`, 'حقل غير معتمد في التوجيه.'));
  }
  return errors.length ? invalidOutcome(errors) : validOutcome(input as unknown as DirectorDirective);
};
