import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { mapExpenseRows } from '../../shared/csv';
import { COLORS, MONTHS, errMsg, fmt, typeIcon } from '../../shared/util';

@Component({
  selector: 'app-expenses', standalone: true, imports: [FormsModule, ChartComponent, IconComponent, ModalComponent],
  template: `
  <div class="page-head">
    <div><h1>Expenses</h1><p class="sub">Compare what you spend month to month and year to year</p></div>
    <div class="actions">
      <button class="btn ghost" (click)="openImport()"><app-icon name="upload" [size]="18" /><span class="hide-sm">Import CSV</span></button>
      <button class="btn" (click)="openForm()"><app-icon name="plus" [size]="18" />Add expense</button>
    </div>
  </div>

  <div class="row between" style="margin-bottom:1rem">
    <div class="seg">@for (y of years; track y) { <button [class.on]="y === year" (click)="setYear(y)">{{ y }}</button> }</div>
  </div>

  <div class="bento">
    <div class="card kpi dark s3"><span class="chip-ic"><app-icon name="wallet" /></span><div><div class="lbl">{{ year }} total</div><div class="val">{{ fmt(kTotal) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="calendar" /></span><div><div class="lbl">Average per month</div><div class="val">{{ fmt(kAvg) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="trend" /></span><div><div class="lbl">Biggest category</div><div class="val">{{ kTop || '-' }}</div><div class="foot">{{ fmt(kTopAmt) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="alert" /></span><div><div class="lbl">Unusual</div><div class="val">{{ anomalies.length }}</div><div class="foot">flagged expenses</div></div></div>
  </div>

  @if (anomalies.length) {
    <div class="alert"><app-icon name="alert" /><div><b>Unusual spending detected</b>
      <ul>@for (a of anomalies.slice(0, 4); track a.id) {
        <li>{{ a.type }}, {{ months[a.month - 1] }} {{ a.year }}: {{ fmt(a.amount) }} is {{ a.percentAbove }}% above its usual {{ fmt(a.average) }}</li>
      }</ul></div></div>
  }

  <div class="bento">
    <div class="card s8"><div class="card-h"><h2><app-icon name="trend" [size]="18" />Monthly: {{ year }} vs {{ year - 1 }}</h2></div>@if (monthlyCfg) { <app-chart [config]="monthlyCfg" /> }</div>
    <div class="card s4"><div class="card-h"><h2><app-icon name="calendar" [size]="18" />Annual totals</h2></div>@if (annualCfg) { <app-chart [config]="annualCfg" /> }</div>
    <div class="card s8"><div class="card-h"><h2><app-icon name="tag" [size]="18" />{{ year }} by type, per month</h2></div>@if (typeCfg && hasTypeData) { <app-chart [config]="typeCfg" /> } @else { <div class="empty">No expense types recorded for {{ year }}.</div> }</div>
    <div class="card s4"><div class="card-h"><h2><app-icon name="wallet" [size]="18" />{{ year }} share by type</h2></div>@if (shareCfg && hasShareData) { <app-chart [config]="shareCfg" /> } @else { <div class="empty">No expense types recorded for {{ year }}.</div> }</div>
  </div>

  <div class="card">
    <div class="card-h"><h2>Records <span class="pill">{{ shown.length }}</span></h2>
      <div style="width:150px"><select [ngModel]="monthFilter" (ngModelChange)="monthFilter = +$event" aria-label="Filter by month">
        <option [ngValue]="0">All months</option>@for (m of months; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }</select></div></div>
    @if (!shown.length) { <div class="empty">No expenses here yet. Use “Add expense” or import your CSV.</div> }
    <ul class="list">@for (r of shown; track r.id) {
      <li class="item" [class.flag]="flagged.has(r.id)">
        <span class="ic-badge" [class.warn]="flagged.has(r.id)"><app-icon [name]="icon(r.type)" [size]="18" /></span>
        <div class="grow"><div class="t">{{ r.type }} <span class="pill">{{ months[r.month - 1] }}</span> @if (flagged.has(r.id)) { <span class="badge">Unusual</span> }</div>
          @if (r.remarks) { <div class="s">{{ r.remarks }}</div> }</div>
        <div class="amt">{{ fmt(r.amount) }}</div>
        <button class="icon-btn" (click)="edit(r)" aria-label="Edit"><app-icon name="pencil" [size]="18" /></button>
        <button class="icon-btn del" (click)="remove(r)" aria-label="Delete"><app-icon name="trash" [size]="18" /></button>
      </li>}</ul>
  </div>

  <app-modal [open]="showForm" [title]="form.id ? 'Edit expense' : 'Add expense'" (closed)="closeForm()">
    <form (ngSubmit)="save()">
      <div class="fields">
        <label class="full">Type<input name="type" list="types" [(ngModel)]="form.type" required autocomplete="off">
          <datalist id="types">@for (t of typeOptions; track t) { <option [value]="t"></option> }</datalist></label>
        <label>Amount (MYR)<input name="amount" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="form.amount" required></label>
        <label>Year<input name="year" type="number" inputmode="numeric" [(ngModel)]="form.year" required></label>
        <label class="full">Month<select name="month" [(ngModel)]="form.month">@for (m of months; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }</select></label>
        <label class="full">Remarks<input name="remarks" [(ngModel)]="form.remarks"></label>
      </div>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="closeForm()">Cancel</button><button type="submit" class="btn">{{ form.id ? 'Save changes' : 'Add expense' }}</button></div>
    </form>
  </app-modal>

  <app-modal [open]="showImport" title="Import expenses" (closed)="showImport = false">
    <p class="muted small" style="margin-bottom:.8rem">Choose a CSV with columns Type, Amount, Month, Year, Remarks. Your Belanjawanku export works too. Rows already in the app are skipped, so importing twice is safe.</p>
    <input type="file" accept=".csv,text/csv" (change)="onFile($event)" aria-label="CSV file">
    @if (parsed) {
      <div style="margin:.8rem 0"><b>{{ toImport.length }}</b> records ready to import
        <span class="muted small">({{ parsed.blank }} blank-amount rows ignored)</span></div>
      <label style="flex-direction:row;align-items:center;gap:.5rem;font-weight:500"><input type="checkbox" [(ngModel)]="skipFuture" style="width:auto;min-height:0"> Skip months after this month</label>
    }
    @if (importMsg) { <div class="okmsg" style="margin-top:.8rem">{{ importMsg }}</div> }
    @if (error) { <div class="err" style="margin-top:.6rem">{{ error }}</div> }
    <div class="sheet-f"><button class="btn ghost" (click)="showImport = false">Close</button>
      <button class="btn" [disabled]="!toImport.length" (click)="doImport()">Import {{ toImport.length || '' }} records</button></div>
  </app-modal>`,
})
export class ExpensesComponent implements OnInit {
  private api = inject(Api);
  fmt = fmt; months = MONTHS; icon = typeIcon;
  now = new Date(); year = this.now.getFullYear(); years: number[] = [this.year]; monthFilter = this.now.getMonth() + 1;
  rows: any[] = []; summary: any[] = []; anomalies: any[] = []; flagged = new Set<number>();
  form: any = this.blank(); error = ''; showForm = false; showImport = false;
  parsed: { records: any[]; blank: number } | null = null; skipFuture = true; importMsg = '';
  monthlyCfg: any; typeCfg: any; annualCfg: any; shareCfg: any; hasTypeData = false; hasShareData = false;
  kTotal = 0; kAvg = 0; kTop = ''; kTopAmt = 0;

  get shown() { return this.rows.filter((r) => Number(r.year) === this.year && (!this.monthFilter || Number(r.month) === this.monthFilter)); }
  get typeOptions() { return [...new Set([...this.rows.map((r) => r.type), 'Electrical', 'Water', 'Internet', 'Misc', 'Savings'])].sort(); }
  get toImport() {
    if (!this.parsed) return [];
    const cur = this.now.getFullYear() * 12 + this.now.getMonth() + 1;
    return this.parsed.records.filter((r) => !this.skipFuture || r.year * 12 + r.month <= cur);
  }
  blank() { return { id: null, type: '', amount: null, month: this.now.getMonth() + 1, year: this.now.getFullYear(), remarks: '' }; }
  ngOnInit() { this.load(); }
  setYear(y: number) { this.year = y; this.build(); }

  load() {
    this.api.get<any[]>('/expenses').subscribe((r) => (this.rows = r));
    this.api.get<any[]>('/expenses/summary').subscribe((s) => { this.summary = s; this.build(); });
    this.api.get<any[]>('/expenses/anomalies').subscribe((a) => { this.anomalies = a; this.flagged = new Set(a.map((x) => x.id)); });
  }

  build() {
    const y = this.year, S = this.summary;
    const ys = [...new Set(S.map((s) => Number(s.year)).filter(Number.isFinite))].sort();
    this.years = [...new Set([...ys, this.now.getFullYear()])].sort((a, b) => b - a);
    const sum = (f: (s: any) => boolean) => S.filter(f).reduce((a, s) => a + (Number(s.total) || 0), 0);
    const monthly = (yr: number) => MONTHS.map((_, i) => sum((s) => Number(s.year) === yr && Number(s.month) === i + 1));
    this.monthlyCfg = { type: 'bar', data: { labels: MONTHS, datasets: [
      { label: String(y - 1), data: monthly(y - 1), backgroundColor: '#D7CCC8' },
      { label: String(y), data: monthly(y), backgroundColor: COLORS[0] }] } };
    const types = [...new Set(S.filter((s) => Number(s.year) === y).map((s) => s.type).filter(Boolean))];
    const totals = types.map((t) => sum((s) => Number(s.year) === y && s.type === t));
    this.hasTypeData = totals.some((total) => total > 0);
    this.hasShareData = this.hasTypeData;
    this.typeCfg = { type: 'bar', data: { labels: MONTHS, datasets: types.map((t, i) => ({
      label: t, backgroundColor: COLORS[i % COLORS.length],
      data: MONTHS.map((_, m) => sum((s) => Number(s.year) === y && Number(s.month) === m + 1 && s.type === t)) })) },
      options: { scales: { x: { stacked: true }, y: { stacked: true } } } };
    this.shareCfg = { type: 'doughnut', data: { labels: types, datasets: [{ data: totals, backgroundColor: types.map((_, i) => COLORS[i % COLORS.length]) }] } };
    this.annualCfg = { type: 'bar', data: { labels: ys.map(String), datasets: [
      { label: 'Total (RM)', data: ys.map((yr) => sum((s) => Number(s.year) === yr)), backgroundColor: ys.map((yr) => (yr === y ? COLORS[0] : '#D7CCC8')) }] },
      options: { plugins: { legend: { display: false } } } };
    this.kTotal = totals.reduce((a, b) => a + b, 0);
    const active = new Set(S.filter((s) => Number(s.year) === y).map((s) => Number(s.month))).size;
    this.kAvg = active ? this.kTotal / active : 0;
    const top = totals.indexOf(Math.max(...totals, 0));
    this.kTop = top >= 0 && totals.length ? types[top] : ''; this.kTopAmt = top >= 0 && totals.length ? totals[top] : 0;
  }

  openForm() { this.form = this.blank(); this.error = ''; this.showForm = true; }
  closeForm() { this.showForm = false; this.error = ''; }
  edit(r: any) { this.form = { ...r }; this.error = ''; this.showForm = true; }
  save() {
    this.error = '';
    const f = this.form;
    const req = f.id ? this.api.put('/expenses/' + f.id, f) : this.api.post('/expenses', f);
    req.subscribe({ next: () => { this.closeForm(); this.load(); }, error: (e) => (this.error = errMsg(e)) });
  }
  remove(r: any) {
    if (confirm(`Delete ${r.type} (${MONTHS[r.month - 1]} ${r.year})?`)) this.api.del('/expenses/' + r.id).subscribe(() => this.load());
  }

  openImport() { this.parsed = null; this.importMsg = ''; this.error = ''; this.showImport = true; }
  onFile(ev: any) {
    const f: File = ev.target.files?.[0]; if (!f) return;
    f.text().then((t) => { this.parsed = mapExpenseRows(t); this.importMsg = ''; });
  }
  doImport() {
    this.error = '';
    this.api.post<any>('/expenses/import', { rows: this.toImport }).subscribe({
      next: (r) => { this.importMsg = `Imported ${r.imported} records. ${r.skipped} already existed${r.invalid ? ', ' + r.invalid + ' invalid' : ''}.`; this.parsed = null; this.load(); },
      error: (e) => (this.error = errMsg(e)),
    });
  }
}
