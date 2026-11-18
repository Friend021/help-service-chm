import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { ApiError } from '../../../core/api/api-error';
import { StageIndicatorComponent } from '../../../shared/components/stage-indicator/stage-indicator.component';
import { WorkflowStage } from '../../../models/idp.models';

type Mode = 'none' | 'current' | 'target';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule, StageIndicatorComponent],
  template: `
    <div class="onboarding-page">
      <app-stage-indicator
        [currentStage]="store.currentStage()"
        [steps]="store.stageLabels()"
        (navigate)="onStageNavigate($event)"
      />

      <div class="ob-scroll">
        <a class="back" href="#" (click)="$event.preventDefault()">
          <mat-icon>arrow_back</mat-icon> На главную
        </a>
        <h1>Создать ИПР: Компас</h1>
        <p class="sub">{{ subtitle() }}</p>
        <div class="rule"></div>

        <div class="sec-head">
          <h2>Подтверждение должностей</h2>
          <span class="step">Шаг 1 из 2</span>
        </div>

        <div class="radios" role="radiogroup" aria-label="Для какой должности строим ИПР">
          <button type="button" class="radio" [class.checked]="mode() === 'current'" (click)="selectMode('current')">
            <span class="dot"></span> ИПР для текущей должности
          </button>
          <button type="button" class="radio" [class.checked]="mode() === 'target'" (click)="selectMode('target')">
            <span class="dot"></span> ИПР для целевой должности
          </button>
        </div>

        <!-- Текущая должность -->
        @if (mode() === 'current') {
          <div class="pos-card">
            <div class="pos-title">Текущая должность:&nbsp; <b>{{ currentPosition() || '— не указана' }}</b></div>
            @if (store.context()?.managerFullName; as mgr) {
              <div class="crumb">Руководитель: {{ mgr }}</div>
            }
            <p class="fn-note">Индивидуальный план развития будет построен для вашей текущей должности.</p>
          </div>
        }

        <!-- Целевая должность -->
        @if (mode() === 'target') {
          <div class="info">
            <span class="i">!</span>
            <span>Важно: целевая должность определяет компетенционный профиль для опросника на следующем шаге</span>
          </div>
          <div class="search">
            <input type="text" [(ngModel)]="search" placeholder="Поиск по названию должности / подразделения">
            <mat-icon class="mag">search</mat-icon>
          </div>
          <div class="roles">
            @for (role of filteredRoles(); track role) {
              <button type="button" class="tleaf" [class.checked]="selectedTarget() === role" (click)="selectedTarget.set(role)">
                <span class="dot"></span> {{ role }}
              </button>
            } @empty {
              <p class="roles-empty">Ничего не найдено по запросу «{{ search() }}».</p>
            }
          </div>
        }

        @if (submitError(); as error) {
          <div class="submit-error" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ error }}</span>
          </div>
        }
      </div>

      <footer class="idp-actionbar ob-foot">
        <button type="button" class="fbtn" (click)="goHome()">
          <mat-icon>arrow_back</mat-icon> Назад
        </button>
        <span class="idp-actionbar__spacer"></span>
        <button type="button" class="fbtn primary" [disabled]="!isFormValid() || submitting()" (click)="submit()">
          @if (submitting()) { <mat-spinner diameter="18"></mat-spinner> }
          @else { <span>Продолжить</span> <mat-icon>arrow_forward</mat-icon> }
        </button>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .onboarding-page { height: 100%; display: flex; flex-direction: column; min-height: 0; }
    .ob-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 22px 30px 20px; }

    .back { display: inline-flex; align-items: center; gap: 8px; color: #8a94a0; text-decoration: none; font-size: 14px; margin-bottom: 12px; }
    .back mat-icon { width: 17px; height: 17px; font-size: 17px; }
    h1 { margin: 0; font: 700 32px/1.1 var(--font-medium); letter-spacing: -.01em; color: #1f2733; }
    .sub { margin: 4px 0 0; color: #8a94a0; font-size: 15px; }
    .rule { height: 1px; background: #e3e6ea; margin: 18px 0 22px; }

    .sec-head { display: flex; align-items: baseline; gap: 16px; margin: 0 0 16px; }
    .sec-head h2 { margin: 0; font: 600 22px/1.2 var(--font-medium); color: #1f2733; }
    .sec-head .step { margin-left: auto; color: #8a94a0; font-size: 15px; }

    .radios { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
    .radio { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; font-size: 16px; color: #39424e; background: none; border: 0; padding: 0; }
    .radio .dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #a7afba; flex: 0 0 auto; display: grid; place-items: center; transition: border-color .12s; }
    .radio .dot::after { content: ""; width: 11px; height: 11px; border-radius: 50%; background: #1f6fd4; transform: scale(0); transition: transform .12s; }
    .radio.checked .dot { border-color: #1f6fd4; }
    .radio.checked .dot::after { transform: scale(1); }

    .pos-card { margin-top: 18px; background: #eef0f3; border-radius: 12px; padding: 20px 22px; max-width: 980px; }
    .pos-card .pos-title { font-size: 16px; color: #1f2733; }
    .pos-card .pos-title b { font-weight: 600; }
    .pos-card .crumb { margin: 6px 0 0; color: #8a94a0; font-size: 14px; }
    .pos-card .fn-note { margin: 14px 0 0; color: #39424e; font-size: 14px; }

    .info { display: flex; gap: 12px; align-items: flex-start; margin-top: 16px; background: #e9eef7; color: #2f6fd4; border-radius: 10px; padding: 14px 16px; max-width: 980px; font-size: 15px; line-height: 1.45; }
    .info .i { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; background: #1f6fd4; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 14px; margin-top: 1px; }

    .search { margin-top: 16px; max-width: 980px; position: relative; }
    .search input { width: 100%; height: 52px; border: 1px solid #cdd3da; border-radius: 10px; background: #fbfcfd; padding: 0 46px 0 18px; font: inherit; font-size: 15px; color: #1f2733; }
    .search input::placeholder { color: #8a94a0; }
    .search .mag { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; font-size: 20px; color: #8a94a0; }

    .roles { margin-top: 14px; display: flex; flex-direction: column; gap: 4px; max-width: 980px; }
    .tleaf { display: inline-flex; align-items: center; gap: 12px; font-size: 16px; color: #39424e; cursor: pointer; background: none; border: 0; padding: 8px 4px; text-align: left; border-radius: 8px; }
    .tleaf:hover { background: #f3f5f8; }
    .tleaf .dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #a7afba; flex: 0 0 auto; display: grid; place-items: center; }
    .tleaf .dot::after { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #1f6fd4; transform: scale(0); transition: transform .12s; }
    .tleaf.checked .dot { border-color: #1f6fd4; }
    .tleaf.checked .dot::after { transform: scale(1); }
    .roles-empty { color: #8a94a0; font-size: 14px; padding: 8px 4px; }

    .submit-error { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 12px; background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container); border-radius: 8px; font-size: 0.875rem; max-width: 980px; }

    .ob-foot { flex: 0 0 auto; margin: 0 40px; border-radius: 12px 12px 0 0; }
    .fbtn { display: inline-flex; align-items: center; gap: 8px; background: transparent; border: 0; color: #fff; font-size: 14px; padding: 6px 4px; cursor: pointer; }
    .fbtn mat-icon { width: 17px; height: 17px; font-size: 17px; }
    .fbtn.primary { background: var(--primary-500); border-radius: 8px; padding: 8px 18px; }
    .fbtn.primary:disabled { opacity: .5; cursor: default; }

    @media (max-width: 720px) {
      .ob-scroll { padding: 18px 16px; }
      .ob-foot { margin: 0; border-radius: 0; }
      h1 { font-size: 26px; }
    }
  `],
})
export class OnboardingComponent {
  readonly store = inject(IdpStoreService);
  private readonly workflow = inject(IdpWorkflowService);
  private readonly router = inject(Router);

  readonly mode = signal<Mode>('none');
  readonly search = signal('');
  readonly selectedTarget = signal<string | null>(null);

  readonly submitError = signal('');
  readonly submitting = signal(false);

  readonly currentPosition = computed(() => this.store.context()?.currentPosition ?? '');

  readonly subtitle = computed(() =>
    this.mode() === 'none'
      ? 'Определите ключевую цель развития и составьте план действий для ее достижения'
      : 'Собрать индивидуальный план развития в диалоге с ИИ'
  );

  /** Список целевых ролей + значение из контекста; фильтруется поиском. */
  readonly targetOptions = computed(() => {
    const roles = this.store.targetRoles();
    const ctxTarget = this.store.context()?.targetPosition;
    if (ctxTarget && !roles.includes(ctxTarget)) return [ctxTarget, ...roles];
    return roles;
  });

  readonly filteredRoles = computed(() => {
    const q = this.search().trim().toLowerCase();
    const roles = this.targetOptions();
    return q ? roles.filter(r => r.toLowerCase().includes(q)) : roles;
  });

  readonly isFormValid = computed(() => {
    if (this.mode() === 'current') return this.currentPosition().trim().length > 0;
    if (this.mode() === 'target') return !!this.selectedTarget()?.trim();
    return false;
  });

  constructor() {
    // Предзаполняем целевую из контекста, как только он загрузится (один раз).
    let inited = false;
    effect(() => {
      const ctxTarget = this.store.context()?.targetPosition;
      if (!inited && ctxTarget) {
        this.selectedTarget.set(ctxTarget);
        inited = true;
      }
    });
  }

  selectMode(mode: Mode): void {
    this.mode.set(mode);
    this.submitError.set('');
  }

  async submit(): Promise<void> {
    if (!this.isFormValid() || this.submitting()) return;
    const current = this.currentPosition().trim();
    const target = this.mode() === 'current' ? current : (this.selectedTarget() ?? '').trim();
    this.submitError.set('');
    this.submitting.set(true);
    try {
      await this.workflow.submitManualContext(current, target);
      this.router.navigate(['/idp/assessment']);
    } catch (error) {
      const apiError = error as ApiError;
      this.submitError.set(apiError?.message ?? 'Не удалось сохранить должности. Попробуйте ещё раз.');
    } finally {
      this.submitting.set(false);
    }
  }

  goHome(): void {
    const url = this.store.context()?.returnUrl;
    if (url) { window.location.href = url; return; }
    this.router.navigate(['/idp/onboarding']);
  }

  onStageNavigate(stage: WorkflowStage): void {
    if (!this.workflow.canActivateStage(stage)) return;
  }
}
