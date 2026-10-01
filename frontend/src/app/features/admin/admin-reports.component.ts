import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { IconComponent } from '../../shared/icon.component';
import { errMsg } from '../../shared/util';
import { TranslatePipe } from '../../shared/translate.pipe';
import { Language } from '../../core/language.service';

@Component({
  selector: 'app-admin-reports', standalone: true, imports: [FormsModule, IconComponent, TranslatePipe],
  template: `
  <div class="page-head"><div><p class="admin-kicker">{{ 'CASE MANAGEMENT' | tr }}</p><h1>{{ 'Reports' | tr }}</h1><p class="sub">{{ 'Review household membership concerns and track outcomes' | tr }}</p></div>
    <button class="icon-btn" (click)="load()" [attr.aria-label]="'Refresh' | tr" [title]="'Refresh' | tr"><app-icon name="refresh" /></button></div>
  @if (error) { <div class="err" style="margin-bottom:.7rem">{{ error | tr }}</div> }
  <div class="admin-report-summary" [attr.aria-label]="'Report totals' | tr">
    <span><b>{{ reports.length }}</b> {{ 'total' | tr }}</span><span><b>{{ count('open') }}</b> {{ 'open' | tr }}</span>
    <span><b>{{ count('reviewing') }}</b> {{ 'reviewing' | tr }}</span><span><b>{{ count('resolved') }}</b> {{ 'resolved' | tr }}</span>
    <span><b>{{ count('dismissed') }}</b> {{ 'dismissed' | tr }}</span>
  </div>
  <div class="admin-report-toolbar">
    <label>{{ 'Search records' | tr }}<input type="search" [(ngModel)]="query" [placeholder]="'ID, household, user or reason' | tr"></label>
    <div class="seg" role="group" [attr.aria-label]="'Filter report status' | tr">
      @for (filter of filters; track filter.value) { <button type="button" [class.on]="status === filter.value" (click)="status = filter.value">{{ filter.label | tr }}</button> }
    </div>
  </div>
  <section class="card admin-report-table-card">
    @if (!shown.length) { <div class="empty">{{ (reports.length ? 'No reports match these filters.' : 'No reports have been submitted.') | tr }}</div> }
    @else {
      <div class="admin-report-table-wrap">
        <table class="admin-report-table">
          <thead><tr><th>{{ 'Record' | tr }}</th><th>{{ 'Household' | tr }}</th><th>{{ 'Reported member' | tr }}</th><th>{{ 'Reporter' | tr }}</th><th>{{ 'Concern' | tr }}</th><th>{{ 'Review' | tr }}</th></tr></thead>
          <tbody>@for (report of shown; track report.id) {
            <tr>
              <td><b>#{{ report.id }}</b><span class="s">{{ 'Received' | tr }} {{ dateTime(report.created_at) }}</span></td>
              <td><b>{{ report.household_name }}</b><span class="s">{{ 'Household' | tr }} #{{ report.household_id || ('removed' | tr) }}</span></td>
              <td><b>{{ report.reported_name }}</b><span class="s">{{ 'User' | tr }} #{{ report.reported_user_id || ('removed' | tr) }}</span></td>
              <td><b>{{ report.reporter_name }}</b><span class="s">{{ 'User' | tr }} #{{ report.reporter_user_id || ('removed' | tr) }}</span></td>
              <td class="admin-report-reason">{{ report.description }}</td>
              <td class="admin-report-review">
                <label>{{ 'Status' | tr }}<select [name]="'status-' + report.id" [(ngModel)]="report.status">
                  <option value="open">{{ 'Open' | tr }}</option><option value="reviewing">{{ 'Reviewing' | tr }}</option><option value="resolved">{{ 'Resolved' | tr }}</option><option value="dismissed">{{ 'Dismissed' | tr }}</option>
                </select></label>
                <label>{{ 'Admin note' | tr }}<textarea [name]="'note-' + report.id" [(ngModel)]="report.admin_note" rows="2" maxlength="2000" [placeholder]="'Resolution or follow-up' | tr"></textarea></label>
                <button class="btn sm" (click)="save(report)">{{ (report.status === 'open' ? 'Save review' : 'Update record') | tr }}</button>
                <span class="s">{{ report.reviewed_by_admin ? ('Reviewed by' | tr) + ' ' + report.reviewed_by_admin : ('Not reviewed' | tr) }}</span>
                @if (report.updated_at) { <span class="s">{{ 'Updated' | tr }} {{ dateTime(report.updated_at) }}</span> }
                @if (report.resolved_at) { <span class="s">{{ 'Closed' | tr }} {{ dateTime(report.resolved_at) }}</span> }
              </td>
            </tr>
          }</tbody>
        </table>
      </div>
    }
  </section>`,
})
export class AdminReportsComponent implements OnInit {
  private api = inject(Api); private language = inject(Language);
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
  dateTime(value: string) { return value ? new Date(value).toLocaleString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY') : '—'; }
}
