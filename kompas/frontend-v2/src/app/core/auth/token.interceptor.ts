import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, switchMap, throwError, from } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Shared in-flight refresh. While one 401 is refreshing, all other 401s
 * await the same promise instead of firing parallel refresh requests.
 */
let refreshInFlight: Promise<boolean> | null = null;

export const tokenInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);
  const token = authService.accessToken();

  if (req.url.includes('/realms/') || req.url.includes('/.well-known/')) {
    return next(req);
  }

  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || !token) {
        return throwError(() => error);
      }

      // Clone `req` (pre-Authorization) so the retry uses the fresh token below.
      return from((refreshInFlight ??= authService.refreshToken().finally(() => {
        refreshInFlight = null;
      }))).pipe(
        switchMap(success => {
          if (!success) {
            void authService.logout();
            return throwError(() => error);
          }
          const newToken = authService.accessToken();
          // If the token did not change, retrying would 401 again forever — stop after 1 retry.
          if (!newToken || newToken === token) {
            void authService.logout();
            return throwError(() => error);
          }
          return next(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }));
        })
      );
    })
  );
};
