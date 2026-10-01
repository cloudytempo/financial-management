import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { Auth } from '../../core/auth.service';
import { Language } from '../../core/language.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { COLORS, MONTHS, fmt, greeting, typeIcon } from '../../shared/util';
import { CalendarWidget } from './widgets/calendar.widget';
import { PrayerWidget } from './widgets/prayer.widget';
import { TranslatePipe } from '../../shared/translate.pipe';
import { SkeletonComponent } from '../../shared/skeleton.component';

@Component({
  selector: 'app-dashboard', standalone: true, imports: [RouterLink, ChartComponent, IconComponent, ModalComponent, CalendarWidget, PrayerWidget, TranslatePipe, SkeletonComponent],
  template: `
  <div class="dashboard-page">
  <div class="page-head"><div><h1>{{ hello | tr }}, {{ firstName }}</h1><p class="sub">{{ today }}</p></div>
    <div class="dashboard-actions">
      <button class="icon-btn" (click)="activeModal = 'attention'" [attr.aria-label]="'Needs attention' | tr" [title]="'Needs attention' | tr"><app-icon name="alert" /></button>
      <button class="icon-btn" (click)="activeModal = 'contacts'" [attr.aria-label]="'Quick call' | tr" [title]="'Quick call' | tr"><app-icon name="call" /></button>
      <button class="icon-btn" (click)="activeModal = 'prayer'" [attr.aria-label]="'Prayer times' | tr" [title]="'Prayer times' | tr"><app-icon name="moon" /></button>
    </div>
  </div>

  <div class="bento dashboard-kpis">
    <div class="card kpi dark s3">
      @if (expensesLoading) { <app-skeleton variant="kpi" /> } @else {
        <span class="chip-ic"><app-icon name="wallet" /></span><div><div class="lbl">{{ spendingPeriodLabel }}</div><div class="val">{{ fmt(curTotal) }}</div>
          @if (prevTotal) { <div class="foot"><span [class.up]="delta > 0" [class.down]="delta <= 0"><app-icon [name]="delta > 0 ? 'arrow-up' : 'arrow-down'" [size]="12" /> {{ abs(delta) }}%</span> {{ 'vs previous month' | tr }}</div> }
        </div>
      }
    </div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="banknote" /></span>
      @if (cashflowLoading) { <app-skeleton variant="kpi" /> } @else { <div><div class="lbl">{{ 'Left after spending' | tr }}</div>
        @if (curIncome) { <div class="val" [class.up]="curIncome - curTotal < 0">{{ fmt(curIncome - curTotal) }}</div><div class="foot">{{ 'income' | tr }} {{ fmt(curIncome) }}</div> }
        @else { <div class="val">-</div><div class="foot"><a routerLink="/income">{{ 'Add income' | tr }}</a> {{ 'to see this' | tr }}</div> }</div> }</div>
    <div class="card kpi s3">@if (paymentsLoading) { <app-skeleton variant="kpi" /> } @else { <span class="chip-ic"><app-icon name="clock" /></span>
      <div><div class="lbl">{{ 'Payments due (30d)' | tr }}</div><div class="val">{{ payments.length }}</div><div class="foot">{{ fmt(dueTotal) }}</div></div> }</div>
    <div class="card kpi s3">@if (attentionLoading) { <app-skeleton variant="kpi" /> } @else { <span class="chip-ic"><app-icon name="alert" /></span>
      <div><div class="lbl">{{ 'Needs attention' | tr }}</div><div class="val">{{ attentionCount }}</div><div class="foot">{{ 'unusual, over budget or stalled' | tr }}</div></div> }</div>
  </div>

  <section class="dashboard-grid" [attr.aria-label]="'Dashboard information' | tr">
    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="trend" [size]="18" />{{ 'Spending' | tr }}</h2></div><div class="dashboard-card-body">
      <section class="dashboard-section"><h3>{{ 'Monthly expenses: this year vs last' | tr }}</h3>@if (expensesLoading) { <app-skeleton variant="chart" /> } @else if (expCfg) { <app-chart [config]="expCfg" /> }</section>
      <section class="dashboard-section"><h3>{{ curLabel | tr }} {{ 'by type' | tr }}</h3>@if (expensesLoading) { <app-skeleton variant="chart" /> } @else if (typeCfg && typeHasData) { <app-chart [config]="typeCfg" /> } @else { <div class="empty">{{ 'No expenses recorded for' | tr }} {{ curLabel | tr }}.</div> }</section>
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="banknote" [size]="18" />{{ 'Cashflow' | tr }}</h2></div><div class="dashboard-card-body">
      <section class="dashboard-section"><h3>{{ 'Income vs expenses' | tr }}</h3>@if (cashflowLoading) { <app-skeleton variant="chart" /> } @else if (incCfg) { <app-chart [config]="incCfg" /> }</section>
      <section class="dashboard-section"><h3><app-icon name="credit-card" [size]="16" />{{ 'Installments by type' | tr }}</h3>@if (installmentsLoading) { <app-skeleton variant="chart" /> } @else if (insCfg) { <app-chart [config]="insCfg" /> }</section>
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="target" [size]="18" />{{ 'Goals' | tr }}</h2><a routerLink="/goals" class="small">{{ 'Manage' | tr }}</a></div><div class="dashboard-card-body dashboard-goal-body">
      @if (goalsLoading) { <app-skeleton variant="chart" /> } @else if (goalCfg) { <app-chart [config]="goalCfg" /> } @else { <div class="empty">{{ 'Goal summary is unavailable.' | tr }}</div> }
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="bell" [size]="18" />{{ 'Upcoming payments' | tr }}</h2></div><div class="dashboard-card-body">
      <section class="dashboard-section"><h3>{{ 'Payments due in 30 days' | tr }}</h3>
      @if (paymentsLoading) { <app-skeleton [rows]="4" /> }
      @else if (!payments.length) { <div class="empty">{{ 'Nothing due in the next 30 days.' | tr }}</div> }
      @else { <ul class="list">@for (u of payments.slice(0, 5); track u.key) {
        <li class="item"><span class="ic-badge" [class.warn]="u.days_left <= 3"><app-icon [name]="icon(u.cat)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ u.title }}</div><div class="s">{{ u.due_date }} · {{ u.kind | tr }}</div></div>
          <div class="amt">{{ fmt(u.amount) }}<div><span class="badge" [class.ok]="u.days_left > 3">{{ (u.days_left < 0 ? 'Overdue' : u.days_left === 0 ? 'Today' : u.days_left + 'd') | tr }}</span></div></div></li>
      }</ul> }</section>
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="pie" [size]="18" />{{ 'Budget' | tr }}, {{ curLabel | tr }}</h2><a routerLink="/budgets" class="small">{{ 'Manage' | tr }}</a></div><div class="dashboard-card-body">
      @if (budgetLoading) { <app-skeleton [rows]="4" /> }
      @else if (!budget.rows.length) { <div class="empty">{{ 'No budgets yet.' | tr }} <a routerLink="/budgets">{{ 'Set one' | tr }}</a> {{ 'to track limits.' | tr }}</div> }
      @else { <ul class="list">@for (r of budget.rows.slice(0, 4); track r.category) {
        <li class="item" style="display:block"><div class="row between small" style="flex-wrap:nowrap"><b>{{ r.category | tr }}</b><span>{{ fmt(r.spent) }} / {{ fmt(r.limit) }}</span></div>
          <div class="bar" style="margin-top:.3rem" [class.warn]="r.status === 'warn'" [class.over]="r.status === 'over'"><i [style.width.%]="r.pct > 100 ? 100 : r.pct"></i></div></li>
      }</ul> }
    </div></article>

    <article class="card dashboard-card"><div class="card-h"><h2><app-icon name="calendar" [size]="18" />{{ 'Calendar & events' | tr }}</h2><a routerLink="/calendar" class="small">{{ 'Open full' | tr }}</a></div><div class="dashboard-card-body">
      <app-calendar-widget [full]="false" [framed]="false" />
    </div></article>
  </section>
  </div>

  <app-modal [open]="activeModal === 'attention'" [title]="'Needs attention' | tr" (closed)="activeModal = null">
    @if (attentionLoading) { <app-skeleton [rows]="4" /> }
    @else if (!attentionCount) { <div class="empty">{{ 'All clear. Nothing unusual right now.' | tr }}</div> }
    @else { <ul class="list">
      @for (a of anomalies.slice(0, 5); track a.id) {
        <li class="item"><span class="ic-badge warn"><app-icon [name]="icon(a.type)" [size]="18" /></span><div class="grow"><div class="t">{{ a.type }} {{ 'looks high' | tr }}</div><div class="s">{{ months[a.month - 1] }} {{ a.year }}</div></div><div class="amt">{{ fmt(a.amount) }}<div><span class="badge">+{{ a.percentAbove }}%</span></div></div></li> }
      @for (r of overBudget; track r.category) {
        <li class="item"><span class="ic-badge warn"><app-icon name="pie" [size]="18" /></span><div class="grow"><div class="t">{{ r.category | tr }} {{ 'over budget' | tr }}</div><div class="s">{{ fmt(r.spent) }} {{ 'of' | tr }} {{ fmt(r.limit) }}</div></div><span class="badge">{{ r.pct }}%</span></li> }
      @for (g of goalReminders; track g.id) {
        <li class="item"><span class="ic-badge brown"><app-icon name="target" [size]="18" /></span><div class="grow"><div class="t">{{ g.name }}</div><div class="s">{{ g.stale ? ('No progress for' | tr) + ' ' + g.months_since_update + ' ' + ('months' | tr) : ('Past target date' | tr) }}</div></div><span class="badge">{{ 'Goal' | tr }}</span></li> }
    </ul> }
  </app-modal>
  <app-modal [open]="activeModal === 'contacts'" [title]="'Quick call' | tr" (closed)="activeModal = null">
    @if (favsLoading) { <app-skeleton [rows]="3" /> }
    @else if (!favs.length) { <div class="empty">{{ 'Star a contact to pin it here.' | tr }}</div> }
    @else { <ul class="list">@for (c of favs; track c.id) {
      <li class="item"><span class="ava">{{ c.name.charAt(0).toUpperCase() }}</span><div class="grow"><div class="t">{{ c.name }}</div><div class="s">{{ c.phone }}</div></div><a class="btn green sm" [href]="tel(c.phone)" [attr.aria-label]="('Call' | tr) + ' ' + c.name"><app-icon name="call" [size]="16" /></a></li>
    }</ul> }
    <div class="sheet-f"><a routerLink="/contacts" class="btn ghost" (click)="activeModal = null">{{ 'All contacts' | tr }}</a></div>
  </app-modal>
  <app-modal [open]="activeModal === 'prayer'" [title]="'Prayer times' | tr" (closed)="activeModal = null"><app-prayer-widget /></app-modal>`,
})
export class DashboardComponent implements OnInit {
  activeModal: 'attention' | 'contacts' | 'prayer' | null = null;
  private api = inject(Api);
  language = inject(Language);
  fmt = fmt; get months() { return MONTHS.map((_, i) => new Date(2024, i, 1).toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY', { month: 'short' })); } icon = typeIcon; abs = Math.abs;
  hello = greeting(); firstName = (inject(Auth).user()?.name || '').split(' ')[0];
  get today() { return new Date().toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  payments: any[] = []; anomalies: any[] = []; goalReminders: any[] = []; favs: any[] = [];
  budget: any = { rows: [] }; typeHasData = false;
  expCfg: any; insCfg: any; goalCfg: any; typeCfg: any; incCfg: any;
  expensesLoading = true; cashflowLoading = true; installmentsLoading = true; goalsLoading = true;
  paymentsLoading = true; budgetLoading = true; anomaliesLoading = true; remindersLoading = true; favsLoading = true;
  private pendingPaymentLists = 2;
  curLabel = 'This month'; curTotal = 0; prevTotal = 0; delta = 0; curIncome = 0;
  get dueTotal() { return this.payments.reduce((a, u) => a + u.amount, 0); }
  get spendingPeriodLabel() { return `${this.curLabel} ${this.language.text('spending')}`; }
  get attentionLoading() { return this.anomaliesLoading || this.remindersLoading || this.budgetLoading; }
  get overBudget() { return (this.budget.rows || []).filter((r: any) => r.status === 'over'); }
  get attentionCount() { return this.anomalies.length + this.goalReminders.length + this.overBudget.length; }
  tel(p: string) { return 'tel:' + p.replace(/[^\d+]/g, ''); }

  private addPayments(list: any[]) { this.payments = [...this.payments, ...list].sort((a, b) => a.due_date.localeCompare(b.due_date)); }

  ngOnInit() {
    const y = new Date().getFullYear(), nowIdx = y * 12 + new Date().getMonth() + 1;
    this.paymentsLoading = true; this.pendingPaymentLists = 2;
    this.api.get<any[]>('/installments/upcoming?days=30').subscribe({ next: (r) => { this.addPayments(r.map((u) => ({ key: 'i' + u.installment_id + '-' + u.period, kind: 'Installment', title: u.name || u.type, cat: u.type, amount: u.amount, due_date: u.due_date, days_left: u.days_left }))); this.finishPaymentList(); }, error: () => this.finishPaymentList() });
    this.api.get<any[]>('/bills/upcoming?days=30').subscribe({ next: (r) => { this.addPayments(r.map((b) => ({ key: 'b' + b.id, kind: 'Bill', title: b.name, cat: b.category || b.name, amount: b.amount, due_date: b.next_due, days_left: b.days_left }))); this.finishPaymentList(); }, error: () => this.finishPaymentList() });
    this.remindersLoading = true;
    this.api.get<any[]>('/goals/reminders').subscribe({ next: (r) => { this.goalReminders = r; this.remindersLoading = false; }, error: () => (this.remindersLoading = false) });
    this.goalsLoading = true;
    this.api.get<any>('/goals/summary').subscribe({ next: (s) => {
      this.goalCfg = { type: 'doughnut', data: { labels: [this.language.text('Complete'), this.language.text('Ongoing')], datasets: [{ data: [s.complete, s.ongoing], backgroundColor: ['#66BB6A', '#5D4037'] }] } };
      this.goalsLoading = false;
    }, error: () => (this.goalsLoading = false) });
    this.anomaliesLoading = true;
    this.api.get<any[]>('/expenses/anomalies').subscribe({ next: (r) => { this.anomalies = r; this.anomaliesLoading = false; }, error: () => (this.anomaliesLoading = false) });
    this.favsLoading = true;
    this.api.get<any[]>('/contacts').subscribe({ next: (r) => { this.favs = r.filter((c) => c.favorite).slice(0, 5); this.favsLoading = false; }, error: () => (this.favsLoading = false) });
    this.installmentsLoading = true;
    this.api.get<any[]>('/installments/summary').subscribe({ next: (s) => {
      this.insCfg = { type: 'bar', data: { labels: s.map((x) => x.type), datasets: [
        { label: this.language.text('Paid'), data: s.map((x) => x.paid), backgroundColor: COLORS[0] },
        { label: this.language.text('Remaining'), data: s.map((x) => x.remaining), backgroundColor: COLORS[1] }] },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } } };
      this.installmentsLoading = false;
    }, error: () => (this.installmentsLoading = false) });
    this.expensesLoading = true; this.cashflowLoading = true;
    this.api.get<any[]>('/expenses/summary').subscribe({ next: (S) => {
      this.api.get<any[]>('/income/summary').subscribe({ next: (I) => this.build(S, I, y, nowIdx), error: () => { this.expensesLoading = false; this.cashflowLoading = false; } });
    }, error: () => { this.expensesLoading = false; this.cashflowLoading = false; } });
  }

  private build(S: any[], I: any[], y: number, nowIdx: number) {
    // Line chart: months with no records are gaps (null), not a drop to RM 0 (covers months before the first record and future months).
    const mLine = (L: any[], yr: number) => this.months.map((_, i) => { const r = L.filter((s) => Number(s.year) === yr && Number(s.month) === i + 1); return r.length ? r.reduce((a, s) => a + (Number(s.total) || 0), 0) : null; });
    const m = (L: any[], yr: number) => this.months.map((_, i) => L.filter((s) => Number(s.year) === yr && Number(s.month) === i + 1).reduce((a, s) => a + (Number(s.total) || 0), 0));
    this.expCfg = { type: 'line', data: { labels: this.months, datasets: [
      { label: String(y - 1), data: mLine(S, y - 1), borderColor: '#BCAAA4', backgroundColor: '#BCAAA4', tension: 0.3, pointRadius: 2 },
      { label: String(y), data: mLine(S, y), borderColor: COLORS[0], backgroundColor: 'rgba(165,214,167,.35)', fill: true, tension: 0.3, pointRadius: 3 }] }, options: { scales: { y: { beginAtZero: true } } } };
    this.incCfg = { type: 'bar', data: { labels: this.months, datasets: [
      { label: this.language.text('Income'), data: m(I, y), backgroundColor: COLORS[1] }, { label: this.language.text('Expenses'), data: m(S, y), backgroundColor: COLORS[0] }] } };
    this.expensesLoading = false;
    this.cashflowLoading = false;
    // "current" month = latest month with expense data that is not in the future
    const idx = (s: any) => Number(s.year) * 12 + Number(s.month);
    const past = S.filter((s) => idx(s) <= nowIdx);
    if (!past.length) { this.budgetLoading = false; return; }
    const latest = Math.max(...past.map(idx));
    const ly = Math.floor((latest - 1) / 12), lm = ((latest - 1) % 12) + 1;
    const inMonth = (L: any[], k: number) => L.filter((s) => idx(s) === k);
    this.curLabel = this.months[lm - 1] + ' ' + ly;
    this.curTotal = inMonth(S, latest).reduce((a, s) => a + (Number(s.total) || 0), 0);
    this.prevTotal = inMonth(S, latest - 1).reduce((a, s) => a + (Number(s.total) || 0), 0);
    this.curIncome = inMonth(I, latest).reduce((a, s) => a + (Number(s.total) || 0), 0);
    this.delta = this.prevTotal ? Math.round(((this.curTotal - this.prevTotal) / this.prevTotal) * 100) : 0;
    const cur = inMonth(S, latest).filter((s) => Number(s.total) > 0);
    this.typeHasData = cur.length > 0;
    this.typeCfg = { type: 'doughnut', data: { labels: cur.map((s) => this.language.text(s.type)), datasets: [{ data: cur.map((s) => Number(s.total)), backgroundColor: cur.map((_, i) => COLORS[i % COLORS.length]) }] } };
    this.budgetLoading = true;
    this.api.get<any>(`/budgets/status?year=${ly}&month=${lm}`).subscribe({ next: (b) => { this.budget = b; this.budgetLoading = false; }, error: () => (this.budgetLoading = false) });
  }
  private finishPaymentList() { this.pendingPaymentLists--; if (this.pendingPaymentLists <= 0) this.paymentsLoading = false; }
}
