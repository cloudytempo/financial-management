import { Routes } from '@angular/router';
import { authGuard } from './core/auth.service';
import { ShellComponent } from './core/shell.component';
import { MODULES } from './core/modules.config';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent) },
  {
    path: '', component: ShellComponent, canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      ...MODULES.map((m) => ({ path: m.path, loadComponent: m.load })), // every registered module gets a route
    ],
  },
  { path: '**', redirectTo: '' },
];
