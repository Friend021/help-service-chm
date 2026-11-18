import { Component, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

/** How long the callback waits for auth initialization before giving up. */
const AUTH_INIT_TIMEOUT_MS = 15_000;

@Component({
  selector: 'app-callback',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatProgressSpinnerModule, MatIconModule],
  template: `
    <div class="callback-page">
      <mat-card class="callback-card" appearance="outlined">
        <mat-card-content class="centered">
          @if (error()) {
            <mat-icon class="error-icon">error_outline</mat-icon>
            <h3>Не удалось завершить вход</h3>
            <p>{{ error() }}</p>
          } @else {
            <mat-spinner diameter="50"></mat-spinner>
            <h3>Завершение входа...</h3>
            <p>Пожалуйста, подождите, пока мы обрабатываем ответ от Keycloak.</p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .callback-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--mat-sys-surface-container-low);
    }

    .callback-card {
      max-width: 360px;
    }

    .centered {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 16px;
      padding: 32px 16px;
    }

    .centered h3 {
      margin: 0;
    }

    .centered p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .error-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--mat-sys-error);
    }
  `],
})
export class CallbackComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly error = signal<string | null>(null);
  #settled = false;

  constructor() {
    effect(() => {
      // Initialization finished: continue to the requested page.
      if (!this.auth.loading() && !this.error()) {
        void this.#navigateToReturnUrl();
      }
    });

    // A hung init must not leave the spinner up forever (D-3r #22).
    void this.#awaitInitWithTimeout();
  }

  async #awaitInitWithTimeout(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.auth.waitForInit(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Auth initialization timed out')),
            AUTH_INIT_TIMEOUT_MS,
          );
        }),
      ]);
    } catch {
      if (this.#settled) return;
      this.#settled = true;
      this.error.set('Инициализация авторизации заняла слишком много времени. Войдите снова.');
      await this.router.navigate(['/login']);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async #navigateToReturnUrl(): Promise<void> {
    if (this.#settled) return;
    this.#settled = true;

    const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/idp';
    await this.router.navigateByUrl(returnUrl);
  }
}