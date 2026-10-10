# mStock Trading Dashboard

A local-only dashboard over the **mStock (Mirae Asset) TypeA trading API**. A React
front end talks to a small Express backend on the same machine, which proxies every
call to mStock and owns everything written to disk.

```
backend/        Express proxy + SQLite + snapshot store   →  node server.js   (port 5000)
test-project/   React 19 + Vite + Tailwind 4 + router 7   →  npm run dev
```

Those are the only two commands. The SQLite database and the snapshot folder create
themselves when the backend starts — there is no separate database step.

---

## Constraints you must design around

### The user cannot log in on demand

They do not have the device that receives the mStock login OTP. Anything gated behind
a successful sign-in is effectively **untestable** for them.

- Never propose "just log in and check" as the way to verify something.
- When a feature can only run authenticated, say plainly that it is unverified rather
  than implying it was tested.
- Prefer designs that degrade to something usable when signed out. The top-bar ticker
  is the model: real mStock quotes when authenticated, a no-auth fallback otherwise.

### Use the demo account to see the signed-in app

Sign in with **123 / 123 / 123** and any OTP. The gate lives in the **backend**
(`backend/lib/demoAccount.js`), so the front end sends identical requests either
way and the demo UI cannot drift from the real one — there is no `demoMode`
branch in any page.

Real for a demo session: routing, auth, sessionStorage, the activity log, the
ticker's Yahoo prices, CSV generation, every error path. Simulated: only what
would have come from the broker — funds, holdings, positions, orders, trades,
quotes, candles, instrument master.

This replaced an earlier hidden "Dashboard" link opening a login-free preview at
`/dashboard/preview`. That link, `PreviewPage.jsx`, the `demoMode` prop and
`demoData.js` have all been deleted — the demo account covers the same need
without a parallel UI to keep in sync. Do not reintroduce a `demoMode` branch in
any component; that is what made drift possible before.

### Never store or log credentials

The app handles live brokerage credentials. Password, API key, access token, refresh /
enc / public tokens and the OTP must never reach the database, the activity log, the
screen, or any third party.

The activity logger filters detail fields by **allowlist, not blocklist**
(`backend/lib/activityLog.js`), so a secret added later is excluded by default. After
touching logging, re-verify by posting fake secrets and grepping the raw `.db` file.

**`backend/.env` was committed, and is now untracked.** It was in commit
a50c307 with a real `MSTOCK_API_KEY` value. `.gitignore` had `.env` all along —
that does nothing for a file already in the index, which is exactly how this
survived. Fixed with `git rm --cached backend/.env` (the file stays on disk),
and the deletion is staged. Two consequences:

- **The mStock key in that commit should be treated as exposed** and rotated.
  Rewriting history would remove it, but only if the repo has never been pushed
  or shared.
- Payment keys now go in that same file, so check `git status` never shows it
  again. `backend/.env.example` is the committed template; it holds no values.

Storage is local by deliberate choice (SQLite via `node:sqlite`, built into Node 22 —
no dependency). Supabase and friends were considered and rejected: single user, single
machine, and it must work offline. The backend binds to `127.0.0.1` only.

---

## mStock API quirks

Confirmed against <https://tradingapi.mstock.com/docs/v1/typeA/> and a real 148k-row
scriptmaster snapshot. **Each of these has already caused a bug here.**

| Quirk | Consequence |
|---|---|
| Candle timestamps carry a **truncated offset** — `2026-08-03T09:15:00+05`, but India is +05:30 | `new Date()` + local formatting shifts every candle 30 min. Read the wall-clock fields literally. |
| Fund summary values are **strings**, including `AVAILABLE_BALANCE` | Coerce before arithmetic |
| Net positions are `{ net: [...], day: [...] \| null }` | `day` is easy to drop silently |
| `loserGainer` returns `status: true` (boolean), not `"success"` | Envelope checks must not assume the string |
| `getInstruments()` resolves to a **bare array**, not `{ status, data }` | Response readers must accept both shapes |
| The SDK's scriptmaster parser uses `line.split(',')` | Corrupts names containing commas ("LIFE INSURANCE CORP OF INDIA, THE"). The backend fetches and parses the CSV itself — `backend/lib/csv.js` |
| Quote symbols are `EXCHANGE:TRADINGSYMBOL-INSTRUMENTTYPE` (`NSE:ACC-EQ`) | …even though the scriptmaster stores the tradingsymbol bare (`ACC`) |
| `position_type` must be lowercase `day` / `overnight` | Uppercase is rejected |
| Historical `from`/`to` need `YYYY-MM-DD HH:MM:SS` | A bare date silently fails |
| `checksum: 'W'` in `generateSession` looks wrong but is what the official README prescribes | Leave it alone |

---

## Architecture notes

**Auth.** `authData` is the single source of truth; `isAuthenticated` derives from it.
The whole payload lives in `sessionStorage` so a refresh keeps you signed in. Provider
and hook are split (`context/AuthContext.jsx` + `context/auth.js`, same for theme)
because a file exporting both a component and a hook breaks Fast Refresh — editing the
hook would silently sign the user out.

**Database (finalised).** 15 tables, `backend/lib/schema.js` owns all of it and
is safe to re-run on every start. Groups: identity (`users`, `algorithms`,
`app_session`), running (`algo_config`, `algo_run`, `algo_order`, `algo_trade`,
`algo_position`), money (`payments`, `webhook_event`, `refund`, `invoice`),
operations (`event`, `audit_log`, `notification`). The old `user` / `plan` /
`subscription` / `payment` tables are gone — bundles with one shared expiry
could not express per-algorithm validity.

**Access is per-user-per-algorithm.** One `algo_<id>` column on `users` holds
the `YYYY-MM-DD` date it is valid until, or `'000000'` when never bought.
Editing `backend/lib/algoCatalogue.js` adds or DROPS the matching column on next
start (dropping discards every user's validity for it — logged loudly). The
`algo_` prefix is load-bearing: only `algo_*` columns are ever dropped, so a
typo cannot cost `email`. Dates are ISO so they compare and index in SQL —
`'000000'` sorts below every real date, so `>= today` excludes unowned ones for
free. Display as DD-MM-YYYY is a front-end concern.

**Money is always INTEGER PAISE.** Never floats in a financial column.

**Runs are bound to a browser session.** An algorithm only runs while the user
is connected. Enforced three ways, because any one alone leaks runs: logout and
session expiry stop that session's runs; a sweeper stops runs whose heartbeat
has been silent ~100s (3 missed 30s beats), catching a closed laptop; and
startup closes out anything left `running` from a previous process. Stop reasons
are recorded: `user`, `session_closed`, `session_expired`, `heartbeat_lost`,
`expired`, `credentials_lost`, `server_restart`, `admin`.

**Broker credentials live in process memory only** (`backend/lib/tokenVault.js`),
keyed by app session token — never on disk, never in the database, never logged,
dropped on logout and on restart. A run cannot start unless its session is
armed (`NO_CREDENTIALS`). This is why a restart stops every run, and that is
intended rather than unfortunate. Verified with canary values that neither the
api key nor the access token reaches `backend/data/`.

**The backend's own API** (everything not proxied to mStock). All of it except
`/api/algorithms` requires the `X-App-Session` header, checked by `requireUser`:

| Route | Purpose |
|---|---|
| `GET /api/algorithms` | catalogue + prices + validity days. Public |
| `GET /api/me` | the front end's one read: user, every algorithm with its validity, active runs, payments |
| `PATCH /api/me` | profile and `capital_paise`. `COALESCE` per column, so a partial body cannot wipe a field |
| `POST /api/purchase/checkout` | records an intent, grants nothing |
| `POST /api/purchase/webhook` | the ONE place access is granted. `express.raw`, signature over exact bytes |
| `POST /api/purchase/verify` | the checkout callback, HMAC-verified. **The only grant path that works on localhost** |
| `POST /api/purchase/failed` | records a dismissed or failed checkout; only moves `created` -> `failed` |
| `POST /api/purchase/mock-confirm` | stands in for the webhook; 403s unless the provider is `mock` |
| `GET /api/runs` · `POST /api/algo/start` · `POST /api/algo/stop` | run control |
| `POST /api/heartbeat` | "this tab is still open"; its reply carries the current run list |
| `GET`/`POST`/`DELETE /api/algo/config[/:algoId]` | the Configure sheet, per user per algorithm |
| `POST /api/log` · `GET /api/log/days` · `GET /api/log/day/:day` | activity log, scoped to the caller |

`/api/algo/start` answers **409 `ALREADY_RUNNING`** or **403 `NOT_ENTITLED`** /
`NO_CREDENTIALS`, and the front end branches on `code`, not on the message.

**Body parsers are registered before `express.json()`, and the order is
load-bearing in both directions.** Whichever parser runs first consumes the
stream.
- Needing a *bigger* limit: instrument compare (64 MB) and `/api/algo/config`
  (8 MB). Register them after the global parser and its 100 kB limit wins —
  the request dies as an HTML 413.
- Needing *no* parsing: `/api/purchase/webhook` takes `express.raw`, because
  the signature covers the exact bytes. Register it after `express.json()` —
  which matches `application/json`, exactly what Razorpay sends — and the
  route gets an empty buffer, the HMAC is computed over the wrong bytes, and
  **every genuine webhook is rejected as a forgery**. This has already happened
  once and the tests caught it.

**Configs are one row per user per algorithm** (`backend/lib/configs.js`).
Saving replaces rather than appends, because a run needs one unambiguous
answer to "what am I trading with". Clearing sets `is_active = 0` instead of
deleting — `algo_run.config_id` points at it, and a hard delete would strip
past runs of what they ran with. Unparseable `params` is treated as "nothing
saved", not as an error.

**Payments: two grant paths, both HMAC-verified.** Access is never granted
because the browser said a payment worked. It is granted by one of two signed
messages, each signed with a **different** secret:

| | Signed over | Secret | Route |
|---|---|---|---|
| Checkout callback | `order_id\|payment_id` | `RAZORPAY_KEY_SECRET` | `POST /api/purchase/verify` |
| Webhook | the raw request body | `RAZORPAY_WEBHOOK_SECRET` | `POST /api/purchase/webhook` |

Mixing the two secrets up is the obvious failure, and there is a test asserting
the key secret does **not** validate a webhook.

Both funnel into the idempotent `fulfilOrder()`, so whichever arrives first
grants the 30 days and the other is a no-op — verified by firing both at once
and asserting `daysLeft === 30`. That redundancy is not optional here: **a
webhook cannot reach `127.0.0.1`**, so on this machine the callback is the only
path that will ever fire. Once the backend is deployed somewhere public the
webhook becomes the reliable one, because it still arrives when a customer
closes the tab mid-payment.

Two more rules the code enforces and the tests cover:
- **Granting events are an allowlist** (`payment.captured`, `order.paid`), not
  "anything that is not a failure". `payment.authorized` means the money is
  held but NOT captured; granting on it would hand out access for a payment
  that can still fall through.
- **The order id used for verification comes from our own `payments` row**, not
  from the body the browser echoes back, and the row's `user_id` must match the
  caller. Otherwise one account could credit another's order.

`verifyWebhook` reads the order id from `payload.payment.entity` *or*
`payload.order.entity`, since `order.paid` carries it on the latter.

Signature comparison is `timingSafeEqual` behind a length guard — it throws on
a length mismatch, and an exception on a short signature is a 500 where a 400
belongs.

**Razorpay works on localhost.** Checkout opens from the BROWSER, not from the
server, so `localhost` is no obstacle — a common misreading. Only the *webhook*
cannot work locally, and `/api/purchase/verify` covers that case. So
`RAZORPAY_WEBHOOK_SECRET` is **optional**: `configured()` requires only the key
pair and reports `webhookReady` separately. Demanding all three would block a
setup that works end to end.

**Switching provider.** `PAYMENT_PROVIDER=mock` (default) simulates purchases
with no account and no keys. `PAYMENT_PROVIDER=razorpay` plus the key pair in
`backend/.env` uses real Checkout; see `backend/.env.example`.
`cd backend && npm run check-payments` creates one throwaway test order to prove
the keys work — it prints no secret, charges nothing and saves nothing. Startup prints
whether the provider is usable and shouts `LIVE KEYS — real money` for an
`rzp_live_` key. `createOrder` calls `POST https://api.razorpay.com/v1/orders`
with HTTP Basic auth via plain `fetch` — no Razorpay SDK, consistent with the
rest of the backend.

The browser side is `src/lib/razorpay.js`, which injects
`checkout.razorpay.com/v1/checkout.js` **on demand** rather than from
`index.html`: it is a third-party script on every page load for something most
visits never touch. It resolves to `paid` / `dismissed` / `failed` and never
decides anything itself — the signed payload goes to the backend to be verified.

**The trading engine (Arjuna).** One algorithm, implemented end to end as a
PAPER trader. Nothing is ever sent to mStock.

| File | Job |
|---|---|
| `lib/strategy.js` | the decision rules. PURE — no clock, no db, no network |
| `lib/priceFeed.js` | real seeded candles + live/simulated bars |
| `lib/paperBroker.js` | writes `algo_order` / `algo_trade` / `algo_position` |
| `lib/engine.js` | one tick loop per run, assembles the UI snapshot |
| `lib/market.js` | is NSE open? (IST, read via Intl, never the server clock) |

**The strategy** is a 5/15 moving-average crossover, long only. Buy when the
fast average rises THROUGH the slow one, sell when it falls back through, with a
−1.5% stop-loss and +3% take-profit checked first. Long only because shorting
needs margin and carries unlimited loss.

The CROSS is what matters, not "fast is above slow" — the latter stays true for
a whole trend and would re-fire a buy every bar. Detecting a cross needs the
PREVIOUS bar's averages, hence `warmupBars = slowPeriod + 1`. On a perfectly
flat series the two averages are exactly equal, so `<=` / `>=` in the cross
tests is deliberate: it catches the transition out of equality. Using strict
`<` would miss the entry entirely and never re-detect it.

**What is real and what is not.** This distinction is the whole credibility of
the demo and must never be blurred:

- REAL: the price seed (~73 real 5-minute candles per symbol from Yahoo), all
  order/trade/position rows, the weighted-average entry price, and every P&L
  figure.
- SIMULATED: bars after the seed when the market is shut, and the fills
  themselves. `broker_order_id` / `broker_trade_id` stay **NULL**, which is the
  marker of a paper fill and keeps the UNIQUE constraints free for real orders
  later. SQLite permits many NULLs in a UNIQUE column.
- Every bar is tagged `real` or `sim`, the counts are reported, and the chart
  draws a labelled rule where exchange data stops. Going live means replacing
  `paperBroker.fill()` with `placeOrder`; everything around it already works.

**The simulated walk is modelled, not arbitrary**, and getting it wrong hid a
real problem. The first version mean-reverted hard toward the seed price, and a
trend-following strategy must lose money in a mean-reverting series by
construction — Arjuna closed every trade at a loss, which looked like a broken
strategy but was a broken simulation. It now has:

- weak mean reversion (0.004) only to stop long-run runaway
- a per-symbol momentum drift that wanders and decays, so the series alternates
  between trending and choppy stretches (lag-1 autocorrelation ~0.17-0.25)
- fat tails (2% chance of a 4x bar) and rare news gaps (0.4% chance of 1.5-3.5%)

The gaps were added because without them the crossover always exits before a
1.5% drawdown and **the stop-loss never fires at all** — an advertised risk
control that never happens. Note they make results WORSE (win rate 48% vs 60%,
P&L +Rs 6.8k vs +Rs 9.8k on a 900-bar backtest), which is the check that they
were added for faithfulness and not to flatter the demo. Any future tuning
should pass that same test.

**Engines follow runs.** Keyed by run id, so the three existing stop mechanisms
(logout, session expiry, heartbeat sweeper) govern the engine too; the sweeper
calls `reconcileEngines(activeRunIds())` so an engine can never outlive its run
and keep paper-trading for a browser that has gone. A backend restart leaves no
engine, and `/api/algo/live` says so explicitly rather than showing an empty
chart.

Price series and the decision log live in memory (worthless after the run);
orders, trades and positions go to SQLite as they happen. A restart therefore
loses the chart but never a fill.

**Time is compressed:** a bar represents 5 minutes of market time and advances
every 2 seconds, so a session plays out in ~5 minutes. The UI states this.

**The live view** is `/dashboard/live`, polling `/api/algo/live` every 2s. ONE
endpoint on purpose — a chart from one request beside a P&L from another can
disagree by a bar, which reads as a bug. `PriceChart.jsx` is hand-rolled SVG
(three lines and some markers do not justify a charting dependency) using the
validated three-slot categorical palette, checked against the slate-900 panel it
renders on. Buy/sell markers carry a SHAPE and a label, never colour alone,
because the sell red and the slow-average aqua are a pair a colourblind reader
can lose. One y-axis: price and both averages are rupees.

**GST invoices** are schema-only for now, deliberately: `invoice` plus
`users.gstin` / `users.billing_state`. Place of supply decides CGST+SGST vs
IGST, and backfilling it later means re-asking every existing customer.

**Theming goes through semantic tokens, never shades.** `src/index.css` defines
one `@theme` block mapping Tailwind colour names onto CSS variables, and `:root`
/ `.dark` supply the two value sets. So `bg-panel`, `text-ink-2`,
`border-edge/60` and every Tailwind variant work normally while the VALUE flips
with the theme.

This replaced ~570 hardcoded `bg-slate-900` / `text-white` classes that had no
light counterpart, which is why the light theme only ever half-worked. **Do not
reintroduce a raw colour class.** The roles are:

| Token | For |
|---|---|
| `page` / `panel` / `raised` | surfaces, back to front |
| `edge` / `edge-strong` / `edge-hover` | borders, subtle to visible |
| `ink` / `ink-2` / `ink-3` | text, primary to muted |
| `good` / `bad` / `warn` / `info` / `brand` | profit, loss, caution, information, accent |
| `on-accent` | text sitting ON a solid accent fill |
| `shade` | drop-shadow colour |

Naming is by role because **a shade cannot be correct in both themes**:
slate-900 is a surface in the dark and ink in the light. The same applies to the
accents — `text-emerald-400` measures about 1.6:1 on white and simply cannot be
read, so `good` is the emerald-700 step in light and the 400 step in dark.
`on-accent` exists for the same reason in reverse: `bg-good` is dark green in
light and bright green in dark, so text on it must flip too.

Every token clears **WCAG AA for text** on both its surfaces (worst case 4.76:1,
light `ink-3` on a panel) — checked with a contrast script, not by eye. The
chart carries two validated palettes (light `#2a78d6/#eb6834/#1baf7a`, dark
`#3987e5/#d95926/#199e70`), each stepped and validated for its own surface
rather than one set dimmed for dark mode. SVG presentation attributes cannot
take `var()`, so `PriceChart` applies them through `style` instead of `stroke=`.

**The theme is chosen before the first paint.** An inline blocking script in
`index.html` reads the saved choice (or the OS preference) and sets `.dark` on
`<html>` before React mounts; without it every load flashed white. It
deliberately duplicates the small initialiser in `ThemeContext`, which persists
to `localStorage` — the old version was a hardcoded `useState(true)`, so the app
always opened dark and a switch to light was undone by the next refresh.

**Two logging choke points.** Every backend call goes through `postApi()` in
`lib/mstockApi.js`, and every navigation goes through the router. Instrumenting those
two covers most of the activity log for free, including endpoints added later. The
ticker deliberately bypasses `postApi` — polling every 30s would bury the log.

**The browser logger is authenticated now.** `/api/log` needs `X-App-Session`,
so `src/lib/activityLog.js` reads the token out of the same sessionStorage key
`AuthProvider` writes — it is a module singleton created before React mounts and
cannot use the auth context. Events logged before sign-in are **held**, not
posted, and go out attributed on the first flush after login (capped at 200, so
a tab parked on /login cannot grow without bound). Signing out calls `flushNow()`
*before* clearing storage, or the `logout` event itself would never be sent.
Forget any of this and the activity log silently goes empty, since a failed
flush is swallowed by design.

**Data on disk** (all under `backend/data/`, gitignored):
- `activity.db` — SQLite activity log. `day` is stored as its own **local** date
  column; querying by UTC would split an IST trading day at 05:30.
- `instruments/instruments-YYYY-MM-DD.csv` — one scriptmaster snapshot per day
  (~11 MB, ~148k rows), captured automatically after a successful login, skipped if
  today's already exists. Written to a `.partial` file and renamed, so a crash can't
  leave a truncated file that looks complete.

**Reading the activity log:** `cd backend && npm run log` (day summary),
`node query-log.js YYYY-MM-DD`, or `--sql "SELECT ..."`. Read-only, SELECT only.

---

## Working conventions

After any front-end change, both must be clean:

```bash
cd test-project && npx eslint src && npx vite build && rm -rf dist
```

The lint config enforces **`react-hooks/set-state-in-effect`** strictly. Never call
`setState` synchronously in an effect body — put it in a promise callback, an observer
callback, or an event handler. This has come up repeatedly.

Verify by running things and showing the output, not by asserting they work.

---

## Current state

Everything below is **uncommitted** on `main` (last commit: "made the version 2 changes").

Recently completed:

1. `/dashboard` index is `HomePage` -> renders `ApiConsole` with all the API buttons.
2. `ApiResponseView` formats every endpoint, each with a record count and a
   "Show raw API response" toggle.
3. Instrument snapshots + diff - **added / deleted / changed**, each downloadable
   as CSV. `changed` ignores `last_price` on purpose.
4. Activity log - SQLite, browsable by day, and **scoped per user**: admins see
   everybody, everyone else only themselves.
5. Top-bar ticker - `LIVE` / `DELAYED` / `STALE` / `SAMPLE`, with `[ticker]`
   logging per symbol.
6. Sidebar: **Choose Algo** and **Stop Algo**; status reads "Algo trading is
   Running" / "Idle".
7. **The 15-table schema is finalised and wired end to end** - see the API table
   above. Per-algorithm access, session-bound runs, in-memory credential vault,
   two-phase purchase, per-algorithm configs.
8. **The front end matches it.** `lib/billingApi.js` is gone, replaced by
   `lib/accountApi.js`; plans and bundles are gone with it.
   - `hooks/useMachine.js` mirrors **server** run state and sends the 30s
     heartbeat. It used to be a local `useState(false)`, which could claim
     "Running" after the backend had stopped everything.
   - `lib/dates.js` renders the backend's ISO dates as DD-MM-YYYY. It parses by
     splitting the string, never `new Date()` - the same habit that shifted
     every candle by 30 minutes.
   - `PlansPage` is now a per-algorithm store with payment history. There are no
     bundles: each algorithm carries its own expiry, and a bundle would need one
     shared date, which is what the schema was redesigned away from.
   - `ConfigurePage` and `AmountPage` persist to the server (debounced, 1200 ms
     and 800 ms) instead of losing everything on a refresh.
   - `AuthContext.logout()` now calls `POST /api/logout`, so signing out stops
     that session's runs and drops its credentials rather than merely hiding a
     session that was still trading.

### Verified by running it

With the demo account (123/123/123), against a live backend:

- 25/25 checks on the exact endpoints and field names the front end reads -
  buy -> valid, double-start 409, unowned 403 `NOT_ENTITLED`, heartbeat keeps a
  run alive, capital and config survive a reload, a capital-only `PATCH` leaves
  name and email intact.
- Webhook replay is idempotent: a second `mock-confirm` on the same order
  answers 200 with `granted: false, alreadyProcessed: true` and grants no
  second 30 days.
- Two users cannot see each other's activity; an admin read sees both.
- A run whose heartbeat is backdated past ~100s is swept with reason
  `heartbeat_lost`; logout stops runs with `session_closed`.
- A planted `password` / `access_token` / `api_key` in a log detail is stripped
  by the allowlist, and no canary appears anywhere under `backend/data/`.
- `npx eslint src` clean, `npx vite build` succeeds.

Razorpay, with no Razorpay account — payloads signed with a known test secret,
and the HMACs cross-checked against Python's `hmac` so the code cannot validate
its own mistake (18 + 26 checks):

- Correct callback signature grants; a forged one is refused, grants nothing and
  marks the order failed; a replay returns `alreadyProcessed` and does not move
  the expiry.
- One account cannot credit another's order (403); verify needs a session (401).
- `payment.captured` grants; `payment.authorized` is recorded and grants
  nothing; `payment.failed` marks the order; a retried delivery with the same
  `x-razorpay-event-id` is answered 200 as a replay; a bad signature and a body
  tampered with after signing are both 400.
- Webhook and callback fired simultaneously on one order grant exactly 30 days.
- Checkout with unusable keys surfaces Razorpay's own message
  ("Authentication failed") as a 502, not a crash or a bare "fetch failed".

**Unverified:** a real `createOrder` against Razorpay (needs real keys) and the
hosted Checkout window itself (needs a browser and real keys). Everything
between those two — order row, signature verification, granting, idempotency —
is covered above.

**Unverified:** everything behind a *real* mStock login, since the OTP device is
not available. The demo account exercises every path except the broker calls
themselves.

### Demo and real logins are the same code path (verified)

The question "does this work for real credentials too?" has been checked, not
assumed. Every `is_demo` branch in the backend lives in exactly two places:

1. **`/api/login` + `/api/verify`** — identity creation. Both paths then call the
   *identical* `upsertUser` -> `createSession` -> `rememberCredentials` sequence;
   only the source of the access token differs.
2. **The broker-data routes** (`/api/portfolio/*`, `/api/market/*`,
   `/api/instruments/*`) — a demo token returns simulated broker data. **This is
   the one intended difference**, and it is the whole point of the demo account.

Nothing in `purchases.js`, `runs.js`, `configs.js`, `payments.js` or the
entitlement code reads `is_demo`, and the front end has no demo branch at all
(`grep -rn "isDemo\|demoMode" test-project/src/` returns nothing). So buying and
enabling an algorithm cannot behave differently for a real user.

Confirmed by running a throwaway `is_demo = 0` user with **no email and no
phone** (mStock does not always return them) through the whole flow — 19 checks:
`/api/me`, a REAL Razorpay order, a signed callback granting access,
`users.algo_hanuman` getting the date, start/stop, and an unbought algorithm
still refused. Plus 8 checks that a **re-login preserves purchases**: the
`UNIQUE (broker, broker_user_id)` + `ON CONFLICT DO UPDATE` reuses the row and
deliberately does not touch the `algo_*` columns or `capital_paise`, so signing
in again cannot wipe what someone paid for.

**Testing gotcha that looks like a bug.** The credential vault is *process*
memory. A test that calls `rememberCredentials()` in its own process and then
hits `/api/algo/start` over HTTP gets **403 `NO_CREDENTIALS`**, because the
server is a different process. That is the design working. The useful signal is
*which* code comes back: `NO_CREDENTIALS` means entitlement passed and only the
vault was missing; `NOT_ENTITLED` means the purchase never registered. To
exercise a run end to end, either call `startRun()` in-process or arm the
server's vault by logging in through `/api/verify`.

### `trading_enabled` is a kill switch that does nothing

`users.trading_enabled` defaults to **0**, is reported to the front end as
`tradingEnabled`, and is **never checked anywhere**. `startRun()` gates on
entitlement, an existing run, and the vault — not on this column. `users.status`
IS enforced (`requireUser` 403s a suspended account), so the inconsistency is
easy to miss.

A column named "master kill switch" that grants no protection is worse than no
column. Either enforce it in `startRun()` — which blocks **every** user until
it is flipped, since the default is 0 — or drop it. Needs a decision, which is
why it has been left alone rather than quietly switched on.

### Watch out

**Only ONE backend can hold port 5000, and a clash is silent-looking.** A second
`node server.js` prints the whole startup banner and *then* dies, because
Express's listen callback runs before the bind error surfaces. From the terminal
that reads as "it starts and stops immediately" with no cause. There is now an
explicit handler on `server.on('error')` that leads with "IGNORE THE LINES
ABOVE" and names the fix, so this explains itself.

Two distinct failures have come from this, both costing real time:
- a **stale** server answering with old code, which looked like "my new routes
  404" (the 413 fix, then again with the purchase routes);
- an **agent-started background** server holding the port so the user's own
  foreground copy could not start.

`netstat -ano | findstr "LISTENING" | findstr ":5000"` then
`taskkill /F /PID <pid>`.

**If you are an agent working on this: do not blanket-kill port 5000.** The user
very likely has the server running in their own terminal, and killing it mid-session
looks like a crash to them. Check for a listener first, identify whose it is
(`Get-CimInstance Win32_Process` shows command lines), and prefer asking over
killing. Leave the port free for them rather than parking a background copy on it.

### Next

**Razorpay is implemented** — real `createOrder`, hosted Checkout, and both
verified grant paths. What remains is not code:

1. A Razorpay account and **test** keys (key id + key secret only) in
   `backend/.env`; see `.env.example`. Verify with `npm run check-payments`.
2. `PAYMENT_PROVIDER=razorpay`, restart the backend, buy on `/dashboard/plans`.
   This works on localhost.

   Use a **domestic** test card. A test account has international payments
   disabled, so the familiar generic Visa `4111 1111 1111 1111` is refused with
   "International cards are not supported" — it is an international BIN and is
   not in Razorpay's domestic list at all. Working ones:
   `4100 2800 0000 1007` (Visa debit), `5555 5100 0008 1006` (Mastercard
   credit), `6527 6589 0000 1005` (RuPay). Any future expiry, any CVV. On the
   mock bank page that follows, an OTP of 4-10 digits succeeds and fewer than 4
   fails, or use the Success / Failure buttons.
3. The webhook only when the backend is public — a tunnel
   (`cloudflared tunnel --url http://localhost:5000`) or a deployment. Subscribe
   it to `payment.captured`, `payment.failed`, `order.paid`. Purchases work
   without it; see the two-grant-paths note above.

Still open afterwards: refunds (`refund` table exists, nothing writes to it) and
GST invoice generation.

### Open questions the user has not answered

- Amount page seeds from `AVAILABLE_BALANCE` but stays editable (25/50/75/All
  presets) and now saves to `users.capital_paise`. Still unconfirmed whether it
  should be read-only.
- Holdings "Value" includes `t1_quantity`. Unconfirmed.
- Order placement / modify / cancel are **deliberately not exposed** - read-only
  by design. Needs an explicit decision before adding, since it moves real money.
  This is also why `algo_run` currently records runs without placing orders: the
  run lifecycle is real, the trading engine inside it is not written yet.
- Bundles were asked for earlier ("add some plans there") and then designed out
  by the per-algorithm expiry model. `PlansPage` sells algorithms individually.
  Worth confirming that is what is wanted.
- **Five algorithms were deleted** (Hanuman, Ganesha, Lakshmi, Shiva,
  Saraswati). They were names with no strategy behind them. Their `algo_*`
  columns were dropped on the next start, logged loudly; nobody owned any of
  them, so nothing was lost. Re-adding one is an entry in
  `backend/lib/algoCatalogue.js` plus a strategy module.
- Brokerage and slippage are deliberately NOT modelled — an invented 0.03%
  would look like a real cost model while being fiction. P&L is gross, and the
  UI says so.
- Trading holidays are not handled: `market.js` has hours and weekends but no
  exchange calendar. On a holiday it reports "open" and the feed simply finds no
  new prices, which it already labels as simulated. Needs a real calendar before
  anything trades for money.
- GST invoicing is schema-only; `invoice` rows are not generated yet.
