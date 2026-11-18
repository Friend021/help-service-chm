import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { StageIndicatorComponent } from '../../../shared/components/stage-indicator/stage-indicator.component';
import { ExportDialogComponent } from '../../../shared/components/export-dialog/export-dialog.component';
import { DirectionCardComponent } from '../../../shared/components/direction-card/direction-card.component';
import { Dictionaries, WorkflowStage } from '../../../models/idp.models';

@Component({
  selector: 'app-completion',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    StageIndicatorComponent,
    DirectionCardComponent,
  ],
  template: `
    <div class="completion-page">
      <app-stage-indicator
        [currentStage]="store.currentStage()"
        [steps]="store.stageLabels()"
        (navigate)="onStageNavigate($event)"
      />

      <div class="completion-content">
        <mat-card class="summary-card" appearance="outlined">
          <mat-card-header>
            <mat-card-title>ИПР готов к экспорту</mat-card-title>
            <mat-card-subtitle>Шаг 5: Проверьте план и подтвердите перенос в систему «План развития»</mat-card-subtitle>
          </mat-card-header>

          <mat-card-content>
            <div class="plan-summary">
              <div class="summary-section">
                <h3>Главная цель</h3>
                <p class="main-goal">{{ store.draft().mainGoal || '— не указана' }}</p>
              </div>

              @if (store.validationErrors().length > 0) {
                <div class="validation-summary" role="alert">
                  <mat-icon color="warn">warning</mat-icon>
                  <div>
                    <strong>Ошибки валидации ({{ store.validationErrors().length }})</strong>
                    <ul>
                      @for (error of store.validationErrors(); track $index) {
                        <li>{{ error.message }}</li>
                      }
                    </ul>
                  </div>
                </div>
              }

              <mat-divider></mat-divider>

              <div class="summary-section">
                <h3>Направления развития ({{ store.directionsCount() }})</h3>
                <div class="directions-readonly">
                  @for (direction of store.draft().directions; track $index; let i = $index) {
                    <app-direction-card
                      [direction]="direction"
                      [index]="i"
                      [dictionaries]="dictionaries()"
                      [reorderable]="false"
                    />
                  }
                </div>
              </div>
            </div>
          </mat-card-content>

          <mat-card-actions align="end">
            <button mat-button (click)="goBack()">Вернуться к правкам</button>
            <button
              mat-flat-button
              color="primary"
              [disabled]="exporting()"
              (click)="openExportDialog()"
            >
              @if (exporting()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <ng-container>
                  <mat-icon>send</mat-icon>
                  Экспортировать в «План развития»
                </ng-container>
              }
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    // Карточки: внутренние отступы 16px, действия отделены 16px снизу — единый ритм ДС
    .completion-page {
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }

    .completion-content {
      margin-top: 24px;
    }

    .summary-card {
      width: 100%;
    }

    .plan-summary {
      padding: 8px 0;
    }

    .summary-section {
      margin-bottom: 24px;
    }

    .summary-section h3 {
      margin: 0 0 12px 0;
      font-size: 1rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface);
    }

    .main-goal {
      margin: 0;
      padding: 16px;
      background: var(--mat-sys-surface-container-low);
      border-radius: 8px;
      font-size: 1.125rem;
      line-height: 1.5;
      color: var(--mat-sys-on-surface);
      border-left: 4px solid var(--mat-sys-primary);
    }

    .validation-summary {
      margin-bottom: 24px;
      padding: 12px 16px;
      display: flex;
      gap: 8px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      border-radius: 8px;
      font-size: 0.875rem;
    }

    .validation-summary ul {
      margin: 8px 0 0 0;
      padding-left: 16px;
    }

    .directions-readonly {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    // Единый внутренний отступ контента карточки: 16px по бокам.
    // Нижние 8px + верхние 8px у mat-card-actions дают 16px между блоками.
    mat-card-content {
      padding: 0 16px 8px;
    }

    // Контент — последний блок карточки (чат, старт): снизу те же 16px.
    mat-card-content:last-child {
      padding-bottom: 16px;
    }

    // Действия: 16px снизу до границы карточки и 16px по бокам.
    mat-card-actions {
      padding: 8px 16px 16px;
      margin: 0;
      gap: 12px;
    }
  `],
})
export class CompletionComponent implements OnInit {
  private readonly store = inject(IdpStoreService);
  private readonly workflow = inject(IdpWorkflowService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  exporting = signal(false);

  dictionaries = computed<Dictionaries>(() => ({
    directions: this.store.directions(),
    tools: this.store.tools(),
    priorities: this.store.priorities(),
  }));

  ngOnInit(): void {
    // Hydration (D-3r #3): after a hard reload at stage 5 the in-memory plan
    // is empty; the store guard skips the GET whenever a draft is already
    // loaded, so a live editing session is never clobbered.
    void this.store.ensureDraftLoaded();
  }

  openExportDialog(): void {
    const dialogRef = this.dialog.open(ExportDialogComponent, {
      data: {
        plan: this.store.draft(),
        validationErrors: this.store.validationErrors(),
      },
      width: '500px',
      maxWidth: '90vw',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.exportPlan();
      }
    });
  }

  async exportPlan(): Promise<void> {
    this.exporting.set(true);
    try {
      // On success the workflow redirects to the backend-provided returnUrl.
      await this.workflow.exportPlan();
    } catch {
      // Export failed (e.g. 422 with validation errors): surface them in the dialog.
      this.openExportDialog();
    } finally {
      this.exporting.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/idp/draft']);
  }

  onStageNavigate(stage: WorkflowStage): void {
    if (!this.workflow.canActivateStage(stage)) return;
    if (stage === 'STAGE_4_REFINEMENT') {
      this.goBack();
    }
  }
}