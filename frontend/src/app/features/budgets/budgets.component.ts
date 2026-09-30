import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { COLORS, MONTHS, errMsg, fmt, typeIcon } from '../../shared/util';

@Component({
  selector: 'app-budgets', standalone: true, imports: [FormsModule, ChartComponent, IconComponent, ModalComponent],
  template: `
  <div class="page-head">
    <div><h1>Budget</h1><p class="sub">Set a limit per category and see how the month is going</p></div>
    <div class="actions">
      <div class="row" style="gap:0"><button class="icon-btn" (click)="shift(-1)" aria-label="Previous month"><app-icon name="left" /></button>
        <b style="min-width:82px;text-align:center">{{ months[month - 1] }} {{ year }}</b>
        <button class="icon-btn" (click)="shift(1)" aria-label="Next month"><app-icon name="right" /></button></div>
      <button class="btn" (click)="openForm()"><app-icon name="plus" [size]="18" />Set budget</button>
    </div>
  </div>

  <div class="bento">
    <div class="card kpi dark s3"><span class="chip-ic"><app-icon name="pie" /></span><div><div class="lbl">Total budget</div><div class="val">{{ fmt(st.totalLimit) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="wallet" /></span><div><div class="lbl">Spent (budgeted)</div><div class="val">{{ fmt(st.totalSpent) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="banknote" /></span><div><div class="lbl">Left</div><div class="val" [class.up]="st.totalLimit - st.totalSpent < 0">{{ fmt(st.totalLimit - st.totalSpent) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="calendar" /></span><div><div class="lbl">Safe to spend / day</div><div class="val">{{ st.safePerDay == null ? '-' : fmt(st.safePerDay) }}</div><div class="foot">{{ st.safePerDay == null ? 'current month only' : 'for the rest of the month' }}</div></div></div>
  </div>

  <div class="bento">
    <div class="card s7"><div class="card-h"><h2><app-icon name="pie" [size]="18" />Budget vs actual</h2></div>
      @if (cfg) { <app-chart [config]="cfg" /> } @else { <div class="empty">Set a budget to see the comparison.</div> }</div>
    <div class="card s5"><div class="card-h"><h2><app-icon name="alert" [size]="18" />Spending with no budget</h2></div>
      @if (!st.unbudgeted.length) { <div class="empty">Every category you spent on has a budget.</div> }
      <ul class="list">@for (u of st.unbudgeted; track u.category) {
        <li class="item"><span class="ic-badge brown"><app-icon [name]="icon(u.category)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ u.category }}</div><div class="s">{{ fmt(u.spent) }} this month</div></div>
          <button class="btn ghost sm" (click)="openForm(u.category, u.spent)">Set limit</button></li>
      }</ul></div>
  </div>

  <div class="card">
    <div class="card-h"><h2>Categories <span class="pill">{{ st.rows.length }}</span></h2></div>
    @if (!st.rows.length) { <div class="empty">No budgets for {{ months[month - 1] }} yet. Tap “Set budget”, for example Groceries RM 600.</div> }
    <ul class="list">@for (r of st.rows; track r.category) {
      <li class="item" style="align-items:flex-start">
        <span class="ic-badge" [class.warn]="r.status === 'over'"><app-icon [name]="icon(r.category)" [size]="18" /></span>
        <div class="grow">
          <div class="row between" style="flex-wrap:nowrap"><div class="t">{{ r.category }}
              <span class="badge" [class.ok]="r.status === 'ok'">{{ r.status === 'over' ? 'Over budget' : r.status === 'warn' ? 'Almost there' : 'On track' }}</span></div>
            <div class="amt small">{{ fmt(r.spent) }} / {{ fmt(r.limit) }}</div></div>
          <div class="bar" style="margin:.4rem 0 .2rem" [class.warn]="r.status === 'warn'" [class.over]="r.status === 'over'"><i [style.width.%]="r.pct > 100 ? 100 : r.pct"></i></div>
          <div class="s">{{ r.pct }}% used ·
            @if (r.remaining >= 0) { {{ fmt(r.remaining) }} left } @else { {{ fmt(-r.remaining) }} over }
            @if (r.projected != null && r.projected > r.limit && r.status !== 'over') { · on pace for {{ fmt(r.projected) }} }</div>
        </div>
        <button class="icon-btn" (click)="openForm(r.category, r.limit)" aria-label="Edit"><app-icon name="pencil" [size]="18" /></button>
        <button class="icon-btn del" (click)="remove(r)" aria-label="Delete"><app-icon name="trash" [size]="18" /></button>
      </li>
    }</ul>
  </div>

  <app-modal [open]="showForm" title="Set budget" (closed)="showForm = false">
    <form (ngSubmit)="save()">
      <div class="fields">
        <label class="full">Category (same name as the expense type)<input name="cat" list="bud-cats" [(ngModel)]="form.category" required autocomplete="off">
          <datalist id="bud-cats">@for (c of catOptions; track c) { <option [value]="c"></option> }</datalist></label>
        <label class="full">Monthly limit (MYR)<input name="amt" type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="form.amount" required></label>
      </div>
      <p class="muted small" style="margin-top:.5rem">Applies from {{ months[month - 1] }} {{ year }} onwards. Earlier months keep their old limit.</p>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showForm = false">Cancel</button><button type="submit" class="btn">Save budget</button></div>
    </form>
  </app-modal>`,
})
export class BudgetsComponent implements OnInit {
  private api = inject(Api);
  fmt = fmt; months = MONTHS; icon = typeIcon; showForm = false; error = '';
  now = new Date(); year = this.now.getFullYear(); month = this.now.getMonth() + 1;
  st: any = { rows: [], unbudgeted: [], totalLimit: 0, totalSpent: 0, safePerDay: null }; cfg: any; catOptions: string[] = [];
  form: any = { category: '', amount: null };

  ngOnInit() { this.load(); this.api.get<any[]>('/expenses').subscribe((r) => (this.catOptions = [...new Set(r.map((x) => x.type))].sort())); }
  shift(n: number) { const d = new Date(this.year, this.month - 1 + n, 1); this.year = d.getFullYear(); this.month = d.getMonth() + 1; this.load(); }
  load() {
    this.api.get<any>(`/budgets/status?year=${this.year}&month=${this.month}`).subscribe((s) => {
      this.st = s;
      this.cfg = s.rows.length ? { type: 'bar', data: { labels: s.rows.map((r: any) => r.category), datasets: [
        { label: 'Budget', data: s.rows.map((r: any) => Number(r.limit)), backgroundColor: COLORS[8] },
        { label: 'Spent', data: s.rows.map((r: any) => Number(r.spent)), backgroundColor: COLORS[0] }] } } : null;
    });
  }
  openForm(category = '', amount: number | null = null) { this.form = { category, amount: amount ? Math.ceil(amount / 10) * 10 : null }; this.error = ''; this.showForm = true; }
  save() {
    this.api.post('/budgets', { ...this.form, year: this.year, month: this.month }).subscribe({ next: () => { this.showForm = false; this.load(); }, error: (e) => (this.error = errMsg(e)) });
  }
  remove(r: any) { if (confirm(`Remove the budget for ${r.category}?`)) this.api.del('/budgets/' + encodeURIComponent(r.category)).subscribe(() => this.load()); }
}
