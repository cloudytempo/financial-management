const router = require('express').Router();
const pool = require('../db');
const { wrap, lockDown } = require('../util');
const TYPES = ['cash', 'bank', 'savings', 'credit_card', 'investment', 'loan', 'other'];
const LIABILITIES = new Set(['credit_card', 'loan']);
const cleanName = (value) => String(value || '').trim();
const validDay = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 31;
const accountOk = (body) => cleanName(body.name).length > 0 && cleanName(body.name).length <= 80 && TYPES.includes(body.type) &&
  Number.isFinite(Number(body.opening_balance)) && (body.type !== 'credit_card' || (validDay(body.statement_day) && validDay(body.due_day)));

async function transactions(householdId, accountId = null) {
  const { rows } = await pool.query(`
    SELECT t.*,a.name AS account_name,a.type AS account_type FROM (
      SELECT e.account_id,'income'::text AS kind,e.amount::float8 AS amount,make_date(e.year::int,e.month::int,1) AS transaction_date,
        e.source AS description,e.remarks AS note,e.id AS source_id,e.created_at
        FROM income e WHERE e.household_id=$1 AND e.account_id IS NOT NULL
      UNION ALL
      SELECT e.account_id,'expense',e.amount::float8,make_date(e.year::int,e.month::int,1),e.type,e.remarks,e.id,e.created_at
        FROM expenses e WHERE e.household_id=$1 AND e.account_id IS NOT NULL
      UNION ALL
      SELECT bp.account_id,'bill_payment',bp.amount::float8,bp.paid_on,b.name,'Bill: '||b.name,bp.id,bp.paid_on::timestamptz
        FROM bill_payments bp JOIN bills b ON b.id=bp.bill_id WHERE b.household_id=$1 AND bp.account_id IS NOT NULL AND bp.expense_id IS NULL
      UNION ALL
      SELECT ip.account_id, 'installment_payment',COALESCE(ip.payment_amount,i.amount)::float8,ip.paid_at::date,
        COALESCE(NULLIF(i.name,''),i.type),'Installment: '||COALESCE(NULLIF(i.name,''),i.type),ip.installment_id,ip.paid_at
        FROM installment_payments ip JOIN installments i ON i.id=ip.installment_id
        WHERE i.household_id=$1 AND ip.account_id IS NOT NULL
      UNION ALL
      SELECT t.from_account_id,'transfer_out',t.amount::float8,t.transfer_date,'Transfer to '||dest.name,t.note,t.id,t.created_at
        FROM account_transfers t JOIN accounts src ON src.id=t.from_account_id JOIN accounts dest ON dest.id=t.to_account_id
        WHERE t.household_id=$1
      UNION ALL
      SELECT t.to_account_id,'transfer_in',t.amount::float8,t.transfer_date,'Transfer from '||src.name,t.note,t.id,t.created_at
        FROM account_transfers t JOIN accounts src ON src.id=t.from_account_id JOIN accounts dest ON dest.id=t.to_account_id
        WHERE t.household_id=$1
    ) t JOIN accounts a ON a.id=t.account_id
    WHERE ($2::int IS NULL OR t.account_id=$2) ORDER BY t.transaction_date DESC,t.created_at DESC,t.kind`,
    [householdId, accountId]);
  return rows;
}

async function accountsForHousehold(householdId) {
  const accounts = (await pool.query(`SELECT id,name,type,opening_balance::float8 AS opening_balance,statement_day,due_day,is_active,created_at
    FROM accounts WHERE household_id=$1 ORDER BY is_active DESC,lower(name),id`, [householdId])).rows;
  const rows = await transactions(householdId);
  const balances = new Map(accounts.map((account) => [account.id, Number(account.opening_balance)]));
  for (const transaction of rows) {
    const liability = LIABILITIES.has(transaction.account_type);
    const adds = liability
      ? ['expense', 'bill_payment', 'installment_payment', 'transfer_out'].includes(transaction.kind)
      : ['income', 'transfer_in'].includes(transaction.kind);
    balances.set(transaction.account_id, (balances.get(transaction.account_id) || 0) + Number(transaction.amount) * (adds ? 1 : -1));
  }
  const result = accounts.map((account) => ({ ...account, is_liability: LIABILITIES.has(account.type), balance: Number((balances.get(account.id) || 0).toFixed(2)) }));
  const total_assets = result.filter((account) => !account.is_liability && account.is_active).reduce((total, account) => total + account.balance, 0);
  const total_liabilities = result.filter((account) => account.is_liability && account.is_active).reduce((total, account) => total + account.balance, 0);
  return { accounts: result, total_assets, total_liabilities, net_worth: total_assets - total_liabilities };
}

router.get('/', wrap(async (req, res) => res.json(await accountsForHousehold(req.household.id))));
router.get('/options', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id,name,type FROM accounts WHERE household_id=$1 AND is_active=true ORDER BY lower(name)', [req.household.id]);
  res.json(rows);
}));
router.get('/transactions', wrap(async (req, res) => {
  const accountId = req.query.account_id == null ? null : Number(req.query.account_id);
  if (accountId != null && (!Number.isInteger(accountId) || !(await pool.query('SELECT 1 FROM accounts WHERE id=$1 AND household_id=$2', [accountId, req.household.id])).rowCount))
    return res.status(404).json({ error: 'Account not found.' });
  res.json(await transactions(req.household.id, accountId));
}));
router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  if (!accountOk(body)) return res.status(400).json({ error: 'Enter an account name, valid type and opening balance.' });
  const { rows } = await pool.query(`INSERT INTO accounts(household_id,name,type,opening_balance,statement_day,due_day) VALUES($1,$2,$3,$4,$5,$6)
    RETURNING id,name,type,opening_balance::float8 AS opening_balance,statement_day,due_day,is_active,created_at`,
    [req.household.id, cleanName(body.name), body.type, Number(body.opening_balance), body.type === 'credit_card' ? Number(body.statement_day) : null, body.type === 'credit_card' ? Number(body.due_day) : null]);
  res.status(201).json({ ...rows[0], is_liability: LIABILITIES.has(rows[0].type), balance: Number(rows[0].opening_balance) });
}));
router.put('/:id', wrap(async (req, res) => {
  const body = req.body || {};
  if (!accountOk(body)) return res.status(400).json({ error: 'Enter an account name, valid type and opening balance.' });
  const result = await pool.query(`UPDATE accounts SET name=$1,type=$2,opening_balance=$3,statement_day=$4,due_day=$5 WHERE id=$6 AND household_id=$7
    RETURNING id,name,type,opening_balance::float8 AS opening_balance,statement_day,due_day,is_active,created_at`,
    [cleanName(body.name), body.type, Number(body.opening_balance), body.type === 'credit_card' ? Number(body.statement_day) : null, body.type === 'credit_card' ? Number(body.due_day) : null, req.params.id, req.household.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Account not found.' });
  const summary = await accountsForHousehold(req.household.id);
  res.json(summary.accounts.find((account) => account.id === result.rows[0].id));
}));
router.post('/:id/transfer', wrap(async (req, res) => {
  const fromId = Number(req.params.id), toId = Number(req.body && req.body.to_account_id), amount = Number(req.body && req.body.amount);
  const transferDate = req.body && req.body.transfer_date;
  const date = new Date(`${transferDate}T00:00:00Z`);
  if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId === toId || !Number.isFinite(amount) || amount <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(transferDate || '') || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== transferDate)
    return res.status(400).json({ error: 'Choose two different accounts, a valid amount and transfer date.' });
  const ids = await pool.query(`SELECT id FROM accounts WHERE household_id=$1 AND is_active=true AND id=ANY($2::int[])`, [req.household.id, [fromId, toId]]);
  if (ids.rowCount !== 2) return res.status(400).json({ error: 'Both accounts must be active accounts in this household.' });
  const note = String(req.body.note || '').trim().slice(0, 250);
  await pool.query(`INSERT INTO account_transfers(household_id,from_account_id,to_account_id,amount,transfer_date,note)
    VALUES($1,$2,$3,$4,$5,$6)`, [req.household.id, fromId, toId, amount, transferDate, note]);
  res.status(201).json({ ok: true });
}));
router.post('/:id/deactivate', wrap(async (req, res) => {
  const result = await pool.query('UPDATE accounts SET is_active=false WHERE id=$1 AND household_id=$2 RETURNING id', [req.params.id, req.household.id]);
  result.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Account not found.' });
}));
router.post('/:id/activate', wrap(async (req, res) => {
  const result = await pool.query('UPDATE accounts SET is_active=true WHERE id=$1 AND household_id=$2 RETURNING id', [req.params.id, req.household.id]);
  result.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Account not found.' });
}));

const init = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('cash','bank','savings','credit_card','investment','loan','other')),
    statement_day SMALLINT CHECK (statement_day BETWEEN 1 AND 31), due_day SMALLINT CHECK (due_day BETWEEN 1 AND 31),
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS statement_day SMALLINT');
  await pool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS due_day SMALLINT');
  await pool.query(`CREATE TABLE IF NOT EXISTS account_transfers (
    id BIGSERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
    from_account_id INT NOT NULL REFERENCES accounts ON DELETE RESTRICT,
    to_account_id INT NOT NULL REFERENCES accounts ON DELETE RESTRICT,
    amount NUMERIC(14,2) NOT NULL CHECK(amount > 0), transfer_date DATE NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK(from_account_id <> to_account_id))`);
  for (const table of ['expenses', 'income', 'bill_payments', 'installment_payments']) {
    if (!(await pool.query('SELECT to_regclass($1) AS name', [`public.${table}`])).rows[0].name) continue;
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS account_id INT REFERENCES accounts ON DELETE SET NULL`);
  }
  if ((await pool.query("SELECT to_regclass('public.installment_payments') AS name")).rows[0].name) {
    await pool.query('ALTER TABLE installment_payments ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12,2)');
    await pool.query(`UPDATE installment_payments p SET payment_amount=i.amount FROM installments i
      WHERE p.installment_id=i.id AND p.payment_amount IS NULL`);
  }
  await pool.query('CREATE INDEX IF NOT EXISTS accounts_household_idx ON accounts(household_id,is_active)');
  await pool.query('CREATE INDEX IF NOT EXISTS account_transfers_household_idx ON account_transfers(household_id,transfer_date DESC)');
  await lockDown(pool, ['accounts', 'account_transfers']);
};
module.exports = { name: 'accounts', router, init };
