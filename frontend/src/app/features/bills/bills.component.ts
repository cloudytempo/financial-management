import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { COLORS, errMsg, fmt, iso, typeIcon } from '../../shared/util';
import { TranslatePipe } from '../../shared/translate.pipe';

@Component({
  selector: 'app-bills', standalone: true, imports: [FormsModule, ChartComponent, IconComponent, ModalComponent, TranslatePipe],
  template: `
  <div class="page-head">
    <div><h1>{{ 'Bills & subscriptions' | tr }}</h1><p class="sub">{{ 'Recurring payments with no end date, and when each is next due' | tr }}</p></div>
    <button class="btn" (click)="openForm()"><app-icon name="plus" [size]="18" />{{ 'Add bill' | tr }}</button>
  </div>

  <div class="bento">
    <div class="card kpi dark s3"><span class="chip-ic"><app-icon name="repeat" /></span><div><div class="lbl">Monthly cost</div><div class="val">{{ fmt(sum.monthly) }}</div><div class="foot">{{ sum.count }} active</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="calendar" /></span><div><div class="lbl">Yearly cost</div><div class="val">{{ fmt(sum.yearly) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="clock" /></span><div><div class="lbl">Due in 30 days</div><div class="val">{{ due.length }}</div><div class="foot">{{ fmt(dueTotal) }}</div></div></div>
    <div class="card kpi s3"><span class="chip-ic"><app-icon name="alert" /></span><div><div class="lbl">Overdue</div><div class="val" [class.up]="overdue">{{ overdue }}</div></div></div>
  </div>

  <div class="bento">
    <div class="card s4"><div class="card-h"><h2><app-icon name="tag" [size]="18" />{{ 'Monthly cost by category' | tr }}</h2></div>@if (cfg) { <app-chart [config]="cfg" /> }</div>
    <div class="card s8">
      <div class="card-h"><h2>{{ 'All bills' | tr }} <span class="pill">{{ items.length }}</span></h2></div>
      @if (!items.length) { <div class="empty">{{ 'No bills yet. Add Unifi, Netflix, insurance or road tax to get reminders.' | tr }}</div> }
      <ul class="list">@for (b of items; track b.id) {
        <li class="item bill-item" [class.flag]="b.overdue" [style.opacity]="b.status === 'active' ? 1 : .6">
          <span class="ic-badge" [class.warn]="b.overdue"><app-icon [name]="icon(b.category || b.name)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ b.name }}
              @if (b.status !== 'active') { <span class="pill">{{ b.status }}</span> }
              @if (b.autopay) { <span class="pill">Auto-pay</span> }</div>
            <div class="s">{{ b.category || 'Bill' }} · {{ b.frequency }} · next {{ b.next_due }}
              @if (b.status === 'active') { · <span class="badge" [class.ok]="b.days_left > 3">{{ b.days_left < 0 ? -b.days_left + 'd overdue' : b.days_left === 0 ? 'Today' : 'in ' + b.days_left + 'd' }}</span> }</div></div>
          <div class="amt">{{ fmt(b.amount) }}</div>
          <div class="bill-desktop-actions">
            @if (b.status === 'active') { <button class="btn green sm" (click)="pay(b)" [title]="'Mark this cycle as paid' | tr"><app-icon name="check" [size]="16" /><span class="hide-sm">{{ 'Paid' | tr }}</span></button> }
            @if (b.paid_count) { <button class="icon-btn" (click)="undo(b)" [attr.aria-label]="'Undo last payment' | tr" [title]="'Undo last payment' | tr"><app-icon name="undo" [size]="18" /></button> }
            <button class="icon-btn" (click)="edit(b)" [attr.aria-label]="'Edit' | tr"><app-icon name="pencil" [size]="18" /></button>
            <button class="icon-btn del" (click)="remove(b)" [attr.aria-label]="'Delete' | tr"><app-icon name="trash" [size]="18" /></button>
          </div>
          <details class="bill-mobile-actions">
            <summary class="icon-btn" aria-label="Bill actions"><app-icon name="more" [size]="18" /></summary>
            <div class="bill-menu">
              @if (b.status === 'active') { <button (click)="pay(b)"><app-icon name="check" [size]="16" />{{ 'Mark paid' | tr }}</button> }
              @if (b.paid_count) { <button (click)="undo(b)"><app-icon name="undo" [size]="18" />{{ 'Undo payment' | tr }}</button> }
              <button (click)="edit(b)"><app-icon name="pencil" [size]="18" />{{ 'Edit' | tr }}</button>
              <button class="del" (click)="remove(b)"><app-icon name="trash" [size]="18" />{{ 'Delete' | tr }}</button>
            </div>
          </details>
        </li>
      }</ul>
    </div>
  </div>

  <div class="card split-card">
    <div class="card-h"><h2><app-icon name="users" [size]="18" />{{ 'Split bills' | tr }} <span class="pill">{{ splits.length }}</span></h2>
      <button class="btn sm" (click)="openSplitForm()"><app-icon name="plus" [size]="16" />{{ 'Split a bill' | tr }}</button></div>
    @if (!splits.length) { <div class="empty">{{ 'No split bills yet. Add a shared bill and track each person\'s share.' | tr }}</div> }
    <ul class="split-list">@for (split of splits; track split.id) {
      <li class="split-entry">
        <div class="row between split-heading"><div class="grow"><div class="t">{{ split.name }} <span class="pill">{{ paidCount(split) }}/{{ split.shares.length }} paid</span></div>
          <div class="s">Due {{ split.due_date }} · {{ fmt(split.total_amount) }} total</div></div>
          <button class="icon-btn del" (click)="removeSplit(split)" [attr.aria-label]="'Delete ' + split.name"><app-icon name="trash" [size]="18" /></button></div>
        <ul class="split-shares">@for (share of split.shares; track share.id) {
          <li><span class="share-name">{{ share.name }}</span><span class="amt">{{ fmt(share.amount) }}</span>
            <button class="chip" [class.paid]="share.paid" (click)="toggleShare(split, share)">{{ (share.paid ? 'Paid' : 'Mark paid') | tr }}</button></li>
        }</ul>
      </li>
    }</ul>
  </div>

  <app-modal [open]="showForm" [title]="(form.id ? 'Edit bill' : 'Add bill') | tr" (closed)="showForm = false">
    <form (ngSubmit)="save()">
      <div class="fields">
        <label class="full">{{ 'Name' | tr }}<input name="name" [(ngModel)]="form.name" [placeholder]="'e.g. Unifi, Netflix, Car insurance' | tr" required></label>
        <label>{{ 'Category' | tr }}<input name="cat" list="bcats" [(ngModel)]="form.category" [placeholder]="'e.g. Internet' | tr"><datalist id="bcats">@for (c of cats; track c) { <option [value]="c"></option> }</datalist></label>
        <label>{{ 'Amount (MYR)' | tr }}<input name="amount" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="form.amount" required></label>
        <label>{{ 'Repeats' | tr }}<select name="freq" [(ngModel)]="form.frequency"><option value="monthly">{{ 'Monthly' | tr }}</option><option value="quarterly">{{ 'Every 3 months' | tr }}</option><option value="yearly">{{ 'Yearly' | tr }}</option></select></label>
        <label>{{ 'Next due date' | tr }}<input name="due" type="date" [(ngModel)]="form.first_due" required></label>
        <label class="full">{{ 'Status' | tr }}<select name="status" [(ngModel)]="form.status"><option value="active">{{ 'Active' | tr }}</option><option value="paused">{{ 'Paused' | tr }}</option><option value="cancelled">{{ 'Cancelled' | tr }}</option></select></label>
        <label class="check full"><input type="checkbox" name="auto" [(ngModel)]="form.autopay"> {{ 'Paid automatically (auto-debit)' | tr }}</label>
        <label class="check full"><input type="checkbox" name="exp" [(ngModel)]="form.add_expense"> {{ 'Add an expense automatically when I mark it paid' | tr }}</label>
      </div>
      <p class="muted small" style="margin-top:.5rem">Turn on the last option only if you do not also enter this bill by hand under Expenses, otherwise it is counted twice. It uses the category above as the expense type.</p>
      @if (error) { <div class="err" style="margin-top:.6rem">{{ error }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showForm = false">{{ 'Cancel' | tr }}</button><button type="submit" class="btn">{{ (form.id ? 'Save changes' : 'Add bill') | tr }}</button></div>
    </form>
  </app-modal>
  <app-modal [open]="showSplitForm" title="Split a bill" (closed)="showSplitForm = false">
    <form class="split-form" (ngSubmit)="saveSplit()">
      <div class="fields">
        <label class="full">Bill name<input name="splitName" [(ngModel)]="splitForm.name" placeholder="e.g. Dinner, utilities" required maxlength="100"></label>
        <label>Total amount (MYR)<input name="splitAmount" type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="splitForm.total_amount" required></label>
        <label>Due date<input name="splitDue" type="date" [(ngModel)]="splitForm.due_date" required></label>
        <label class="full">Participants<textarea name="people" [(ngModel)]="splitPeopleText" rows="4" placeholder="One name per line" required></textarea></label>
      </div>
      <p class="muted small" style="margin-top:.5rem">The total is split evenly. Any extra cents are assigned one at a time from the top of the list.</p>
      @if (splitError) { <div class="err" style="margin-top:.6rem">{{ splitError }}</div> }
      <div class="sheet-f"><button type="button" class="btn ghost" (click)="showSplitForm = false">Cancel</button><button type="submit" class="btn">Create split</button></div>
    </form>
  </app-modal>`,
})
export class BillsComponent implements OnInit {
  private api = inject(Api);
  fmt = fmt; icon = typeIcon; showForm = false; error = '';
  cats = ['Internet', 'Electrical', 'Water', 'Insurance', 'Subscription', 'Phone', 'Road tax', 'Assessment tax', 'Other'];
  items: any[] = []; splits: any[] = []; showSplitForm = false; splitError = ''; splitPeopleText = '';
  splitForm: any = this.blankSplit(); sum: any = { count: 0, monthly: 0, yearly: 0, by: [] }; cfg: any; form: any = this.blank();
  get due() { return this.items.filter((b) => b.status === 'active' && b.days_left <= 30); }
  get dueTotal() { return this.due.reduce((a, b) => a + b.amount, 0); }
  get overdue() { return this.items.filter((b) => b.overdue).length; }

  blank() { const d = new Date(); return { id: null, name: '', category: '', amount: null, frequency: 'monthly', first_due: iso(new Date(d.getFullYear(), d.getMonth() + 1, 1)), status: 'active', autopay: false, add_expense: false }; }
  ngOnInit() { this.load(); this.loadSplits(); }
  load() {
    this.api.get<any[]>('/bills').subscribe((r) => (this.items = r));
    this.api.get<any>('/bills/summary').subscribe((s) => {
      this.sum = s;
      this.cfg = { type: 'doughnut', data: { labels: s.by.map((x: any) => x.category), datasets: [{ data: s.by.map((x: any) => Number(Number(x.monthly).toFixed(2))), backgroundColor: s.by.map((_: any, i: number) => COLORS[i % COLORS.length]) }] } };
    });
  }
  blankSplit() { return { name: '', total_amount: null, due_date: iso(new Date()) }; }
  loadSplits() { this.api.get<any[]>('/bills/splits').subscribe((r) => (this.splits = r)); }
  paidCount(split: any) { return split.shares.filter((share: any) => share.paid).length; }
  openSplitForm() { this.splitForm = this.blankSplit(); this.splitPeopleText = ''; this.splitError = ''; this.showSplitForm = true; }
  saveSplit() {
    const people = this.splitPeopleText.split(/\r?\n/).map((person) => person.trim()).filter(Boolean);
    this.api.post('/bills/splits', { ...this.splitForm, people }).subscribe({
      next: () => { this.showSplitForm = false; this.loadSplits(); }, error: (e) => (this.splitError = errMsg(e)),
    });
  }
  toggleShare(split: any, share: any) {
    this.api.post(`/bills/splits/${split.id}/shares/${share.id}/toggle`, { paid: !share.paid }).subscribe(() => this.loadSplits());
  }
  removeSplit(split: any) {
    if (confirm(`Delete split bill ${split.name}?`)) this.api.del('/bills/splits/' + split.id).subscribe(() => this.loadSplits());
  }
  openForm() { this.form = this.blank(); this.error = ''; this.showForm = true; }
  edit(b: any) { this.form = { ...b, first_due: b.next_due }; this.error = ''; this.showForm = true; }
  save() {
    const f = this.form, req = f.id ? this.api.put('/bills/' + f.id, f) : this.api.post('/bills', f);
    req.subscribe({ next: () => { this.showForm = false; this.load(); }, error: (e) => (this.error = errMsg(e)) });
  }
  pay(b: any) {
    const a = prompt(`Amount paid for ${b.name} (MYR)`, String(b.amount));
    if (a === null) return;
    this.api.post(`/bills/${b.id}/pay`, { amount: a }).subscribe({ next: () => this.load(), error: (e) => alert(errMsg(e)) });
  }
  undo(b: any) { if (confirm(`Undo the last payment for ${b.name}?`)) this.api.post(`/bills/${b.id}/undo`, {}).subscribe(() => this.load()); }
  remove(b: any) { if (confirm(`Delete ${b.name} and its payment history?`)) this.api.del('/bills/' + b.id).subscribe(() => this.load()); }
}
