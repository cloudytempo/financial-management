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
  selector: 'app-contacts', standalone: true, imports: [FormsModule, IconComponent, ModalComponent, TranslatePipe, SkeletonComponent],
  template: `
  <div class="page-head">
    <div><h1>{{ 'Contacts' | tr }}</h1><p class="sub">{{ 'Tap the green button to call straight from your phone' | tr }}</p></div>
    <div class="actions">
      @if (!hasEmergency) { <button class="btn ghost" (click)="seed()"><app-icon name="alert" [size]="18" /><span class="hide-sm">{{ 'Emergency numbers' | tr }}</span></button> }
      <button class="btn" (click)="openForm()"><app-icon name="plus" [size]="18" />{{ 'Add contact' | tr }}</button>
    </div>
  </div>

  <div class="card" style="margin-bottom:1rem">
    <label style="position:relative"><span class="sr" style="position:absolute;left:-999px">{{ 'Search contacts' | tr }}</span>
      <input type="search" [placeholder]="'Search name or number' | tr" [(ngModel)]="q" style="padding-left:2.4rem">
      <span style="position:absolute;left:.75rem;top:2.15rem;color:var(--muted);line-height:0"><app-icon name="search" [size]="18" /></span></label>
    <div class="seg" style="margin-top:.7rem"><button [class.on]="!cat" (click)="cat = ''">{{ 'All' | tr }}</button>
      @for (c of cats; track c) { <button [class.on]="cat === c" (click)="cat = c">{{ c | tr }}</button> }</div>
  </div>

  <div class="card">
    @if (loading) { <app-skeleton [rows]="5" /> }
    @else if (!shown.length) { <div class="empty">{{ (items.length ? 'No contacts match.' : 'No contacts yet. Add one, or start with the emergency numbers.') | tr }}</div> }
    @else { <ul class="list">@for (c of shown; track c.id) {
      <li class="item">
        <span class="ava" style="width:42px;height:42px">{{ c.name.charAt(0).toUpperCase() }}</span>
        <div class="grow"><div class="t">{{ c.name }} <span class="pill">{{ c.category | tr }}</span></div>
          <div class="s">{{ c.phone }}@if (c.notes) { · {{ c.notes }} }</div></div>
        <button class="icon-btn" (click)="fav(c)" [attr.aria-label]="c.favorite ? 'Remove from favourites' : 'Add to favourites'" [style.color]="c.favorite ? '#F9A825' : ''">
          <app-icon name="star" [size]="20" /></button>
        <a class="btn green sm" [href]="tel(c.phone)" [attr.aria-label]="'Call' | tr"><app-icon name="call" [size]="16" /><span class="hide-sm">{{ 'Call' | tr }}</span></a>
        <a class="icon-btn" [href]="wa(c.phone)" target="_blank" rel="noopener" [attr.aria-label]="'WhatsApp' | tr"><app-icon name="message" [size]="18" /></a>
        <button class="icon-btn" (click)="edit(c)" [attr.aria-label]="'Edit' | tr"><app-icon name="pencil" [size]="18" /></button>
        <button class="icon-btn del" (click)="remove(c)" [attr.aria-label]="'Delete' | tr"><app-icon name="trash" [size]="18" /></button>
      </li>
    }</ul> }
  </div>

  <app-modal [open]="showForm" [title]="form.id ? 'Edit contact' : 'Add contact'" (closed)="showForm = false">
    <form (ngSubmit)="save()">
      <div class="fields">
        <label class="full">{{ 'Name' | tr }}<input name="name" [(ngModel)]="form.name" required></label>
        <label class="full">{{ 'Phone number' | tr }}<input name="phone" type="tel" inputmode="tel" [(ngModel)]="form.phone" [placeholder]="'e.g. 012-345 6789' | tr" required></label>
        <label class="full">{{ 'Category' | tr }}<select name="cat" [(ngModel)]="form.category">@for (c of cats; track c) { <option [ngValue]="c">{{ c | tr }}</option> }</select></label>
        <label class="full">{{ 'Notes' | tr }}<input name="notes" [(ngModel)]="form.notes" [placeholder]="'e.g. TNB careline, plumber' | tr"></label>
        <label class="check full"><input type="checkbox" name="fav" [(ngModel)]="form.favorite"> {{ 'Show on dashboard (quick call)' | tr }}</label>
      </div>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error | tr }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showForm = false">{{ 'Cancel' | tr }}</button><button type="submit" class="btn">{{ (form.id ? 'Save changes' : 'Add contact') | tr }}</button></div>
    </form>
  </app-modal>`,
})
export class ContactsComponent implements OnInit {
  private api = inject(Api); private language = inject(Language);
  cats = ['Family', 'Emergency', 'Utilities', 'Services', 'Work', 'Other'];
  items: any[] = []; q = ''; cat = ''; loading = true; showForm = false; error = ''; form: any = this.blank();
  get hasEmergency() { return this.items.some((c) => c.category === 'Emergency'); }
  get shown() {
    const q = this.q.trim().toLowerCase();
    return this.items.filter((c) => (!this.cat || c.category === this.cat) && (!q || c.name.toLowerCase().includes(q) || c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000') || c.phone.includes(q)));
  }
  blank() { return { id: null, name: '', phone: '', category: 'Family', notes: '', favorite: false }; }
  tel(p: string) { return 'tel:' + p.replace(/[^\d+]/g, ''); }
  wa(p: string) { const d = p.replace(/[^\d+]/g, ''); return 'https://wa.me/' + (d.startsWith('+') ? d.slice(1) : d.startsWith('0') ? '60' + d.slice(1) : d); } // Malaysian 01x numbers -> 601x
  ngOnInit() { this.load(); }
  load() { this.loading = true; this.api.get<any[]>('/contacts').subscribe({ next: (r) => { this.items = r; this.loading = false; }, error: (e) => { this.error = errMsg(e); this.loading = false; } }); }
  openForm() { this.form = this.blank(); this.error = ''; this.showForm = true; }
  edit(c: any) { this.form = { ...c }; this.error = ''; this.showForm = true; }
  save() {
    const f = this.form, req = f.id ? this.api.put('/contacts/' + f.id, f) : this.api.post('/contacts', f);
    req.subscribe({ next: () => { this.showForm = false; this.load(); }, error: (e) => (this.error = errMsg(e)) });
  }
  fav(c: any) { this.api.put('/contacts/' + c.id, { ...c, favorite: !c.favorite }).subscribe(() => this.load()); }
  remove(c: any) { if (confirm(`${this.language.text('Delete')} ${c.name}?`)) this.api.del('/contacts/' + c.id).subscribe(() => this.load()); }
  seed() { this.api.post('/contacts/emergency-seed', {}).subscribe(() => this.load()); }
}
