import { Component, input, model, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SkillAssessmentItem } from '../../../models/idp.models';

@Component({
  selector: 'app-skill-rating',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="skill-rating" [class.readonly]="readonly()">
      <div class="skill-info">
        <h4 class="skill-name">{{ skill().skillName }}</h4>
        <p class="skill-description">{{ skill().description }}</p>
      </div>

      <div class="rating-controls">
        <span class="rate-label">Самооценка:</span>
        <div class="tiles" role="radiogroup" [attr.aria-label]="'Оценка навыка ' + skill().skillName">
          @for (n of stars(); track n) {
            <button
              type="button"
              class="tile"
              [class.fill]="hover() === null && n <= currentValue()"
              [class.preview]="hover() !== null && n <= (hover() ?? 0)"
              [disabled]="readonly()"
              [attr.aria-label]="'Оценка ' + n + ' из 5'"
              [attr.aria-checked]="n === currentValue()"
              (click)="setRating(n)"
              (mouseenter)="onHover(n)"
              (mouseleave)="hover.set(null)"
            >{{ n }}</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .skill-rating {
      display: flex;
      align-items: flex-start;
      gap: 24px;
      padding: 18px 20px;
      background: #fff;
      border: 1px solid #eceef1;
      border-radius: 12px;
      box-shadow: 0 1px 2px rgba(20, 28, 40, 0.04);
    }

    .skill-info { flex: 1 1 auto; min-width: 0; }

    .skill-name {
      margin: 0 0 6px;
      font: 600 16px/22px var(--font-medium);
      color: #1f2733;
    }

    .skill-description {
      margin: 0;
      font: 400 14px/21px var(--font-regular);
      color: #8a94a0;
      overflow-wrap: anywhere;
    }

    .rating-controls {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .rate-label { color: #8a94a0; font-size: 13px; }

    .tiles { display: flex; gap: 7px; }

    .tile {
      width: 34px;
      height: 34px;
      border-radius: 7px;
      border: 0;
      background: #e5e8ec;
      color: #9aa3ae;
      font: 600 14px/1 var(--font-medium);
      display: grid;
      place-items: center;
      cursor: pointer;
      transition: background 0.1s, color 0.1s, transform 0.06s;
    }
    .tile:not(:disabled):hover { transform: translateY(-1px); }
    .tile.fill { background: #1fa882; color: #fff; }
    .tile.preview { background: #bfe6da; color: #2b6c5a; }
    .tile:disabled { cursor: default; }

    .tile:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    @media (max-width: 640px) {
      .skill-rating { flex-direction: column; gap: 14px; }
    }
  `],
})
export class SkillRatingComponent {
  skill = input.required<SkillAssessmentItem>();
  rating = model<number | null>(null);
  readonly = input(false);

  readonly stars = computed(() => [1, 2, 3, 4, 5]);
  readonly hover = signal<number | null>(null);

  /** Текущее значение: в режиме правки — модель, в readonly — из skill. */
  readonly currentValue = computed(() =>
    (this.readonly() ? this.skill().rating : this.rating()) ?? 0
  );

  onHover(n: number): void {
    if (this.readonly()) return;
    this.hover.set(n);
  }

  setRating(value: number): void {
    if (this.readonly()) return;
    const newRating = this.rating() === value ? null : value;
    this.rating.set(newRating);
  }
}
