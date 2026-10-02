const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../util');
const { statusFor } = require('./budgets');
const { loadAll: loadBills } = require('./bills');
const { loadAll: loadInstallments } = require('./installments');
const { list: loadGoals } = require('./goals');
const { anomaliesFor } = require('./expenses');

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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const periodKey = (year, month) => year * 12 + month;
const fromKey = (key) => ({ year: Math.floor((key - 1) / 12), month: ((key - 1) % 12) + 1 });
const periodLabel = (year, month) => `${MONTH_NAMES[month - 1]} ${year}`;
const money = (value) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}RM${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const pct = (value) => `${Math.round(Number(value) || 0)}%`;
const groupSum = (rows, keyField) => {
  const by = new Map();
  for (const row of rows) by.set(row[keyField], (by.get(row[keyField]) || 0) + Number(row.amount));
  return [...by.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
};
const table = (headers, rows) => {
  if (!rows.length) return '_Not available._\n';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}\n`;
};

// Builds the full narrative markdown report from a household's module data. Deterministic (no external AI call):
// every figure is computed directly from the data already stored for this household.
function buildNarrative(householdName, period, prevPeriod, expenses, income, budgetStatus, bills, installments, goals, anomalies) {
  const inPeriod = (rows, p) => rows.filter((r) => Number(r.year) === p.year && Number(r.month) === p.month);
  const curExpenses = inPeriod(expenses, period), prevExpenses = inPeriod(expenses, prevPeriod);
  const curIncome = inPeriod(income, period), prevIncome = inPeriod(income, prevPeriod);
  const totalExpenses = curExpenses.reduce((a, r) => a + Number(r.amount), 0);
  const totalIncome = curIncome.reduce((a, r) => a + Number(r.amount), 0);
  const prevTotalExpenses = prevExpenses.reduce((a, r) => a + Number(r.amount), 0);
  const prevTotalIncome = prevIncome.reduce((a, r) => a + Number(r.amount), 0);
  const net = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : null;
  const hasPrev = prevExpenses.length > 0 || prevIncome.length > 0;

  const incomeBySource = groupSum(curIncome, 'source');
  const expenseByCategory = groupSum(curExpenses, 'type');
  const overBudget = budgetStatus.rows.filter((r) => r.status === 'over');
  const warnBudget = budgetStatus.rows.filter((r) => r.status === 'warn');

  const activeBills = bills.filter((b) => b.status === 'active');
  const dueSoonBills = activeBills.filter((b) => b.days_left <= 14);
  const activeInstallments = installments.filter((i) => !i.completed);
  const dueSoonInstallments = activeInstallments.filter((i) => i.next_due && (new Date(i.next_due) - new Date()) / 864e5 <= 14);
  const totalUpcoming = activeBills.reduce((a, b) => a + b.monthly_cost, 0) + activeInstallments.reduce((a, i) => a + Number(i.amount), 0);

  const lines = [];
  lines.push('# Household Financial Report');
  lines.push(`*${householdName} · Reporting period: ${periodLabel(period.year, period.month)} · Generated ${new Date().toISOString().slice(0, 10)}*\n`);

  // 1. Executive Summary
  lines.push('## 1. Executive Summary');
  lines.push(`This report covers **${householdName}**'s financial activity for **${periodLabel(period.year, period.month)}**.\n`);
  lines.push(table(['Metric', 'Value'], [
    ['Total income', money(totalIncome)],
    ['Total expenses', money(totalExpenses)],
    ['Net cash flow', money(net)],
    ['Savings rate', savingsRate === null ? 'Not available' : pct(savingsRate)],
    ['Over-budget categories', String(overBudget.length)],
  ]));
  lines.push('');
  const summaryObservations = [];
  summaryObservations.push(net >= 0 ? `The household spent less than it earned, with a net surplus of ${money(net)}.` : `The household spent more than it earned, with a net shortfall of ${money(Math.abs(net))}.`);
  if (hasPrev) {
    const expenseDelta = prevTotalExpenses ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : null;
    if (expenseDelta !== null) summaryObservations.push(`Expenses ${expenseDelta >= 0 ? 'increased' : 'decreased'} by ${pct(Math.abs(expenseDelta))} compared with ${periodLabel(prevPeriod.year, prevPeriod.month)}.`);
  } else {
    summaryObservations.push('No data is available for the previous period, so month-to-month comparison is not possible.');
  }
  if (overBudget.length) summaryObservations.push(`${overBudget.length} budget categor${overBudget.length === 1 ? 'y is' : 'ies are'} over its limit this period.`);
  if (goals.length) summaryObservations.push(`${goals.filter((g) => g.status === 'Complete').length} of ${goals.length} financial goal(s) are marked complete.`);
  for (const line of summaryObservations) lines.push(`- ${line}`);
  lines.push('');

  // 2. Income Overview
  lines.push('## 2. Income Overview');
  lines.push(`Total income for ${periodLabel(period.year, period.month)}: **${money(totalIncome)}**\n`);
  lines.push('### Income by source');
  lines.push(table(['Source', 'Amount', 'Share'], incomeBySource.map((row) => [row.key, money(row.total), totalIncome ? pct((row.total / totalIncome) * 100) : 'Not available'])));
  if (hasPrev) {
    const delta = prevTotalIncome ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : null;
    lines.push(`\n**Compared with ${periodLabel(prevPeriod.year, prevPeriod.month)}:** income was ${money(prevTotalIncome)}, a ${delta === null ? 'change that is not available' : `${delta >= 0 ? 'rise' : 'drop'} of ${pct(Math.abs(delta))}`}.`);
  } else {
    lines.push('\n**Comparison with the previous period:** Not available.');
  }
  lines.push('');

  // 3. Expense Overview
  lines.push('## 3. Expense Overview');
  lines.push(`Total expenses for ${periodLabel(period.year, period.month)}: **${money(totalExpenses)}**\n`);
  lines.push('### Expenses by category');
  lines.push(table(['Category', 'Amount', 'Share'], expenseByCategory.map((row) => [row.key, money(row.total), totalExpenses ? pct((row.total / totalExpenses) * 100) : 'Not available'])));
  if (expenseByCategory.length) lines.push(`\n**Largest categories:** ${expenseByCategory.slice(0, 3).map((row) => `${row.key} (${money(row.total)})`).join(', ')}.`);
  if (hasPrev) {
    const delta = prevTotalExpenses ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 : null;
    lines.push(`\n**Compared with ${periodLabel(prevPeriod.year, prevPeriod.month)}:** expenses were ${money(prevTotalExpenses)}, a ${delta === null ? 'change that is not available' : `${delta >= 0 ? 'rise' : 'drop'} of ${pct(Math.abs(delta))}`}.`);
  } else {
    lines.push('\n**Comparison with the previous period:** Not available.');
  }
  lines.push('');

  // 4. Budget Performance
  lines.push('## 4. Budget Performance');
  if (!budgetStatus.rows.length) {
    lines.push('No budgets are set up for this period. _Not available._\n');
  } else {
    lines.push(table(['Category', 'Budget', 'Actual', 'Difference', 'Status'], budgetStatus.rows.map((row) => [
      row.category, money(row.limit), money(row.spent), money(row.limit - row.spent),
      row.status === 'over' ? 'Over budget' : row.status === 'warn' ? 'Close to budget' : 'Within budget',
    ])));
    lines.push('');
    if (overBudget.length) lines.push(`- **Over budget:** ${overBudget.map((r) => `${r.category} (spent ${money(r.spent)} of ${money(r.limit)}, ${pct(r.pct)})`).join('; ')}.`);
    if (warnBudget.length) lines.push(`- **Close to budget:** ${warnBudget.map((r) => `${r.category} (${pct(r.pct)} used)`).join('; ')}.`);
    const okBudget = budgetStatus.rows.filter((r) => r.status === 'ok');
    if (okBudget.length) lines.push(`- **Within budget:** ${okBudget.map((r) => r.category).join(', ')}.`);
  }
  lines.push('');

  // 5. Bills and Installments
  lines.push('## 5. Bills and Installments');
  lines.push(`Total recurring/upcoming commitments: **${money(totalUpcoming)}** per month (active bills and ongoing installments).\n`);
  lines.push('### Bills');
  lines.push(table(['Bill', 'Category', 'Amount', 'Frequency', 'Next due', 'Status'], activeBills.map((b) => [
    b.name, b.category || 'Not available', money(b.amount), b.frequency, b.next_due || 'Not available',
    b.overdue ? 'Overdue' : b.days_left <= 14 ? 'Due soon' : 'Scheduled',
  ])));
  lines.push('\n### Installments');
  lines.push(table(['Installment', 'Amount per period', 'Progress', 'Next due'], activeInstallments.map((i) => [
    i.name || i.type, money(i.amount), `${i.paid_count}/${i.duration_months} (${i.progress}%)`, i.next_due || 'Not available',
  ])));
  const attention = [...dueSoonBills.map((b) => `${b.name} (due ${b.next_due})`), ...dueSoonInstallments.map((i) => `${i.name || i.type} (due ${i.next_due})`)];
  lines.push(attention.length ? `\n**Needs attention soon:** ${attention.join('; ')}.` : '\n**Needs attention soon:** Nothing is due within 14 days.');
  lines.push('');

  // 6. Financial Goals
  lines.push('## 6. Financial Goals');
  if (!goals.length) {
    lines.push('No financial goals have been set. _Not available._\n');
  } else {
    lines.push(table(['Goal', 'Target', 'Current', 'Progress', 'Target Date'], goals.map((g) => [
      g.name, money(g.target_amount), money(g.saved_amount), `${g.progress}%`, g.target_date,
    ])));
    lines.push('');
    for (const g of goals) {
      if (g.status === 'Complete') { lines.push(`- **${g.name}** has been completed.`); continue; }
      let note = `- **${g.name}** is ${g.progress}% of the way to its target of ${money(g.target_amount)}.`;
      if (g.overdue) note += ' Its target date has already passed.';
      else if (g.stale) note += ` There has been no progress update for ${g.months_since_update} month(s).`;
      lines.push(note);
    }
  }
  lines.push('');

  // 7. Spending Insights
  lines.push('## 7. Spending Insights');
  const insights = [];
  for (const a of anomalies.slice(0, 5)) insights.push(`${a.type} in ${MONTH_NAMES[a.month - 1]} ${a.year} was ${money(a.amount)}, ${pct(a.percentAbove)} above its usual average of ${money(a.average)}.`);
  if (overBudget.length) insights.push(`Budget pressure is evident in ${overBudget.map((r) => r.category).join(', ')}, which ${overBudget.length === 1 ? 'is' : 'are'} already over the set limit.`);
  if (hasPrev && prevTotalIncome && totalIncome !== prevTotalIncome) insights.push(`Income ${totalIncome > prevTotalIncome ? 'increased' : 'decreased'} from ${money(prevTotalIncome)} to ${money(totalIncome)} between the two periods.`);
  const staleGoals = goals.filter((g) => g.stale);
  if (staleGoals.length) insights.push(`${staleGoals.map((g) => g.name).join(', ')} ${staleGoals.length === 1 ? 'has' : 'have'} seen no savings progress recently.`);
  if (!insights.length) insights.push('No significant patterns were detected from the available data.');
  for (const line of insights) lines.push(`- ${line}`);
  lines.push('');

  // 8. Action Items
  lines.push('## 8. Action Items');
  const immediate = [];
  const shortTerm = [];
  const longTerm = [];
  for (const b of activeBills.filter((b) => b.overdue)) immediate.push(`Pay the overdue bill "${b.name}" (${money(b.amount)}).`);
  for (const b of dueSoonBills.filter((b) => !b.overdue)) immediate.push(`Prepare for "${b.name}" due on ${b.next_due} (${money(b.amount)}).`);
  for (const r of overBudget) immediate.push(`Review spending in "${r.category}", which is ${pct(r.pct)} of its budget.`);
  for (const g of goals.filter((g) => g.overdue)) immediate.push(`Revisit the target date for the goal "${g.name}", which has passed.`);
  for (const r of warnBudget) shortTerm.push(`Keep an eye on "${r.category}" spending, currently at ${pct(r.pct)} of its budget.`);
  for (const i of dueSoonInstallments) shortTerm.push(`Plan for the installment payment on "${i.name || i.type}" due ${i.next_due}.`);
  if (savingsRate !== null && savingsRate < 10) longTerm.push(`Consider ways to increase the savings rate, currently at ${pct(savingsRate)}.`);
  for (const g of staleGoals) longTerm.push(`Resume contributions toward the goal "${g.name}" to keep it on track.`);
  const renderActions = (title, items) => { lines.push(`**${title}:**`); if (items.length) for (const item of items) lines.push(`- ${item}`); else lines.push('- Nothing identified for this priority level.'); lines.push(''); };
  renderActions('Immediate', immediate);
  renderActions('Short-term', shortTerm);
  renderActions('Long-term', longTerm);

  // 9. Detailed Transaction Summary
  lines.push('## 9. Detailed Transaction Summary');
  lines.push(`Summary for ${periodLabel(period.year, period.month)} (${curExpenses.length + curIncome.length} record(s)):\n`);
  lines.push('### Expenses by category');
  lines.push(table(['Category', 'Amount', 'Entries'], expenseByCategory.map((row) => [row.key, money(row.total), String(curExpenses.filter((r) => r.type === row.key).length)])));
  lines.push('\n### Income by source');
  lines.push(table(['Source', 'Amount', 'Entries'], incomeBySource.map((row) => [row.key, money(row.total), String(curIncome.filter((r) => r.source === row.key).length)])));
  lines.push('');

  // 10. Closing Summary
  lines.push('## 10. Closing Summary');
  lines.push(`${householdName} ${net >= 0 ? 'stayed within its income' : 'spent beyond its income'} in ${periodLabel(period.year, period.month)}, ending with a net ${net >= 0 ? 'surplus' : 'shortfall'} of ${money(Math.abs(net))}.`);
  const watch = [];
  if (overBudget.length) watch.push('budget categories that are over their limit');
  if (dueSoonBills.length || dueSoonInstallments.length) watch.push('upcoming bills and installments due soon');
  if (staleGoals.length) watch.push('goals with no recent progress');
  lines.push(watch.length ? `Key items to monitor next period: ${watch.join(', ')}.` : 'No urgent items were identified to monitor for the next period.');

  return lines.join('\n');
}

router.get('/narrative', wrap(async (req, res) => {
  const householdId = req.household.id;
  const [expensesResult, incomeResult, billsList, installmentsList, goalsList, anomaliesList] = await Promise.all([
    pool.query('SELECT type,amount::float8 AS amount,month,year FROM expenses WHERE household_id=$1', [householdId]),
    pool.query('SELECT source,amount::float8 AS amount,month,year FROM income WHERE household_id=$1', [householdId]),
    loadBills(householdId),
    loadInstallments(householdId),
    loadGoals(householdId),
    anomaliesFor(householdId),
  ]);
  const expenses = expensesResult.rows, income = incomeResult.rows;
  const now = new Date();
  const keys = [...expenses, ...income].map((r) => periodKey(r.year, r.month));
  const currentKey = keys.length ? Math.max(...keys) : periodKey(now.getFullYear(), now.getMonth() + 1);
  const period = fromKey(currentKey), prevPeriod = fromKey(currentKey - 1);
  const budgetStatus = await statusFor(householdId, period.year, period.month);
  const markdown = buildNarrative(req.household.name, period, prevPeriod, expenses, income, budgetStatus, billsList, installmentsList, goalsList, anomaliesList);
  res.json({ markdown, generated_at: new Date().toISOString() });
}));

module.exports = { name: 'reports', router };
