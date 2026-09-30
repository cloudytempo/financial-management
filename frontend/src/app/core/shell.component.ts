import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './auth.service';
import { MODULES } from './modules.config';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-shell', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
  <div class="app">
    <aside class="side">
      <div class="brand"><span class="logo"><app-icon name="wallet" /></span>Home Ledger</div>
      <nav class="nav">
        @for (n of nav; track n.path) { <a [routerLink]="'/' + n.path" routerLinkActive="active"><app-icon [name]="n.icon" />{{ n.label }}</a> }
      </nav>
      <div class="usercard">
        <span class="ava">{{ initial() }}</span>
        <span class="who"><b>{{ auth.user()?.name }}</b><span>{{ auth.user()?.email }}</span></span>
        <button class="icon-btn" (click)="auth.logout()" aria-label="Sign out" title="Sign out"><app-icon name="logout" /></button>
      </div>
    </aside>
    <div style="min-width:0">
      <header class="topbar">
        <div class="brand"><span class="logo"><app-icon name="wallet" [size]="18" /></span>Home Ledger</div>
        <button class="icon-btn" (click)="auth.logout()" aria-label="Sign out"><app-icon name="logout" /></button>
      </header>
      <main><router-outlet /></main>
    </div>
    <nav class="tabbar">
      @for (n of nav; track n.path) { <a [routerLink]="'/' + n.path" routerLinkActive="active"><span class="ic"><app-icon [name]="n.icon" [size]="22" /></span>{{ n.label }}</a> }
    </nav>
  </div>`,
})
export class ShellComponent {
  auth = inject(Auth);
  nav = [{ path: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }, ...MODULES];
  initial = computed(() => (this.auth.user()?.name || '?').charAt(0).toUpperCase());
}
