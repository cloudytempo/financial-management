import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../../core/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { TranslatePipe } from '../../shared/translate.pipe';

@Component({
  selector: 'app-admin-shell', standalone: true, imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent, TranslatePipe],
  template: `
  <div class="admin-layout">
    <aside class="admin-side">
      <a class="admin-brand" routerLink="/admin/dashboard"><img src="/favicon.svg" alt=""><span><b>Homint</b><small>{{ 'System admin' | tr }}</small></span></a>
      <nav class="admin-nav">
        <a routerLink="/admin/dashboard" routerLinkActive="active"><app-icon name="grid" />{{ 'Dashboard' | tr }}</a>
        <a routerLink="/admin/reports" routerLinkActive="active"><app-icon name="alert" />{{ 'Reports' | tr }}</a>
        <a routerLink="/admin/users" routerLinkActive="active"><app-icon name="users" />{{ 'Users' | tr }}</a>
        <a routerLink="/admin/households" routerLinkActive="active"><app-icon name="home" />{{ 'Households' | tr }}</a>
        <a routerLink="/admin/settings" routerLinkActive="active"><app-icon name="settings" />{{ 'Settings' | tr }}</a>
      </nav>
      <div class="admin-account">
        <span class="ava">{{ adminInitial() }}</span>
        <span class="admin-account-who"><b>{{ 'System admin' | tr }}</b><span>{{ auth.adminUser()?.email }}</span></span>
        <button class="icon-btn" (click)="auth.logoutAdmin()" [attr.aria-label]="'Sign out' | tr" [title]="'Sign out' | tr"><app-icon name="logout" /></button>
      </div>
    </aside>
    <main class="admin-main"><div class="admin-view"><router-outlet /></div><footer class="brand-footer">{{ 'Powered by CloudyTempo · © 2026 All rights reserved.' | tr }}</footer></main>
  </div>`,
})
export class AdminShellComponent {
  auth = inject(Auth);
  adminInitial() { return String(this.auth.adminUser()?.email || 'A').charAt(0).toUpperCase(); }
}
