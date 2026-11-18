import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (route, state): Promise<boolean> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // One-shot wait for keycloak initialization — no polling.
  await authService.waitForInit();

  if (authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
};
