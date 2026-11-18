import { Injectable, signal, inject } from '@angular/core';
import { IdpWorkflowService } from '../../features/idp/services/idp-workflow.service';
import { Scenario } from '../../models/idp.models';

interface MockVariant {
  id: string;
  name: string;
  scenario: Scenario;
}

/**
 * Dev-only catalog of employee scenarios for the floating variant switcher.
 *
 * IMPORTANT: this service no longer invents context/skills/stage locally.
 * Selecting a variant only updates the UI badge and asks the workflow to
 * switch the backend scenario via POST /mock/scenario; the backend remains
 * the sole source of truth for stage/context/skills (GET /session/context
 * + SSE STAGE_UPDATE).
 */
@Injectable({ providedIn: 'root' })
export class MockDataService {
  private readonly workflow = inject(IdpWorkflowService);

  // Current variant signal (used only for the dev badge/UI)
  readonly currentVariant = signal<string>('frontend');
  readonly variants = signal<MockVariant[]>(this.buildVariants());

  // Apply variant: backend is the source of truth; do not invent stage/context/skills here.
  async applyVariant(variantId: string): Promise<void> {
    const variant = this.variants().find(v => v.id === variantId);
    if (!variant) return;

    this.currentVariant.set(variantId);
    await this.workflow.switchScenario(variant.scenario);
  }

  private buildVariants(): MockVariant[] {
    return [
      { id: 'frontend', name: 'Frontend Developer', scenario: 'known_employee' },
      { id: 'qa', name: 'QA Engineer', scenario: 'known_employee' },
      { id: 'backend', name: 'Backend Developer', scenario: 'known_employee' },
      { id: 'manager', name: 'Engineering Manager', scenario: 'known_employee' },
      { id: 'generic', name: 'Generic Specialist', scenario: 'new_employee' },
    ];
  }
}
