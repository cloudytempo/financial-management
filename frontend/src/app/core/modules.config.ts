import { Type } from '@angular/core';

export interface AppModule { path: string; label: string; icon: string; primary?: boolean; load: () => Promise<Type<unknown>>; }

// Add future modules here: they appear in the sidebar/tab bar ("primary" ones get a tab; the rest go under More) and get a route automatically.
export const MODULES: AppModule[] = [
  { path: 'expenses', label: 'Expenses', icon: 'wallet', primary: true, load: () => import('../features/expenses/expenses.component').then((m) => m.ExpensesComponent) },
  { path: 'income', label: 'Income', icon: 'banknote', load: () => import('../features/income/income.component').then((m) => m.IncomeComponent) },
  { path: 'budgets', label: 'Budget', icon: 'pie', load: () => import('../features/budgets/budgets.component').then((m) => m.BudgetsComponent) },
  { path: 'bills', label: 'Bills', icon: 'receipt', primary: true, load: () => import('../features/bills/bills.component').then((m) => m.BillsComponent) },
  { path: 'installments', label: 'Installments', icon: 'credit-card', load: () => import('../features/installments/installments.component').then((m) => m.InstallmentsComponent) },
  { path: 'accounts', label: 'Accounts', icon: 'landmark', primary: true, load: () => import('../features/accounts/accounts.component').then((m) => m.AccountsComponent) },
  { path: 'goals', label: 'Goals', icon: 'target', load: () => import('../features/goals/goals.component').then((m) => m.GoalsComponent) },
  { path: 'calendar', label: 'Calendar', icon: 'calendar', primary: true, load: () => import('../features/calendar/calendar.component').then((m) => m.CalendarComponent) },
  { path: 'contacts', label: 'Contacts', icon: 'contact', load: () => import('../features/contacts/contacts.component').then((m) => m.ContactsComponent) },
  { path: 'settings', label: 'Settings', icon: 'settings', load: () => import('../features/settings/settings.component').then((m) => m.SettingsComponent) },
];
