# Valley Croft Farm Management System (Frontend)

Role-based dashboard: **admin**, **ceo**, **finance**, **employee**.  
Stack: React + Vite, Tailwind CSS, Axios, TanStack React Query, React Router, react-hook-form, Recharts. Deploy on Vercel.

## Env

- `VITE_API_URL` — API base URL (e.g. `https://api.valleycroft.com`). Copy `.env.example` to `.env`.
- On the **API server**, `FRONTEND_URL` must list the origins that load this app (CORS). See `.env.example`.

## Ledger & transactions

When the API posts transactions to the ledger, follow **[FRONTEND-LEDGER.md](./FRONTEND-LEDGER.md)** (payloads, categories, 400 + `hint`, read-only `journalEntryId`, legacy vs accounting reports).

## Routes

| Path | Access |
|------|--------|
| `/`, `/booking`, `/booking-track` | Public (marketing + booking) |
| `/login` | Public; redirects to role home if already logged in |
| `/admin/*` | Admin only |
| `/ceo/*` | CEO only |
| `/finance/*` | Finance only |
| `/employee/*` | Employee only |
| Any other path | Redirect → `/login` |

JWT in `localStorage` under key `token`. Axios instance in `src/api/axiosInstance.js` attaches `Authorization: Bearer <token>` and 401 → redirect to `/login`.

## Structure

- **Auth:** `src/context/AuthContext.jsx` (role from decoded JWT).
- **API:** `src/api/` — use `axiosInstance` only; never raw `axios`.
- **Role pages:** `src/pages/admin/`, `ceo/`, `finance/`, `employee/` (each has Layout + dashboard/children).
- **ProtectedRoute:** `src/components/ProtectedRoute.jsx` — enforces role, redirects wrong role to their home.

## Build order (implement in this order)

1. ✅ Vite + Tailwind + React Router + QueryClientProvider  
2. ✅ Login + AuthContext + ProtectedRoute + role redirect  
3. Admin: booking calendar + create/edit/cancel  
4. Finance: transactions, cashflow, income statement, balance sheet, ledger (/api/accounting)  
5. Employee: work log submit (photo upload), my-logs history  
6. CEO: read-only overview + Recharts  
7. Inventory and reports last  

## Conventions

- **Data:** `useQuery` for fetch (no `useEffect` + fetch/axios). `useMutation` + `onMutate` for optimistic updates. Pagination: `?page=1&limit=20`; use `keepPreviousData: true` on list queries.
- **Forms:** react-hook-form + zod; validate on blur where needed.
- **UI:** Tailwind only; Recharts for charts; loading / error / empty state on every data UI.
- **Imports:** `@/` points to `src/` (see `vite.config.js` + `jsconfig.json`).
