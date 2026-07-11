# Help Valeria Recover — Fundraiser + Online Charity Auction

A compassionate fundraising website **and** a full online charity-auction platform,
built to help fund the medical care of Valeria, an 18-year-old in intensive care after
a car accident. Direct giving via **GoFundMe remains the primary call-to-action**; the
auction is a complementary way for the community to raise more.

## Running it hands-off (operator guide)

This section is for whoever runs the auction day-to-day (e.g. the family). Four topics:
payments, handing over admin, emails, and the one thing to enable before a real launch.

### 1. How auction money reaches the family (GoFundMe model)
The default payment model is **`gofundme`**, chosen so 100% of auction money flows into the
existing GoFundMe campaign → the family's bank, with **no bank details collected on this
site and no card processing.** The flow:

1. A bidder wins → their dashboard shows **Pay** → a page that sends them to the GoFundMe
   donate page with the exact winning-bid amount to enter.
2. After donating, the winner taps **"I've donated on GoFundMe"** (payment → *submitted*).
3. An admin opens **Admin → Payments**, checks the GoFundMe donations for a matching one,
   and clicks **Confirm received** (or **Reject** with a reason). Confirming releases the
   winner's **collection details** and notifies both parties.

> Because GoFundMe has no API, matching is a manual step — the admin ties a GoFundMe
> donation to a winning bid. Ask winners to donate the **exact** amount so it's easy to match.
> (To switch to automatic card payments later, set `PAYMENT_PROVIDER=stripe` — the code is ready.)

### 2. Handing admin over to the family
1. The family member creates a normal account on the site (Sign in → Create account).
2. An existing admin opens **Admin → Team**, finds them, and clicks **Make admin**.
3. They can now approve/reject items, set each item's **starting bid and duration**,
   confirm payments, manage fulfilment, and resolve disputes.

The first admin is seeded from the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars on the host.
Set a strong `ADMIN_PASSWORD` before launch.

### 3. Email notifications (Resend)
Emails (won / outbid / payment confirmed / how to collect) send via **Resend** when configured;
otherwise they stay in-app only. To turn them on, set these env vars on the host:

- `RESEND_API_KEY` — from [resend.com](https://resend.com) (free tier available)
- `EMAIL_FROM` — a **verified** sender, e.g. `Valeria Auction <auction@yourdomain.org>`
  (Resend requires you to verify a domain to email arbitrary recipients; until then you can
  only email your own verified address.)
- `SITE_URL` — your public site, e.g. `https://savevaleria.netlify.app` (used for email links)

### 4. ⚠️ Before a real launch: turn on data persistence
On Render's **free** plan the server sleeps when idle and **its storage is wiped on restart**,
so items/bids/accounts reset and auctions may not end on time. This is fine for testing but
**not** for a live auction. To fix, either:
- **Render paid + disk (~$7/mo):** uncomment the `plan: starter` + `disk:` block in `render.yaml`
  and set `DATA_DIR=/var/data`; or
- **A managed database** (larger change — see §9).

> **New here? Two-minute start:**
> ```powershell
> cd server
> npm start           # no npm install needed — zero runtime dependencies
> ```
> Then open **http://localhost:4000/** (campaign site) and **http://localhost:4000/app/** (auction).

---

## Contents
1. [What this is](#what-this-is)
2. [Running it](#running-it)
3. [Architecture & separation of concerns](#architecture)
4. [The four subsystems](#subsystems)
5. [Payments & the GoFundMe question](#payments)
6. [Collection & delivery](#collection)
7. [Demo accounts](#demo-accounts)
8. [Editing the campaign site](#editing)
9. [Security & production hardening](#hardening)

---

<a name="what-this-is"></a>
## 1. What this is

| Layer | Tech | Notes |
|---|---|---|
| **Fundraising website** | Static HTML/CSS/JS (`/index.html`, `/css`, `/js`) | The original campaign site. "Donate Now" → GoFundMe everywhere. |
| **Auction application** | Vanilla JS multipage app (`/app`) | Browse, bid (live), submit items, dashboards, admin. |
| **API server** | Node.js, **zero runtime dependencies** (`/server`) | `http` + `crypto` + `fs` only. JSON data store. SSE for real-time bids. |
| **Payments** | Provider-agnostic layer | `mock` (local) or `stripe` (real). See [§5](#payments). |

Chosen for honesty and portability: it **runs today with one command, no build step and
no `npm install`**, and every boundary is isolated so you can scale each piece up
(Postgres, Stripe, a CDN, a worker) without rewrites.

<a name="running-it"></a>
## 2. Running it

Requires **Node.js 18+** (developed on 22).

```powershell
cd server
npm start                     # starts http://localhost:4000
```

Useful scripts (run from `/server`):

| Command | Does |
|---|---|
| `npm start` | Run the server (auto-seeds demo data on first run). |
| `npm run seed` | Seed the admin + demo data manually. |
| `npm run reset` | Delete `server/data` (DB + uploads) for a clean slate. |

Configuration is via environment variables (see `server/config.js`) — port, `AUTH_SECRET`,
`ADMIN_EMAIL`/`ADMIN_PASSWORD`, `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, etc.

<a name="architecture"></a>
## 3. Architecture & separation of concerns

```
valeria-fundraiser/
├── index.html, css/, js/         # (1) FUNDRAISING WEBSITE  — static, Donate Now primary
├── app/                          # (2) AUCTION APP          — browse/bid/submit/dashboard/admin
│   ├── auction.html  js/browse.js      · browse, search, filter
│   ├── item.html     js/item.js        · detail, gallery, live bidding (SSE)
│   ├── submit.html   js/submit.js      · step-by-step item donation + drag-drop photos
│   ├── dashboard.html js/dashboard.js  · bidder + donor dashboards
│   ├── admin.html    js/admin.js       · admin console
│   ├── checkout.html                   · payment (mock provider screen)
│   ├── login.html
│   └── js/api.js, js/app.js             · shared API client + UI (header, toasts, notifications)
└── server/                       # (3) API + (4) ADMIN/logic + PAYMENTS
    ├── index.js                  · HTTP entry: static serving + API routing + SSE
    ├── config.js                 · all settings (env-overridable)
    ├── seed.js                   · first-run admin + demo data
    ├── lib/
    │   ├── store.js              · JSON data store  ← swap for a real DB here
    │   ├── auth.js               · scrypt hashing + HMAC tokens
    │   ├── payments.js           · provider abstraction (mock | stripe)
    │   ├── finalize.js           · auction settlement / winner selection
    │   ├── realtime.js           · Server-Sent Events hub
    │   ├── notify.js             · in-app notifications (+ email hook stub)
    │   ├── uploads.js, serialize.js, http.js, router.js, static.js
    └── routes/
        ├── auth.routes.js  items.routes.js  auctions.routes.js
        ├── payments.routes.js   admin.routes.js
    └── data/                     · db.json + uploads/ (git-ignore in production)
```

The **fundraising site never imports auction code**, the **auction app talks to the
server only through `/api`**, **payments live behind one interface**, and **admin logic
is its own route module gated by role**. Each can be deployed or replaced independently.

<a name="subsystems"></a>
## 4. The four subsystems

### Item donation (donors)
- Step-by-step wizard (`/app/submit.html`) with **drag-and-drop multi-photo upload**,
  title, description, category, estimated value, condition, **optional reserve price**,
  full collection/delivery details, and contact info.
- New items enter **`pending`** and are invisible until an admin approves them.
- Donors track every item's status from **their dashboard**.

### Auction (bidders)
- Browse with **search, category filter, and sort**; cards show current bid, bid count
  and a live countdown.
- Item page shows a **photo gallery, full description, current high bid, bid count,
  bid history, and time remaining**, and places bids with **real-time updates via SSE**.
- **Anti-sniping**: bids in the final 2 minutes extend the auction by 2 minutes.
- **Notifications** (in-app, live) when you're **outbid** or **win**; a personal
  **dashboard** lists every auction you're in.

### Payments
- Winners pay their bid; on success the item becomes **`paid`** and both parties receive
  **collection/delivery instructions**. See [§5](#payments).

### Administration (`/app/admin.html`, role = admin)
- **Review queue**: approve (set starting bid + duration), reject (with reason), or edit.
- **All listings** management and **category** visibility.
- **Fulfilment**: mark items **shipped/collected**; **open/resolve disputes**.
- **Payments** overview and **fundraising statistics** (raised, awaiting payment,
  live auctions, bids, users).

<a name="payments"></a>
## 5. Payments & the GoFundMe question

**Can auction proceeds go directly into the GoFundMe campaign?**
**No — not automatically.** GoFundMe does **not** provide a public payments API that lets
a third-party application charge a card and deposit the funds into a specific campaign.
Donations can only be made through GoFundMe's own hosted flow. So a winning-bid charge
cannot land *inside* GoFundMe programmatically.

**What we do instead** — a provider-agnostic payment layer (`server/lib/payments.js`)
with two implementations behind one interface:

| Provider | When | Behaviour |
|---|---|---|
| **`mock`** (default) | Local dev / demo | Simulates checkout + confirmation, no real money, so the whole flow is testable end-to-end. |
| **`stripe`** | Production | Real, PCI-compliant **Stripe Checkout**. Card data never touches our server. Funds settle in the campaign's Stripe account; the organiser then **forwards the net proceeds to the GoFundMe** (documented and auditable). |

Enable Stripe with env vars — **no code changes**:
```powershell
$env:PAYMENT_PROVIDER = "stripe"
$env:STRIPE_SECRET_KEY = "sk_live_or_test_..."
$env:STRIPE_SUCCESS_URL = "https://yourdomain/app/dashboard.html?paid=1"
$env:STRIPE_CANCEL_URL  = "https://yourdomain/app/dashboard.html?paid=0"
```
For production, also implement the **webhook** (`POST /api/payments/webhook`) so fulfilment
doesn't depend on the browser redirect — the stub is in `payments.routes.js`.

The user experience is identical either way: **win → pay → receive collection details**.

<a name="collection"></a>
## 6. Collection & delivery

Every listing has a visible **Collection & Delivery** section covering location, whether
shipping is available (and its cost), collection times, special instructions, and the
donor's preferred post-auction contact method. **Full contact details are shared with the
winner only after payment is confirmed** — shown on the checkout confirmation and sent as a
notification to both the winner and the donor.

<a name="demo-accounts"></a>
## 7. Demo accounts

Seeded automatically on first run (change these before deploying):

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@example.com` | `admin1234` |
| Donor | `donor@example.com` | `password123` |
| Bidder | `bidder@example.com` | `password123` |

Three demo auctions are live and one item sits in the admin review queue so you can try
the approval flow immediately.

<a name="editing"></a>
## 8. Editing the campaign site

The static fundraising site is unchanged and still fully config-driven — see
`js/config.js` (campaign copy, goal, updates, FAQ) and the original notes below.
"Donate Now" points to the GoFundMe everywhere and remains the primary CTA.

<a name="hardening"></a>
## 9. Security & production hardening

This is a solid, working foundation. Before handling real money and personal data, do the
following (each maps to an isolated module, so none is a rewrite):

- **Database**: replace `lib/store.js` (JSON file) with Postgres/SQLite. The interface is
  ~10 methods. This also removes the single-process limitation.
- **Payments**: switch `PAYMENT_PROVIDER=stripe`, add the signed **webhook**, and never
  trust the client for payment status.
- **Auth**: move tokens to **http-only, Secure cookies**; consider a vetted JWT library;
  add rate limiting and email verification / password reset.
- **Uploads**: store photos in object storage (S3/GCS), validate/transcode images, and
  serve via a CDN. Currently capped at 8 photos × 5MB and validated by MIME + size.
- **Transport**: run behind HTTPS (a reverse proxy such as Nginx/Caddy) and add a strict
  Content-Security-Policy. Basic security headers are already set.
- **Notifications**: wire `lib/notify.js`'s `emailStub` to a real provider (Postmark,
  SendGrid, Twilio) so outbid/win/fulfilment messages are actually emailed/texted.
- **Real-time at scale**: back `lib/realtime.js` with Redis pub/sub to run multiple
  server instances.
- **Backups & PII**: back up `data/`, and treat donor/bidder contact details as personal
  data (retention, deletion, privacy policy).

Financial + legal note: running a paid charity auction may have tax, licensing, and
consumer-protection obligations depending on your jurisdiction. Confirm the arrangement
for moving proceeds to the family with GoFundMe and a local advisor before going live.
