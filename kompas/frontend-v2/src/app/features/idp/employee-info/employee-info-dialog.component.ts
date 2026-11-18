import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EmployeeContext } from '../../../models/idp.models';

/**
 * Карточка сотрудника ИПР: открывается кнопкой «Информация о сотруднике»
 * из правой панели shell-компонента.
 */
@Component({
  selector: 'app-employee-info-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="employee-info">
      <header class="employee-info__header">
        <h2 class="employee-info__title">Информация о сотруднике</h2>
        <button
          mat-icon-button
          class="employee-info__close"
          type="button"
          aria-label="Закрыть"
          (click)="close()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <mat-dialog-content class="employee-info__content">
        <dl class="info-list">
          <div class="info-row">
            <dt class="info-row__label">ФИО</dt>
            <dd class="info-row__value">{{ data.fullName || '—' }}</dd>
          </div>

          <div class="info-row">
            <dt class="info-row__label">ID сотрудника</dt>
            <dd class="info-row__value">{{ data.employeeId || '—' }}</dd>
          </div>

          <div class="info-row">
            <dt class="info-row__label">Текущая должность</dt>
            <dd class="info-row__value">{{ positionOrFallback(data.currentPosition) }}</dd>
          </div>

          <div class="info-row">
            <dt class="info-row__label">Целевая должность</dt>
            <dd class="info-row__value">{{ positionOrFallback(data.targetPosition) }}</dd>
          </div>

          <div class="info-row">
            <dt class="info-row__label">Руководитель</dt>
            <dd class="info-row__value">{{ data.managerFullName || '—' }}</dd>
          </div>
        </dl>

        @if (data.hasActiveIdpWarning) {
          <div class="info-warning" role="status">
            <mat-icon>warning</mat-icon>
            <span>У сотрудника уже есть активный ИПР</span>
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="employee-info__actions">
        <button mat-flat-button color="primary" type="button" (click)="close()">Закрыть</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 520px;
      max-width: 100%;
      padding: 24px;
      box-sizing: border-box;
      color: var(--on-surface-high-emphasis-color);
    }

    .employee-info__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .employee-info__title {
      margin: 0;
      font: 500 16px/24px var(--font-medium);
      letter-spacing: 0.15px;
      color: var(--on-surface-high-emphasis-color);
    }

    .employee-info__close {
      flex: 0 0 auto;
      width: 32px;
      height: 32px;
      padding: 0;
      color: var(--on-surface-medium-emphasis-color);
    }

    .employee-info__close mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
    }

    .employee-info__content {
      padding: 0;
      margin: 16px 0 0;
      max-height: min(60vh, 480px);
    }

    .info-list {
      margin: 0;
      padding: 0;
    }

    .info-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
      padding: 10px 0;
      border-bottom: 1px solid var(--outline-color);
      font: 400 14px/20px var(--font-regular);
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-row__label {
      margin: 0;
      color: var(--on-surface-medium-emphasis-color);
    }

    .info-row__value {
      margin: 0;
      color: var(--on-surface-high-emphasis-color);
      overflow-wrap: anywhere;
    }

    // Две колонки (label + value) на широких экранах
    @media (min-width: 480px) {
      .info-row {
        grid-template-columns: 160px minmax(0, 1fr);
        gap: 12px;
        align-items: baseline;
      }
    }

    .info-warning {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 16px;
      padding: 12px;
      border-radius: var(--radius-lg);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font: 400 14px/20px var(--font-regular);
    }

    .info-warning mat-icon {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--mat-sys-error);
    }

    .employee-info__actions {
      padding: 16px 0 0;
      margin: 0;
      min-height: auto;
    }
  `],
})
export class EmployeeInfoDialogComponent {
  readonly data = inject<EmployeeContext>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EmployeeInfoDialogComponent>);

  close(): void {
    this.dialogRef.close();
  }

  /** Пустая должность в контексте показывается как «Не определена». */
  positionOrFallback(value: string | null): string {
    return value && value.trim().length > 0 ? value : 'Не определена';
  }
}
