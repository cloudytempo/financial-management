import { Component, inject } from '@angular/core';
import { Api } from '../../core/api.service';
import { Language } from '../../core/language.service';
import { TranslatePipe } from '../../shared/translate.pipe';
import { downloadBlob } from '../../shared/util';

@Component({
  selector: 'app-admin-settings', standalone: true, imports: [TranslatePipe],
  template: `
  <div class="page-head"><div><p class="admin-kicker">{{ 'HOMINT OPERATIONS' | tr }}</p><h1>{{ 'Settings' | tr }}</h1></div></div>
  <section class="card admin-settings-panel" aria-labelledby="admin-language-title">
    <h2 id="admin-language-title">{{ 'Language' | tr }}</h2><p class="sub">{{ 'Choose your language' | tr }}</p>
    <div class="seg" role="group" [attr.aria-label]="'Language' | tr" style="margin-top:.75rem">
      <button type="button" [class.on]="language.code() === 'en'" (click)="language.set('en')">{{ 'English' | tr }}</button>
      <button type="button" [class.on]="language.code() === 'ms'" (click)="language.set('ms')">{{ 'Bahasa Melayu' | tr }}</button>
    </div>
  </section>
  <section class="card admin-settings-panel" aria-labelledby="admin-export-title" style="margin-top:1rem">
    <h2 id="admin-export-title">{{ 'Export system data' | tr }}</h2>
    <p class="sub">{{ 'Download users, households, reports and activity as Excel or CSV. Password hashes are never included.' | tr }}</p>
    <div class="seg" role="group" [attr.aria-label]="'Export format' | tr" style="margin-top:.75rem">
      <button type="button" [class.on]="format === 'xlsx'" (click)="format = 'xlsx'">Excel</button>
      <button type="button" [class.on]="format === 'csv'" (click)="format = 'csv'">CSV</button>
    </div>
    @if (error) { <div class="err small" style="margin-top:.5rem">{{ error | tr }}</div> }
    <button class="btn" type="button" style="margin-top:.75rem" [disabled]="exporting" (click)="exportData()">{{ (exporting ? 'Exporting…' : 'Export system data') | tr }}</button>
  </section>`,
})
export class AdminSettingsComponent {
  language = inject(Language); private api = inject(Api);
  format: 'xlsx' | 'csv' = 'xlsx'; exporting = false; error = '';
  exportData() {
    this.error = ''; this.exporting = true;
    const ext = this.format === 'csv' ? 'zip' : 'xlsx';
    this.api.getBlob('/admin/export?format=' + this.format).subscribe({
      next: (blob) => { downloadBlob(blob, `homint-system-${new Date().toISOString().slice(0, 10)}.${ext}`); this.exporting = false; },
      error: () => { this.error = 'Something went wrong. Try again.'; this.exporting = false; },
    });
  }
}
