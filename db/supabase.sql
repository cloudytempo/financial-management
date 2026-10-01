CREATE TABLE users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE households (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  created_by INT REFERENCES users ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE UNIQUE INDEX households_name_unique ON households (lower(name));
ALTER TABLE users ADD COLUMN active_household_id INT REFERENCES households ON DELETE SET NULL;
CREATE TABLE household_members (
  household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users ON DELETE CASCADE, joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (household_id, user_id));
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
  type TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12), year SMALLINT NOT NULL,
  remarks TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX ON expenses (household_id, year, month);
CREATE TABLE installments (
  id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
  type TEXT NOT NULL, name TEXT DEFAULT '', amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  duration_months SMALLINT NOT NULL CHECK (duration_months > 0),
  due_day SMALLINT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  start_month SMALLINT NOT NULL CHECK (start_month BETWEEN 1 AND 12), start_year SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE installment_payments (
  installment_id INT NOT NULL REFERENCES installments ON DELETE CASCADE,
  period SMALLINT NOT NULL, paid_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (installment_id, period));
CREATE TABLE events (
  id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
  title TEXT NOT NULL, event_date DATE NOT NULL, notes TEXT DEFAULT '');
CREATE INDEX ON events (household_id, event_date);
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY, household_id INT NOT NULL REFERENCES households ON DELETE CASCADE,
  name TEXT NOT NULL, target_amount NUMERIC(12,2) NOT NULL CHECK (target_amount > 0),
  saved_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  target_date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'Ongoing' CHECK (status IN ('Ongoing','Complete')),
  last_progress_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now());

-- Supabase only: block the public Data API from reading these tables (the backend connects as the postgres role, which bypasses RLS).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
