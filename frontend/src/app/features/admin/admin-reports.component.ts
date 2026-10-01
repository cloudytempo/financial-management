import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { IconComponent } from '../../shared/icon.component';
import { errMsg } from '../../shared/util';

@Component({
  selector: 'app-admin-reports', standalone: true, imports: [FormsModule, IconComponent],
  template: `
  <div class="page-head"><div><p class="admin-kicker">CASE MANAGEMENT</p><h1>Reports</h1><p class="sub">Review household membership concerns and track outcomes</p></div>
    <button class="icon-btn" (click)="load()" aria-label="Refresh reports" title="Refresh"><app-icon name="refresh" /></button></div>
  @if (error) { <div class="err" style="margin-bottom:.7rem">{{ error }}</div> }
  <div class="admin-report-summary" aria-label="Report totals">
    <span><b>{{ reports.length }}</b> total</span><span><b>{{ count('open') }}</b> open</span>
    <span><b>{{ count('reviewing') }}</b> reviewing</span><span><b>{{ count('resolved') }}</b> resolved</span>
    <span><b>{{ count('dismissed') }}</b> dismissed</span>
  </div>
  <div class="admin-report-toolbar">
    <label>Search records<input type="search" [(ngModel)]="query" placeholder="ID, household, user or reason"></label>
    <div class="seg" role="group" aria-label="Filter report status">
      @for (filter of filters; track filter.value) { <button type="button" [class.on]="status === filter.value" (click)="status = filter.value">{{ filter.label }}</button> }
    </div>
  </div>
  <section class="card admin-report-table-card">
    @if (!shown.length) { <div class="empty">{{ reports.length ? 'No reports match these filters.' : 'No reports have been submitted.' }}</div> }
    @else {
      <div class="admin-report-table-wrap">
        <table class="admin-report-table">
          <thead><tr><th>Record</th><th>Household</th><th>Reported member</th><th>Reporter</th><th>Concern</th><th>Review</th></tr></thead>
          <tbody>@for (report of shown; track report.id) {
            <tr>
              <td><b>#{{ report.id }}</b><span class="s">Received {{ dateTime(report.created_at) }}</span></td>
              <td><b>{{ report.household_name }}</b><span class="s">Household #{{ report.household_id || 'removed' }}</span></td>
              <td><b>{{ report.reported_name }}</b><span class="s">User #{{ report.reported_user_id || 'removed' }}</span></td>
              <td><b>{{ report.reporter_name }}</b><span class="s">User #{{ report.reporter_user_id || 'removed' }}</span></td>
              <td class="admin-report-reason">{{ report.description }}</td>
              <td class="admin-report-review">
                <label>Status<select [name]="'status-' + report.id" [(ngModel)]="report.status">
                  <option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
                </select></label>
                <label>Admin note<textarea [name]="'note-' + report.id" [(ngModel)]="report.admin_note" rows="2" maxlength="2000" placeholder="Resolution or follow-up"></textarea></label>
                <button class="btn sm" (click)="save(report)">{{ report.status === 'open' ? 'Save review' : 'Update record' }}</button>
                <span class="s">{{ report.reviewed_by_admin ? 'Reviewed by ' + report.reviewed_by_admin : 'Not reviewed' }}</span>
                @if (report.updated_at) { <span class="s">Updated {{ dateTime(report.updated_at) }}</span> }
                @if (report.resolved_at) { <span class="s">Closed {{ dateTime(report.resolved_at) }}</span> }
              </td>
            </tr>
          }</tbody>
        </table>
      </div>
    }
  </section>`,
})
export class AdminReportsComponent implements OnInit {
  private api = inject(Api);
  reports: any[] = []; query = ''; status = 'all'; error = '';
  filters = [
    { label: 'All', value: 'all' }, { label: 'Open', value: 'open' }, { label: 'Reviewing', value: 'reviewing' },
    { label: 'Resolved', value: 'resolved' }, { label: 'Dismissed', value: 'dismissed' },
  ];
  get shown() {
    const q = this.query.trim().toLowerCase();
    return this.reports.filter((report) => (!q || `${report.id} ${report.household_id} ${report.household_name} ${report.reporter_user_id} ${report.reporter_name} ${report.reported_user_id} ${report.reported_name} ${report.description}`.toLowerCase().includes(q)) && (this.status === 'all' || report.status === this.status));
  }
  ngOnInit() { this.load(); }
  load() { this.api.get<any[]>('/admin/reports').subscribe({ next: (rows) => (this.reports = rows), error: (e) => (this.error = errMsg(e)) }); }
  count(value: string) { return this.reports.filter((report) => report.status === value).length; }
  save(report: any) {
    this.error = '';
    this.api.put<any>('/admin/reports/' + report.id, { status: report.status, admin_note: report.admin_note || '' }).subscribe({
      next: (updated) => Object.assign(report, updated),
      error: (e) => (this.error = errMsg(e)),
    });
  }
  dateTime(value: string) { return value ? new Date(value).toLocaleString() : '—'; }
}
