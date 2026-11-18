import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowStage, StageLabel } from '../../../models/idp.models';

/**
 * Компактный вертикальный виджет этапов ИПР для правой панели
 * (аналог «Статус ИПР» в макете).
 */
@Component({
  selector: 'app-stage-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="stage-widget" aria-label="Этапы составления ИПР">
      <ol class="stage-widget__list">
        @for (step of filteredSteps(); track step.stage) {
          <li
            class="stage-widget__item"
            [class.is-active]="step.stage === currentStage()"
            [class.is-done]="isCompleted(step.stage)"
          >
            <button
              type="button"
              class="stage-widget__button"
              [disabled]="!canNavigate(step.stage)"
              [attr.aria-current]="step.stage === currentStage() ? 'step' : null"
              [attr.aria-label]="'Шаг ' + step.stepNumber + ': ' + step.label"
              (click)="navigate.emit(step.stage)"
            >
              <span class="stage-widget__marker" aria-hidden="true"></span>
              <span class="stage-widget__label">{{ step.label }}</span>
            </button>
          </li>
        }
      </ol>
    </nav>
  `,
  styles: [`
    .stage-widget__list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .stage-widget__item {
      position: relative;
      margin-bottom: 12px;
    }

    .stage-widget__item:last-child {
      margin-bottom: 0;
    }

    .stage-widget__button {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 16px;
      padding: 0;
      border: 0;
      background: none;
      text-align: left;
      cursor: pointer;
      color: #1F1F1F;
    }

    .stage-widget__button:disabled {
      cursor: default;
    }

    .stage-widget__marker {
      flex: 0 0 auto;
      width: 8px;
      height: 16px;
      border-radius: 2px;
      background: var(--idp-marker-todo);
      transition: background-color 0.2s ease, box-shadow 0.2s ease;
    }

    .stage-widget__label {
      font: 400 13px/18px var(--font-regular);
      color: #1F1F1F;
    }

    .stage-widget__item.is-done .stage-widget__marker {
      background: var(--idp-marker-done);
    }

    .stage-widget__item.is-done .stage-widget__label {
      color: #1F1F1F;
    }

    .stage-widget__item.is-active .stage-widget__marker {
      background: var(--idp-marker-done);
    }

    .stage-widget__item.is-active .stage-widget__label {
      color: #1F1F1F;
      font-family: var(--font-medium);
      font-weight: 500;
    }

    .stage-widget__item:not(.is-active):not(.is-done) .stage-widget__label {
      color: #1F1F1F;
    }
  `],
})
export class StageWidgetComponent {
  currentStage = input.required<WorkflowStage>();
  steps = input.required<StageLabel[]>();

  navigate = output<WorkflowStage>();

  /** The "Контекст сотрудника" step is loaded automatically; it is not a user-facing stage. */
  readonly filteredSteps = computed(() =>
    this.steps().filter((step) => step.stage !== 'STAGE_1_CONTEXT')
  );

  isCompleted(stage: WorkflowStage): boolean {
    const steps = this.filteredSteps();
    const order = steps.map((s) => s.stage);
    const currentIndex = order.indexOf(this.currentStage());
    return order.indexOf(stage) < currentIndex;
  }

  canNavigate(stage: WorkflowStage): boolean {
    const steps = this.filteredSteps();
    const order = steps.map((s) => s.stage);
    const currentIndex = order.indexOf(this.currentStage());
    const targetIndex = order.indexOf(stage);
    return targetIndex <= currentIndex;
  }
}
