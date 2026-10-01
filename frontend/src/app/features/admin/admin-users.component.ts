import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { errMsg } from '../../shared/util';
import { TranslatePipe } from '../../shared/translate.pipe';
import { Language } from '../../core/language.service';
import { SkeletonComponent } from '../../shared/skeleton.component';

@Component({
  selector: 'app-admin-users', standalone: true, imports: [FormsModule, IconComponent, ModalComponent, TranslatePipe, SkeletonComponent],
  template: `
  <div class="page-head"><div><p class="admin-kicker">{{ 'DIRECTORY' | tr }}</p><h1>{{ 'Users' | tr }}</h1><p class="sub">{{ 'Manage finance accounts and access' | tr }}</p></div>
    <button class="icon-btn" (click)="load()" [attr.aria-label]="'Refresh' | tr" [title]="'Refresh' | tr"><app-icon name="refresh" /></button></div>
  <label class="admin-search">{{ 'Search users' | tr }}<input type="search" [(ngModel)]="query" [placeholder]="'Name, email or household' | tr"></label>
  @if (error) { <div class="err" style="margin:.7rem 0">{{ error | tr }}</div> }
  <section class="card admin-directory">
    @if (loading) { <app-skeleton [rows]="6" /> }
    @else if (!shown.length) { <div class="empty">{{ (users.length ? 'No users match.' : 'No users found.') | tr }}</div> }
    @else { <ul class="list">@for (user of shown; track user.id) {
      <li class="item admin-directory-row">
        <span class="ava">{{ user.name.charAt(0).toUpperCase() }}</span>
        <div class="grow"><div class="t">{{ user.name }} <span class="pill" [class.admin-status-off]="!user.is_active || user.is_banned">{{ (user.is_banned ? 'Banned' : user.is_active ? 'Active' : 'Deactivated') | tr }}</span></div>
          <div class="s">{{ user.email }} · {{ user.household_name || ('No active household' | tr) }} · {{ user.household_count }} {{ 'linked' | tr }}</div>
          <div class="s">{{ 'Joined' | tr }} {{ date(user.created_at) }}</div></div>
        <button class="icon-btn" (click)="edit(user)" [attr.aria-label]="('Edit user' | tr) + ' ' + user.name" [title]="'Edit user' | tr"><app-icon name="pencil" /></button>
        @if (user.is_banned) { <button class="btn green sm" (click)="unban(user)">{{ 'Unban' | tr }}</button> }
        @else {
          @if (user.is_active) { <button class="btn danger sm" (click)="deactivate(user)">{{ 'Deactivate' | tr }}</button> }
          @else { <span class="muted small">{{ 'Password reset required on next sign in' | tr }}</span> }
          <button class="btn danger sm" (click)="ban(user)">{{ 'Ban' | tr }}</button>
        }
      </li>
    }</ul> }
  </section>
  <app-modal [open]="showEdit" [title]="'Edit user' | tr" (closed)="showEdit = false">
    <form (ngSubmit)="save()"><div class="fields">
      <label class="full">{{ 'Name' | tr }}<input name="name" [(ngModel)]="form.name" required maxlength="100"></label>
      <label class="full">{{ 'Email' | tr }}<input name="email" type="email" [(ngModel)]="form.email" required maxlength="254"></label>
    </div>
    @if (error) { <div class="err" style="margin-top:.6rem">{{ error | tr }}</div> }
    <div class="sheet-f"><button type="button" class="btn ghost" (click)="showEdit = false">{{ 'Cancel' | tr }}</button><button class="btn" type="submit">{{ 'Save changes' | tr }}</button></div></form>
  </app-modal>`,
})
export class AdminUsersComponent implements OnInit {
  private api = inject(Api); private language = inject(Language);
  users: any[] = []; query = ''; error = ''; loading = true; showEdit = false; form: any = {};
  get shown() {
    const q = this.query.trim().toLowerCase();
    return this.users.filter((user) => !q || `${user.name} ${user.email} ${user.household_name || ''}`.toLowerCase().includes(q));
  }
  ngOnInit() { this.load(); }
  load() { this.loading = true; this.api.get<any[]>('/admin/users').subscribe({ next: (rows) => { this.users = rows; this.loading = false; }, error: (e) => { this.error = errMsg(e); this.loading = false; } }); }
  edit(user: any) { this.form = { id: user.id, name: user.name, email: user.email }; this.error = ''; this.showEdit = true; }
  save() {
    this.api.put('/admin/users/' + this.form.id, this.form).subscribe({
      next: () => { this.showEdit = false; this.load(); }, error: (e) => (this.error = errMsg(e)),
    });
  }
  deactivate(user: any) {
    if (confirm(`${this.language.text('Deactivate')} ${user.name}? ${this.language.text('Their active household access will be removed. They must sign in and set a new password to reactivate.')}`))
      this.api.post('/admin/users/' + user.id + '/deactivate', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  ban(user: any) {
    if (confirm(`${this.language.text('Ban')} ${user.name}? ${this.language.text('They will not be able to sign in until unbanned.')}`))
      this.api.post('/admin/users/' + user.id + '/ban', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  unban(user: any) {
    this.api.post('/admin/users/' + user.id + '/unban', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  date(value: string) { return new Date(value).toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY'); }
}
