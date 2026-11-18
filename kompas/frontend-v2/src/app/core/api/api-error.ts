import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiErrorResponse, ValidationError } from '../../models/idp.models';

/**
 * Normalized, typed API error (models ApiErrorResponse) surfaced consistently
 * to callers from every non-2xx response.
 */
export interface ApiError extends ApiErrorResponse {
  /** HTTP status, when the error originated from an HTTP response. */
  status?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Maps a backend error body (wire shape per mock-backend/openapi.yaml:
 * `{ error: string, message: string, errors?: [{ path, message }] }`) into a
 * typed ApiError. Accepts either the raw body or an object carrying it
 * (e.g. an HttpErrorResponse-like `{ status, error }`).
 */
export function toApiError(source: unknown, status?: number): ApiError {
  // Already-normalized ApiError (`{code, message, status, ...}` without the raw
  // wire `error` field): pass through unchanged so repeated normalization
  // (interceptor -> service catch) never erases `code`/`status`.
  if (isRecord(source) && typeof source['code'] === 'string' && source['error'] === undefined) {
    const normalized = source as unknown as ApiError;
    return status === undefined ? normalized : { ...normalized, status };
  }
  // Accept both a raw body and a wrapper (axios/HttpErrorResponse style).
  const body: Record<string, unknown> | null = isRecord(source)
    ? source
    : isRecord((source as { error?: unknown } | null)?.error)
      ? ((source as { error: Record<string, unknown> }).error as Record<string, unknown>)
      : null;

  const rawCode = body?.['error'];
  const rawMessage = body?.['message'];
  const rawValidation = body?.['validationErrors'] ?? body?.['errors'];

  const code =
    typeof rawCode === 'string' && rawCode.trim()
      ? rawCode
      : typeof status === 'number'
        ? `HTTP_${status}`
        : 'UNKNOWN';

  const message = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage : 'Неизвестная ошибка API.';

  let validationErrors: ValidationError[] | undefined;
  if (Array.isArray(rawValidation)) {
    validationErrors = rawValidation
      .filter(isRecord)
      .filter((item) => typeof item['path'] === 'string' && typeof item['message'] === 'string')
      .map((item) => ({ path: item['path'] as string, message: item['message'] as string }));
  }

  return { code, message, validationErrors, status };
}

/**
 * Functional HTTP interceptor: rewrites every non-2xx HttpErrorResponse into
 * a typed ApiError so it reaches resource.error() / catch blocks uniformly.
 * Register via `provideHttpClient(withInterceptors([apiErrorInterceptor]))`.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse) {
        return throwError(() => toApiError(error.error, error.status));
      }
      return throwError(() => error);
    }),
  );
