import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { AuthService } from './app/core/auth/auth.service';

// Bootstrap and initialize auth
bootstrapApplication(App, appConfig)
  .then(appRef => {
    const auth = appRef.injector.get(AuthService);
    return auth.initialize().then(() => appRef);
  })
  .catch(err => console.error('Bootstrap failed:', err));