import { bootstrapApplication } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { inject } from '@angular/core';
import { Theme } from './app/core/theme.service';
import { appConfig } from './app/app.config';

@Component({ selector: 'app-root', standalone: true, imports: [RouterOutlet], template: '<router-outlet />' })
class AppComponent { private theme = inject(Theme); }

bootstrapApplication(AppComponent, appConfig).catch(console.error);
