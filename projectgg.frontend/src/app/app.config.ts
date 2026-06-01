import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { JwtInterceptor } from './services/jwt.interceptor';
import { IconRegistryService } from './services/icon-registry.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: JwtInterceptor,
      multi: true
    },
    {
      // Register local Material Icons SVGs at bootstrap so <mat-icon
      // svgIcon="people"> resolves to /assets/icons/people.svg instead
      // of falling back to the incomplete font ligature.
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (icons: IconRegistryService) => () => icons.register(),
      deps: [IconRegistryService],
    },
  ]
};
