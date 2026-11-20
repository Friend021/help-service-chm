import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ExportSuccessData {
  /** Есть ли куда переходить (handover-URL «Плана развития»). */
  hasReturnUrl: boolean;
}

/**
 * Окно подтверждения успешного экспорта ИПР в «План развития».
 * close(true) — перейти в «План развития», close(false) — остаться в Компасе.
 */
@Component({
  selector: 'app-export-success-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="esd">
      <div class="esd__badge"><mat-icon>check_circle</mat-icon></div>
      <h2 class="esd__title">ИПР экспортирован в «План развития»</h2>
      <p class="esd__sub">
        Индивидуальный план развития успешно передан в систему «План развития».
        @if (data.hasReturnUrl) {
          Перейдите туда, чтобы продолжить работу с планом, или останьтесь в Компасе.
        }
      </p>

      <div class="esd__actions">
        <button mat-stroked-button (click)="close(false)">Остаться в Компасе</button>
        @if (data.hasReturnUrl) {
          <button mat-flat-button color="primary" (click)="close(true)">
            <mat-icon>open_in_new</mat-icon>
            Перейти в «План развития»
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .esd { padding: 24px 24px 20px; max-width: 460px; text-align: left; }
    .esd__badge {
      width: 56px; height: 56px; border-radius: 50%;
      background: #e3f6ec; color: #1f9d57;
      display: grid; place-items: center; margin-bottom: 14px;
    }
    .esd__badge mat-icon { width: 32px; height: 32px; font-size: 32px; }
    .esd__title { margin: 0 0 8px; font: 600 22px/28px var(--font-medium); color: #1f2733; }
    .esd__sub { margin: 0 0 22px; color: #566070; font-size: 15px; line-height: 1.5; }
    .esd__actions { display: flex; justify-content: flex-end; gap: 12px; flex-wrap: wrap; }
  `],
})
export class ExportSuccessDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ExportSuccessDialogComponent, boolean>);
  readonly data = inject<ExportSuccessData>(MAT_DIALOG_DATA);

  close(goToPlan: boolean): void {
    this.dialogRef.close(goToPlan);
  }
}
