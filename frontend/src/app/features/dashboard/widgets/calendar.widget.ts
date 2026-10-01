import { Component, Input, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../core/api.service';
import { Language } from '../../../core/language.service';
import { IconComponent } from '../../../shared/icon.component';
import { TranslatePipe } from '../../../shared/translate.pipe';
import { SkeletonComponent } from '../../../shared/skeleton.component';
import { EVENT_TYPES, MONTHS, errMsg, eventColor, iso } from '../../../shared/util';

const pad = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'app-calendar-widget', standalone: true, imports: [FormsModule, IconComponent, TranslatePipe, SkeletonComponent],
  template: `
  <div class="calendar-widget" [class.card]="framed">
    <div class="card-h">
      <h2><app-icon name="calendar" [size]="18" />{{ months[month] }} {{ year }}</h2>
      <div class="row" style="gap:.15rem"><button class="btn ghost sm" (click)="goTo(todayIso)">{{ 'Today' | tr }}</button>
        <button class="icon-btn" (click)="shift(-1)" [attr.aria-label]="'Previous month' | tr"><app-icon name="left" /></button>
        <button class="icon-btn" (click)="shift(1)" [attr.aria-label]="'Next month' | tr"><app-icon name="right" /></button></div>
    </div>
    <div class="legend">@for (t of types; track t.name) {
      <button class="lg" [class.off]="hidden.has(t.name)" [class.on]="!hidden.has(t.name)" [style.--tc]="t.color" (click)="toggle(t.name)" [attr.aria-pressed]="!hidden.has(t.name)"><i></i>{{ t.name | tr }}</button>
    }</div>

    <div class="calwrap" [class.full]="full">
      <div>
        <div class="cal">
          @for (d of dow; track $index) { <div class="dow">{{ d }}</div> }
          @for (b of blanks; track $index) { <div></div> }
          @for (d of days; track d) {
            <button class="day" [class.sel]="sel === isoDay(d)" [class.today]="todayIso === isoDay(d)" (click)="selectDay(d)" [attr.aria-label]="label(isoDay(d))">
              {{ d }}<span class="dots">@for (c of dots(d); track $index) { <span class="dot" [style.background]="c"></span> }</span>
            </button>
          }
        </div>
      </div>

      <div>
        <div class="sub-h" style="margin-top:0">{{ label(sel) }}</div>
        @if (monthLoading) { <app-skeleton [rows]="2" /> }
        @else { @for (e of dayEvents; track e.id) {
          <div class="ev" [style.--tc]="color(e.type)">
            <div class="grow"><div class="t">{{ e.title }}</div><div class="s">{{ e.event_time || ('All day' | tr) }} · {{ e.type | tr }}</div></div>
            <button class="icon-btn" (click)="edit(e)" [attr.aria-label]="'Edit event' | tr"><app-icon name="pencil" [size]="16" /></button>
            <button class="icon-btn del" (click)="remove(e)" [attr.aria-label]="'Delete event' | tr"><app-icon name="trash" [size]="16" /></button>
          </div>
        }
        @for (d of dayDues; track d.key) {
          <div class="ev" [style.--tc]="color('Payment')"><div class="grow"><div class="t">{{ d.title }}</div><div class="s">{{ d.kind | tr }} {{ 'due' | tr }} · RM {{ d.amount }}</div></div></div>
        }
        @if (!dayEvents.length && !dayDues.length) { <div class="muted small" style="margin-top:.4rem">{{ 'Nothing on this day.' | tr }}</div> } }

        <form (ngSubmit)="save()" style="margin-top:.9rem">
          <div class="sub-h" style="margin-top:0">{{ (form.id ? 'Edit event' : 'Add event') | tr }}</div>
          <input name="title" [(ngModel)]="form.title" [placeholder]="'Event title' | tr" [attr.aria-label]="'Event title' | tr" required>
          <div class="typepick" style="margin:.5rem 0">@for (t of types; track t.name) {
            <button type="button" class="lg" [class.on]="form.type === t.name" [style.--tc]="t.color" (click)="form.type = t.name"><i></i>{{ t.name | tr }}</button>
          }</div>
          <div class="row" style="flex-wrap:nowrap"><input name="date" type="date" [(ngModel)]="form.event_date" required [attr.aria-label]="'Date' | tr"><input name="time" type="time" [(ngModel)]="form.event_time" [attr.aria-label]="'Time (optional)' | tr"></div>
          @if (error) { <div class="err">{{ error | tr }}</div> }
          <div class="row" style="margin-top:.55rem"><button type="submit" class="btn"><app-icon [name]="form.id ? 'check' : 'plus'" [size]="18" />{{ (form.id ? 'Save event' : 'Add event') | tr }}</button>
            @if (form.id) { <button type="button" class="btn ghost" (click)="resetForm()">{{ 'Cancel' | tr }}</button> }</div>
        </form>

        <div class="sub-h">{{ 'Coming up' | tr }}</div>
        @if (upcomingLoading) { <app-skeleton [rows]="3" /> } @else { @for (c of coming; track c.key) {
          <div class="ev click" [style.--tc]="color(c.type)" (click)="goTo(c.date)" role="button" tabindex="0" (keydown.enter)="goTo(c.date)">
            <span class="datechip"><b>{{ c.date.slice(8) }}</b><span>{{ months[+c.date.slice(5, 7) - 1] }}</span></span>
            <div class="grow"><div class="t">{{ c.title }}</div><div class="s">{{ c.time || ((c.kind === 'event' ? 'All day' : c.kind + ' due') | tr) }} · {{ c.type | tr }}@if (c.overdue) { · <span class="badge">{{ 'Overdue' | tr }}</span> }</div></div>
          </div>
        }
        @if (!coming.length) { <div class="muted small" style="margin-top:.4rem">{{ 'No events or due dates in the next 60 days.' | tr }}</div> } }
        @if (allComing.length > 6) { <button class="btn ghost sm" style="margin-top:.5rem" (click)="showAll = !showAll">{{ showAll ? ('Show less' | tr) : ('Show all' | tr) + ' ' + allComing.length }}</button> }
      </div>
    </div>
  </div>`,
})
export class CalendarWidget implements OnInit {
  @Input() full = false;
  @Input() framed = true;
  private api = inject(Api); private language = inject(Language);
  get months() { return MONTHS.map((_, i) => new Date(2024, i, 1).toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY', { month: 'short' })); }
  dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; types = EVENT_TYPES; color = eventColor;
  now = new Date(); year = this.now.getFullYear(); month = this.now.getMonth();
  todayIso = iso(this.now); sel = this.todayIso; showAll = false; error = ''; monthLoading = true; upcomingLoading = true;
  events: any[] = []; upcoming: any[] = []; dues: any[] = []; hidden = new Set<string>();
  private inst: any[] = []; private bills: any[] = []; private dotMap = new Map<string, string[]>();
  form: any = this.blank();

  get days() { return Array.from({ length: new Date(this.year, this.month + 1, 0).getDate() }, (_, i) => i + 1); }
  get blanks() { return Array.from({ length: new Date(this.year, this.month, 1).getDay() }); }
  get dayEvents() { return this.events.filter((e) => e.event_date === this.sel && !this.hidden.has(e.type)); }
  get dayDues() { return this.hidden.has('Payment') ? [] : this.dues.filter((d) => d.date === this.sel); }
  get allComing() {
    const end = iso(new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate() + 60));
    const ev = this.upcoming.filter((e) => !this.hidden.has(e.type)).map((e) => ({ key: 'e' + e.id, date: e.event_date, time: e.event_time || '', title: e.title, type: e.type, kind: 'event', overdue: false }));
    const du = this.hidden.has('Payment') ? [] : this.dues.filter((d) => d.date <= end).map((d) => ({ key: d.key, date: d.date, time: '', title: d.title, type: 'Payment', kind: d.kind, overdue: d.date < this.todayIso }));
    return [...ev, ...du].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }
  get coming() { return this.showAll ? this.allComing : this.allComing.slice(0, 6); }

  blank() { return { id: null, title: '', type: 'Personal', event_time: '', event_date: this.sel }; }
  isoDay(d: number) { return `${this.year}-${pad(this.month + 1)}-${pad(d)}`; }
  label(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long' }); }
  dots(d: number) { return this.dotMap.get(this.isoDay(d)) || []; }

  ngOnInit() { this.loadMonth(); this.loadUpcoming(); this.loadDues(); }
  loadMonth() {
    this.monthLoading = true;
    const last = new Date(this.year, this.month + 1, 0).getDate();
    this.api.get<any[]>(`/events?from=${this.isoDay(1)}&to=${this.isoDay(last)}`).subscribe({ next: (r) => { this.events = r; this.rebuild(); this.monthLoading = false; }, error: (e) => { this.error = errMsg(e); this.monthLoading = false; } });
  }
  loadUpcoming() { this.upcomingLoading = true; this.api.get<any[]>('/events/upcoming?days=60').subscribe({ next: (r) => { this.upcoming = r; this.upcomingLoading = false; }, error: (e) => { this.error = errMsg(e); this.upcomingLoading = false; } }); }
  loadDues() {
    this.api.get<any[]>('/installments/upcoming?days=365').subscribe((r) => { this.inst = r.map((u) => ({ key: 'i' + u.installment_id + '-' + u.period, date: u.due_date, title: u.name || u.type, kind: 'Installment', amount: u.amount })); this.mergeDues(); });
    this.api.get<any[]>('/bills/upcoming?days=365').subscribe((r) => { this.bills = r.map((b) => ({ key: 'b' + b.id, date: b.next_due, title: b.name, kind: 'Bill', amount: b.amount })); this.mergeDues(); });
  }
  private mergeDues() { this.dues = [...this.inst, ...this.bills]; this.rebuild(); }
  private rebuild() {
    const m = new Map<string, string[]>();
    const add = (date: string, c: string) => { const a = m.get(date) || []; if (!a.includes(c) && a.length < 4) a.push(c); m.set(date, a); };
    this.events.filter((e) => !this.hidden.has(e.type)).forEach((e) => add(e.event_date, eventColor(e.type)));
    if (!this.hidden.has('Payment')) this.dues.forEach((d) => add(d.date, eventColor('Payment')));
    this.dotMap = m;
  }

  toggle(t: string) { const h = new Set(this.hidden); h.has(t) ? h.delete(t) : h.add(t); this.hidden = h; this.rebuild(); }
  selectDay(d: number) { this.sel = this.isoDay(d); if (!this.form.id) this.form.event_date = this.sel; }
  shift(n: number) {
    const d = new Date(this.year, this.month + n, 1);
    this.year = d.getFullYear(); this.month = d.getMonth(); this.sel = this.isoDay(1); if (!this.form.id) this.form.event_date = this.sel; this.loadMonth();
  }
  goTo(date: string) {
    const [y, m] = date.split('-').map(Number);
    const moved = y !== this.year || m - 1 !== this.month;
    this.year = y; this.month = m - 1; this.sel = date; if (!this.form.id) this.form.event_date = date;
    if (moved) this.loadMonth();
  }
  edit(e: any) { this.form = { id: e.id, title: e.title, type: e.type, event_time: e.event_time || '', event_date: e.event_date }; this.error = ''; }
  resetForm() { this.form = this.blank(); this.error = ''; }
  save() {
    this.error = '';
    const f = this.form;
    if (!f.title.trim() || !f.event_date) return;
    const body = { title: f.title, type: f.type, event_date: f.event_date, event_time: f.event_time || null };
    const req = f.id ? this.api.put('/events/' + f.id, body) : this.api.post('/events', body);
    req.subscribe({
      next: () => { const d = f.event_date; this.form = { ...this.blank(), type: f.type, event_date: d }; this.goTo(d); this.loadMonth(); this.loadUpcoming(); },
      error: (e) => (this.error = errMsg(e)),
    });
  }
  remove(e: any) { if (confirm(`${this.language.text('Delete')} "${e.title}"?`)) this.api.del('/events/' + e.id).subscribe(() => { this.loadMonth(); this.loadUpcoming(); }); }
}
