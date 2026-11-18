import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { CallbackComponent } from './features/auth/callback/callback.component';
import { EntryComponent } from './features/auth/entry/entry.component';
import { IdpEntryComponent } from './features/idp/idp-entry/idp-entry.component';
import { authGuard } from './core/auth/auth.guard';
import { stageGuard } from './features/idp/stage.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/idp', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'callback', component: CallbackComponent },
  // Вход из внешней системы «План развития»: /entry?token=<JWT>
  { path: 'entry', component: EntryComponent },

  {
    path: 'idp',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/idp/idp-shell/idp-shell.component').then((m) => m.IdpShellComponent),
        children: [
          { path: '', redirectTo: 'context', pathMatch: 'full' },
          {
            path: 'context',
            canActivate: [stageGuard],
            component: IdpEntryComponent,
          },
          {
            path: 'onboarding',
            canActivate: [stageGuard],
            loadComponent: () =>
              import('./features/idp/onboarding/onboarding.component').then(
                (m) => m.OnboardingComponent
              ),
          },
          {
            path: 'assessment',
            canActivate: [stageGuard],
            loadComponent: () =>
              import('./features/idp/assessment/assessment.component').then(
                (m) => m.AssessmentComponent
              ),
          },
          {
            path: 'draft',
            canActivate: [stageGuard],
            loadComponent: () =>
              import('./features/idp/draft/draft.component').then((m) => m.DraftComponent),
          },
          {
            path: 'refinement',
            canActivate: [stageGuard],
            loadComponent: () =>
              import('./features/idp/refinement/refinement.component').then(
                (m) => m.RefinementComponent
              ),
          },
          {
            path: 'completion',
            canActivate: [stageGuard],
            loadComponent: () =>
              import('./features/idp/completion/completion.component').then(
                (m) => m.CompletionComponent
              ),
          },
        ],
      },
    ],
  },

  { path: '**', redirectTo: '/idp' },
];