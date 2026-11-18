import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { IdpStoreService } from '../../core/state/idp-store.service';
import { IdpWorkflowService } from './services/idp-workflow.service';
import { WorkflowStage } from '../../models/idp.models';

/**
 * Child route segment → WorkflowStage checked by the workflow service.
 * `draft` maps to STAGE_4_REFINEMENT because draft display and refinement
 * share stage 4 per design (STAGE_3_DRAFT_GEN has no route of its own).
 */
const STAGE_BY_PATH: Readonly<Record<string, WorkflowStage>> = {
  onboarding: 'STAGE_1_2_ONBOARDING',
  assessment: 'STAGE_2_QUESTIONNAIRE',
  draft: 'STAGE_4_REFINEMENT',
  refinement: 'STAGE_4_REFINEMENT',
  completion: 'STAGE_5_COMPLETED',
};

/**
 * C4: blocks deep links to stages the workflow hasn't reached yet (a direct
 * URL to /idp/draft or /idp/completion on a fresh session used to render an
 * empty-plan export UI). Delegates the verdict entirely to
 * IdpWorkflowService.canActivateStage (back is always allowed, forward is
 * gated on workflow preconditions). Auth concerns stay in authGuard.
 *
 * The guard runs BEFORE the shell component is created, so on a fresh
 * session (e.g. login returnUrl=/idp/draft) the store still holds the
 * default stage/context. It therefore awaits the shared context load first
 * — the same in-flight promise the shell reuses — so the decision reflects
 * the backend-reported stage/targetPosition.
 *
 * Negative verdict → UrlTree to the highest stage the workflow currently
 * allows (`/idp/onboarding` as the floor) so the user lands where the backend
 * says they belong instead of at a hard-coded early stage.
 */
export const stageGuard: CanActivateFn = async (route) => {
  const workflow = inject(IdpWorkflowService);
  const store = inject(IdpStoreService);
  const router = inject(Router);

  const stage = STAGE_BY_PATH[route.routeConfig?.path ?? ''];
  if (!stage) return true;

  // Only load when nothing is known yet: a resolved context or an earlier
  // failure (store.contextError) already determines the stage. Failures are
  // swallowed here — the redirect below sends the user to onboarding.
  if (store.context() === null && store.contextError() === null) {
    await workflow.loadContext().catch(() => {
      /* store.contextError holds the failure; redirect logic below applies */
    });
  }

  if (workflow.canActivateStage(stage)) return true;

  // Highest allowed stage: "back" is always allowed, so the last path whose
  // precondition passes is the furthest reachable stage (insertion order runs
  // onboarding → completion; unknown for this session → falls back to onboarding).
  let redirect = '/idp/onboarding';
  for (const path of Object.keys(STAGE_BY_PATH)) {
    const candidate = STAGE_BY_PATH[path];
    if (candidate && workflow.canActivateStage(candidate)) redirect = `/idp/${path}`;
  }
  return router.parseUrl(redirect);
};
