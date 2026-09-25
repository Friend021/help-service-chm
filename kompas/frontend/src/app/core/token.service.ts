import { Injectable } from '@angular/core';

const TOKEN_KEY = 'kompas.accessToken';

/** Токен доступа живёт в sessionStorage: вкладка закрыта — сессия забыта. */
@Injectable({ providedIn: 'root' })
export class TokenService {
  get token(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  set(token: string): void {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  clear(): void {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}
