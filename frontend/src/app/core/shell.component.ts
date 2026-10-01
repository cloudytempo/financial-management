import { Component, computed, inject, OnInit } from '@angular/core';
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
        <button class="icon-btn" (click)="openNotifications()" [attr.aria-label]="'Notifications' | tr" [title]="'Notifications' | tr" style="position:relative">
          <app-icon name="bell" />@if (unreadCount) { <span class="badge" style="position:absolute;top:-4px;right:-4px">{{ unreadCount }}</span> }
        </button>
        <span class="ava">{{ initial() }}</span>
        <span class="who"><b>{{ auth.user()?.name }}</b><span>{{ auth.user()?.household?.name }}</span></span>
        <button class="icon-btn" (click)="auth.logout()" [attr.aria-label]="'Sign out' | tr" [title]="'Sign out' | tr"><app-icon name="logout" /></button>
      </div>
    </aside>
    <div style="min-width:0">
      <header class="topbar">
        <div class="brand"><img class="homint-mark" src="/favicon.svg" alt="">Homint</div>
        <div class="row" style="flex-wrap:nowrap">
          <button class="icon-btn" (click)="openNotifications()" [attr.aria-label]="'Notifications' | tr" style="position:relative">
            <app-icon name="bell" />@if (unreadCount) { <span class="badge" style="position:absolute;top:-4px;right:-4px">{{ unreadCount }}</span> }
          </button>
          <button class="icon-btn" (click)="auth.logout()" [attr.aria-label]="'Sign out' | tr"><app-icon name="logout" /></button>
        </div>
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
  </app-modal>
  <app-modal [open]="notificationsOpen" [title]="'Notifications' | tr" (closed)="notificationsOpen = false">
    @if (!notifications.length) { <div class="empty">{{ 'No notifications yet.' | tr }}</div> }
    @else {
      <ul class="list">
        @for (n of notifications; track n.id) {
          <li class="item" [class.unread]="!n.read"><span class="ic-badge" [class.warn]="n.type === 'banned' || n.type === 'removed'"><app-icon name="bell" [size]="18" /></span>
            <div class="grow"><div class="t">{{ n.message }}</div><div class="s">{{ dateTime(n.created_at) }}</div></div></li>
        }
      </ul>
      <div class="sheet-f"><button class="btn ghost" (click)="markAllRead()">{{ 'Mark all read' | tr }}</button></div>
    }
  </app-modal>`,
})
export class ShellComponent implements OnInit {
  auth = inject(Auth); moreOpen = false; notificationsOpen = false;
  notifications: any[] = []; unreadCount = 0;
  nav = [{ path: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', primary: true }, ...MODULES];
  sidebarNav = this.nav.filter((n) => n.path !== 'calendar');
  primary = this.nav.filter((n) => n.primary);
  more = this.nav.filter((n) => !n.primary);
  initial = computed(() => (this.auth.user()?.name || '?').charAt(0).toUpperCase());
  ngOnInit() { this.loadNotifications(); }
  loadNotifications() { this.auth.notifications().subscribe({ next: (rows) => { this.notifications = rows; this.unreadCount = rows.filter((n) => !n.read).length; }, error: () => {} }); }
  openNotifications() { this.notificationsOpen = true; this.loadNotifications(); if (this.unreadCount) this.auth.markAllNotificationsRead().subscribe({ next: () => (this.unreadCount = 0), error: () => {} }); }
  markAllRead() { this.auth.markAllNotificationsRead().subscribe({ next: () => this.loadNotifications(), error: () => {} }); }
  dateTime(value: string) { return new Date(value).toLocaleString(); }
}
