import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { ApiError } from '../../../core/api/api-error';
import { StageIndicatorComponent } from '../../../shared/components/stage-indicator/stage-indicator.component';
import { WorkflowStage } from '../../../models/idp.models';
import { PositionPickerDialogComponent, PositionPickerData } from './position-picker-dialog.component';

type Mode = 'none' | 'current' | 'target';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, StageIndicatorComponent],
  template: `
    <div class="onboarding-page">
      <app-stage-indicator
        [currentStage]="store.currentStage()"
        [steps]="store.stageLabels()"
        (navigate)="onStageNavigate($event)"
      />

      <div class="ob-scroll">
        <div class="ob-inner">
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
            @if (currentCrumbs(); as crumbs) {
              <div class="crumb">{{ crumbs }}</div>
            }
            @if (store.currentPositionProfile()?.keyFunctions?.length) {
              <div class="fn-block">
                <div class="fn-title">Функции текущей должности:</div>
                <ul class="fn-list">
                  @for (fn of store.currentPositionProfile()!.keyFunctions; track $index) {
                    <li>{{ fn }}</li>
                  }
                </ul>
              </div>
            } @else {
              <p class="fn-note">Индивидуальный план развития будет построен для вашей текущей должности.</p>
            }
          </div>
        }

        <!-- Целевая должность -->
        @if (mode() === 'target') {
          <div class="info">
            <span class="i">!</span>
            <span>Важно: целевая должность определяет компетенционный профиль для опросника на следующем шаге</span>
          </div>

          @if (selectedTarget(); as sel) {
            <div class="pos-card">
              <button type="button" class="card-edit" (click)="openPositionPicker()"
                      matTooltip="Изменить должность" aria-label="Изменить целевую должность">
                <mat-icon>edit</mat-icon>
              </button>
              <div class="pos-title">Целевая должность:&nbsp; <b>{{ sel }}</b></div>
              @if (targetCrumbs(); as crumbs) {
                <div class="crumb">{{ crumbs }}</div>
              }
              @if (store.targetPositionProfile()?.keyFunctions?.length) {
                <div class="fn-block">
                  <div class="fn-title">Функции целевой должности:</div>
                  <ul class="fn-list">
                    @for (fn of store.targetPositionProfile()!.keyFunctions; track $index) {
                      <li>{{ fn }}</li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
        }

        @if (submitError(); as error) {
          <div class="submit-error" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ error }}</span>
          </div>
        }
        </div>
      </div>

      <footer class="idp-actionbar ob-foot">
        <button mat-button type="button" (click)="goHome()">
          <mat-icon>arrow_back</mat-icon> Назад
        </button>
        <span class="idp-actionbar__spacer"></span>
        <button mat-flat-button color="primary" type="button" iconPositionEnd
                [disabled]="!isFormValid() || submitting()" (click)="submit()">
          @if (submitting()) { <mat-spinner diameter="18"></mat-spinner> }
          @else { Продолжить <mat-icon>arrow_forward</mat-icon> }
        </button>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .onboarding-page { height: 100%; display: flex; flex-direction: column; min-height: 0; }
    .ob-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 22px 24px 20px; }
    .ob-inner { max-width: 1000px; margin: 0 auto; }

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

    .pos-card { position: relative; margin-top: 18px; background: #eef0f3; border-radius: 12px; padding: 20px 22px; max-width: 980px; }
    .pos-card .card-edit {
      position: absolute; top: 14px; right: 14px;
      width: 36px; height: 36px; border: 0; border-radius: 9px;
      background: transparent; color: #1f6fd4; cursor: pointer;
      display: grid; place-items: center; transition: background .12s;
    }
    .pos-card .card-edit:hover { background: #e2e7ee; }
    .pos-card .card-edit mat-icon { width: 20px; height: 20px; font-size: 20px; }
    .pos-card .pos-title { padding-right: 44px; }
    .pos-card .pos-title { font-size: 16px; color: #1f2733; }
    .pos-card .pos-title b { font-weight: 600; }
    .pos-card .crumb { margin: 6px 0 0; color: #8a94a0; font-size: 14px; }
    .pos-card .fn-note { margin: 14px 0 0; color: #39424e; font-size: 14px; }
    .pos-card .fn-block { margin: 16px 0 0; }
    .pos-card .fn-title { font-weight: 600; font-size: 15px; color: #1f2733; margin-bottom: 8px; }
    .pos-card .fn-list { margin: 0; padding-left: 20px; color: #39424e; font-size: 14px; line-height: 1.55; }
    .pos-card .fn-list li { margin: 4px 0; }

    .info { display: flex; gap: 12px; align-items: flex-start; margin-top: 16px; background: #e9eef7; color: #2f6fd4; border-radius: 10px; padding: 14px 16px; max-width: 980px; font-size: 15px; line-height: 1.45; }
    .info .i { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; background: #1f6fd4; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 14px; margin-top: 1px; }

    .submit-error { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 12px; background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container); border-radius: 8px; font-size: 0.875rem; max-width: 980px; }

    .ob-foot { flex: 0 0 auto; max-width: 1000px; width: 100%; margin: 0 auto; border-radius: 12px 12px 0 0; }

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

  private readonly dialog = inject(MatDialog);

  readonly mode = signal<Mode>('none');
  readonly selectedTarget = signal<string | null>(null);

  readonly submitError = signal('');
  readonly submitting = signal(false);

  readonly currentPosition = computed(() => this.store.context()?.currentPosition ?? '');

  readonly subtitle = computed(() =>
    this.mode() === 'none'
      ? 'Определите ключевую цель развития и составьте план действий для ее достижения'
      : 'Собрать индивидуальный план развития в диалоге с ИИ'
  );

  /** Крошки «Блок > Дирекция > Семейство > Должность» для выбранной целевой должности. */
  readonly targetCrumbs = computed(() => {
    const title = this.selectedTarget();
    if (!title) return '';
    const p = this.store.targetPositions().find(r => r.title === title);
    if (!p) return '';
    const parts = [p.orgBlock, p.orgDirection, p.careerTrack, p.title].filter((x): x is string => !!x);
    return parts.filter((x, i) => i === 0 || x !== parts[i - 1]).join(' > ');
  });

  readonly isFormValid = computed(() => {
    if (this.mode() === 'current') return this.currentPosition().trim().length > 0;
    if (this.mode() === 'target') return !!this.selectedTarget()?.trim();
    return false;
  });

  // Целевая должность по умолчанию НЕ выбрана — пользователь выбирает её сам
  // в модалке. Контекстный `targetPosition` намеренно не предзаполняем.

  /** Крошки орг-пути текущей должности: Блок > Дирекция > Семейство > Должность. */
  readonly currentCrumbs = computed(() => {
    const p = this.store.currentPositionProfile();
    if (!p) return '';
    const parts = [p.orgBlock, p.orgDirection, p.careerTrack, p.title].filter((x): x is string => !!x);
    return parts.filter((x, i) => i === 0 || x !== parts[i - 1]).join(' > ');
  });

  selectMode(mode: Mode): void {
    const prev = this.mode();
    this.mode.set(mode);
    this.submitError.set('');
    if (mode === 'current') {
      const cur = this.currentPosition();
      if (cur) void this.store.loadPositionProfile(cur);
    } else if (mode === 'target') {
      const sel = this.selectedTarget();
      if (sel) void this.store.loadTargetPositionProfile(sel);
      // При выборе радио «целевая должность» сразу открываем попап выбора.
      // Дальше сменить должность можно карандашом в углу карточки.
      if (prev !== 'target') void this.openTargetPickerOnEnter();
    }
  }

  /**
   * Авто-открытие попапа при входе в режим целевой должности.
   * Если попап закрыли без выбора и раньше должности не было — снимаем выбор
   * радио (возвращаемся к «ничего не выбрано»), заглушку не показываем.
   */
  private async openTargetPickerOnEnter(): Promise<void> {
    const had = this.selectedTarget();
    const picked = await this.openPositionPicker();
    if (!picked && !had && this.mode() === 'target') {
      this.mode.set('none');
    }
  }

  /** Открывает модалку «Выберите должность» с деревом; возвращает выбранную должность или null. */
  async openPositionPicker(): Promise<string | null> {
    const positions = this.store.targetPositions();
    const ctxTarget = this.store.context()?.targetPosition;
    const rows = positions.length
      ? [...positions]
      : this.store.targetRoles().map(t => ({ title: t, careerTrack: null, orgBlock: null, orgDirection: null }));
    // Значение из контекста, если его нет в списке — добавим отдельной веткой «Прочее».
    if (ctxTarget && !rows.some(r => r.title === ctxTarget)) {
      rows.unshift({ title: ctxTarget, careerTrack: null, orgBlock: null, orgDirection: null });
    }

    const ref = this.dialog.open(PositionPickerDialogComponent, {
      data: { positions: rows, selected: this.selectedTarget() } satisfies PositionPickerData,
      width: '760px',
      maxWidth: '94vw',
      autoFocus: false,
    });
    const picked = await firstValueFrom(ref.afterClosed());
    if (picked) {
      this.selectedTarget.set(picked);
      this.submitError.set('');
      void this.store.loadTargetPositionProfile(picked);
      return picked;
    }
    return null;
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
