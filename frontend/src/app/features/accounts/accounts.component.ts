import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api.service';
import { Language } from '../../core/language.service';
import { ChartComponent } from '../../shared/chart.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { TranslatePipe } from '../../shared/translate.pipe';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { errMsg, fmt, iso, typeIcon } from '../../shared/util';

const ACCOUNT_TYPES = ['cash', 'bank', 'savings', 'credit_card', 'investment', 'loan', 'other'];

@Component({
  selector: 'app-accounts', standalone: true, imports: [FormsModule, ChartComponent, IconComponent, ModalComponent, TranslatePipe, SkeletonComponent],
  template: `
  <div class="page-head">
    <div><h1>{{ 'Accounts' | tr }}</h1><p class="sub">{{ 'Track balances, assets, liabilities and transfers' | tr }}</p></div>
    <div class="actions">
      <button class="btn ghost" (click)="openTransfer()" [disabled]="activeAccounts.length < 2"><app-icon name="repeat" [size]="18" />{{ 'Transfer' | tr }}</button>
      <button class="btn" (click)="openAccount()"><app-icon name="plus" [size]="18" />{{ 'Add account' | tr }}</button>
    </div>
  </div>
  @if (error) { <div class="err" style="margin-bottom:1rem">{{ error | tr }}</div> }
  <div class="bento">
    <div class="card kpi dark s4"><span class="chip-ic"><app-icon name="landmark" /></span><div><div class="lbl">{{ 'Assets' | tr }}</div><div class="val">{{ fmt(summary.total_assets) }}</div></div></div>
    <div class="card kpi s4"><span class="chip-ic"><app-icon name="credit-card" /></span><div><div class="lbl">{{ 'Liabilities' | tr }}</div><div class="val">{{ fmt(summary.total_liabilities) }}</div></div></div>
    <div class="card kpi s4"><span class="chip-ic"><app-icon name="wallet" /></span><div><div class="lbl">{{ 'Net worth' | tr }}</div><div class="val">{{ fmt(summary.net_worth) }}</div></div></div>
  </div>

  <div class="bento">
    <section class="card s7"><div class="card-h"><h2>{{ 'Account balances' | tr }}</h2><span class="pill">{{ activeAccounts.length }} {{ 'active' | tr }}</span></div>
      @if (accountsLoading) { <app-skeleton [rows]="3" /> }
      @else if (!accounts.length) { <div class="empty">{{ 'No accounts yet. Add cash, bank, savings or credit accounts to track your money.' | tr }}</div> }
      @else { <ul class="list">@for (account of accounts; track account.id) {
        <li class="item account-row" [class.account-inactive]="!account.is_active">
          <span class="ic-badge"><app-icon [name]="typeIcon(account.type)" [size]="18" /></span>
          <div class="grow"><div class="t">{{ account.name }} <span class="pill">{{ account.type | tr }}</span>
            @if (!account.is_active) { <span class="badge">{{ 'Inactive' | tr }}</span> }</div>
            <div class="s">{{ account.is_liability ? ('Liability' | tr) : ('Asset' | tr) }} · {{ 'Opening balance' | tr }} {{ fmt(account.opening_balance) }}</div>
            @if (account.type === 'credit_card') { <div class="s">{{ 'Statement day' | tr }} {{ account.statement_day }} · {{ 'Payment due day' | tr }} {{ account.due_day }}</div> }
          </div>
          <div class="amt">{{ fmt(account.balance) }}</div>
          <button class="icon-btn" (click)="editAccount(account)" [attr.aria-label]="('Edit account' | tr) + ' ' + account.name"><app-icon name="pencil" [size]="18" /></button>
          @if (account.is_active) { <button class="icon-btn del" (click)="deactivate(account)" [attr.aria-label]="('Deactivate' | tr) + ' ' + account.name"><app-icon name="eye-off" [size]="18" /></button> }
          @else { <button class="icon-btn" (click)="activate(account)" [attr.aria-label]="('Activate' | tr) + ' ' + account.name"><app-icon name="check" [size]="18" /></button> }
        </li>
      }</ul> }
    </section>
    <section class="card s5"><div class="card-h"><h2>{{ 'Balances by account' | tr }}</h2></div>
      @if (accountsLoading) { <app-skeleton variant="chart" /> } @else if (chart) { <app-chart [config]="chart" /> } @else { <div class="empty">{{ 'Add an account to see balances.' | tr }}</div> }
    </section>
  </div>

  <section class="card account-history">
    <div class="card-h"><h2>{{ 'Account activity' | tr }} <span class="pill">{{ visibleTransactions.length }}</span></h2>
      <label class="account-filter">{{ 'Account' | tr }}<select name="historyAccount" [(ngModel)]="historyAccountId"><option [ngValue]="null">{{ 'All accounts' | tr }}</option>
        @for (account of accounts; track account.id) { <option [ngValue]="account.id">{{ account.name }}</option> }</select></label>
    </div>
    @if (transactionsLoading) { <app-skeleton [rows]="4" /> }
    @else if (!visibleTransactions.length) { <div class="empty">{{ 'Transactions linked to accounts will appear here.' | tr }}</div> }
    @else { <ul class="list">@for (transaction of visibleTransactions; track transaction.kind + '-' + transaction.source_id + '-' + transaction.account_id) {
      <li class="item"><span class="ic-badge" [class.warn]="isOutflow(transaction)"><app-icon [name]="transactionIcon(transaction.kind)" [size]="18" /></span>
        <div class="grow"><div class="t">{{ transaction.description }} <span class="pill">{{ transaction.kind | tr }}</span></div>
          <div class="s">{{ transaction.account_name }} · {{ formatDate(transaction.transaction_date) }}@if (transaction.note) { · {{ transaction.note }} }</div></div>
        <div class="amt" [class.down]="!isOutflow(transaction)" [class.up]="isOutflow(transaction)">{{ isOutflow(transaction) ? '-' : '+' }}{{ fmt(transaction.amount) }}</div>
      </li>
    }</ul> }
  </section>

  <app-modal [open]="showAccountForm" [title]="(accountForm.id ? 'Edit account' : 'Add account') | tr" (closed)="showAccountForm = false">
    <form (ngSubmit)="saveAccount()"><div class="fields">
      <label class="full">{{ 'Account name' | tr }}<input name="accountName" [(ngModel)]="accountForm.name" maxlength="80" required [placeholder]="'e.g. Main bank account' | tr"></label>
      <label>{{ 'Account type' | tr }}<select name="accountType" [(ngModel)]="accountForm.type">@for (type of accountTypes; track type) { <option [ngValue]="type">{{ type | tr }}</option> }</select></label>
      <label>{{ 'Opening balance (MYR)' | tr }}<input name="openingBalance" type="number" inputmode="decimal" step="0.01" [(ngModel)]="accountForm.opening_balance" required></label>
      @if (accountForm.type === 'credit_card') {
        <label>{{ 'Statement day' | tr }}<input name="statementDay" type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="accountForm.statement_day" required></label>
        <label>{{ 'Payment due day' | tr }}<input name="dueDay" type="number" inputmode="numeric" min="1" max="31" [(ngModel)]="accountForm.due_day" required></label>
      }
    </div>
    @if (accountError) { <div class="err" style="margin-top:.6rem">{{ accountError | tr }}</div> }
    <div class="sheet-f"><button type="button" class="btn ghost" (click)="showAccountForm = false">{{ 'Cancel' | tr }}</button><button class="btn" type="submit">{{ (accountForm.id ? 'Save changes' : 'Add account') | tr }}</button></div></form>
  </app-modal>

  <app-modal [open]="showTransferForm" [title]="'Transfer between accounts' | tr" (closed)="showTransferForm = false">
    <form (ngSubmit)="saveTransfer()"><div class="fields">
      <label>{{ 'From account' | tr }}<select name="from" [(ngModel)]="transferForm.from_account_id" required>@for (account of activeAccounts; track account.id) { <option [ngValue]="account.id">{{ account.name }} · {{ fmt(account.balance) }}</option> }</select></label>
      <label>{{ 'To account' | tr }}<select name="to" [(ngModel)]="transferForm.to_account_id" required>@for (account of transferTargets; track account.id) { <option [ngValue]="account.id">{{ account.name }}</option> }</select></label>
      <label>{{ 'Amount (MYR)' | tr }}<input name="transferAmount" type="number" inputmode="decimal" step="0.01" min="0.01" [(ngModel)]="transferForm.amount" required></label>
      <label>{{ 'Transfer date' | tr }}<input name="transferDate" type="date" [(ngModel)]="transferForm.transfer_date" required></label>
      <label class="full">{{ 'Note' | tr }}<input name="note" [(ngModel)]="transferForm.note" maxlength="250"></label>
    </div>
    @if (transferError) { <div class="err" style="margin-top:.6rem">{{ transferError | tr }}</div> }
    <div class="sheet-f"><button type="button" class="btn ghost" (click)="showTransferForm = false">{{ 'Cancel' | tr }}</button><button class="btn" type="submit">{{ 'Transfer' | tr }}</button></div></form>
  </app-modal>`,
})
export class AccountsComponent implements OnInit {
  private api = inject(Api); private language = inject(Language);
  accountTypes = ACCOUNT_TYPES; typeIcon = typeIcon; accounts: any[] = []; transactions: any[] = []; summary: any = { total_assets: 0, total_liabilities: 0, net_worth: 0 };
  accountsLoading = true; transactionsLoading = true;
  chart: any; error = ''; accountError = ''; transferError = ''; showAccountForm = false; showTransferForm = false;
  historyAccountId: number | null = null;
  accountForm: any = this.blankAccount(); transferForm: any = this.blankTransfer();
  get activeAccounts() { return this.accounts.filter((account) => account.is_active); }
  get transferTargets() { return this.activeAccounts.filter((account) => account.id !== this.transferForm.from_account_id); }
  get visibleTransactions() { return this.transactions.filter((transaction) => this.historyAccountId == null || transaction.account_id === this.historyAccountId); }
  ngOnInit() { this.load(); }
  blankAccount() { return { id: null, name: '', type: 'bank', opening_balance: 0, statement_day: null, due_day: null }; }
  blankTransfer() { return { from_account_id: null, to_account_id: null, amount: null, transfer_date: iso(new Date()), note: '' }; }
  load() {
    this.error = ''; this.accountsLoading = true; this.transactionsLoading = true;
    this.api.get<any>('/accounts').subscribe({ next: (result) => {
      this.accounts = result.accounts; this.summary = result;
      this.chart = this.accounts.length ? { type: 'bar', data: {
        labels: this.accounts.map((account) => account.name),
        datasets: [{ label: this.language.text('Balance'), data: this.accounts.map((account) => account.balance), backgroundColor: this.accounts.map((account) => account.is_liability ? '#FE9496' : '#1BCFB4') }],
      }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } } : null;
      if (this.transferForm.from_account_id == null) this.transferForm.from_account_id = this.activeAccounts[0]?.id ?? null;
      this.transferForm.to_account_id = this.transferTargets[0]?.id ?? null;
      this.accountsLoading = false;
    }, error: (e) => { this.error = errMsg(e); this.accountsLoading = false; } });
    this.api.get<any[]>('/accounts/transactions').subscribe({ next: (rows) => { this.transactions = rows; this.transactionsLoading = false; }, error: (e) => { this.error = errMsg(e); this.transactionsLoading = false; } });
  }
  openAccount() { this.accountForm = this.blankAccount(); this.accountError = ''; this.showAccountForm = true; }
  editAccount(account: any) { this.accountForm = { id: account.id, name: account.name, type: account.type, opening_balance: account.opening_balance, statement_day: account.statement_day, due_day: account.due_day }; this.accountError = ''; this.showAccountForm = true; }
  saveAccount() {
    const request = this.accountForm.id ? this.api.put('/accounts/' + this.accountForm.id, this.accountForm) : this.api.post('/accounts', this.accountForm);
    request.subscribe({ next: () => { this.showAccountForm = false; this.load(); }, error: (e) => (this.accountError = errMsg(e)) });
  }
  deactivate(account: any) {
    if (confirm(`${this.language.text('Deactivate')} ${account.name}? ${this.language.text('Existing transaction history will be kept.')}`))
      this.api.post('/accounts/' + account.id + '/deactivate', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) });
  }
  activate(account: any) { this.api.post('/accounts/' + account.id + '/activate', {}).subscribe({ next: () => this.load(), error: (e) => (this.error = errMsg(e)) }); }
  openTransfer() {
    this.transferForm = this.blankTransfer(); this.transferForm.from_account_id = this.activeAccounts[0]?.id ?? null;
    this.transferForm.to_account_id = this.activeAccounts.find((account) => account.id !== this.transferForm.from_account_id)?.id ?? null;
    this.transferError = ''; this.showTransferForm = true;
  }
  saveTransfer() {
    this.transferError = '';
    this.api.post('/accounts/' + this.transferForm.from_account_id + '/transfer', this.transferForm).subscribe({
      next: () => { this.showTransferForm = false; this.load(); }, error: (e) => (this.transferError = errMsg(e)),
    });
  }
  isOutflow(transaction: any) {
    const liability = ['credit_card', 'loan'].includes(transaction.account_type);
    return liability ? ['expense', 'bill_payment', 'installment_payment', 'transfer_out'].includes(transaction.kind) : ['expense', 'bill_payment', 'installment_payment', 'transfer_out'].includes(transaction.kind);
  }
  transactionIcon(kind: string) { return kind === 'income' || kind === 'transfer_in' ? 'trending-up' : kind.startsWith('transfer') ? 'repeat' : kind === 'installment_payment' ? 'credit-card' : kind === 'bill_payment' ? 'receipt' : 'wallet'; }
  formatDate(value: string) { return new Date(value).toLocaleDateString(this.language.code() === 'ms' ? 'ms-MY' : 'en-MY'); }
  fmt = fmt;
}
