# Expense Settler

[![CI](https://github.com/Satwik367/expense-settler/actions/workflows/ci.yml/badge.svg)](https://github.com/Satwik367/expense-settler/actions/workflows/ci.yml)

A shared expense tracker for flatmates and PGs. Instead of everyone paying everyone back, it collapses all debts into net balances and computes the **minimum number of transactions** needed to settle the group. Debtors pay creditors directly over UPI and the creditor confirms receipt. The whole stack runs locally with Docker Compose or deployed on Render, with a GitHub Actions CI/CD pipeline.

> **Live demo:** [Open Expense Settler](https://expense-settler.onrender.com)
> The backend runs on a free tier that sleeps after inactivity, so the **first request can take 30 to 60 seconds**.

## Features

- Register and log in with cookie-based sessions
- Create groups. The creator is added automatically and becomes the group **admin**
- Add members by email (they must already have an account)
- Log expenses with three split types: **equal**, **custom amounts**, **percentage**
- **Edit and delete expenses.** Only the person who created an expense, or the group admin, can change it. Deletes are soft, so history is preserved
- **Automatic recompute.** Settlements are recalculated whenever an expense is added, edited or deleted, so there is no manual "compute" step
- **Balances view.** See who is owed and who owes, per group and as a summary on the dashboard
- **UPI payments with manual confirmation.** Each member can save a UPI ID. The debtor gets a UPI deep link to pay the creditor directly, then taps "I've paid". The creditor confirms or rejects
- Leave a group once your balance is zero. The group's history stays for the other members

## Tech stack

| Layer                 | Tech                                              |
| --------------------- | ------------------------------------------------- |
| Frontend              | React 18, Vite, React Router                      |
| Backend               | Node.js, Express                                  |
| Database              | MongoDB (Mongoose)                                |
| Payments              | UPI deep links + manual confirmation              |
| Validation / security | Zod, bcryptjs, JWT, helmet, express-rate-limit    |
| Containers            | Docker, Docker Compose, nginx                     |
| CI/CD                 | GitHub Actions, Render auto-deploy gated on CI    |
| Hosting               | Render (backend + static frontend), MongoDB Atlas |

## How the settlement algorithm works

Source: `backend/src/utils/settlementAlgorithm.js`

1. **Net balances.** For each expense that has not been deleted, the payer is credited the full amount and every participant is debited their share. Each member ends up with one number: positive means they're owed money, negative means they owe.
2. **Subtract what's already paid.** Paid settlements count as real transfers (`backend/src/utils/balances.js`), so recomputing never asks someone to pay twice.
3. **Greedy matching.** Repeatedly match the largest creditor against the largest debtor until everyone is at zero.
4. **Reconcile with existing settlements.** On every recompute (`backend/src/utils/settlementService.js`), pending settlements whose from, to and amount are unchanged are kept as they are. The rest are marked `stale` and replaced with new ones.

Naive pairwise settling can need up to O(n²) payments. This approach needs at most n-1. It is not guaranteed to be the theoretical minimum, since that variant is NP-hard (it reduces to subset-sum partitioning), but it is the standard practical approach and is optimal or near-optimal for real groups. Amounts are rounded to 2 decimals with a 0.01 tolerance to avoid floating-point dust. When a split doesn't divide evenly, the leftover paisa goes to the largest share so the shares always add up to the total exactly.

The unit tests (`backend/tests/settlementAlgorithm.test.js`) include one that replays the generated payments against the original balances and checks that everything nets to zero.

## Settlement lifecycle

```
pending ──(debtor taps "I've paid")──> awaiting_confirmation ──(creditor confirms)──> paid
                                              │
                                              └──(creditor rejects)──> pending

stale: a settlement replaced by a recompute after expenses changed
```

## Payment flow and security design

### UPI with confirmation

1. The debtor opens the settlement. The app builds a `upi://pay?...` link from the creditor's UPI ID, the amount and a note, and the debtor pays in their own UPI app. Money moves directly between the two people, so this app never touches it.
2. The debtor taps **I've paid**. The settlement moves to `awaiting_confirmation`.
3. The creditor checks their bank or UPI app and taps **Confirm** (settlement becomes `paid`) or **Reject** (it goes back to `pending` and the group is recomputed).

Because UPI has no webhook for a person-to-person transfer, the creditor's confirmation is the source of truth. The creditor's UPI ID is only returned by the API to the debtor who owes that settlement.

### Security summary

| Concern                          | How it's handled                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Password storage                 | bcrypt, 12 rounds                                                                                                                                                                                                        |
| Session token                    | JWT in an `httpOnly` cookie, never exposed to JavaScript                                                                                                                                                                 |
| Cross-site cookies in production | `SameSite=None; Secure` (frontend and backend are on different domains)                                                                                                                                                  |
| Account enumeration              | Same generic error for unknown email and wrong password                                                                                                                                                                  |
| Brute force                      | A strict rate limit on auth endpoints, plus a general limit on API traffic                                                                                                                                               |
| Amount tampering                 | Settlement amounts are computed and stored on the server. Clients never send an amount                                                                                                                                   |
| Input validation                 | Zod schemas on every write route, including UPI ID format                                                                                                                                                                |
| Error leakage                    | No stack traces in production responses                                                                                                                                                                                  |
| Authorization                    | Membership checks on every group, expense and settlement route. Only the debtor can report a payment. Only the creditor can confirm or reject. Only the expense creator or the group admin can edit or delete an expense |
| Data exposure                    | A creditor's UPI ID is stripped from settlement responses for everyone except the debtor                                                                                                                                 |
| Dependency risk                  | `npm audit` runs in CI and fails on high or critical advisories                                                                                                                                                          |

## CI/CD pipeline

Defined in `.github/workflows/ci.yml`. It runs on every push to `main` and on every pull request:

1. **Backend:** `npm ci`, run the algorithm unit tests, then `npm audit --omit=dev --audit-level=high`
2. **Frontend:** `npm ci` and a production `npm run build`
3. **Docker:** build the backend and frontend images

Render's **Auto-Deploy** is set to "After CI Checks Pass" on both services, so a commit is only deployed if all checks are green.

## Project structure

```
expense-settler/
├── .github/workflows/ci.yml
├── backend/
│   ├── src/
│   │   ├── config/        db.js
│   │   ├── models/        User, Group, Expense, Settlement
│   │   ├── controllers/   auth, group, expense, settlement
│   │   ├── routes/        Express routers + Zod schemas
│   │   ├── middleware/    auth, rateLimiter, validate, errorHandler
│   │   ├── utils/         settlementAlgorithm.js, balances.js,
│   │   │                  settlementService.js
│   │   └── server.js
│   ├── tests/             settlement algorithm unit tests
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/           client.js
│   │   ├── context/       AuthContext.jsx
│   │   ├── components/    ExpenseForm, SettlementList, Balance
│   │   └── pages/         Login, Register, Dashboard, GroupDetail
│   ├── Dockerfile
│   └── nginx.conf
└── docker-compose.yml
```

## API overview

All routes are under `/api`. Everything except `auth/register`, `auth/login`, and `health` requires a logged-in session.

| Method       | Route                                           | Purpose                                                               |
| ------------ | ----------------------------------------------- | --------------------------------------------------------------------- |
| POST         | `/auth/register`, `/auth/login`, `/auth/logout` | Session handling                                                      |
| GET / PATCH  | `/auth/me`                                      | Current user / update profile (UPI ID)                                |
| GET / POST   | `/groups`                                       | List my groups (with my balance) / create a group                     |
| GET          | `/groups/:id`                                   | Group details (members only)                                          |
| GET          | `/groups/:id/balances`                          | Net balance of every member                                           |
| POST         | `/groups/:id/members`                           | Add a member by email                                                 |
| POST         | `/groups/:id/leave`                             | Leave a group (blocked while you have a balance; admin cannot leave)  |
| GET / POST   | `/groups/:id/expenses`                          | List / add expenses                                                   |
| PUT / DELETE | `/groups/:id/expenses/:expenseId`               | Edit / soft-delete an expense (creator or admin only)                 |
| POST         | `/groups/:id/settlements/compute`               | Force a recompute (also runs automatically after expense changes)     |
| GET          | `/groups/:id/settlements`                       | Settlements still needing action (`pending`, `awaiting_confirmation`) |
| POST         | `/groups/:id/settlements/:settlementId/report`  | Debtor reports a UPI payment                                          |
| POST         | `/groups/:id/settlements/:settlementId/confirm` | Creditor confirms receipt                                             |
| POST         | `/groups/:id/settlements/:settlementId/reject`  | Creditor rejects the report                                           |
| GET          | `/health`                                       | Health check                                                          |

## Running locally

### Prerequisites

Node.js 20+ and Docker Desktop.

### Option A: Docker Compose (everything in containers)

```bash
cp backend/.env.example backend/.env     # on Windows: copy backend\.env.example backend\.env
# fill in JWT_SECRET (see Environment variables)
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000/api/health

Compose overrides `MONGO_URI` to point at the `mongo` service name, so the values in `.env` don't matter for this option. Data persists in named volumes. Run `docker compose down -v` to wipe it.

### Option B: Run the apps directly

Start MongoDB in a container, then run the backend and frontend with npm:

```bash
docker run -d --name es-mongo -p 27017:27017 mongo:7

cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

In `backend/.env`, set:

```
MONGO_URI=mongodb://localhost:27017/expense_settler
```

### Testing with two users

Cookies are shared across tabs in one browser profile, so logging in as a second user in another tab logs out the first. Use two different browsers, or one normal window and one private window.

### Tests

```bash
cd backend
npm test
```

The algorithm tests need no database.

## Environment variables (backend)

| Variable              | Description                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PORT`                | Server port (default 5000)                                                                                      |
| `NODE_ENV`            | `production` enables `Secure` / `SameSite=None` cookies and hides stack traces                                  |
| `FRONTEND_ORIGIN`     | Exact frontend URL for CORS, with no trailing slash                                                             |
| `MONGO_URI`           | MongoDB connection string. **Include the database name** (`.../expense_settler`), otherwise MongoDB uses `test` |
| `JWT_SECRET`          | Long random string. Use a different one in production                                                           |
| `JWT_EXPIRES_IN`      | Session length (default `7d`)                                                                                   |
| `COOKIE_NAME`         | Session cookie name (default `es_token`)                                                                        |
| `AUTH_RATE_LIMIT_MAX` | Auth requests per 15 minutes per IP                                                                             |

Frontend build variable: `VITE_API_BASE` is the backend URL ending in `/api`. Vite bakes it in at build time, so changing it requires a rebuild.

## Deployment (Render + Atlas)

1. **MongoDB Atlas.** Create a free cluster and a database user. Allow `0.0.0.0/0` in Network Access (Render's free tier has no fixed IP), so use a long random database password. Put the database name in the URI.
2. **Backend: Render Web Service.** Root directory `backend`, Docker environment, with all environment variables above set.
3. **Frontend: Render Static Site.** Root `frontend`, build command `npm install && npm run build`, publish directory `dist`, `VITE_API_BASE` set. Add a rewrite rule `/*` to `/index.html` so refreshing on `/groups/...` doesn't 404.
4. Set the backend's `FRONTEND_ORIGIN` to the frontend's real URL.
5. On both services, set **Auto-Deploy** to "After CI Checks Pass" so only green commits are deployed.

### Lessons learned while deploying

- **Cross-site cookies.** With the frontend and backend on different domains, a `SameSite=Lax` cookie is silently dropped on API calls, so login appears to work but every later request returns 401. The fix is `SameSite=None; Secure` in production. Browsers that block third-party cookies can still interfere. Serving both from one parent domain makes the cookie first-party and avoids that entirely.
- **Atlas database name.** A connection string without a database name silently writes to a database called `test`.

## Known limitations and next steps

- Members must register before they can be added. There are no invite emails or invite links
- The admin can't leave a group and admin rights can't be transferred yet
- Any member can add other members (not admin-only)
- UPI payments rely on the creditor confirming receipt. There is no automatic bank-side verification
- If two recomputes run at the same moment, pending settlements can briefly be duplicated until the next recompute
- An expense that involves a member who has since left can't be edited
- No password reset or email verification
- No CSRF token. `SameSite` and CORS are the current protection
- No refresh tokens or server-side session revocation (a session is a single 7-day JWT)
- Groups can't be deleted, by design, so the payment history is preserved
- Currency is fixed to INR
- CI covers unit tests, a dependency audit and builds, but there are no API integration tests yet
- Ideas: integration tests with a Mongo service container in CI, admin transfer on leave, invite links, a mobile app (PWA or Capacitor), and deployment on AWS with Kubernetes
