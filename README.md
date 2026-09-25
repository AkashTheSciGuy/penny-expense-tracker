# Penny Expense Tracker

Penny is a React + TypeScript + Vite expense tracker. The frontend and server-side API deploy to Netlify. Persistent data is stored in Neon PostgreSQL. Supabase is not used.

## Architecture

```text
Browser
  -> Netlify React/Vite frontend
  -> same-origin /api/*
  -> Netlify Function
  -> Neon PostgreSQL
```

Authentication is implemented by the Netlify Function. Passwords are hashed with Node.js `scrypt`; login sessions use random server-side tokens stored as SHA-256 hashes in PostgreSQL and an HttpOnly cookie in the browser. There is no email-verification step.

## Local checks

```bash
npm install
npm test
npm run typecheck
npm run build
```

To run the frontend and Netlify Function together locally, create a local `.env` containing your pooled Neon `DATABASE_URL`, then use:

```bash
npx netlify dev
```

Do not commit `.env` or any Neon connection string.

## Database

Run `database/schema.sql` once in the Neon SQL Editor. It creates:

- `users`
- `sessions`
- `transactions`
- `budgets`

## Deployment

Follow `SETUP_NEON_NETLIFY.md` for the production deployment checklist.

## Auth behavior

Users register with an email and a password of at least 12 characters. Registration immediately creates a session; Penny does not send or require an email-verification message. Password-reset email delivery is not included because this setup has no email provider.
