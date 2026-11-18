import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { WorkflowStage, StageLabel } from '../../../models/idp.models';

@Component({
  selector: 'app-stage-indicator',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <nav class="stage-indicator" aria-label="Этапы составления ИПР">
      <ol class="steps">
        @for (step of filteredSteps(); track step.stage; let i = $index) {
          <li class="step" [class.active]="step.stage === currentStage()" [class.completed]="isCompleted(step.stage)" [class.current]="step.stage === currentStage()">
            <button
              type="button"
              class="step-button"
              [disabled]="!canNavigate(step.stage)"
              (click)="navigate.emit(step.stage)"
              [attr.aria-current]="step.stage === currentStage() ? 'step' : null"
              [attr.aria-label]="'Шаг ' + step.stepNumber + ': ' + step.label + (step.stage === currentStage() ? ', текущий' : isCompleted(step.stage) ? ', завершен' : '')"
            >
              <span class="step-number">{{ step.stepNumber }}</span>
              <span class="step-label">{{ step.label }}</span>
            </button>
            @if (i < filteredSteps().length - 1) {
              <div class="step-connector" [class.completed]="isCompleted(step.stage)"></div>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: [`
    .stage-indicator {
      overflow-x: auto;
      padding: 8px 0;
    }

    .steps {
      display: flex;
      align-items: flex-start;
      width: 100%;
      padding: 0 8px;
    }

    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1 1 0;
      min-width: 96px;
      position: relative;
    }

    .step-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: center;
      transition: background-color 0.2s;
      border-radius: 8px;
    }

    .step-button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .step-button:not(:disabled):hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.875rem;
      background: var(--idp-marker-todo);
      color: #fff;
      border: 2px solid transparent;
      transition: background-color 0.2s;
    }

    .step.active .step-number {
      background: var(--idp-rail-chip);
      color: #fff;
      border-color: var(--idp-rail-chip);
      box-shadow: 0 0 0 4px rgba(37, 162, 119, 0.25);
    }

    .step.completed .step-number {
      background: var(--idp-marker-done);
      color: #fff;
      border-color: var(--idp-marker-done);
    }

    .step-label {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      max-width: 100%;
      padding: 0 4px;
      line-height: 1.3;
      text-wrap: balance;
    }

    .step.active .step-label {
      color: var(--idp-rail-chip);
      font-weight: 500;
    }

    .step.completed .step-label {
      color: var(--mat-sys-on-surface);
    }

    .step-connector {
      position: absolute;
      top: 15px;
      left: 50%;
      right: -50%;
      height: 2px;
      background: var(--idp-marker-todo);
      z-index: -1;
    }

    .step-connector.completed {
      background: var(--idp-marker-done);
    }

    .step:last-child .step-connector {
      display: none;
    }
  `],
})
export class StageIndicatorComponent {
  currentStage = input.required<WorkflowStage>();
  steps = input.required<StageLabel[]>();

  navigate = output<WorkflowStage>();

  /** The "Контекст сотрудника" step is loaded automatically; it is not a user-facing stage. */
  readonly filteredSteps = computed(() =>
    this.steps().filter((step) => step.stage !== 'STAGE_1_CONTEXT')
  );

  isCompleted(stage: WorkflowStage): boolean {
    const stages = this.filteredSteps().map((s) => s.stage);
    const currentIndex = stages.indexOf(this.currentStage());
    return stages.indexOf(stage) < currentIndex;
  }

  canNavigate(stage: WorkflowStage): boolean {
    const stages = this.filteredSteps().map((s) => s.stage);
    const currentIndex = stages.indexOf(this.currentStage());
    const targetIndex = stages.indexOf(stage);
    // Can navigate to completed stages and current stage
    return targetIndex <= currentIndex;
  }
}
