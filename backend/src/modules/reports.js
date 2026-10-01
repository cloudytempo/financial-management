const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../util');

// One detailed snapshot of every module for the current household, used to generate a full report.
router.get('/full', wrap(async (req, res) => {
  const householdId = req.household.id;
  const [expenses, income, budgets, bills, installments, goals, accounts, contacts, events] = await Promise.all([
    pool.query('SELECT type,amount::float8 AS amount,month,year,remarks FROM expenses WHERE household_id=$1 ORDER BY year DESC,month DESC', [householdId]),
    pool.query('SELECT source,amount::float8 AS amount,month,year,remarks FROM income WHERE household_id=$1 ORDER BY year DESC,month DESC', [householdId]),
    pool.query('SELECT category,amount::float8 AS amount,effective_year,effective_month FROM budgets WHERE household_id=$1 ORDER BY effective_year DESC,effective_month DESC', [householdId]),
    pool.query("SELECT name,category,amount::float8 AS amount,frequency,status FROM bills WHERE household_id=$1 ORDER BY name", [householdId]),
    pool.query('SELECT type,name,amount::float8 AS amount,duration_months,start_month,start_year FROM installments WHERE household_id=$1 ORDER BY id', [householdId]),
    pool.query("SELECT name,target_amount::float8 AS target_amount,saved_amount::float8 AS saved_amount,target_date,status FROM goals WHERE household_id=$1 ORDER BY status DESC,target_date", [householdId]),
    pool.query("SELECT name,type,opening_balance::float8 AS opening_balance,is_active FROM accounts WHERE household_id=$1 ORDER BY name", [householdId]),
    pool.query('SELECT name,phone,category FROM contacts WHERE household_id=$1 ORDER BY name', [householdId]),
    pool.query("SELECT title,type,to_char(event_date,'YYYY-MM-DD') AS event_date FROM events WHERE household_id=$1 ORDER BY event_date", [householdId]),
  ]);
  const totalExpenses = expenses.rows.reduce((a, r) => a + r.amount, 0);
  const totalIncome = income.rows.reduce((a, r) => a + r.amount, 0);
  res.json({
    generated_at: new Date().toISOString(), household_id: householdId, household_name: req.household.name,
    summary: { total_expenses: totalExpenses, total_income: totalIncome, net: totalIncome - totalExpenses,
      accounts: accounts.rows.length, goals: goals.rows.length, bills: bills.rows.length, installments: installments.rows.length },
    expenses: expenses.rows, income: income.rows, budgets: budgets.rows, bills: bills.rows,
    installments: installments.rows, goals: goals.rows, accounts: accounts.rows, contacts: contacts.rows, events: events.rows,
  });
}));

module.exports = { name: 'reports', router };
