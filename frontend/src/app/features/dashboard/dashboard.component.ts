import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { Auth } from '../../core/auth.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { COLORS, MONTHS, fmt, greeting, typeIcon } from '../../shared/util';
import { CalendarWidget } from './widgets/calendar.widget';
import { PrayerWidget } from './widgets/prayer.widget';

@Component({
  selector: 'app-dashboard', standalone: true, imports: [RouterLink, ChartComponent, IconComponent, ModalComponent, CalendarWidget, PrayerWidget],
  template: `
  <div class="dashboard-page">
  <div class="page-head"><div><h1>{{ hello }}, {{ firstName }}</h1><p class="sub">{{ today }}</p></div>
    <div class="dashboard-actions">
      <button class="icon-btn" (click)="activeModal = 'attention'" aria-label="Needs attention" title="Needs attention"><app-icon name="alert" /></button>
      <button class="icon-btn" (click)="activeModal = 'contacts'" aria-label="Quick call" title="Quick call"><app-icon name="call" /></button>
      <button class="icon-btn" (click)="activeModal = 'prayer'" aria-label="Prayer times" title="Prayer times"><app-icon name="moon" /></button>
    </div>
  </div>

  <div class="bento dashboard-kpis">
    <div class="card kpi dark s3"><span class="chip-ic"><app-icon name="wallet" /></span>
      <div><div class="lbl">{{ curLabel }} spending</div><div class="val">{{ fmt(curTotal) }}</div>
        @if (prevTotal) { <div class="foot"><span [class.up]="delta > 0" [class.down]="delta <= 0"><app-icon [name]="delta > 0 ? 'arrow-up' : 'arrow-down'" [size]="12" /> {{ abs(delta) }}%</span> vs previous month</div> }</div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="banknote" /></span>
      <div><div class="lbl">Left after spending</div>
        @if (curIncome) { <div class="val" [class.up]="curIncome - curTotal < 0">{{ fmt(curIncome - curTotal) }}</div><div class="foot">income {{ fmt(curIncome) }}</div> }
        @else { <div class="val">-</div><div class="foot"><a routerLink="/income">Add income</a> to see this</div> }</div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="clock" /></span>
      <div><div class="lbl">Payments due (30d)</div><div class="val">{{ payments.length }}</div><div class="foot">{{ fmt(dueTotal) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="alert" /></span>
      <div><div class="lbl">Needs attention</div><div class="val">{{ attentionCount }}</div><div class="foot">unusual, over budget or stalled</div></div></div>
  </div>

  <section class="dashboard-grid" aria-label="Dashboard information">
    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="trend" [size]="18" />Spending</h2></div><div class="dashboard-card-body">
      <section class="dashboard-section"><h3>Monthly expenses: this year vs last</h3>@if (expCfg) { <app-chart [config]="expCfg" /> }</section>
      <section class="dashboard-section"><h3>{{ curLabel }} by type</h3>@if (typeCfg && typeHasData) { <app-chart [config]="typeCfg" /> } @else { <div class="empty">No expenses recorded for {{ curLabel }}.</div> }</section>
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="banknote" [size]="18" />Cashflow</h2></div><div class="dashboard-card-body">
      <section class="dashboard-section"><h3>Income vs expenses</h3>@if (incCfg) { <app-chart [config]="incCfg" /> }</section>
      <section class="dashboard-section"><h3><app-icon name="credit-card" [size]="16" />Installments by type</h3>@if (insCfg) { <app-chart [config]="insCfg" /> }</section>
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="target" [size]="18" />Goals</h2><a routerLink="/goals" class="small">Manage</a></div><div class="dashboard-card-body">
      @if (goalCfg) { <app-chart [config]="goalCfg" /> } @else { <div class="empty">Goal summary is unavailable.</div> }
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="bell" [size]="18" />Upcoming payments</h2></div><div class="dashboard-card-body">
      <section class="dashboard-section"><h3>Payments due in 30 days</h3>
      @if (!payments.length) { <div class="empty">Nothing due in the next 30 days.</div> }
      <ul class="list">@for (u of payments.slice(0, 5); track u.key) {
        <li class="item"><span class="ic-badge" [class.warn]="u.days_left <= 3"><app-icon [name]="icon(u.cat)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ u.title }}</div><div class="s">{{ u.due_date }} · {{ u.kind }}</div></div>
          <div class="amt">{{ fmt(u.amount) }}<div><span class="badge" [class.ok]="u.days_left > 3">{{ u.days_left < 0 ? 'Overdue' : u.days_left === 0 ? 'Today' : u.days_left + 'd' }}</span></div></div></li>
      }</ul></section>
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="pie" [size]="18" />Budget, {{ curLabel }}</h2><a routerLink="/budgets" class="small">Manage</a></div><div class="dashboard-card-body">
      @if (!budget.rows.length) { <div class="empty">No budgets yet. <a routerLink="/budgets">Set one</a> to track limits.</div> }
      <ul class="list">@for (r of budget.rows.slice(0, 4); track r.category) {
        <li class="item" style="display:block"><div class="row between small" style="flex-wrap:nowrap"><b>{{ r.category }}</b><span>{{ fmt(r.spent) }} / {{ fmt(r.limit) }}</span></div>
          <div class="bar" style="margin-top:.3rem" [class.warn]="r.status === 'warn'" [class.over]="r.status === 'over'"><i [style.width.%]="r.pct > 100 ? 100 : r.pct"></i></div></li>
      }</ul>
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="calendar" [size]="18" />Calendar & events</h2><a routerLink="/calendar" class="small">Open full</a></div><div class="dashboard-card-body">
      <app-calendar-widget [full]="false" [framed]="false" />
    </div></article>
  </section>
  </div>

  <app-modal [open]="activeModal === 'attention'" title="Needs attention" (closed)="activeModal = null">
    @if (!attentionCount) { <div class="empty">All clear. Nothing unusual right now.</div> }
    <ul class="list">
      @for (a of anomalies.slice(0, 5); track a.id) {
        <li class="item"><span class="ic-badge warn"><app-icon [name]="icon(a.type)" [size]="18" /></span><div class="grow"><div class="t">{{ a.type }} looks high</div><div class="s">{{ months[a.month - 1] }} {{ a.year }}</div></div><div class="amt">{{ fmt(a.amount) }}<div><span class="badge">+{{ a.percentAbove }}%</span></div></div></li> }
      @for (r of overBudget; track r.category) {
        <li class="item"><span class="ic-badge warn"><app-icon name="pie" [size]="18" /></span><div class="grow"><div class="t">{{ r.category }} over budget</div><div class="s">{{ fmt(r.spent) }} of {{ fmt(r.limit) }}</div></div><span class="badge">{{ r.pct }}%</span></li> }
      @for (g of goalReminders; track g.id) {
        <li class="item"><span class="ic-badge brown"><app-icon name="target" [size]="18" /></span><div class="grow"><div class="t">{{ g.name }}</div><div class="s">{{ g.stale ? 'No progress for ' + g.months_since_update + ' months' : 'Past target date' }}</div></div><span class="badge">Goal</span></li> }
    </ul>
  </app-modal>
  <app-modal [open]="activeModal === 'contacts'" title="Quick call" (closed)="activeModal = null">
    @if (!favs.length) { <div class="empty">Star a contact to pin it here.</div> }
    <ul class="list">@for (c of favs; track c.id) {
      <li class="item"><span class="ava">{{ c.name.charAt(0).toUpperCase() }}</span><div class="grow"><div class="t">{{ c.name }}</div><div class="s">{{ c.phone }}</div></div><a class="btn green sm" [href]="tel(c.phone)" aria-label="Call {{ c.name }}"><app-icon name="call" [size]="16" /></a></li>
    }</ul>
    <div class="sheet-f"><a routerLink="/contacts" class="btn ghost" (click)="activeModal = null">All contacts</a></div>
  </app-modal>
  <app-modal [open]="activeModal === 'prayer'" title="Prayer times" (closed)="activeModal = null"><app-prayer-widget /></app-modal>`,
})
export class DashboardComponent implements OnInit {
  activeModal: 'attention' | 'contacts' | 'prayer' | null = null;
  private api = inject(Api);
  fmt = fmt; months = MONTHS; icon = typeIcon; abs = Math.abs;
  hello = greeting(); firstName = (inject(Auth).user()?.name || '').split(' ')[0];
  today = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  payments: any[] = []; anomalies: any[] = []; goalReminders: any[] = []; favs: any[] = [];
  budget: any = { rows: [] }; typeHasData = false;
  expCfg: any; insCfg: any; goalCfg: any; typeCfg: any; incCfg: any;
  curLabel = 'This month'; curTotal = 0; prevTotal = 0; delta = 0; curIncome = 0;
  get dueTotal() { return this.payments.reduce((a, u) => a + u.amount, 0); }
  get overBudget() { return (this.budget.rows || []).filter((r: any) => r.status === 'over'); }
  get attentionCount() { return this.anomalies.length + this.goalReminders.length + this.overBudget.length; }
  tel(p: string) { return 'tel:' + p.replace(/[^\d+]/g, ''); }

  private addPayments(list: any[]) { this.payments = [...this.payments, ...list].sort((a, b) => a.due_date.localeCompare(b.due_date)); }

  ngOnInit() {
    const y = new Date().getFullYear(), nowIdx = y * 12 + new Date().getMonth() + 1;
    this.api.get<any[]>('/installments/upcoming?days=30').subscribe((r) => this.addPayments(r.map((u) => ({ key: 'i' + u.installment_id + '-' + u.period, kind: 'Installment', title: u.name || u.type, cat: u.type, amount: u.amount, due_date: u.due_date, days_left: u.days_left }))));
    this.api.get<any[]>('/bills/upcoming?days=30').subscribe((r) => this.addPayments(r.map((b) => ({ key: 'b' + b.id, kind: 'Bill', title: b.name, cat: b.category || b.name, amount: b.amount, due_date: b.next_due, days_left: b.days_left }))));
    this.api.get<any[]>('/goals/reminders').subscribe((r) => (this.goalReminders = r));
    this.api.get<any>('/goals/summary').subscribe((s) => {
      this.goalCfg = { type: 'doughnut', data: { labels: ['Complete', 'Ongoing'], datasets: [{ data: [s.complete, s.ongoing], backgroundColor: ['#66BB6A', '#5D4037'] }] } };
    });
    this.api.get<any[]>('/expenses/anomalies').subscribe((r) => (this.anomalies = r));
    this.api.get<any[]>('/contacts').subscribe((r) => (this.favs = r.filter((c) => c.favorite).slice(0, 5)));
    this.api.get<any[]>('/installments/summary').subscribe((s) => {
      this.insCfg = { type: 'bar', data: { labels: s.map((x) => x.type), datasets: [
        { label: 'Paid', data: s.map((x) => x.paid), backgroundColor: COLORS[0] },
        { label: 'Remaining', data: s.map((x) => x.remaining), backgroundColor: COLORS[1] }] },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } } };
    });
    this.api.get<any[]>('/expenses/summary').subscribe((S) => {
      this.api.get<any[]>('/income/summary').subscribe((I) => this.build(S, I, y, nowIdx));
    });
  }

  private build(S: any[], I: any[], y: number, nowIdx: number) {
    // Line chart: months with no records are gaps (null), not a drop to RM 0 (covers months before the first record and future months).
    const mLine = (L: any[], yr: number) => MONTHS.map((_, i) => { const r = L.filter((s) => Number(s.year) === yr && Number(s.month) === i + 1); return r.length ? r.reduce((a, s) => a + (Number(s.total) || 0), 0) : null; });
    const m = (L: any[], yr: number) => MONTHS.map((_, i) => L.filter((s) => Number(s.year) === yr && Number(s.month) === i + 1).reduce((a, s) => a + (Number(s.total) || 0), 0));
    this.expCfg = { type: 'line', data: { labels: MONTHS, datasets: [
      { label: String(y - 1), data: mLine(S, y - 1), borderColor: '#BCAAA4', backgroundColor: '#BCAAA4', tension: 0.3, pointRadius: 2 },
      { label: String(y), data: mLine(S, y), borderColor: COLORS[0], backgroundColor: 'rgba(165,214,167,.35)', fill: true, tension: 0.3, pointRadius: 3 }] }, options: { scales: { y: { beginAtZero: true } } } };
    this.incCfg = { type: 'bar', data: { labels: MONTHS, datasets: [
      { label: 'Income', data: m(I, y), backgroundColor: COLORS[1] }, { label: 'Expenses', data: m(S, y), backgroundColor: COLORS[0] }] } };
    // "current" month = latest month with expense data that is not in the future
    const idx = (s: any) => Number(s.year) * 12 + Number(s.month);
    const past = S.filter((s) => idx(s) <= nowIdx);
    if (!past.length) return;
    const latest = Math.max(...past.map(idx));
    const ly = Math.floor((latest - 1) / 12), lm = ((latest - 1) % 12) + 1;
    const inMonth = (L: any[], k: number) => L.filter((s) => idx(s) === k);
    this.curLabel = MONTHS[lm - 1] + ' ' + ly;
    this.curTotal = inMonth(S, latest).reduce((a, s) => a + (Number(s.total) || 0), 0);
    this.prevTotal = inMonth(S, latest - 1).reduce((a, s) => a + (Number(s.total) || 0), 0);
    this.curIncome = inMonth(I, latest).reduce((a, s) => a + (Number(s.total) || 0), 0);
    this.delta = this.prevTotal ? Math.round(((this.curTotal - this.prevTotal) / this.prevTotal) * 100) : 0;
    const cur = inMonth(S, latest).filter((s) => Number(s.total) > 0);
    this.typeHasData = cur.length > 0;
    this.typeCfg = { type: 'doughnut', data: { labels: cur.map((s) => s.type), datasets: [{ data: cur.map((s) => Number(s.total)), backgroundColor: cur.map((_, i) => COLORS[i % COLORS.length]) }] } };
    this.api.get<any>(`/budgets/status?year=${ly}&month=${lm}`).subscribe((b) => (this.budget = b));
  }
}
