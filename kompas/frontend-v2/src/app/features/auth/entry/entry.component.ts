import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../environments/environment';

/** Ключ, под которым entry-токен переживает редирект на Keycloak и обратно. */
const ENTRY_TOKEN_KEY = 'kompas_entry_token';
const AUTH_INIT_TIMEOUT_MS = 15_000;

/**
 * Точка входа из внешней системы «План развития».
 *
 * Поток: «План развития» редиректит на `/entry?token=<JWT>`. Токен сохраняем,
 * при необходимости авторизуемся в Keycloak (с возвратом на /entry), затем
 * отдаём токен на бэк (`POST /api/v1/session/entry`), который заводит контекст
 * выбранного сотрудника, и уходим в мастер ИПР.
 */
@Component({
  selector: 'app-entry',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatProgressSpinnerModule, MatIconModule, MatButtonModule],
  template: `
    <div class="entry-page">
      <mat-card class="entry-card" appearance="outlined">
        <mat-card-content class="centered">
          @if (error()) {
            <mat-icon class="error-icon">error_outline</mat-icon>
            <h3>Не удалось открыть Компас</h3>
            <p>{{ error() }}</p>
            <button mat-stroked-button (click)="retry()">Попробовать снова</button>
          } @else {
            <mat-spinner diameter="50"></mat-spinner>
            <h3>Открываем Компас…</h3>
            <p>Переносим данные сотрудника из «Плана развития».</p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .entry-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--mat-sys-surface-container-low);
    }
    .entry-card { max-width: 380px; }
    .centered {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 16px;
      padding: 32px 16px;
    }
    .centered h3 { margin: 0; }
    .centered p { margin: 0; color: var(--mat-sys-on-surface-variant); }
    .error-icon { font-size: 48px; width: 48px; height: 48px; color: var(--mat-sys-error); }
  `],
})
export class EntryComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly error = signal<string | null>(null);

  constructor() {
    // Токен приходит в query при первом заходе; после возврата из Keycloak его
    // в URL уже нет — берём из sessionStorage.
    const tokenFromUrl = this.route.snapshot.queryParams['token'] as string | undefined;
    if (tokenFromUrl) {
      try {
        sessionStorage.setItem(ENTRY_TOKEN_KEY, tokenFromUrl);
      } catch {
        /* приватный режим — продолжим с токеном из URL */
      }
    }
    void this.#run(tokenFromUrl);
  }

  retry(): void {
    this.error.set(null);
    void this.#run(undefined);
  }

  async #run(tokenFromUrl?: string): Promise<void> {
    const token = tokenFromUrl ?? this.#readStoredToken();
    if (!token) {
      // Нет токена входа — отправляем на обычный вход.
      await this.router.navigate(['/login']);
      return;
    }

    // Ждём инициализацию Keycloak (с таймаутом, чтобы не висеть вечно).
    try {
      await this.#awaitInitWithTimeout();
    } catch {
      this.error.set('Инициализация авторизации заняла слишком долго. Попробуйте снова.');
      return;
    }

    // Не авторизованы — уходим в Keycloak и возвращаемся на /entry (токен уже в sessionStorage).
    if (!this.auth.isAuthenticated()) {
      await this.auth.login('/entry');
      return;
    }

    // Авторизованы — передаём контекст сотрудника на бэк.
    try {
      const accessToken = await this.auth.getFreshToken();
      const response = await fetch(`${environment.apiUrl}/session/entry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const message = await this.#extractError(response);
        throw new Error(message);
      }
      this.#clearStoredToken();
      await this.router.navigateByUrl('/idp');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Токен входа недействителен или истёк.');
    }
  }

  async #awaitInitWithTimeout(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.auth.waitForInit(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), AUTH_INIT_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async #extractError(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      return body.message || body.error || `Ошибка ${response.status}`;
    } catch {
      return `Ошибка ${response.status}`;
    }
  }

  #readStoredToken(): string | null {
    try {
      return sessionStorage.getItem(ENTRY_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  #clearStoredToken(): void {
    try {
      sessionStorage.removeItem(ENTRY_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}
