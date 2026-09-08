# Finance tracker

Spending, portfolio, and SIP/EMI calculators. Hosted on GitHub Pages with a free Supabase database and two passwords (viewer vs owner).

## Open it

After Pages is on: **https://07prajwal.github.io/finance/**

Until Supabase is connected, each device keeps its own copy. Passwords are `owner` / `viewer` (change them in `js/config.js`).

```bash
npm test
python3 -m http.server 8080
```

## Host it (free)

### 1. GitHub Pages

1. Create a GitHub repo and push this folder.
2. Settings → Pages → Deploy from branch `main` (root).
3. Tests run automatically via `.github/workflows/test.yml`.

### 2. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. SQL editor: run `supabase/schema.sql`, then `supabase/seed.sql` (or `npm run seed:sql` to regenerate the seed from `js/seed.js`).
3. Edge Functions secrets (Project Settings → Edge Functions, or CLI):

```bash
node scripts/hash-password.js 'your-owner-password'
node scripts/hash-password.js 'your-viewer-password'
```

Set:

- `OWNER_PASSWORD_HASH` — hex from the first command
- `VIEWER_PASSWORD_HASH` — hex from the second
- `JWT_SECRET` — a long random string

4. Deploy functions (`verify_jwt` is already false in `supabase/config.toml`):

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy login
npx supabase functions deploy api
```

5. Paste the project URL and **anon public** key into `js/config.js`. Never put the service-role key in the frontend.

After that, sign-in goes through the `login` function. Writes only succeed with the owner JWT. Row Level Security has no anon policies, so the public key cannot read tables directly.

### 3. iPhone / friend

- Add the Pages URL to the iPhone home screen.
- Give a friend the URL + **viewer** password only.

Session lasts 7 days in `localStorage`. Sign out from the nav.

### 4. iPhone Shortcut (log an expense after Google Pay)

The site already has Add expense. A Shortcut is for when you close GPay and want the same questions without opening the page.

1. Deploy the `expense` function once (`npx supabase functions deploy expense`).
2. On iPhone: Shortcuts → + → name it **Log expense**.
3. Add actions in this order:
   - **Ask for Input** → Number → prompt `Amount`
   - **Choose from Menu** → Our Expense, Home Expense, My Expense (prompt `Type`)
   - **Choose from Menu** → Food, Quick Delivery, Travel, Shopping, Medicine, Other (prompt `Category`)
   - **Choose from Menu** → UPI, Cash, Card (prompt `Account`)
   - **Ask for Input** → Text → prompt `Notes` (Allow Empty)
   - **Get Contents of URL**
     - URL: `https://capyboshlcdhpzxurajn.supabase.co/functions/v1/expense`
     - Method: POST
     - Headers: `Content-Type` = `application/json`, `Authorization` = `Bearer` + your **anon public** key from `js/config.js`, `apikey` = the same key
     - Request Body: JSON

```json
{
  "password": "YOUR_OWNER_PASSWORD",
  "amount": Amount (the Ask for Input result),
  "type": Type (the first menu result),
  "category": Category,
  "account": Account,
  "notes": Notes
}
```

In Shortcuts, each JSON value is a Magic Variable, not typed text. Keep the owner password only on your phone.

4. Automation: Shortcuts → Automation → New → **App** → Google Pay → **Is Closed** → Run **Log expense**. Turn **Ask Before Running** on until you trust it, then off if you want it every time GPay closes.

A 401 means the owner password in the Shortcut is wrong. A saved row shows on the website after refresh.

## What changed from the first draft

- Overview splits **Investments** and **Spending**.
- Add expense is an owner-only stepper (date → amount → type → category → account → notes → confirm).
- Delete requires a confirm that shows amount and date.
- Portfolio shows unrealised P/L %, realised P/L, sleeve totals, buy/sell (Nokia lots stay separate).
- Calculators take a number or a slider (sliders are debounced). EMI chart is Principal repaid / Interest paid.
- Numbers / CSV import-export is gone.

## Honest limit

A leaked viewer password lets someone see balances. A leaked owner password lets them change data. Rotate the hashes in Supabase if that happens. This is shared-password security, not bank accounts.
