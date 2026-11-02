import { bootstrapApplication } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { inject } from '@angular/core';
import { Theme } from './app/core/theme.service';
import { appConfig } from './app/app.config';
import { LoadingOverlayComponent } from './app/core/loading.service';

@Component({ selector: 'app-root', standalone: true, imports: [RouterOutlet, LoadingOverlayComponent], template: '<router-outlet /><app-loading-overlay />' })
class AppComponent { private theme = inject(Theme); }

bootstrapApplication(AppComponent, appConfig).catch(console.error);
