import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { MockDataService } from '../../../core/state/mock-data.service';
import { environment } from '../../../environments/environment';

/**
 * Dev-only variant switcher (plan §7.3). Floating action button in the
 * bottom-right corner; visible only outside production builds. Shows the
 * active MockDataService variant as a badge and opens a menu with the
 * explicit 5-variant list (frontend/qa/backend/manager/generic).
 * Switching goes through the backend: applyVariant → POST /mock/scenario +
 * reload context via the existing workflow path, then navigate to '/idp'
 * so the entry component can send the user to the right first stage.
 */
@Component({
  selector: 'app-dev-tools',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!isProduction) {
      <button
        mat-fab
        color="primary"
        class="dev-fab"
        matTooltip="Dev Tools: сменить мок-варианта пользователя"
        [matBadge]="currentVariantId()"
        matBadgePosition="above after"
        matBadgeSize="small"
        [matMenuTriggerFor]="variantMenu"
      >
        <mat-icon>developer_mode</mat-icon>
      </button>

      <mat-menu #variantMenu="matMenu">
        @for (variant of variants(); track variant.id) {
          <button mat-menu-item (click)="selectVariant(variant.id)">
            <mat-icon>{{ variant.id === currentVariantId() ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
            <span>{{ variant.name }}</span>
          </button>
        }
      </mat-menu>
    }
  `,
  styles: [`
    .dev-fab {
      position: fixed;
      bottom: 76px;
      /* Слева от правого rail (320px) + отступ 24px, чтобы не перекрывать
         кнопку «Информация о сотруднике» внизу панели. */
      right: calc(320px + 24px);
      z-index: 1100;
    }

    /* Ниже 1100px rail скрыт — возвращаем FAB к правому краю. */
    @media (max-width: 1100px) {
      .dev-fab {
        right: 24px;
      }
    }
  `],
})
export class DevToolsComponent {
  private readonly mockData = inject(MockDataService);
  private readonly router = inject(Router);

  readonly isProduction = environment.production;
  readonly currentVariantId = computed(() => this.mockData.currentVariant());
  readonly variants = computed(() =>
    this.mockData.variants().map((v) => ({ id: v.id, name: v.name }))
  );

  async selectVariant(variantId: string): Promise<void> {
    if (variantId === this.currentVariantId()) return;

    // Backend is the source of truth: POST /mock/scenario and reload context
    // through the existing workflow path (clearSession + loadContext +
    // loadDictionariesOnce). Then force route re-evaluation.
    await this.mockData.applyVariant(variantId);
    await this.router.navigate(['/idp']);
  }
}
