import { Component } from '@angular/core';
import { DraftComponent } from '../draft/draft.component';

/**
 * Refinement component — thin wrapper around DraftComponent, kept as a separate
 * route so STAGE_4_REFINEMENT and STAGE_3_DRAFT_GEN share one editor/chat
 * implementation (documented design: the stage lives in the store, not here).
 */
@Component({
  selector: 'app-refinement',
  standalone: true,
  imports: [DraftComponent],
  template: `<app-draft />`,
})
export class RefinementComponent {}