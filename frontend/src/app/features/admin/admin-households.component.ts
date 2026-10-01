import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { errMsg } from '../../shared/util';

@Component({
  selector: 'app-admin-households', standalone: true, imports: [FormsModule, IconComponent, ModalComponent],
  template: `
  <div class="page-head"><div><p class="admin-kicker">DIRECTORY</p><h1>Households</h1><p class="sub">Manage household status, ownership and membership</p></div>
    <button class="icon-btn" (click)="load()" aria-label="Refresh households" title="Refresh"><app-icon name="refresh" /></button></div>
  <label class="admin-search">Search households<input type="search" [(ngModel)]="query" placeholder="Household or owner"></label>
  @if (error) { <div class="err" style="margin:.7rem 0">{{ error }}</div> }
  <section class="card admin-directory">
    @if (!shown.length) { <div class="empty">{{ households.length ? 'No households match.' : 'No households found.' }}</div> }
    <ul class="list">@for (household of shown; track household.id) {
      <li class="item admin-directory-row">
        <span class="ic-badge"><app-icon name="home" /></span>
        <div class="grow"><div class="t">{{ household.name }} <span class="pill" [class.admin-status-off]="!household.is_active">{{ household.is_active ? 'Active' : 'Deactivated' }}</span></div>
          <div class="s">Owner: {{ household.owner_name || 'Unassigned' }} · {{ household.member_count }} active members</div>
          <div class="s">Created {{ date(household.created_at) }}</div></div>
        <button class="icon-btn" (click)="edit(household)" [attr.aria-label]="'Edit ' + household.name" title="Edit household"><app-icon name="pencil" /></button>
        @if (household.is_active) { <button class="btn danger sm" (click)="deactivate(household)">Deactivate</button> }
        @else { <button class="btn green sm" (click)="activate(household)">Activate</button> }
      </li>
    }</ul>
  </section>
  <app-modal [open]="showEdit" title="Edit household" (closed)="showEdit = false">
    <form (ngSubmit)="save()"><label>Household name<input name="name" [(ngModel)]="form.name" required maxlength="100"></label>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showEdit = false">Cancel</button><button class="btn" type="submit">Save changes</button></div></form>
  </app-modal>`,
})
export class AdminHouseholdsComponent implements OnInit {
  private api = inject(Api);
  households: any[] = []; query = ''; error = ''; showEdit = false; form: any = {};
  get shown() {
    const q = this.query.trim().toLowerCase();
    return this.households.filter((household) => !q || `${household.name} ${household.owner_name || ''}`.toLowerCase().includes(q));
  }
  ngOnInit() { this.load(); }
  load() { this.api.get<any[]>('/admin/households').subscribe({ next: (rows) => (this.households = rows), error: (e) => (this.error = errMsg(e)) }); }
  edit(household: any) { this.form = { id: household.id, name: household.name }; this.error = ''; this.showEdit = true; }
  save() { this.api.put('/admin/households/' + this.form.id, this.form).subscribe({ next: () => { this.showEdit = false; this.load(); }, error: (e) => (this.error = errMsg(e)) }); }
  deactivate(household: any) {
    if (confirm(`Deactivate ${household.name} and unlink all ${household.member_count} active members?`))
      this.api.post('/admin/households/' + household.id + '/deactivate', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  activate(household: any) {
    if (confirm(`Reactivate ${household.name}? Previous members will need to join again.`))
      this.api.post('/admin/households/' + household.id + '/activate', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  date(value: string) { return new Date(value).toLocaleDateString(); }
}
