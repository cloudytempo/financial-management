import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../core/api.service';
import { IconComponent } from '../../../shared/icon.component';
import { MONTHS } from '../../../shared/util';

const pad = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'app-calendar-widget', standalone: true, imports: [FormsModule, IconComponent],
  template: `
  <div class="card">
    <div class="card-h"><h2><app-icon name="calendar" [size]="18" />{{ months[month] }} {{ year }}</h2>
      <div><button class="icon-btn" (click)="shift(-1)" aria-label="Previous month"><app-icon name="left" /></button>
        <button class="icon-btn" (click)="shift(1)" aria-label="Next month"><app-icon name="right" /></button></div></div>
    <div class="cal">
      @for (d of dow; track $index) { <div class="dow">{{ d }}</div> }
      @for (b of blanks; track $index) { <div></div> }
      @for (d of days; track d) {
        <button class="day" [class.sel]="sel === iso(d)" [class.today]="today === iso(d)" (click)="sel = iso(d)">
          {{ d }}<span class="dots">@if (has(d, events)) { <span class="dot"></span> } @if (has(d, dues)) { <span class="dot due"></span> }</span>
        </button>
      }
    </div>
    <div style="margin-top:.8rem">
      <div class="small muted" style="font-weight:600">{{ sel }}</div>
      <ul class="list">
        @for (e of onSel(events); track e.id) { <li class="item"><span class="grow t">{{ e.title }}</span><button class="icon-btn del" (click)="remove(e)" aria-label="Remove event"><app-icon name="trash" [size]="16" /></button></li> }
        @for (u of onSel(dues); track u.installment_id + '-' + u.period) { <li class="item"><span class="ic-badge warn"><app-icon name="credit-card" [size]="16" /></span><span class="grow small">Installment due: {{ u.name || u.type }} (RM {{ u.amount }})</span></li> }
      </ul>
      <form class="row" style="flex-wrap:nowrap;margin-top:.4rem" (ngSubmit)="add()">
        <input name="t" [(ngModel)]="title" placeholder="Add an event on this day" aria-label="Event title" required>
        <button type="submit" class="btn" aria-label="Add event"><app-icon name="plus" [size]="18" /></button>
      </form>
    </div>
  </div>`,
})
export class CalendarWidget implements OnInit {
  private api = inject(Api);
  months = MONTHS; dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  now = new Date(); year = this.now.getFullYear(); month = this.now.getMonth();
  today = this.iso(this.now.getDate()); sel = this.today; title = '';
  events: any[] = []; dues: any[] = [];

  get days() { return Array.from({ length: new Date(this.year, this.month + 1, 0).getDate() }, (_, i) => i + 1); }
  get blanks() { return Array.from({ length: new Date(this.year, this.month, 1).getDay() }); }
  iso(d: number) { return `${this.year}-${pad(this.month + 1)}-${pad(d)}`; }
  has(d: number, list: any[]) { return list.some((x) => (x.event_date || x.due_date) === this.iso(d)); }
  onSel(list: any[]) { return list.filter((x) => (x.event_date || x.due_date) === this.sel); }

  ngOnInit() { this.load(); this.api.get<any[]>('/installments/upcoming?days=365').subscribe((r) => (this.dues = r)); }
  shift(n: number) {
    const d = new Date(this.year, this.month + n, 1);
    this.year = d.getFullYear(); this.month = d.getMonth(); this.sel = this.iso(1); this.load();
  }
  load() {
    const last = new Date(this.year, this.month + 1, 0).getDate();
    this.api.get<any[]>(`/events?from=${this.iso(1)}&to=${this.iso(last)}`).subscribe((r) => (this.events = r));
  }
  add() {
    if (!this.title.trim()) return;
    this.api.post('/events', { title: this.title.trim(), event_date: this.sel }).subscribe(() => { this.title = ''; this.load(); });
  }
  remove(e: any) { this.api.del('/events/' + e.id).subscribe(() => this.load()); }
}
