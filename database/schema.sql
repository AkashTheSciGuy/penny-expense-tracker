-- Penny PostgreSQL schema for Neon
-- Use this for a fresh Penny database.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- =====================================================
-- Users
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (
    char_length(email) BETWEEN 3 AND 320
  ),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- =====================================================
-- Sessions
-- =====================================================
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
-- =====================================================
-- Categories
-- =====================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (
    char_length(trim(name)) BETWEEN 1 AND 50
  ),
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_amount bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_recurring_amount_check CHECK (
    (
      is_recurring = false
      AND recurring_amount IS NULL
    )
    OR (
      is_recurring = true
      AND recurring_amount BETWEEN 1 AND 99999999999
    )
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_name_unique ON categories (user_id, lower(name));
-- =====================================================
-- Transactions
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (
    char_length(trim(title)) BETWEEN 0 AND 120
  ),
  amount bigint NOT NULL CHECK (
    amount BETWEEN 1 AND 99999999999
  ),
  type text NOT NULL CHECK (
    type IN ('expense', 'income')
  ),
  category text NOT NULL CHECK (
    char_length(trim(category)) BETWEEN 1 AND 50
  ),
  account text NOT NULL CHECK (
    account IN (
      'Debit card',
      'Credit card',
      'UPI',
      'Bank',
      'Cash',
      'Other'
    )
  ),
  date date NOT NULL,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_owner_date ON transactions(user_id, date DESC, id);
-- =====================================================
-- Budgets
-- =====================================================
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (
    char_length(trim(category)) BETWEEN 1 AND 50
  ),
  amount bigint NOT NULL CHECK (
    amount BETWEEN 1 AND 99999999999
  ),
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  UNIQUE (user_id, category, month)
);
COMMIT;