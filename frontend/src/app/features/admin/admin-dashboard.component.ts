import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { errMsg } from '../../shared/util';
import { TranslatePipe } from '../../shared/translate.pipe';

@Component({
  selector: 'app-admin-dashboard', standalone: true, imports: [RouterLink, ChartComponent, IconComponent, ModalComponent, TranslatePipe],
  template: `
  <div class="admin-dashboard-page">
  <div class="page-head admin-dashboard-head"><div><p class="admin-kicker">{{ 'HOMINT OPERATIONS' | tr }}</p><h1>{{ 'Dashboard' | tr }}</h1><p class="sub">{{ 'Account growth and household activity' | tr }}</p></div>
    <div class="admin-dashboard-actions">
      <button class="admin-report-trigger" (click)="openReports()" [attr.aria-label]="'Open reports' | tr" [title]="'Open reports' | tr"><app-icon name="alert" /><span>{{ data.open_reports }}</span></button>
      <button class="icon-btn" (click)="load()" [attr.aria-label]="'Refresh' | tr" [title]="'Refresh' | tr"><app-icon name="refresh" /></button>
    </div></div>
  @if (error) { <div class="err" style="margin-bottom:1rem">{{ error }}</div> }
  <section class="card admin-period-card"><div class="card-h"><h2>{{ 'New entries' | tr }}</h2><span class="muted small">{{ data.users.active }} {{ 'active users' | tr }} · {{ data.households.active }} {{ 'active households' | tr }}</span></div>
    <div class="admin-period-grid">
      <b></b><b>{{ 'Daily' | tr }}</b><b>{{ 'Weekly' | tr }}</b><b>{{ 'Monthly' | tr }}</b>
      <strong>{{ 'Users' | tr }}</strong><span>{{ data.users.today }}</span><span>{{ data.users.this_week }}</span><span>{{ data.users.this_month }}</span>
      <strong>{{ 'Households' | tr }}</strong><span>{{ data.households.today }}</span><span>{{ data.households.this_week }}</span><span>{{ data.households.this_month }}</span>
    </div>
  </section>
  <div class="admin-dashboard-grid">
    <section class="card admin-chart-panel"><div class="card-h"><h2>{{ 'New users and households' | tr }}</h2><span class="muted small">{{ 'Last 30 days' | tr }}</span></div>@if (chart) { <app-chart [config]="chart" /> }</section>
    <section class="card admin-activity-panel"><div class="card-h"><h2>{{ (showAllActivity ? 'User and household activity' : 'Recent activity') | tr }}</h2>
      <button class="btn ghost sm" (click)="toggleActivity()">{{ (showAllActivity ? 'Show recent' : 'View all activity') | tr }}</button></div>
      <div class="admin-activity-scroll">
      @if (!visibleActivity.length) { <div class="empty">{{ 'Activity will appear as users join and leave households.' | tr }}</div> }
      <ol class="admin-timeline">@for (event of visibleActivity; track event.id) {
        <li><span class="timeline-marker" [class.warn]="event.activity_type.includes('deactivated')" aria-hidden="true"></span>
          <div class="timeline-entry"><div class="row between"><b>{{ activityLabel(event.activity_type) }}</b><time class="muted small">{{ dateTime(event.created_at) }}</time></div>
            <div class="s">{{ event.actor_name }}@if (event.subject_name) { · {{ event.subject_name }}}@if (event.household_name) { · {{ event.household_name }}}</div></div></li>
      }</ol>
      </div>
    </section>
  </div>
  </div>
  <app-modal [open]="reportsOpen" [title]="'Open reports' | tr" (closed)="reportsOpen = false">
    <div class="admin-report-modal">
      @if (reportsLoading) { <p class="muted small">{{ 'Loading reports...' | tr }}</p> }
      @else if (!reports.length) { <div class="empty">{{ 'No open reports.' | tr }}</div> }
      @else { @for (report of reports; track report.id) {
        <article class="admin-report"><div class="row between"><b>{{ report.reported_name }}</b><span class="pill">{{ report.status }}</span></div>
          <div class="s">{{ report.household_name }} · {{ 'Reported by' | tr }} {{ report.reporter_name }}</div><p>{{ report.description }}</p>
          <div class="s">{{ 'Received' | tr }} {{ dateTime(report.created_at) }}</div>
        </article>
      } }
      <a class="btn" routerLink="/admin/reports" (click)="reportsOpen = false">{{ 'Open report tracker' | tr }}</a>
    </div>
  </app-modal>`,
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(Api);
  data: any = { users: { total: 0, active: 0, today: 0, this_week: 0, this_month: 0 }, households: { total: 0, active: 0, today: 0, this_week: 0, this_month: 0 }, trend: [], activity: [], open_reports: 0 };
  reports: any[] = []; reportsOpen = false; reportsLoading = false; allActivity: any[] = []; showAllActivity = false; chart: any; error = '';
  get visibleActivity() { return this.showAllActivity ? this.allActivity : this.data.activity; }
  ngOnInit() { this.load(); }
  load() {
    this.error = '';
    this.api.get<any>('/admin/dashboard').subscribe({ next: (r) => {
      this.data = r;
      this.chart = { type: 'line', data: { labels: r.trend.map((x: any) => String(x.date).slice(5)), datasets: [
        { label: 'New users', data: r.trend.map((x: any) => x.users), borderColor: '#A05AFF', backgroundColor: 'rgba(160,90,255,.12)', tension: .3, fill: true },
        { label: 'Households', data: r.trend.map((x: any) => x.households), borderColor: '#1BCFB4', backgroundColor: 'rgba(27,207,180,.12)', tension: .3, fill: true },
      ] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } };
    }, error: (e) => (this.error = errMsg(e)) });
  }
  openReports() {
    this.reportsOpen = true; this.reportsLoading = true;
    this.api.get<any[]>('/admin/reports').subscribe({
      next: (rows) => { this.reports = rows.filter((report) => ['open', 'reviewing'].includes(report.status)); this.reportsLoading = false; },
      error: (e) => { this.error = errMsg(e); this.reportsLoading = false; },
    });
  }
  toggleActivity() {
    if (this.showAllActivity) { this.showAllActivity = false; return; }
    this.api.get<any[]>('/admin/activity').subscribe({ next: (rows) => { this.allActivity = rows; this.showAllActivity = true; }, error: (e) => (this.error = errMsg(e)) });
  }
  activityLabel(type: string) { return type.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()); }
  dateTime(value: string) { return new Date(value).toLocaleString(); }
}
