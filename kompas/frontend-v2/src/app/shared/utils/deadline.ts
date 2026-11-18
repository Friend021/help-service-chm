/**
 * Pure helpers for `IdpTask.deadLine` values.
 *
 * The backend contract (mock-backend/openapi.yaml) requires ISO 8601 UTC that
 * ends with 'Z' and up to milliseconds:
 *   ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$
 */

function pad(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, '0');
}

/** Normalizes a Date or date-like string to ISO 8601 UTC, always ending with 'Z'. */
export function toIsoUtcDeadline(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Cannot parse date: ${String(value)}`);
  }
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}` +
    `T${pad(date.getUTCHours(), 2)}:${pad(date.getUTCMinutes(), 2)}:${pad(date.getUTCSeconds(), 2)}` +
    `.${pad(date.getUTCMilliseconds(), 3)}Z`
  );
}

/** Parses an ISO 8601 UTC deadline string back into a Date. */
export function parseDeadline(iso: string): Date {
  const date = new Date(iso.trim());
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Cannot parse ISO deadline: ${iso}`);
  }
  return date;
}
