import { Component, inject, OnInit } from '@angular/core';
import { Api } from '../../core/api.service';
import { Auth } from '../../core/auth.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { COLORS, MONTHS, fmt, greeting, typeIcon } from '../../shared/util';
import { CalendarWidget } from './widgets/calendar.widget';
import { PrayerWidget } from './widgets/prayer.widget';

@Component({
  selector: 'app-dashboard', standalone: true, imports: [ChartComponent, IconComponent, CalendarWidget, PrayerWidget],
  template: `
  <div class="dashboard-page">
  <div class="page-head">
    <div><h1>{{ hello }}, {{ firstName }}</h1><p class="sub">{{ today }}</p></div>
  </div>

  <div class="bento dashboard-kpis">
    <div class="card kpi dark s3"><span class="chip-ic"><app-icon name="wallet" /></span>
      <div><div class="lbl">{{ curLabel }} spending</div><div class="val">{{ fmt(curTotal) }}</div>
        @if (prevTotal) { <div class="foot"><span [class.up]="delta > 0" [class.down]="delta <= 0"><app-icon [name]="delta > 0 ? 'arrow-up' : 'arrow-down'" [size]="12" /> {{ abs(delta) }}%</span> vs previous month</div> }</div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="clock" /></span>
      <div><div class="lbl">Installments due (30d)</div><div class="val">{{ upcoming.length }}</div><div class="foot">{{ fmt(dueTotal) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="target" /></span>
      <div><div class="lbl">Goals complete</div><div class="val">{{ goals.complete }}/{{ goals.complete + goals.ongoing }}</div><div class="foot">{{ goals.ongoing }} ongoing</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="alert" /></span>
      <div><div class="lbl">Needs attention</div><div class="val">{{ anomalies.length + goalReminders.length }}</div><div class="foot">unusual or stalled</div></div></div>
  </div>

  <div class="bento dashboard-grid">
    <div class="card s8"><div class="card-h"><h2><app-icon name="trend" [size]="18" />Monthly expenses: this year vs last</h2></div>@if (expCfg) { <app-chart [config]="expCfg" /> }</div>
    <div class="card s4"><div class="card-h"><h2><app-icon name="bell" [size]="18" />Upcoming installments</h2></div>
      @if (!upcoming.length) { <div class="empty">Nothing due in the next 30 days.</div> }
      <ul class="list">@for (u of upcoming.slice(0, 5); track u.installment_id + '-' + u.period) {
        <li class="item"><span class="ic-badge" [class.warn]="u.days_left <= 3"><app-icon [name]="icon(u.type)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ u.name || u.type }}</div><div class="s">{{ u.due_date }} · {{ u.period }}/{{ u.of }}</div></div>
          <div class="amt">{{ fmt(u.amount) }}<div><span class="badge" [class.ok]="u.days_left > 3">{{ u.days_left < 0 ? 'Overdue' : u.days_left === 0 ? 'Today' : u.days_left + 'd' }}</span></div></div></li>
      }</ul></div>

    <div class="card s4"><div class="card-h"><h2><app-icon name="tag" [size]="18" />{{ curLabel }} by type</h2></div>@if (typeCfg) { <app-chart [config]="typeCfg" /> }</div>
    <div class="card s4"><div class="card-h"><h2><app-icon name="credit-card" [size]="18" />Installments by type</h2></div>@if (insCfg) { <app-chart [config]="insCfg" /> }</div>
    <div class="card s4"><div class="card-h"><h2><app-icon name="target" [size]="18" />Goal completion</h2></div>@if (goalCfg) { <app-chart [config]="goalCfg" /> }</div>

    <div class="s6"><app-calendar-widget /></div>
    <div class="s6 stack">
      <app-prayer-widget />
      <div class="card"><div class="card-h"><h2><app-icon name="alert" [size]="18" />Needs attention</h2></div>
        @if (!anomalies.length && !goalReminders.length) { <div class="empty">All clear. Nothing unusual right now.</div> }
        <ul class="list">
          @for (a of anomalies.slice(0, 4); track a.id) {
            <li class="item"><span class="ic-badge warn"><app-icon [name]="icon(a.type)" [size]="18" /></span>
              <div class="grow"><div class="t">{{ a.type }}</div><div class="s">{{ months[a.month - 1] }} {{ a.year }}</div></div>
              <div class="amt">{{ fmt(a.amount) }}<div><span class="badge">+{{ a.percentAbove }}%</span></div></div></li> }
          @for (g of goalReminders; track g.id) {
            <li class="item"><span class="ic-badge brown"><app-icon name="target" [size]="18" /></span>
              <div class="grow"><div class="t">{{ g.name }}</div><div class="s">{{ g.stale ? 'No progress for ' + g.months_since_update + ' months' : 'Past target date' }}</div></div>
              <span class="badge">Goal</span></li> }
        </ul></div>
    </div>
  </div>
  </div>`,
})
export class DashboardComponent implements OnInit {
  private api = inject(Api);
  fmt = fmt; months = MONTHS; icon = typeIcon; abs = Math.abs;
  hello = greeting(); firstName = (inject(Auth).user()?.name || '').split(' ')[0];
  today = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  upcoming: any[] = []; anomalies: any[] = []; goalReminders: any[] = []; goals = { complete: 0, ongoing: 0 };
  expCfg: any; insCfg: any; goalCfg: any; typeCfg: any;
  curLabel = 'This month'; curTotal = 0; prevTotal = 0; delta = 0; dueTotal = 0;

  ngOnInit() {
    const y = new Date().getFullYear(), nowIdx = y * 12 + new Date().getMonth() + 1;
    this.api.get<any[]>('/installments/upcoming?days=30').subscribe((r) => { this.upcoming = r; this.dueTotal = r.reduce((a, u) => a + u.amount, 0); });
    this.api.get<any[]>('/goals/reminders').subscribe((r) => (this.goalReminders = r));
    this.api.get<any>('/goals/summary').subscribe((s) => {
      this.goals = s;
      this.goalCfg = { type: 'doughnut', data: { labels: ['Complete', 'Ongoing'], datasets: [{ data: [s.complete, s.ongoing], backgroundColor: ['#66BB6A', '#5D4037'] }] } };
    });
    this.api.get<any[]>('/expenses/anomalies').subscribe((r) => (this.anomalies = r));
    this.api.get<any[]>('/expenses/summary').subscribe((S) => {
      const m = (yr: number) => MONTHS.map((_, i) => S.filter((s) => s.year === yr && s.month === i + 1).reduce((a, s) => a + s.total, 0));
      this.expCfg = { type: 'line', data: { labels: MONTHS, datasets: [
        { label: String(y - 1), data: m(y - 1), borderColor: '#BCAAA4', backgroundColor: '#BCAAA4', tension: 0.3, pointRadius: 2 },
        { label: String(y), data: m(y), borderColor: COLORS[0], backgroundColor: 'rgba(165,214,167,.35)', fill: true, tension: 0.3, pointRadius: 3 }] } };
      // "current" month = latest month with data that is not in the future
      const idx = (s: any) => s.year * 12 + s.month;
      const past = S.filter((s) => idx(s) <= nowIdx);
      if (!past.length) return;
      const latest = Math.max(...past.map(idx));
      const ly = Math.floor((latest - 1) / 12), lm = ((latest - 1) % 12) + 1;
      const inMonth = (k: number) => S.filter((s) => idx(s) === k);
      this.curLabel = MONTHS[lm - 1] + ' ' + ly;
      this.curTotal = inMonth(latest).reduce((a, s) => a + s.total, 0);
      this.prevTotal = inMonth(latest - 1).reduce((a, s) => a + s.total, 0);
      this.delta = this.prevTotal ? Math.round(((this.curTotal - this.prevTotal) / this.prevTotal) * 100) : 0;
      const cur = inMonth(latest).filter((s) => s.total > 0);
      this.typeCfg = { type: 'doughnut', data: { labels: cur.map((s) => s.type), datasets: [{ data: cur.map((s) => s.total), backgroundColor: cur.map((_, i) => COLORS[i % COLORS.length]) }] } };
    });
    this.api.get<any[]>('/installments/summary').subscribe((s) => {
      this.insCfg = { type: 'bar', data: { labels: s.map((x) => x.type), datasets: [
        { label: 'Paid', data: s.map((x) => x.paid), backgroundColor: COLORS[0] },
        { label: 'Remaining', data: s.map((x) => x.remaining), backgroundColor: COLORS[1] }] },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } } };
    });
  }
}
