import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from './token.service';

/** Подставляет токен доступа во все вызовы API, кроме создания сессии. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const tokens = inject(TokenService);
  const token = tokens.token;

  const isCreateSession = request.method === 'POST' && request.url.endsWith('/api/sessions');
  if (!token || isCreateSession) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
