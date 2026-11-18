import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmPlanData {
  mainGoal: string;
  directionsCount: number;
  tasksCount: number;
}

/**
 * Модалка «Подтвердите правильность данных» (макет Red elephant):
 * краткая сводка плана перед отправкой на согласование.
 */
@Component({
  selector: 'app-confirm-plan-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="cpd">
      <div class="cpd__badge"><mat-icon>fact_check</mat-icon></div>
      <h2 class="cpd__title">Подтвердите правильность данных</h2>
      <p class="cpd__sub">Проверьте ключевые параметры ИПР перед переходом к подтверждению.</p>

      <dl class="cpd__list">
        <div class="cpd__row">
          <dt>Ключевая цель</dt>
          <dd>{{ data.mainGoal.trim() || '— не указана' }}</dd>
        </div>
        <div class="cpd__row">
          <dt>Направлений развития</dt>
          <dd>{{ data.directionsCount }}</dd>
        </div>
        <div class="cpd__row">
          <dt>Всего действий</dt>
          <dd>{{ data.tasksCount }}</dd>
        </div>
      </dl>

      <div class="cpd__actions">
        <button mat-stroked-button (click)="close(false)">Назад к редактированию</button>
        <button mat-flat-button color="primary" (click)="close(true)">
          Подтвердить и продолжить
        </button>
      </div>
    </div>
  `,
  styles: [`
    .cpd { padding: 24px 24px 20px; max-width: 480px; }
    .cpd__badge {
      width: 52px; height: 52px; border-radius: 50%;
      background: #e9eef7; color: #1f6fd4;
      display: grid; place-items: center; margin-bottom: 14px;
    }
    .cpd__badge mat-icon { width: 28px; height: 28px; font-size: 28px; }
    .cpd__title { margin: 0 0 6px; font: 600 22px/28px var(--font-medium); color: #1f2733; }
    .cpd__sub { margin: 0 0 18px; color: #8a94a0; font-size: 14px; line-height: 1.5; }

    .cpd__list { margin: 0 0 22px; display: flex; flex-direction: column; gap: 10px; }
    .cpd__row {
      display: flex; align-items: baseline; gap: 16px;
      padding: 12px 14px; background: #f3f5f8; border-radius: 10px;
    }
    .cpd__row dt { flex: 0 0 170px; color: #8a94a0; font-size: 14px; margin: 0; }
    .cpd__row dd { flex: 1 1 auto; margin: 0; color: #1f2733; font-weight: 500; overflow-wrap: anywhere; }

    .cpd__actions { display: flex; justify-content: flex-end; gap: 12px; flex-wrap: wrap; }
  `],
})
export class ConfirmPlanDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConfirmPlanDialogComponent>);
  readonly data = inject<ConfirmPlanData>(MAT_DIALOG_DATA);

  close(confirmed: boolean): void {
    this.dialogRef.close(confirmed);
  }
}
