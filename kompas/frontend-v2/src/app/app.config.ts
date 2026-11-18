import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideClientHydration } from '@angular/platform-browser';
import { MAT_DATE_LOCALE } from '@angular/material/core';

import { routes } from './app.routes';
import { tokenInterceptor } from './core/auth/token.interceptor';
import { apiErrorInterceptor } from './core/api/api-error';
import { authGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';
import { ApiClientService } from './core/api/api-client.service';
import { SseService } from './core/api/sse.service';
import { IdpStoreService } from './core/state/idp-store.service';
import { IdpWorkflowService } from './features/idp/services/idp-workflow.service';
import { environment } from './environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([tokenInterceptor, apiErrorInterceptor])),
    provideAnimations(),
    provideClientHydration(),

    // Даты в формате ДД.ММ.ГГГГ (дизайн-система компании)
    { provide: MAT_DATE_LOCALE, useValue: 'ru-RU' },

    // Core services
    AuthService,
    ApiClientService,
    SseService,
    IdpStoreService,
    IdpWorkflowService,

    // Environment
    { provide: 'environment', useValue: environment },

    // Guards
    // authGuard is used directly in routes
  ],
};