import { Type } from '@angular/core';

export interface AppModule { path: string; label: string; icon: string; load: () => Promise<Type<unknown>>; }

// Add future modules here: they appear in the sidebar/tab bar and get a route automatically.
export const MODULES: AppModule[] = [
  { path: 'expenses', label: 'Expenses', icon: 'wallet', load: () => import('../features/expenses/expenses.component').then((m) => m.ExpensesComponent) },
  { path: 'installments', label: 'Installments', icon: 'credit-card', load: () => import('../features/installments/installments.component').then((m) => m.InstallmentsComponent) },
  { path: 'goals', label: 'Goals', icon: 'target', load: () => import('../features/goals/goals.component').then((m) => m.GoalsComponent) },
];
