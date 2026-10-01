import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { COLORS, MONTHS, errMsg, fmt, typeIcon } from '../../shared/util';
import { Language } from '../../core/language.service';
import { TranslatePipe } from '../../shared/translate.pipe';

@Component({
  selector: 'app-installments', standalone: true, imports: [FormsModule, ChartComponent, IconComponent, ModalComponent, TranslatePipe],
  template: `
  <div class="page-head">
    <div><h1>{{ 'Installments' | tr }}</h1><p class="sub">{{ 'Track every monthly payment until it is cleared' | tr }}</p></div>
    <button class="btn" (click)="openForm()"><app-icon name="plus" [size]="18" />{{ 'Add installment' | tr }}</button>
  </div>

  <div class="bento">
    <div class="card kpi dark s4"><span class="chip-ic"><app-icon name="credit-card" /></span><div><div class="lbl">{{ 'Monthly commitment' | tr }}</div><div class="val">{{ fmt(kMonthly) }}</div></div></div>
    <div class="card kpi s4"><span class="chip-ic"><app-icon name="banknote" /></span><div><div class="lbl">{{ 'Remaining to pay' | tr }}</div><div class="val">{{ fmt(kRemaining) }}</div></div></div>
    <div class="card kpi s4"><span class="chip-ic"><app-icon name="clock" /></span><div><div class="lbl">{{ 'Due in 30 days' | tr }}</div><div class="val">{{ upcoming.length }}</div><div class="foot">{{ fmt(kDue) }}</div></div></div>
  </div>

  <div class="bento">
    <div class="card s7"><div class="card-h"><h2><app-icon name="credit-card" [size]="18" />{{ 'Total by type' | tr }}</h2></div>@if (chartCfg) { <app-chart [config]="chartCfg" /> }</div>
    <div class="card s5"><div class="card-h"><h2><app-icon name="bell" [size]="18" />{{ 'Due soon' | tr }}</h2></div>
      @if (!upcoming.length) { <div class="empty">{{ 'Nothing due in the next 30 days.' | tr }}</div> }
      <ul class="list">@for (u of upcoming; track u.installment_id + '-' + u.period) {
        <li class="item"><span class="ic-badge" [class.warn]="u.days_left <= 3"><app-icon [name]="icon(u.type)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ u.name || (u.type | tr) }}</div><div class="s">{{ u.due_date }} · {{ 'payment' | tr }} {{ u.period }} {{ 'of' | tr }} {{ u.of }}</div></div>
          <div class="amt">{{ fmt(u.amount) }}<div><span class="badge" [class.ok]="u.days_left > 3">{{ u.days_left < 0 ? -u.days_left + ' ' + ('days overdue' | tr) : u.days_left === 0 ? ('Today' | tr) : ('in' | tr) + ' ' + u.days_left + ' ' + ('days' | tr) }}</span></div></div></li>
      }</ul></div>
  </div>

  @if (!items.length) { <div class="card empty">{{ 'No installments yet. Add one to start tracking payments.' | tr }}</div> }
  <div class="cards">
  @for (i of items; track i.id) {
    <div class="card">
      <div class="row between" style="flex-wrap:nowrap">
        <div class="row" style="flex-wrap:nowrap;min-width:0"><span class="ic-badge"><app-icon [name]="icon(i.type)" [size]="18" /></span>
          <div style="min-width:0"><div style="font-weight:700">{{ i.name || (i.type | tr) }} @if (i.completed) { <span class="badge ok">{{ 'Completed' | tr }}</span> }</div><div class="s muted small">{{ i.type | tr }} · {{ fmt(i.amount) }}/{{ 'month' | tr }} · {{ 'due day' | tr }} {{ i.due_day }}</div></div></div>
        <div class="row" style="flex-wrap:nowrap;gap:0"><button class="icon-btn" (click)="edit(i)" [attr.aria-label]="'Edit' | tr"><app-icon name="pencil" [size]="18" /></button>
          <button class="icon-btn del" (click)="remove(i)" [attr.aria-label]="'Delete' | tr"><app-icon name="trash" [size]="18" /></button></div>
      </div>
      <div class="row between small" style="margin:.7rem 0 .3rem"><span>{{ i.paid_count }} {{ 'of' | tr }} {{ i.duration_months }} {{ 'paid' | tr }}</span><b>{{ i.progress }}%</b></div>
      <div class="bar" [class.ok]="i.completed"><i [style.width.%]="i.progress"></i></div>
      <div class="chips">
        @for (s of i.schedule; track s.period) {
          <button class="chip" [class.paid]="s.paid" [class.overdue]="s.overdue" (click)="toggle(i, s)"
            [title]="(s.paid ? 'Paid. Tap to undo' : 'Tap to mark as paid') | tr">{{ label(s.due_date) }}</button>
        }
      </div>
    </div>
  }
  </div>

  <app-modal [open]="showForm" [title]="(form.id ? 'Edit installment' : 'Add installment') | tr" (closed)="closeForm()">
    <form (ngSubmit)="save()">
      <div class="fields">
        <label>{{ 'Type' | tr }}<select name="type" [(ngModel)]="form.type">@for (t of types; track t) { <option [ngValue]="t">{{ t | tr }}</option> }</select></label>
        <label>{{ 'Name' | tr }}<input name="name" [(ngModel)]="form.name" [placeholder]="'e.g. iPhone 15' | tr"></label>
        <label>{{ 'Monthly amount (MYR)' | tr }}<input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="form.amount" required></label>
        <label>{{ 'Duration (months)' | tr }}<input name="dur" type="number" inputmode="numeric" min="1" [(ngModel)]="form.duration_months" required></label>
        <label>{{ 'Payment due day' | tr }}<input name="day" type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="form.due_day" required></label>
        <label>{{ 'Start month' | tr }}<select name="sm" [(ngModel)]="form.start_month">@for (m of months; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }</select></label>
        <label class="full">{{ 'Start year' | tr }}<input name="sy" type="number" inputmode="numeric" [(ngModel)]="form.start_year" required></label>
      </div>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error | tr }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="closeForm()">{{ 'Cancel' | tr }}</button><button type="submit" class="btn">{{ (form.id ? 'Save changes' : 'Add installment') | tr }}</button></div>
    </form>
  </app-modal>`,
})
export class InstallmentsComponent implements OnInit {
  private api = inject(Api); private language = inject(Language);
  fmt = fmt; get months() { return MONTHS.map((_, i) => new Date(2024, i, 1).toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY', { month: 'short' })); } icon = typeIcon;
  types = ['House', 'Phone', 'Shopee PayLater', 'Car', 'Other'];
  now = new Date(); showForm = false;
  items: any[] = []; upcoming: any[] = []; chartCfg: any; form: any = this.blank(); error = '';
  kMonthly = 0; kRemaining = 0; kDue = 0;

  blank() { return { id: null, type: 'House', name: '', amount: null, duration_months: 12, due_day: 1, start_month: this.now.getMonth() + 1, start_year: this.now.getFullYear() }; }
  ngOnInit() { this.load(); }
  label(d: string) { return this.months[+d.slice(5, 7) - 1] + " '" + d.slice(2, 4); }

  load() {
    this.api.get<any[]>('/installments').subscribe((r) => (this.items = r));
    this.api.get<any[]>('/installments/upcoming?days=30').subscribe((r) => { this.upcoming = r; this.kDue = r.reduce((a, u) => a + u.amount, 0); });
    this.api.get<any[]>('/installments/summary').subscribe((s) => {
      this.kMonthly = s.reduce((a, x) => a + Number(x.monthly), 0); this.kRemaining = s.reduce((a, x) => a + Number(x.remaining), 0);
      this.chartCfg = { type: 'bar', data: { labels: s.map((x) => this.language.text(x.type)), datasets: [
        { label: this.language.text('Paid'), data: s.map((x) => Number(x.paid)), backgroundColor: COLORS[0] },
        { label: this.language.text('Remaining'), data: s.map((x) => Number(x.remaining)), backgroundColor: COLORS[1] }] },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } } };
    });
  }
  openForm() { this.form = this.blank(); this.error = ''; this.showForm = true; }
  closeForm() { this.showForm = false; this.error = ''; }
  edit(i: any) { this.form = { ...i }; this.error = ''; this.showForm = true; }
  save() {
    this.error = '';
    const f = this.form;
    const req = f.id ? this.api.put('/installments/' + f.id, f) : this.api.post('/installments', f);
    req.subscribe({ next: () => { this.closeForm(); this.load(); }, error: (e) => (this.error = errMsg(e)) });
  }
  remove(i: any) { if (confirm(`${this.language.text('Delete')} ${i.name || i.type} ${this.language.text('and its payment history?')}`)) this.api.del('/installments/' + i.id).subscribe(() => this.load()); }
  toggle(i: any, s: any) { this.api.post(`/installments/${i.id}/payments`, { period: s.period, paid: !s.paid }).subscribe(() => this.load()); }
}
