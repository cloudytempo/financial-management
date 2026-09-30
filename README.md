# Home Ledger

Angular 18 + Express + PostgreSQL, run with Docker Compose.

## Run
    cp .env.example .env      # then edit DB_PASSWORD and JWT_SECRET
    docker compose up -d --build
Open http://localhost:8080 and sign up (new users get full access).

Data lives in the `pgdata` Docker volume. `db/init.sql` runs only on first start;
to reset the database: `docker compose down -v`.

## Upgrading an existing install
The Goals table is created automatically on backend start, so existing data is kept:
    docker compose up -d --build

## Importing expenses
Expenses page, Import CSV. `data/belanjawanku.csv` is your Belanjawanku sheet converted (158 rows with an amount;
blank cells are skipped). "Skip months after this month" is ticked by default, so pre-filled future months are not imported.
Re-importing is safe: rows already in the database are skipped.

## Using it on your phone
The UI is responsive: bottom tab bar and bottom-sheet forms on phones, sidebar on desktop.
For access from outside your home network, put the stack behind HTTPS (e.g. a reverse proxy such as Caddy or Cloudflare Tunnel).
HTTPS is also required for browser location, which prayer times use.

## Password reset
"Forgot password?" on the sign-in page: enter the account email (the username) and a new password.
No email verification is performed, so anyone who knows an email can reset that account.

## Goals
Goals track saved amount vs target. An ongoing goal is flagged when its saved amount/status hasn't changed for
2 months (`STALE_MONTHS` in `backend/src/modules/goals.js`) or when its target date has passed.

## Add a new module
Backend: create `backend/src/modules/<name>.js` exporting `{ name, router }`, add it to `modules/index.js`
(mounted at `/api/<name>`, auth applied automatically). Add tables to `db/init.sql`.
Frontend: create `features/<name>/<name>.component.ts`, add one entry to `core/modules.config.ts`
(sidebar link and route are generated). Dashboard widgets are standalone components in `features/dashboard/`.

## Notes
- Abnormal expense rule (`backend/src/modules/expenses.js`): flagged when above the average of the same type's other
  months + max(2 standard deviations, 30%), with at least 3 other records.
- Prayer times use the free Aladhan API (JAKIM method) and browser geolocation, which needs `localhost` or HTTPS;
  otherwise it falls back to Kuala Lumpur.
- Behind HTTPS/public access, put a reverse proxy in front and keep a strong JWT_SECRET.
