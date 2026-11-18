import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IdpStoreService } from '../../../core/state/idp-store.service';

/**
 * Entry point for the IDP section.
 *
 * The employee context is loaded automatically by the shell; this component
 * simply waits until the context (or a context error) is available and then
 * redirects the user to the appropriate first stage:
 * - /idp/onboarding while the backend reports STAGE_1_2_ONBOARDING, i.e. the
 *   position step hasn't been confirmed yet (current is pre-filled, target is
 *   chosen there) — shown ALWAYS as a confirmation, even when positions are known.
 * - /idp/assessment once the context is confirmed and a target position exists.
 */
@Component({
  selector: 'app-idp-entry',
  standalone: true,
  template: '',
})
export class IdpEntryComponent {
  private readonly store = inject(IdpStoreService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const context = this.store.context();
      const contextError = this.store.contextError();

      // Wait until the shell-initiated context load settles one way or another.
      if (context === null && contextError === null) return;

      // Пока контекст не подтверждён, бэк отдаёт STAGE_1_2_ONBOARDING — всегда
      // показываем шаг должностей (подтверждение). После подтверждения — опросник.
      const onboarding = this.store.currentStage() === 'STAGE_1_2_ONBOARDING' || !context?.targetPosition;
      const target = onboarding ? '/idp/onboarding' : '/idp/assessment';
      void this.router.navigate([target], { replaceUrl: true });
    });
  }
}
