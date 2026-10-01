import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../../core/auth.service';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-admin-shell', standalone: true, imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent],
  template: `
  <div class="admin-layout">
    <aside class="admin-side">
      <a class="admin-brand" routerLink="/admin/dashboard"><img src="/favicon.svg" alt=""><span><b>Homint</b><small>System admin</small></span></a>
      <nav class="admin-nav">
        <a routerLink="/admin/dashboard" routerLinkActive="active"><app-icon name="grid" />Dashboard</a>
        <a routerLink="/admin/reports" routerLinkActive="active"><app-icon name="alert" />Reports</a>
        <a routerLink="/admin/users" routerLinkActive="active"><app-icon name="users" />Users</a>
        <a routerLink="/admin/households" routerLinkActive="active"><app-icon name="home" />Households</a>
      </nav>
      <div class="admin-account">
        <span class="ava">{{ adminInitial() }}</span>
        <span class="admin-account-who"><b>System admin</b><span>{{ auth.adminUser()?.email }}</span></span>
        <button class="icon-btn" (click)="auth.logoutAdmin()" aria-label="Sign out" title="Sign out"><app-icon name="logout" /></button>
      </div>
    </aside>
    <main class="admin-main"><router-outlet /></main>
  </div>`,
})
export class AdminShellComponent {
  auth = inject(Auth);
  adminInitial() { return String(this.auth.adminUser()?.email || 'A').charAt(0).toUpperCase(); }
}
