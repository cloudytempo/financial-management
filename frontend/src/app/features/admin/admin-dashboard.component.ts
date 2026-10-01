import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { errMsg } from '../../shared/util';

@Component({
  selector: 'app-admin-dashboard', standalone: true, imports: [FormsModule, ChartComponent, IconComponent],
  template: `
  <div class="admin-dashboard-page">
  <div class="page-head admin-dashboard-head"><div><p class="admin-kicker">HOMINT OPERATIONS</p><h1>Dashboard</h1><p class="sub">Account growth, household activity and reports</p></div>
    <button class="icon-btn" (click)="load()" aria-label="Refresh dashboard" title="Refresh"><app-icon name="refresh" /></button></div>
  @if (error) { <div class="err" style="margin-bottom:1rem">{{ error }}</div> }
  <section class="card admin-period-card"><div class="card-h"><h2>New entries</h2><span class="muted small">{{ data.users.active }} active users · {{ data.households.active }} active households</span></div>
    <div class="admin-period-grid">
      <b></b><b>Daily</b><b>Weekly</b><b>Monthly</b>
      <strong>Users</strong><span>{{ data.users.today }}</span><span>{{ data.users.this_week }}</span><span>{{ data.users.this_month }}</span>
      <strong>Households</strong><span>{{ data.households.today }}</span><span>{{ data.households.this_week }}</span><span>{{ data.households.this_month }}</span>
    </div>
  </section>
  <div class="admin-dashboard-grid">
    <section class="card admin-chart-panel"><div class="card-h"><h2>New users and households</h2><span class="muted small">Last 30 days</span></div>@if (chart) { <app-chart [config]="chart" /> }</section>
    <section class="card admin-report-panel"><div class="card-h"><h2>Reports <span class="pill">{{ data.open_reports }} open</span></h2></div>
      <div class="admin-report-scroll">
      @if (!reports.length) { <div class="empty">No user reports.</div> }
      @for (report of reports; track report.id) {
        <article class="admin-report"><div class="row between"><b>{{ report.reported_name }}</b><span class="pill">{{ report.status }}</span></div>
          <div class="s">{{ report.household_name }} · {{ report.reporter_name }}</div><p>{{ report.description }}</p>
          <textarea aria-label="Admin note" rows="2" [(ngModel)]="report.admin_note" placeholder="Admin note"></textarea>
          <div class="row" style="margin-top:.4rem">
            @if (report.status === 'open') { <button class="btn ghost sm" (click)="review(report,'reviewing')">Review</button> }
            @if (report.status === 'open' || report.status === 'reviewing') {
              <button class="btn green sm" (click)="review(report,'resolved')">Resolve</button>
              <button class="btn danger sm" (click)="review(report,'dismissed')">Dismiss</button>
            }
          </div>
        </article>
      }
      </div>
    </section>
    <section class="card admin-activity-panel"><div class="card-h"><h2>{{ showAllActivity ? 'User and household activity' : 'Recent activity' }}</h2>
      <button class="btn ghost sm" (click)="toggleActivity()">{{ showAllActivity ? 'Show recent' : 'View all activity' }}</button></div>
      <div class="admin-activity-scroll">
      @if (!visibleActivity.length) { <div class="empty">Activity will appear as users join and leave households.</div> }
      <ol class="admin-timeline">@for (event of visibleActivity; track event.id) {
        <li><span class="timeline-marker" [class.warn]="event.activity_type.includes('deactivated')" aria-hidden="true"></span>
          <div class="timeline-entry"><div class="row between"><b>{{ activityLabel(event.activity_type) }}</b><time class="muted small">{{ dateTime(event.created_at) }}</time></div>
            <div class="s">{{ event.actor_name }}@if (event.subject_name) { · {{ event.subject_name }}}@if (event.household_name) { · {{ event.household_name }}}</div></div></li>
      }</ol>
      </div>
    </section>
  </div>
  </div>`,
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(Api);
  data: any = { users: { total: 0, active: 0, today: 0, this_week: 0, this_month: 0 }, households: { total: 0, active: 0, today: 0, this_week: 0, this_month: 0 }, trend: [], activity: [], open_reports: 0 };
  reports: any[] = []; allActivity: any[] = []; showAllActivity = false; chart: any; error = '';
  get visibleActivity() { return this.showAllActivity ? this.allActivity : this.data.activity; }
  ngOnInit() { this.load(); }
  load() {
    this.error = '';
    this.api.get<any>('/admin/dashboard').subscribe({ next: (r) => {
      this.data = r;
      this.chart = { type: 'line', data: { labels: r.trend.map((x: any) => String(x.date).slice(5)), datasets: [
        { label: 'New users', data: r.trend.map((x: any) => x.users), borderColor: '#007f78', backgroundColor: 'rgba(0,127,120,.12)', tension: .3, fill: true },
        { label: 'Households', data: r.trend.map((x: any) => x.households), borderColor: '#83bf37', backgroundColor: 'rgba(131,191,55,.08)', tension: .3, fill: true },
      ] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } };
    }, error: (e) => (this.error = errMsg(e)) });
    this.api.get<any[]>('/admin/reports').subscribe({ next: (r) => (this.reports = r.filter((x) => ['open', 'reviewing'].includes(x.status))), error: (e) => (this.error = errMsg(e)) });
  }
  review(report: any, status: string) {
    this.api.put('/admin/reports/' + report.id, { status, admin_note: report.admin_note || '' }).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  toggleActivity() {
    if (this.showAllActivity) { this.showAllActivity = false; return; }
    this.api.get<any[]>('/admin/activity').subscribe({ next: (rows) => { this.allActivity = rows; this.showAllActivity = true; }, error: (e) => (this.error = errMsg(e)) });
  }
  activityLabel(type: string) { return type.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()); }
  dateTime(value: string) { return new Date(value).toLocaleString(); }
}
