import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { COLORS, MONTHS, errMsg, fmt, typeIcon } from '../../shared/util';
import { Language } from '../../core/language.service';
import { TranslatePipe } from '../../shared/translate.pipe';

@Component({
  selector: 'app-budgets', standalone: true, imports: [FormsModule, ChartComponent, IconComponent, ModalComponent, TranslatePipe],
  template: `
  <div class="page-head">
    <div><h1>{{ 'Budget' | tr }}</h1><p class="sub">{{ 'Set a limit per category and see how the month is going' | tr }}</p></div>
    <div class="actions">
      <div class="row" style="gap:0"><button class="icon-btn" (click)="shift(-1)" [attr.aria-label]="'Previous month' | tr"><app-icon name="left" /></button>
        <b style="min-width:82px;text-align:center">{{ months[month - 1] }} {{ year }}</b>
        <button class="icon-btn" (click)="shift(1)" [attr.aria-label]="'Next month' | tr"><app-icon name="right" /></button></div>
      <button class="btn" (click)="openForm()"><app-icon name="plus" [size]="18" />{{ 'Set budget' | tr }}</button>
    </div>
  </div>

  <div class="bento">
    <div class="card kpi dark s3"><span class="chip-ic"><app-icon name="pie" /></span><div><div class="lbl">{{ 'Total budget' | tr }}</div><div class="val">{{ fmt(st.totalLimit) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="wallet" /></span><div><div class="lbl">{{ 'Spent (budgeted)' | tr }}</div><div class="val">{{ fmt(st.totalSpent) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="banknote" /></span><div><div class="lbl">{{ 'Left' | tr }}</div><div class="val" [class.up]="st.totalLimit - st.totalSpent < 0">{{ fmt(st.totalLimit - st.totalSpent) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="calendar" /></span><div><div class="lbl">{{ 'Safe to spend / day' | tr }}</div><div class="val">{{ st.safePerDay == null ? '-' : fmt(st.safePerDay) }}</div><div class="foot">{{ (st.safePerDay == null ? 'current month only' : 'for the rest of the month') | tr }}</div></div></div>
  </div>

  <div class="bento">
    <div class="card s7"><div class="card-h"><h2><app-icon name="pie" [size]="18" />{{ 'Budget vs actual' | tr }}</h2></div>
      @if (cfg) { <app-chart [config]="cfg" /> } @else { <div class="empty">{{ 'Set a budget to see the comparison.' | tr }}</div> }</div>
    <div class="card s5"><div class="card-h"><h2><app-icon name="alert" [size]="18" />{{ 'Spending with no budget' | tr }}</h2></div>
      @if (!st.unbudgeted.length) { <div class="empty">{{ 'Every category you spent on has a budget.' | tr }}</div> }
      <ul class="list">@for (u of st.unbudgeted; track u.category) {
        <li class="item"><span class="ic-badge brown"><app-icon [name]="icon(u.category)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ u.category }}</div><div class="s">{{ fmt(u.spent) }} {{ 'this month' | tr }}</div></div>
          <button class="btn ghost sm" (click)="openForm(u.category, u.spent)">{{ 'Set limit' | tr }}</button></li>
      }</ul></div>
  </div>

  <div class="card">
    <div class="card-h"><h2>{{ 'Categories' | tr }} <span class="pill">{{ st.rows.length }}</span></h2></div>
    @if (!st.rows.length) { <div class="empty">{{ 'No budgets for' | tr }} {{ months[month - 1] }} {{ 'yet. Tap “Set budget”, for example Groceries RM 600.' | tr }}</div> }
    <ul class="list">@for (r of st.rows; track r.category) {
      <li class="item" style="align-items:flex-start">
        <span class="ic-badge" [class.warn]="r.status === 'over'"><app-icon [name]="icon(r.category)" [size]="18" /></span>
        <div class="grow">
          <div class="row between" style="flex-wrap:nowrap"><div class="t">{{ r.category }}
              <span class="badge" [class.ok]="r.status === 'ok'">{{ (r.status === 'over' ? 'Over budget' : r.status === 'warn' ? 'Almost there' : 'On track') | tr }}</span></div>
            <div class="amt small">{{ fmt(r.spent) }} / {{ fmt(r.limit) }}</div></div>
          <div class="bar" style="margin:.4rem 0 .2rem" [class.warn]="r.status === 'warn'" [class.over]="r.status === 'over'"><i [style.width.%]="r.pct > 100 ? 100 : r.pct"></i></div>
          <div class="s">{{ r.pct }}% {{ 'used' | tr }} ·
            @if (r.remaining >= 0) { {{ fmt(r.remaining) }} {{ 'left' | tr }} } @else { {{ fmt(-r.remaining) }} {{ 'over' | tr }} }
            @if (r.projected != null && r.projected > r.limit && r.status !== 'over') { · {{ 'on pace for' | tr }} {{ fmt(r.projected) }} }</div>
        </div>
        <button class="icon-btn" (click)="openForm(r.category, r.limit)" [attr.aria-label]="'Edit' | tr"><app-icon name="pencil" [size]="18" /></button>
        <button class="icon-btn del" (click)="remove(r)" [attr.aria-label]="'Delete' | tr"><app-icon name="trash" [size]="18" /></button>
      </li>
    }</ul>
  </div>

  <app-modal [open]="showForm" [title]="'Set budget' | tr" (closed)="showForm = false">
    <form (ngSubmit)="save()">
      <div class="fields">
        <label class="full">{{ 'Category (same name as the expense type)' | tr }}<input name="cat" list="bud-cats" [(ngModel)]="form.category" required autocomplete="off">
          <datalist id="bud-cats">@for (c of catOptions; track c) { <option [value]="c"></option> }</datalist></label>
        <label class="full">{{ 'Monthly limit (MYR)' | tr }}<input name="amt" type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="form.amount" required></label>
      </div>
      <p class="muted small" style="margin-top:.5rem">{{ 'Applies from' | tr }} {{ months[month - 1] }} {{ year }} {{ 'onwards. Earlier months keep their old limit.' | tr }}</p>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error | tr }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showForm = false">{{ 'Cancel' | tr }}</button><button type="submit" class="btn">{{ 'Save budget' | tr }}</button></div>
    </form>
  </app-modal>`,
})
export class BudgetsComponent implements OnInit {
  private api = inject(Api); private language = inject(Language);
  fmt = fmt; get months() { return MONTHS.map((_, i) => new Date(2024, i, 1).toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY', { month: 'short' })); } icon = typeIcon; showForm = false; error = '';
  now = new Date(); year = this.now.getFullYear(); month = this.now.getMonth() + 1;
  st: any = { rows: [], unbudgeted: [], totalLimit: 0, totalSpent: 0, safePerDay: null }; cfg: any; catOptions: string[] = [];
  form: any = { category: '', amount: null };

  ngOnInit() { this.load(); this.api.get<any[]>('/expenses').subscribe((r) => (this.catOptions = [...new Set(r.map((x) => x.type))].sort())); }
  shift(n: number) { const d = new Date(this.year, this.month - 1 + n, 1); this.year = d.getFullYear(); this.month = d.getMonth() + 1; this.load(); }
  load() {
    this.api.get<any>(`/budgets/status?year=${this.year}&month=${this.month}`).subscribe((s) => {
      this.st = s;
      this.cfg = s.rows.length ? { type: 'bar', data: { labels: s.rows.map((r: any) => r.category), datasets: [
        { label: this.language.text('Budget'), data: s.rows.map((r: any) => Number(r.limit)), backgroundColor: COLORS[8] },
        { label: this.language.text('Spent'), data: s.rows.map((r: any) => Number(r.spent)), backgroundColor: COLORS[0] }] } } : null;
    });
  }
  openForm(category = '', amount: number | null = null) { this.form = { category, amount: amount ? Math.ceil(amount / 10) * 10 : null }; this.error = ''; this.showForm = true; }
  save() {
    this.api.post('/budgets', { ...this.form, year: this.year, month: this.month }).subscribe({ next: () => { this.showForm = false; this.load(); }, error: (e) => (this.error = errMsg(e)) });
  }
  remove(r: any) { if (confirm(`${this.language.text('Remove the budget for')} ${r.category}?`)) this.api.del('/budgets/' + encodeURIComponent(r.category)).subscribe(() => this.load()); }
}
