import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../core/api.service';
import { TokenService } from '../core/token.service';

@Component({
  selector: 'app-entry',
  standalone: true,
  imports: [MatProgressSpinnerModule, MatIconModule],
  template: `
    <div class="entry">
      <div class="card">
        <div class="brand">Компас</div>

        @if (error()) {
          <div class="error">
            <mat-icon>error_outline</mat-icon>
            <div>
              <div class="error__title">Не удалось открыть сервис</div>
              <div class="error__text">{{ error() }}</div>
              <div class="error__hint">
                Вернитесь в «ПЛАН РАЗВИТИЯ» и снова нажмите «Сформировать с помощью Компаса».
              </div>
            </div>
          </div>
        } @else {
          <mat-spinner diameter="36"></mat-spinner>
          <div class="status">Проверяем токен входа и открываем сессию…</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .entry {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }

    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      width: 100%;
      max-width: 520px;
      padding: 40px 32px;
      background: #fff;
      border: 1px solid var(--kompas-border);
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    }

    .brand {
      font-size: 24px;
      font-weight: bold;
      color: var(--kompas-teal);
    }

    .status {
      color: #6b7478;
      font-size: 14px;
      text-align: center;
    }

    .error {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      color: #b3261e;
      text-align: left;
    }

    .error__title {
      font-weight: bold;
      margin-bottom: 6px;
    }

    .error__text {
      color: #2b3134;
      font-size: 14px;
    }

    .error__hint {
      margin-top: 10px;
      color: #6b7478;
      font-size: 13px;
    }
  `]
})
export class EntryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly tokens = inject(TokenService);

  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.error.set('В ссылке нет токена входа.');
      return;
    }

    this.tokens.clear();
    this.api.createSession(token).subscribe({
      next: (session) => {
        if (session.accessToken) {
          this.tokens.set(session.accessToken);
        }
        void this.router.navigate(['/chat', session.sessionId]);
      },
      error: (response) => {
        this.error.set(response?.error?.error ?? 'Сервис недоступен. Попробуйте позже.');
      }
    });
  }
}
