import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { COLORS, MONTHS, errMsg, fmt, typeIcon } from '../../shared/util';

@Component({
  selector: 'app-income', standalone: true, imports: [FormsModule, ChartComponent, IconComponent, ModalComponent],
  template: `
  <div class="page-head">
    <div><h1>Income</h1><p class="sub">Salary, side gigs, pension, and other money coming in</p></div>
    <div class="actions">
      <button class="btn ghost" (click)="carry()"><app-icon name="repeat" [size]="18" /><span class="hide-sm">Copy recurring</span></button>
      <button class="btn" (click)="openForm()"><app-icon name="plus" [size]="18" />Add income</button>
    </div>
  </div>
  @if (msg) { <div class="okmsg" style="margin-bottom:1rem">{{ msg }}</div> }
  <div class="seg" style="margin-bottom:1rem">@for (y of years; track y) { <button [class.on]="y === year" (click)="setYear(y)">{{ y }}</button> }</div>

  <div class="bento">
    <div class="card kpi dark s3"><span class="chip-ic"><app-icon name="banknote" /></span><div><div class="lbl">{{ year }} income</div><div class="val">{{ fmt(kIncome) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="calendar" /></span><div><div class="lbl">Average per month</div><div class="val">{{ fmt(kAvg) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="wallet" /></span><div><div class="lbl">Left after expenses</div><div class="val" [class.up]="kNet < 0">{{ fmt(kNet) }}</div><div class="foot">expenses {{ fmt(kSpent) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="trend" /></span><div><div class="lbl">Savings rate</div><div class="val">{{ kIncome ? kRate + '%' : '-' }}</div><div class="foot">of income kept</div></div></div>
  </div>

  <div class="bento">
    <div class="card s8"><div class="card-h"><h2><app-icon name="trend" [size]="18" />Income vs expenses, {{ year }}</h2></div>@if (cfg) { <app-chart [config]="cfg" /> }</div>
    <div class="card s4"><div class="card-h"><h2><app-icon name="banknote" [size]="18" />By source</h2></div>@if (srcCfg) { <app-chart [config]="srcCfg" /> }</div>
  </div>

  <div class="card">
    <div class="card-h"><h2>Records <span class="pill">{{ shown.length }}</span></h2></div>
    @if (!shown.length) { <div class="empty">No income recorded for {{ year }}. Add any income source to see savings and budgets work together.</div> }
    <ul class="list">@for (r of shown; track r.id) {
      <li class="item"><span class="ic-badge"><app-icon [name]="icon(r.source)" [size]="18" /></span>
        <div class="grow"><div class="t">{{ r.source }} <span class="pill">{{ months[r.month - 1] }}</span> @if (r.recurring) { <span class="badge ok">Recurring</span> }</div>
          @if (r.remarks) { <div class="s">{{ r.remarks }}</div> }</div>
        <div class="amt">{{ fmt(r.amount) }}</div>
        <button class="icon-btn" (click)="edit(r)" aria-label="Edit"><app-icon name="pencil" [size]="18" /></button>
        <button class="icon-btn del" (click)="remove(r)" aria-label="Delete"><app-icon name="trash" [size]="18" /></button></li>
    }</ul>
  </div>

  <app-modal [open]="showForm" [title]="form.id ? 'Edit income' : 'Add income'" (closed)="showForm = false">
    <form (ngSubmit)="save()">
      <div class="fields">
        <label class="full">Source<input name="source" list="sources" [(ngModel)]="form.source" required autocomplete="off">
          <datalist id="sources">@for (s of sources; track s) { <option [value]="s"></option> }</datalist></label>
        <label>Amount (MYR)<input name="amount" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="form.amount" required></label>
        <label>Year<input name="year" type="number" inputmode="numeric" [(ngModel)]="form.year" required></label>
        <label class="full">Month<select name="month" [(ngModel)]="form.month">@for (m of months; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }</select></label>
        <label class="full">Remarks<input name="remarks" [(ngModel)]="form.remarks"></label>
        <label class="check full"><input type="checkbox" name="rec" [(ngModel)]="form.recurring"> Recurring every month (can be copied forward)</label>
      </div>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showForm = false">Cancel</button><button type="submit" class="btn">{{ form.id ? 'Save changes' : 'Add income' }}</button></div>
    </form>
  </app-modal>`,
})
export class IncomeComponent implements OnInit {
  private api = inject(Api);
  fmt = fmt; months = MONTHS; icon = typeIcon;
  sources = ['Salary', 'Side gig', 'Pension', 'Freelance', 'Business', 'Rental', 'Investment', 'Bonus', 'Allowance', 'Commission', 'Other'];
  now = new Date(); year = this.now.getFullYear(); years = [this.year]; showForm = false; error = ''; msg = '';
  rows: any[] = []; inc: any[] = []; exp: any[] = []; form: any = this.blank(); cfg: any; srcCfg: any;
  kIncome = 0; kAvg = 0; kSpent = 0; kNet = 0; kRate = 0;

  get shown() { return this.rows.filter((r) => Number(r.year) === this.year); }
  blank() { return { id: null, source: 'Salary', amount: null, month: this.now.getMonth() + 1, year: this.now.getFullYear(), remarks: '', recurring: true }; }
  ngOnInit() { this.load(); }
  setYear(y: number) { this.year = y; this.build(); }
  load() {
    this.api.get<any[]>('/income').subscribe((r) => (this.rows = r));
    this.api.get<any[]>('/expenses/summary').subscribe((e) => { this.exp = e; this.api.get<any[]>('/income/summary').subscribe((i) => { this.inc = i; this.build(); }); });
  }
  build() {
    const y = this.year, sum = (L: any[], f: (s: any) => boolean) => L.filter(f).reduce((a, s) => a + (Number(s.total) || 0), 0);
    this.years = [...new Set([...this.inc.map((s) => Number(s.year)), ...this.exp.map((s) => Number(s.year)), this.now.getFullYear()])].sort((a, b) => b - a);
    const mI = MONTHS.map((_, i) => sum(this.inc, (s) => Number(s.year) === y && Number(s.month) === i + 1));
    const mE = MONTHS.map((_, i) => sum(this.exp, (s) => Number(s.year) === y && Number(s.month) === i + 1));
    this.cfg = { type: 'bar', data: { labels: MONTHS, datasets: [{ label: 'Income', data: mI, backgroundColor: COLORS[1] }, { label: 'Expenses', data: mE, backgroundColor: COLORS[0] }] } };
    const srcs = [...new Set(this.inc.filter((s) => Number(s.year) === y).map((s) => s.source).filter(Boolean))];
    this.srcCfg = { type: 'doughnut', data: { labels: srcs, datasets: [{ data: srcs.map((n) => sum(this.inc, (s) => Number(s.year) === y && s.source === n)), backgroundColor: srcs.map((_, i) => COLORS[i % COLORS.length]) }] } };
    this.kIncome = mI.reduce((a, b) => a + b, 0); this.kSpent = mE.reduce((a, b) => a + b, 0);
    const active = mI.filter((v) => v > 0).length; this.kAvg = active ? this.kIncome / active : 0;
    this.kNet = this.kIncome - this.kSpent; this.kRate = this.kIncome ? Math.round((this.kNet / this.kIncome) * 100) : 0;
  }
  openForm() { this.form = this.blank(); this.error = ''; this.showForm = true; }
  edit(r: any) { this.form = { ...r }; this.error = ''; this.showForm = true; }
  save() {
    const f = this.form, req = f.id ? this.api.put('/income/' + f.id, f) : this.api.post('/income', f);
    req.subscribe({ next: () => { this.showForm = false; this.load(); }, error: (e) => (this.error = errMsg(e)) });
  }
  remove(r: any) { if (confirm(`Delete ${r.source} (${MONTHS[r.month - 1]} ${r.year})?`)) this.api.del('/income/' + r.id).subscribe(() => this.load()); }
  carry() {
    this.api.post<any>('/income/carry', { month: this.now.getMonth() + 1, year: this.now.getFullYear() }).subscribe({
      next: (r) => { this.msg = r.added ? `Copied ${r.added} recurring item(s) into ${MONTHS[this.now.getMonth()]}.` : 'Nothing to copy: this month already has them, or last month had no recurring income.'; this.load(); },
      error: (e) => (this.msg = errMsg(e)) });
  }
}
