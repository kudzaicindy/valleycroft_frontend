# Frontend ↔ Ledger / transactions

This doc matches the API behaviour when transactions post to the general ledger.

## Transaction create/update (POST/PUT `/api/finance/transactions`)

### Payload (what the UI sends)

- **Required:** `type` (`income` | `expense`), `category`, `description`, `amount` (positive number).
- **Optional:** `date`, `reference`, `booking` (e.g. linked booking id).
- **Do not send** `journalEntryId` on write. The server sets or ignores it. Treat it as **read-only** from GET responses.
- **POST dedup:** send header **`Idempotency-Key`** (unique per intentional create; reuse the same key only when retrying the *same* submit). Booking-derived revenue uses a stable key: `booking-revenue-<bookingId>`.
- **GET list:** responses may include **`ledgerStatus`**: `'posted' | 'unposted'` (prefer this over inferring from `journalEntryId`). **`meta.duplicateRowsCollapsed`** counts server-side merged duplicate documents on that page. Opt out of collapse: `?collapseDuplicates=0`.

Implementation:

- `src/utils/transactionWritePayload.js` — `buildTransactionWritePayload`
- `src/utils/transactionLedgerUi.js` — `newIdempotencyKey`, `isTransactionLedgerPosted`
- `src/api/finance.js` — `createTransaction(body, { idempotencyKey })`
- `src/pages/dashboard/TransactionsPage.jsx` — forms use the builder only (no `journalEntryId`); creates send idempotency.

### Categories

Canonical values must match the backend account mapping (see API `ACCOUNTING.md` / `transactionJournalService`).

- Dropdown options and labels: `src/constants/transactionCategories.js` (`TRANSACTION_CATEGORY_OPTIONS`).
- Display stored values with `transactionCategoryLabel()`.

If the backend adds a new category, add the same `value` there with a user-facing `label`.

### Errors (400 — ledger not ready)

POST/PUT may return **400** with a message like “Could not post ledger entry” / “Could not update ledger” and a **`hint`** (e.g. run `npm run seed:accounting` on the server).

- Axios attaches `hint` to the thrown `Error` when present (`src/api/axiosInstance.js`).
- UI: `formatTransactionMutationMessage()` in `src/utils/apiError.js` — shows message, hint, and a line asking an admin to seed accounting. **Do not** silently retry forever.

### Optional: ledger column

If GET returns `journalEntryId`, the Transactions table shows a **Posted** pill (`TransactionsPage`). A future journal detail route can deep-link from that id.

---

## Reports: legacy finance vs ledger accounting

| Source | Base path | Notes |
|--------|-----------|--------|
| **Transaction-based (legacy)** | `/api/finance/...` | `income-statement`, `balance-sheet`, `cashflow` — as documented on the API. |
| **Ledger-based** | `/api/accounting/...` | Operating summary, balance sheet, cash flow, journal entries (`ACCOUNTING.md`). |

**Frontend (current):** **Statements (transaction-based)** in the nav use `/api/finance/*` with `FinanceLegacyReportsBanner`. **Accounting (ledger)** → **Ledger** page (`/finance/ledger`, `/ceo/ledger`) uses `src/api/accounting.js` and `LedgerPage.jsx` with `LedgerReportsBanner`. Old path `/pl` redirects to `/ledger`.

---

## CORS / origins

Backend should set **`FRONTEND_URL`** to the actual dev/prod origins (comma-separated). Align with where Vite (or hosting) serves the app — see `.env.example` (Vite: default `http://localhost:5173`).

---

## Checklist (TL;DR)

- [x] Same transaction fields; no `journalEntryId` on POST/PUT.
- [x] Show 400 + `hint` and admin seed message; no infinite silent retry.
- [x] Category dropdown = canonical values + plain labels.
- [x] Optional “Posted” when `journalEntryId` present on GET.
- [x] Statement pages + nav labelled as transaction-based vs future ledger UI.
- [x] This file + `.env.example` for `FRONTEND_URL` / `VITE_API_URL`.
