import { Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { Auth } from '../../core/auth.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { COLORS, MONTHS, fmt, greeting, typeIcon } from '../../shared/util';
import { PrayerWidget } from './widgets/prayer.widget';

@Component({
  selector: 'app-dashboard', standalone: true, imports: [RouterLink, ChartComponent, IconComponent, PrayerWidget],
  template: `
  <div class="dashboard-page">
  <div class="page-head"><div><h1>{{ hello }}, {{ firstName }}</h1><p class="sub">{{ today }}</p></div></div>

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

  <section class="dashboard-carousel" aria-label="Dashboard cards">
    <div class="dashboard-carousel-head"><h2>Overview</h2><div class="row"><button class="icon-btn" (click)="moveCarousel(-1)" aria-label="Previous dashboard cards"><app-icon name="left" /></button><button class="icon-btn" (click)="moveCarousel(1)" aria-label="Next dashboard cards"><app-icon name="right" /></button></div></div>
    <div class="dashboard-track" #carousel>
    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="trend" [size]="18" />Monthly expenses: this year vs last</h2></div>@if (expCfg) { <app-chart [config]="expCfg" /> }</div></article>
    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="bell" [size]="18" />Upcoming payments</h2></div>
      @if (!payments.length) { <div class="empty">Nothing due in the next 30 days.</div> }
      <ul class="list">@for (u of payments.slice(0, 3); track u.key) {
        <li class="item"><span class="ic-badge" [class.warn]="u.days_left <= 3"><app-icon [name]="icon(u.cat)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ u.title }}</div><div class="s">{{ u.due_date }} · {{ u.kind }}</div></div>
          <div class="amt">{{ fmt(u.amount) }}<div><span class="badge" [class.ok]="u.days_left > 3">{{ u.days_left < 0 ? 'Overdue' : u.days_left === 0 ? 'Today' : u.days_left + 'd' }}</span></div></div></li>
      }</ul></div></article>

    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="pie" [size]="18" />Budget, {{ curLabel }}</h2><a routerLink="/budgets" class="small">Manage</a></div>
      @if (!budget.rows.length) { <div class="empty">No budgets yet. <a routerLink="/budgets">Set one</a> to track limits.</div> }
      <ul class="list">@for (r of budget.rows.slice(0, 4); track r.category) {
        <li class="item" style="display:block"><div class="row between small" style="flex-wrap:nowrap"><b>{{ r.category }}</b><span>{{ fmt(r.spent) }} / {{ fmt(r.limit) }}</span></div>
          <div class="bar" style="margin-top:.3rem" [class.warn]="r.status === 'warn'" [class.over]="r.status === 'over'"><i [style.width.%]="r.pct > 100 ? 100 : r.pct"></i></div></li>
      }</ul></div></article>
    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="tag" [size]="18" />{{ curLabel }} by type</h2></div>@if (typeCfg) { <app-chart [config]="typeCfg" /> }</div></article>
    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="banknote" [size]="18" />Income vs expenses</h2></div>@if (incCfg) { <app-chart [config]="incCfg" /> }</div></article>

    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="credit-card" [size]="18" />Installments by type</h2></div>@if (insCfg) { <app-chart [config]="insCfg" /> }</div></article>
    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="target" [size]="18" />Goal completion</h2></div>@if (goalCfg) { <app-chart [config]="goalCfg" /> }</div></article>
    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="call" [size]="18" />Quick call</h2><a routerLink="/contacts" class="small">All</a></div>
      @if (!favs.length) { <div class="empty">Star a contact to pin it here.</div> }
      <ul class="list">@for (c of favs.slice(0, 3); track c.id) {
        <li class="item"><span class="ava" style="width:38px;height:38px">{{ c.name.charAt(0).toUpperCase() }}</span>
          <div class="grow"><div class="t">{{ c.name }}</div><div class="s">{{ c.phone }}</div></div>
          <a class="btn green sm" [href]="tel(c.phone)" aria-label="Call {{ c.name }}"><app-icon name="call" [size]="16" /></a></li>
      }</ul></div></article>

    <article class="dashboard-panel"><app-prayer-widget /></article>
    <article class="dashboard-panel"><div class="card"><div class="card-h"><h2><app-icon name="alert" [size]="18" />Needs attention</h2></div>
        @if (!attentionCount) { <div class="empty">All clear. Nothing unusual right now.</div> }
        <ul class="list">
          @for (a of anomalies.slice(0, 1); track a.id) {
            <li class="item"><span class="ic-badge warn"><app-icon [name]="icon(a.type)" [size]="18" /></span>
              <div class="grow"><div class="t">{{ a.type }} looks high</div><div class="s">{{ months[a.month - 1] }} {{ a.year }}</div></div>
              <div class="amt">{{ fmt(a.amount) }}<div><span class="badge">+{{ a.percentAbove }}%</span></div></div></li> }
          @for (r of overBudget.slice(0, 1); track r.category) {
            <li class="item"><span class="ic-badge warn"><app-icon name="pie" [size]="18" /></span>
              <div class="grow"><div class="t">{{ r.category }} over budget</div><div class="s">{{ fmt(r.spent) }} of {{ fmt(r.limit) }}</div></div><span class="badge">{{ r.pct }}%</span></li> }
          @for (g of goalReminders.slice(0, 1); track g.id) {
            <li class="item"><span class="ic-badge brown"><app-icon name="target" [size]="18" /></span>
              <div class="grow"><div class="t">{{ g.name }}</div><div class="s">{{ g.stale ? 'No progress for ' + g.months_since_update + ' months' : 'Past target date' }}</div></div><span class="badge">Goal</span></li> }
        </ul></div></article>
    <article class="dashboard-panel"><div class="card calendar-shortcut"><app-icon name="calendar" [size]="28" /><h2>Calendar</h2><p class="sub">Events, bills and installments by date</p><a routerLink="/calendar" class="btn sm">Open calendar</a></div></article>
    </div>
  </section>
  </div>`,
})
export class DashboardComponent implements OnInit {
  @ViewChild('carousel') carousel!: ElementRef<HTMLElement>;
  private api = inject(Api);
  fmt = fmt; months = MONTHS; icon = typeIcon; abs = Math.abs;
  hello = greeting(); firstName = (inject(Auth).user()?.name || '').split(' ')[0];
  today = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  payments: any[] = []; anomalies: any[] = []; goalReminders: any[] = []; favs: any[] = [];
  budget: any = { rows: [] };
  expCfg: any; insCfg: any; goalCfg: any; typeCfg: any; incCfg: any;
  curLabel = 'This month'; curTotal = 0; prevTotal = 0; delta = 0; curIncome = 0;
  get dueTotal() { return this.payments.reduce((a, u) => a + u.amount, 0); }
  get overBudget() { return (this.budget.rows || []).filter((r: any) => r.status === 'over'); }
  get attentionCount() { return this.anomalies.length + this.goalReminders.length + this.overBudget.length; }
  tel(p: string) { return 'tel:' + p.replace(/[^\d+]/g, ''); }
  moveCarousel(direction: number) { this.carousel.nativeElement.scrollBy({ left: direction * this.carousel.nativeElement.clientWidth, behavior: 'smooth' }); }

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
    const m = (L: any[], yr: number) => MONTHS.map((_, i) => L.filter((s) => s.year === yr && s.month === i + 1).reduce((a, s) => a + s.total, 0));
    this.expCfg = { type: 'line', data: { labels: MONTHS, datasets: [
      { label: String(y - 1), data: m(S, y - 1), borderColor: '#BCAAA4', backgroundColor: '#BCAAA4', tension: 0.3, pointRadius: 2 },
      { label: String(y), data: m(S, y), borderColor: COLORS[0], backgroundColor: 'rgba(165,214,167,.35)', fill: true, tension: 0.3, pointRadius: 3 }] } };
    this.incCfg = { type: 'bar', data: { labels: MONTHS, datasets: [
      { label: 'Income', data: m(I, y), backgroundColor: COLORS[1] }, { label: 'Expenses', data: m(S, y), backgroundColor: COLORS[0] }] } };
    // "current" month = latest month with expense data that is not in the future
    const idx = (s: any) => s.year * 12 + s.month;
    const past = S.filter((s) => idx(s) <= nowIdx);
    if (!past.length) return;
    const latest = Math.max(...past.map(idx));
    const ly = Math.floor((latest - 1) / 12), lm = ((latest - 1) % 12) + 1;
    const inMonth = (L: any[], k: number) => L.filter((s) => idx(s) === k);
    this.curLabel = MONTHS[lm - 1] + ' ' + ly;
    this.curTotal = inMonth(S, latest).reduce((a, s) => a + s.total, 0);
    this.prevTotal = inMonth(S, latest - 1).reduce((a, s) => a + s.total, 0);
    this.curIncome = inMonth(I, latest).reduce((a, s) => a + s.total, 0);
    this.delta = this.prevTotal ? Math.round(((this.curTotal - this.prevTotal) / this.prevTotal) * 100) : 0;
    const cur = inMonth(S, latest).filter((s) => s.total > 0);
    this.typeCfg = { type: 'doughnut', data: { labels: cur.map((s) => s.type), datasets: [{ data: cur.map((s) => s.total), backgroundColor: cur.map((_, i) => COLORS[i % COLORS.length]) }] } };
    this.api.get<any>(`/budgets/status?year=${ly}&month=${lm}`).subscribe((b) => (this.budget = b));
  }
}
