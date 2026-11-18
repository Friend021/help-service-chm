import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CompassLogoComponent } from '../../../shared/components/compass-logo/compass-logo.component';
import { environment } from '../../../environments/environment';

/**
 * Accepts only app-relative paths for post-login navigation. Absolute URLs,
 * scheme-relative (`//host`) and encoded variants are rejected to prevent
 * open redirects via `?returnUrl=`.
 */
export function safeReturnUrl(raw: string | null | undefined): string {
  const fallback = '/idp';
  if (!raw || !raw.startsWith('/')) return fallback;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return fallback;
  return raw;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    CompassLogoComponent,
  ],
  template: `
    <div class="login-page">
      <mat-card class="login-card" appearance="outlined">
        <mat-card-header>
          <mat-card-title class="login-title">
            <app-compass-logo class="title-icon" [size]="22" />
            <span>Вход в Компас</span>
          </mat-card-title>
          <mat-card-subtitle>Система индивидуальных планов развития</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          @if (!useKeycloak()) {
            <form (ngSubmit)="mockLogin()" #form="ngForm">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Логин</mat-label>
                <input matInput [(ngModel)]="username" name="username" required autocomplete="username">
                <mat-icon matPrefix>person</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Пароль</mat-label>
                <input matInput type="password" [(ngModel)]="password" name="password" required autocomplete="current-password">
                <mat-icon matPrefix>lock</mat-icon>
              </mat-form-field>

              @if (error()) {
                <div class="error-message">
                  <mat-icon>error</mat-icon>
                  {{ error() }}
                </div>
              }

              <button
                mat-flat-button
                color="primary"
                class="full-width login-btn"
                type="submit"
                [disabled]="loading() || !form.valid"
              >
                @if (loading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <ng-container>
                    <mat-icon>login</mat-icon>
                    Войти
                  </ng-container>
                }
              </button>
            </form>

            <mat-divider></mat-divider>

            <div class="demo-users">
              <p class="demo-title">Демо-пользователи:</p>
              @for (user of mockUsers; track user.username) {
                <button
                  mat-stroked-button
                  class="full-width"
                  (click)="fillCredentials(user.username, user.password)"
                  [disabled]="loading()"
                >
                  {{ user.username }} / {{ user.password }} ({{ user.role }})
                </button>
              }
            </div>
          } @else {
            <div class="keycloak-login">
              <mat-icon class="large-icon">security</mat-icon>
              <h3>Вход через Keycloak</h3>
              <p>Вы будете перенаправлены на страницу входа Keycloak для аутентификации.</p>
              <button mat-flat-button color="primary" (click)="keycloakLogin()" [disabled]="loading()">
                @if (loading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <ng-container>
                    <mat-icon>login</mat-icon>
                    Войти через Keycloak
                  </ng-container>
                }
              </button>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--mat-sys-surface-container-low);
    }

    .login-card {
      width: 100%;
      max-width: 420px;
    }

    .title-icon {
      margin-right: 8px;
      color: var(--mat-sys-primary);
    }

    .login-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .login-title .title-icon {
      margin-right: 0;
    }

    .full-width {
      width: 100%;
    }

    .login-btn {
      height: 48px;
      font-size: 1rem;
      margin-bottom: 12px;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      border-radius: 8px;
      margin-top: 12px;
      margin-bottom: 12px;
      font-size: 0.875rem;
    }

    .demo-users {
      margin-top: 16px;
    }

    .demo-title {
      margin: 0 0 12px 0;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
      letter-spacing: 0.5px;
    }

    .demo-users button {
      margin-bottom: 8px;
      justify-content: flex-start;
      font-size: 0.875rem;
    }

    .keycloak-login {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 32px 16px;
      gap: 16px;
    }

    .large-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--mat-sys-primary);
    }

    .keycloak-login h3 {
      margin: 0;
    }

    .keycloak-login p {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  username = '';
  password = '';
  loading = this.auth.loading;
  error = this.auth.error;

  useKeycloak = computed(() => !environment.mockUsers.length);
  // Cast: the prod environment replaces mockUsers with `[]` (inferred never[]),
  // which broke the template type-check of ng build.
  mockUsers = environment.mockUsers as Array<{ username: string; password: string; role: string }>;

  async mockLogin(): Promise<void> {
    if (!this.username || !this.password) return;

    await this.auth.mockLogin(this.username, this.password);
    if (this.auth.isAuthenticated()) {
      const returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
      await this.router.navigateByUrl(returnUrl);
    }
  }

  fillCredentials(username: string, password: string): void {
    this.username = username;
    this.password = password;
  }

  keycloakLogin(): void {
    this.auth.login();
  }
}