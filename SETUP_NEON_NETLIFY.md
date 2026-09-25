# Penny: Neon PostgreSQL + Netlify deployment

This is the production path for this version of Penny. Supabase and Render are not used.

```text
Friends' browsers
      |
      v
Netlify (React/Vite + Netlify Function)
      | server-side DATABASE_URL only
      v
Neon PostgreSQL
```

## 1. Create the Neon database

1. Open your Neon project.
2. Keep the default database (usually `neondb`) or select the database you want Penny to use.
3. Open **SQL Editor**.
4. Open `database/schema.sql` from this repository, paste the entire file into the SQL Editor, and run it once.
5. In Neon, confirm the following tables exist: `users`, `sessions`, `transactions`, and `budgets`.

Running the schema again is safe because it uses `IF NOT EXISTS`.

## 2. Copy the correct Neon connection string

In Neon's connection details, choose the **pooled** connection. Its hostname normally contains `-pooler`. Copy the complete PostgreSQL connection string, including its SSL query parameters.

It will look similar to:

```text
postgresql://USER:PASSWORD@ep-example-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

Treat this as a secret. Never put it in browser code, GitHub, `VITE_*`, screenshots, or chat messages.

## 3. Test locally

From the project root:

```bash
npm install
npm test
npm run typecheck
npm run build
```

Create `.env` locally:

```env
DATABASE_URL=YOUR_POOLED_NEON_CONNECTION_STRING
```

Then run Netlify's local environment:

```bash
npx netlify dev
```

Open the local URL printed by Netlify. Test:

1. Create an account.
2. Confirm there is no email-verification step.
3. Add a transaction and a budget.
4. Refresh the page; the data should remain.
5. Sign out and sign in again.
6. Create a second account and verify it cannot see the first account's data.

## 4. Push to GitHub

Make sure `.env` is not committed. Then:

```bash
git init
git add .
git commit -m "Deploy Penny with Neon and Netlify"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

If the repository already exists, commit and push normally instead of re-running `git init`.

## 5. Create the Netlify site

1. Sign in to Netlify.
2. Choose **Add new project / Import an existing project**.
3. Connect GitHub and select the Penny repository.
4. Netlify should read `netlify.toml`. The expected build settings are:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
Node: 22
```

5. Do not deploy the database URL in frontend build variables.

## 6. Add DATABASE_URL to Netlify

Open the Penny Netlify project and go to **Project configuration -> Environment variables**. Add:

```text
Key: DATABASE_URL
Value: YOUR_POOLED_NEON_CONNECTION_STRING
```

If Netlify offers variable scopes, make sure **Functions** is included. Save the variable and trigger a new production deploy. Environment-variable changes only apply to a new deploy/function version.

Do not call it `VITE_DATABASE_URL`; Vite-prefixed values are intended for client-side code.

## 7. Verify production before sharing

Open the `*.netlify.app` production URL and test all of these:

- create account
- immediate login (no email verification)
- sign out / sign in
- add, edit, and delete a transaction
- create/update/delete a budget
- refresh and verify data persists
- second account cannot see first account's records
- mobile layout works

If an API request returns HTTP 500, inspect **Netlify -> Functions -> api -> logs** first. The most common cause is a missing/incorrect `DATABASE_URL` or the database schema not being applied.

## 8. Share it

Once the production tests pass, share the Netlify production URL. Each friend creates their own account; all accounts use the same Neon database but API queries always scope transactions and budgets to the authenticated user ID.

## Security notes

- Database credentials exist only in the Netlify Function environment.
- Passwords are never stored in plaintext.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Write requests reject cross-origin requests.
- The API never accepts a browser-provided `user_id`; it derives ownership from the server-side session.
- No email verification means Penny cannot prove that a registrant owns the email address they typed. For a friends/demo deployment this can be acceptable, but public sign-up abuse protection should be added if the URL is distributed widely.

## Future database changes

Do not edit live tables manually for application changes. Add versioned SQL migration files under `database/migrations/`, test them, then apply them to Neon.
