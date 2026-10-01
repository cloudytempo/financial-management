import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './auth.service';
import { MODULES } from './modules.config';
import { IconComponent } from '../shared/icon.component';
import { ModalComponent } from '../shared/modal.component';
import { TranslatePipe } from '../shared/translate.pipe';

@Component({
  selector: 'app-shell', standalone: true, imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, ModalComponent, TranslatePipe],
  template: `
  <div class="app">
    <aside class="side">
      <div class="brand"><img class="homint-mark" src="/favicon.svg" alt="">Homint</div>
      <nav class="nav">
        @for (n of sidebarNav; track n.path) { <a [routerLink]="'/' + n.path" routerLinkActive="active"><app-icon [name]="n.icon" />{{ n.label | tr }}</a> }
      </nav>
      <div class="usercard">
        <span class="ava">{{ initial() }}</span>
        <span class="who"><b>{{ auth.user()?.name }}</b><span>{{ auth.user()?.household?.name }}</span></span>
        <button class="icon-btn" (click)="auth.logout()" [attr.aria-label]="'Sign out' | tr" [title]="'Sign out' | tr"><app-icon name="logout" /></button>
      </div>
    </aside>
    <div style="min-width:0">
      <header class="topbar">
        <div class="brand"><img class="homint-mark" src="/favicon.svg" alt="">Homint</div>
        <div><button class="icon-btn" (click)="auth.logout()" [attr.aria-label]="'Sign out' | tr"><app-icon name="logout" /></button></div>
      </header>
      <main><router-outlet /></main>
      <footer class="brand-footer">{{ 'Powered by CloudyTempo · © 2026 All rights reserved.' | tr }}</footer>
    </div>
    <nav class="tabbar">
      @for (n of primary; track n.path) { <a [routerLink]="'/' + n.path" routerLinkActive="active"><span class="ic"><app-icon [name]="n.icon" [size]="22" /></span>{{ n.label | tr }}</a> }
      <button class="tab" (click)="moreOpen = true"><span class="ic"><app-icon name="more" [size]="22" /></span>{{ 'More' | tr }}</button>
    </nav>
  </div>
  <app-modal [open]="moreOpen" [title]="'More' | tr" (closed)="moreOpen = false">
    <div class="morelist">
      @for (n of more; track n.path) { <a [routerLink]="'/' + n.path" (click)="moreOpen = false"><span class="ic-badge"><app-icon [name]="n.icon" [size]="18" /></span>{{ n.label | tr }}</a> }
      <button (click)="moreOpen = false; auth.logout()"><span class="ic-badge"><app-icon name="logout" [size]="18" /></span>{{ 'Sign out' | tr }}</button>
    </div>
  </app-modal>`,
})
export class ShellComponent {
  auth = inject(Auth); moreOpen = false;
  nav = [{ path: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', primary: true }, ...MODULES];
  sidebarNav = this.nav.filter((n) => n.path !== 'calendar');
  primary = this.nav.filter((n) => n.primary);
  more = this.nav.filter((n) => !n.primary);
  initial = computed(() => (this.auth.user()?.name || '?').charAt(0).toUpperCase());
}
