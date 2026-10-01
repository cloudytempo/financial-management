import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { errMsg } from '../../shared/util';
import { TranslatePipe } from '../../shared/translate.pipe';
import { Language } from '../../core/language.service';

@Component({
  selector: 'app-admin-households', standalone: true, imports: [FormsModule, IconComponent, ModalComponent, TranslatePipe],
  template: `
  <div class="page-head"><div><p class="admin-kicker">{{ 'DIRECTORY' | tr }}</p><h1>{{ 'Households' | tr }}</h1><p class="sub">{{ 'Manage household status, ownership and membership' | tr }}</p></div>
    <button class="icon-btn" (click)="load()" [attr.aria-label]="'Refresh' | tr" [title]="'Refresh' | tr"><app-icon name="refresh" /></button></div>
  <label class="admin-search">{{ 'Search households' | tr }}<input type="search" [(ngModel)]="query" [placeholder]="'Household or owner' | tr"></label>
  @if (error) { <div class="err" style="margin:.7rem 0">{{ error | tr }}</div> }
  <section class="card admin-directory">
    @if (!shown.length) { <div class="empty">{{ (households.length ? 'No households match.' : 'No households found.') | tr }}</div> }
    <ul class="list">@for (household of shown; track household.id) {
      <li class="item admin-directory-row">
        <span class="ic-badge"><app-icon name="home" /></span>
        <div class="grow"><div class="t">{{ household.name }} <span class="pill" [class.admin-status-off]="!household.is_active">{{ (household.is_active ? 'Active' : 'Deactivated') | tr }}</span></div>
          <div class="s">{{ 'Owner:' | tr }} {{ household.owner_name || ('Unassigned' | tr) }} · {{ household.member_count }} {{ 'active members' | tr }}</div>
          <div class="s">{{ 'Created' | tr }} {{ date(household.created_at) }}</div></div>
        <button class="icon-btn" (click)="edit(household)" [attr.aria-label]="('Edit household' | tr) + ' ' + household.name" [title]="'Edit household' | tr"><app-icon name="pencil" /></button>
        @if (household.is_active) { <button class="btn danger sm" (click)="deactivate(household)">{{ 'Deactivate' | tr }}</button> }
        @else { <button class="btn green sm" (click)="activate(household)">{{ 'Activate' | tr }}</button> }
      </li>
    }</ul>
  </section>
  <app-modal [open]="showEdit" [title]="'Edit household' | tr" (closed)="showEdit = false">
    <form (ngSubmit)="save()"><label>{{ 'Household name' | tr }}<input name="name" [(ngModel)]="form.name" required maxlength="100"></label>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error | tr }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showEdit = false">{{ 'Cancel' | tr }}</button><button class="btn" type="submit">{{ 'Save changes' | tr }}</button></div></form>
  </app-modal>`,
})
export class AdminHouseholdsComponent implements OnInit {
  private api = inject(Api); private language = inject(Language);
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
    if (confirm(`${this.language.text('Deactivate')} ${household.name} ${this.language.text('and unlink all')} ${household.member_count} ${this.language.text('active members')}?`))
      this.api.post('/admin/households/' + household.id + '/deactivate', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  activate(household: any) {
    if (confirm(`${this.language.text('Reactivate')} ${household.name}? ${this.language.text('Previous members will need to join again.')}`))
      this.api.post('/admin/households/' + household.id + '/activate', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  date(value: string) { return new Date(value).toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY'); }
}
