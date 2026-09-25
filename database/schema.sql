-- Penny PostgreSQL schema for Neon
-- Apply once in the Neon SQL Editor before deploying Penny.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (char_length(email) BETWEEN 3 AND 320),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 99999999999),
  type text NOT NULL CHECK (type IN ('expense','income')),
  category text NOT NULL CHECK (category IN ('Food & drinks','Shopping','Transport','Housing','Health','Entertainment','Travel','Education','Salary','Other')),
  account text NOT NULL CHECK (account IN ('Debit card','Credit card','Bank','Cash','Other')),
  date date NOT NULL,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_owner_date ON transactions(user_id, date DESC, id);

CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('Food & drinks','Shopping','Transport','Housing','Health','Entertainment','Travel','Education','Salary','Other')),
  amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 99999999999),
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  UNIQUE(user_id, category, month)
);

COMMIT;
