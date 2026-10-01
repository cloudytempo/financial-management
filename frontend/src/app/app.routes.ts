import { Routes } from '@angular/router';
import { adminGuard, adminLoginGuard, authGuard } from './core/auth.service';
import { ShellComponent } from './core/shell.component';
import { MODULES } from './core/modules.config';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent) },
  { path: 'admin/login', canActivate: [adminLoginGuard], loadComponent: () => import('./features/admin/admin-login.component').then((m) => m.AdminLoginComponent) },
  {
    path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./features/admin/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent) },
      { path: 'users', loadComponent: () => import('./features/admin/admin-users.component').then((m) => m.AdminUsersComponent) },
      { path: 'households', loadComponent: () => import('./features/admin/admin-households.component').then((m) => m.AdminHouseholdsComponent) },
    ],
  },
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
