import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { errMsg } from '../../shared/util';

@Component({
  selector: 'app-admin-users', standalone: true, imports: [FormsModule, IconComponent, ModalComponent],
  template: `
  <div class="page-head"><div><p class="admin-kicker">DIRECTORY</p><h1>Users</h1><p class="sub">Manage finance accounts and access</p></div>
    <button class="icon-btn" (click)="load()" aria-label="Refresh users" title="Refresh"><app-icon name="refresh" /></button></div>
  <label class="admin-search">Search users<input type="search" [(ngModel)]="query" placeholder="Name, email or household"></label>
  @if (error) { <div class="err" style="margin:.7rem 0">{{ error }}</div> }
  <section class="card admin-directory">
    @if (!shown.length) { <div class="empty">{{ users.length ? 'No users match.' : 'No users found.' }}</div> }
    <ul class="list">@for (user of shown; track user.id) {
      <li class="item admin-directory-row">
        <span class="ava">{{ user.name.charAt(0).toUpperCase() }}</span>
        <div class="grow"><div class="t">{{ user.name }} <span class="pill" [class.admin-status-off]="!user.is_active">{{ user.is_active ? 'Active' : 'Deactivated' }}</span></div>
          <div class="s">{{ user.email }} · {{ user.household_name || 'No active household' }} · {{ user.household_count }} linked</div>
          <div class="s">Joined {{ date(user.created_at) }}</div></div>
        <button class="icon-btn" (click)="edit(user)" [attr.aria-label]="'Edit ' + user.name" title="Edit user"><app-icon name="pencil" /></button>
        @if (user.is_active) { <button class="btn danger sm" (click)="deactivate(user)">Deactivate</button> }
        @else { <span class="muted small">Password reset required on next sign in</span> }
      </li>
    }</ul>
  </section>
  <app-modal [open]="showEdit" title="Edit user" (closed)="showEdit = false">
    <form (ngSubmit)="save()"><div class="fields">
      <label class="full">Name<input name="name" [(ngModel)]="form.name" required maxlength="100"></label>
      <label class="full">Email<input name="email" type="email" [(ngModel)]="form.email" required maxlength="254"></label>
    </div>
    @if (error) { <div class="err" style="margin-top:.6rem">{{ error }}</div> }
    <div class="sheet-f"><button type="button" class="btn ghost" (click)="showEdit = false">Cancel</button><button class="btn" type="submit">Save changes</button></div></form>
  </app-modal>`,
})
export class AdminUsersComponent implements OnInit {
  private api = inject(Api);
  users: any[] = []; query = ''; error = ''; showEdit = false; form: any = {};
  get shown() {
    const q = this.query.trim().toLowerCase();
    return this.users.filter((user) => !q || `${user.name} ${user.email} ${user.household_name || ''}`.toLowerCase().includes(q));
  }
  ngOnInit() { this.load(); }
  load() { this.api.get<any[]>('/admin/users').subscribe({ next: (rows) => (this.users = rows), error: (e) => (this.error = errMsg(e)) }); }
  edit(user: any) { this.form = { id: user.id, name: user.name, email: user.email }; this.error = ''; this.showEdit = true; }
  save() {
    this.api.put('/admin/users/' + this.form.id, this.form).subscribe({
      next: () => { this.showEdit = false; this.load(); }, error: (e) => (this.error = errMsg(e)),
    });
  }
  deactivate(user: any) {
    if (confirm(`Deactivate ${user.name}? Their active household access will be removed. They must sign in and set a new password to reactivate.`))
      this.api.post('/admin/users/' + user.id + '/deactivate', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  date(value: string) { return new Date(value).toLocaleDateString(); }
}
