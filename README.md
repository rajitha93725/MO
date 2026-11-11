# MO Cafe & Villa – Operations

Mobile-first Next.js app for the daily operations of MO Cafe & Villa: orders, costs, profit, cash and bank, to-dos.
Currency is LKR (whole rupees). The data lives in a Google Sheet, one tab per entity.

- **Brand:** the "MO" graffiti logo (white letters, black outline) on Vermilion `#E8411E`. Files: `public/logo.svg` and `src/app/icon.svg`.
- **Stack:** Next.js 15 (App Router, server actions), NextAuth (Google sign-in), Google Sheets REST API through a service account, Recharts, Vitest.

---

## 1. Quick look without Google (demo mode)

```bash
npm install
# PowerShell:  $env:DATA_BACKEND="memory"; $env:AUTH_DISABLED="true"; $env:DEMO_TODAY="2027-01-20"; npm run dev
DATA_BACKEND=memory AUTH_DISABLED=true DEMO_TODAY=2027-01-20 npm run dev
```

Open http://localhost:3000. Demo mode uses in-memory sample data and resets on every restart. Set `DEMO_ROLE=staff` to see what staff see.

## 2. Setup with Google Sheets

### 2.1 The spreadsheet
The app uses a single sheet: **MO**, `https://docs.google.com/spreadsheets/d/17WZm1xvPyjg6o4B6RkjjJpByzhnO0qvTVOkgeL8w_fU`.
Its tabs, headers and starting data are already set up. Sample data is never written to it; that exists only in demo mode (section 1).

### 2.2 Service account (the app's server reads and writes the sheet with it)
1. Open https://console.cloud.google.com and create a project, for example `mo-cafe-ops`.
2. Go to **APIs & Services → Library**, search for **Google Sheets API**, and click **Enable**.
3. Go to **IAM & Admin → Service Accounts → Create service account**, name it `mo-sheets` and finish. It needs no project roles.
4. Open the service account, go to **Keys → Add key → Create new key → JSON**, and download the file. Keep it private and never commit it.
5. In the MO spreadsheet, click **Share**, paste the service-account email (`mo-cafe-villa@mo-villa-and-cafe.iam.gserviceaccount.com`) and give it **Editor** access.

### 2.3 Google sign-in (OAuth client for the partners and staff)
1. Go to **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name "MO Cafe & Villa" and your email, and add the scopes `email`, `profile` and `openid`.
   While the app is in **Testing**, add every user's Gmail under **Test users**. Alternatively, click **Publish app**.
2. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorised JavaScript origin: `http://localhost:3000`, plus your production URL later.
   - Authorised redirect URI: `http://localhost:3000/api/auth/callback/google`, plus `https://<your-domain>/api/auth/callback/google` later.
3. Copy the **Client ID** and **Client secret**.

### 2.4 Environment
Copy `.env.example` to `.env.local` and fill it in:

| Variable | Value |
|---|---|
| `DATA_BACKEND` | `sheets` |
| `GOOGLE_SHEET_ID` | `17WZm1xvPyjg6o4B6RkjjJpByzhnO0qvTVOkgeL8w_fU` (already set in `.env.local`) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key, in double quotes, keeping the `\n` sequences |
| `NEXTAUTH_URL` | `http://localhost:3000` (or the production URL) |
| `NEXTAUTH_SECRET` | a long random string (`npx auth secret` or `openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 2.3 |
| `BOOTSTRAP_PARTNER_EMAILS` | `rajitha93725@gmail.com`. These emails can always sign in as a partner. |
| `OWNER_EMAILS` | `rajitha93725@gmail.com`. The owner(s): the only accounts that see MO Villa, Cash & bank, Settings and Users. Falls back to `BOOTSTRAP_PARTNER_EMAILS` when empty. |

### 2.5 Tabs and seed data (already done for the MO sheet)
```bash
npm run setup:sheet   # all tabs + Menu (54 items), Settings, Targets, Fixed_Costs, Users. No sample data.
```
You only need this to rebuild a new or blank sheet. It's safe to re-run: a tab that already has data rows is left unchanged.

### 2.6 Run
```bash
npm run dev            # development
npm run build && npm start   # production
```
Sign in as Rajitha, then go to **More → Settings → Users & roles** and add Janith (`partner`) and the staff (`staff`).
Under **Cash & bank**, add an **Opening balance** for Petty cash and for Bank.

### 2.7 Deploy (later)
The app runs on any Node 18+ host. On **Vercel**: import the repo, add the same environment variables (set `NEXTAUTH_URL` to the Vercel URL), and add that URL's callback to the OAuth client. Don't set `AUTH_DISABLED` or `DEMO_TODAY` in production.

---

## 3. Roles

| Role | Can do |
|---|---|
| **owner** (a partner listed in `OWNER_EMAILS`) | Everything, including **MO Villa**, **Cash & bank**, **Settings** and **Users** |
| **partner** | The cafe: menu, fixed costs and payments, cafe profit and their cafe share, cafe capital, to-dos, and edit or delete any cafe entry. **No villa information**: no villa page or cards, no villa profit or shares, no booking-linked to-dos, no MO Villa or shared capital, and no Cash & bank (villa money moves through the same accounts) |
| **staff** | Add orders and daily costs, and view the menu, daily sales and to-dos. No profit, cash, settings or editing of existing entries |

Roles are checked on the server inside every page (`requirePage`) and server action (`requireAction`), not only hidden in the UI. Sign-in is limited to the Users tab plus `BOOTSTRAP_PARTNER_EMAILS`. The owner comes from the server config (`OWNER_EMAILS`), never from the sheet, so no one can give themselves owner access from inside the app.

---

## 4. Tabs and columns

Every tab has a header row. The app reads columns **by header name**, so you can reorder columns, but don't rename them.
Dates are `YYYY-MM-DD`, months are `YYYY-MM`, and amounts are whole rupees.

### Menu
| Column | Meaning |
|---|---|
| item_id | `B01`… Breakfast, `A01`… All day dining, `D01`… Drinks |
| category | Breakfast / All day dining / Drinks |
| sub_category | e.g. Crepes, Juice, Kottu |
| item_name | Name shown on the order screen |
| unit_cost | Ingredient cost per portion (Rs) |
| selling_price | Menu price (Rs) |
| active | yes / no. Inactive items are hidden from order entry. |

### Menu_Price_History
Written automatically whenever a partner changes an item's cost or price.
`history_id, item_id, effective_date, old_cost, old_price, new_cost, new_price, changed_by`

### Orders (one row per order line)
| Column | Meaning |
|---|---|
| order_id | Shared by all lines of one order |
| date, time | When saved (cafe timezone) |
| meal | Breakfast / Lunch / Dinner |
| item_id, item_name | Snapshot from the menu |
| qty | Whole number > 0 |
| unit_price, unit_cost | **Snapshot** of the menu price and cost at save time, so later menu changes don't alter history |
| line_total | qty × unit_price |
| line_cost | qty × unit_cost |
| payment_method | Cash / Card / Bank transfer |
| notes | Free text |
| line_id | Unique key of the row |
| entered_by | Email of the user who saved it |

### Daily_Costs
`cost_id, date, category (list from Settings), description, amount, paid_from (Petty cash / Bank), paid_by (Business / Rajitha / Janith), notes, entered_by`
Costs paid **personally** by a partner (`paid_by` ≠ Business) count in profit but don't reduce business cash. They're shown as "owed to partner".

### Fixed_Costs
`fixed_id, name, amount, frequency (Monthly / One-time), start_month, end_month (optional), month_paid (one-time), paid_from, notes`

### Fixed_Payments (planned vs actual)
`payment_id, fixed_id, month, amount, paid_date, paid_from, notes`. Each row records that a monthly fixed cost was paid for a month; "Mark paid" on the Fixed costs screen creates it.

### Cash_Movements
`movement_id, date, account (Petty cash / Bank), type, amount, notes, moved_by (Rajitha / Janith / Staff: who moved the money, required)`
Types: Opening balance, Top-up, Withdrawal (these use `account`), and Transfer petty→bank, Transfer bank→petty, Cash sales deposit (petty→bank). The direction of those three is fixed.

### Todo
`task_id, task, owner (Rajitha / Janith / Staff), due_date, priority (High / Medium / Low), done (checkbox), done_date, booking_id (optional link to a MO_Villa booking)`

### Settings (key / value / description)
| key | default | used for |
|---|---|---|
| opening_month | 2026-12 | first month in the profit table and YTD |
| closed_months | 6,7,8,9,10 | greyed months: no monthly fixed costs, plan = 0 |
| food_cost_target_pct | 40 | menu highlight and dashboard |
| partners | Rajitha:50,Janith:50 | cafe profit split (must total 100) |
| villa_partners | Rajitha:100 | villa profit split (must total 100) |
| petty_low_threshold | 20000 | low petty-cash warning |
| one_time_allocation | full | `full` = all in month paid; `spread` = over N open months |
| one_time_spread_months | 6 | N for spread |
| fixed_profit_basis | actual_when_paid | `planned` always uses the plan amount; `actual_when_paid` uses the recorded payment when one exists |
| cost_categories | Food & ingredients,… | Daily cost category list |
| food_check_categories | Food & ingredients,Drinks & beverages | the "actual purchases" side of the food cost check |
| todo_amber_days | 3 | amber window for to-dos |
| timezone | Asia/Colombo | what "today" means |

### Targets (planned targets per period, part of Settings)
`period, start_month, end_month, planned_monthly_sales, planned_net_profit, daily_target_breakfast, daily_target_lunch, daily_target_dinner`
Seeded from your Target Sales plan: First 3 months (Dec 2026–Feb 2027), Next 3 months (Mar–May 2027) and the 2028 season (Nov 2027–May 2028).

### Users
`email, name, role (partner / staff)`

---

## 5. Formulas (also shown in the UI behind every **i**)

For each month:
- **Sales** = Σ Orders.line_total
- **Food cost (menu-based)** = Σ Orders.line_cost
- **Daily costs** = Σ Daily_Costs.amount
- **Fixed costs** = monthly fixed costs active that month (start ≤ month ≤ end, not a closed month) + one-time costs allocated to that month
- **Total costs** = Daily costs + Fixed costs
- **Net profit** = Sales − Total costs. Menu-based food cost isn't subtracted again, because real purchases are already in Daily costs.
- **Net margin** = Net profit ÷ Sales, shown as "-" when Sales = 0
- **Partner share** = Net profit × partner % (Settings: `partners`). Rounded to whole rupees; any remainder goes to the last partner so the shares always add up exactly.
- **Food cost check** = actual Food & ingredients + Drinks purchases − menu-based food cost. A positive result means waste, stock build-up or price changes.
- **YTD** = Jan (or the opening month, if later) through the current month

Cash:
- **Petty cash** = opening + cash sales + top-ups + transfers bank→petty − daily and fixed costs paid from petty cash by the Business − transfers petty→bank − cash sales deposits − withdrawals
- **Bank** = opening + card and bank-transfer sales + top-ups + transfers petty→bank + cash sales deposits − bank-paid daily and fixed costs − transfers bank→petty − withdrawals
- Monthly fixed costs reduce cash only once they're recorded as paid. One-time costs reduce cash in `month_paid`.

All of these live in `src/lib/calc/` as pure functions. No numbers are hard-coded; every threshold and rate comes from the Settings and Targets tabs.

---

## 6. Code map

```
src/lib/types.ts            domain types
src/lib/settings.ts         Settings parsing + seed defaults
src/lib/calc/               pure calculations (profit, fixedCosts, cash, daily, dates, money)
src/lib/data/schema.ts      tab names + columns (single source of truth)
src/lib/data/store.ts       DataStore interface  ← swap point
src/lib/data/sheetsStore.ts Google Sheets implementation
src/lib/data/memoryStore.ts in-memory implementation (demo/tests)
src/lib/data/index.ts       getStore(): picks the backend
src/lib/data/repo.ts        typed repository used by pages/actions
src/app/actions.ts          server actions (validation + role checks)
src/app/*                   screens
scripts/setup-sheet.ts      creates tabs + seeds
tests/                      unit tests (profit, cash, daily, validation, CSV)
```

**Moving to Supabase or Firebase:** create tables named as in `schema.ts` with the same columns, implement the five methods of `DataStore` (`list`, `insert`, `update`, `remove`, `replaceAll`), and return the new store from `getStore()`. The UI and calculations stay the same.

## 7. Tests

```bash
npm test
```
95 tests cover the profit formulas, fixed-cost allocation (monthly, closed months, one-time full or spread), planned vs actual, partner split and rounding, YTD, cash and bank balances, transfers, the low-cash warning, the daily view, to-do urgency, validation, CSV escaping, the Sheets store, and MO Villa (nights, commission and payout, splitting stays across months, double booking, monthly villa profit, occupancy, per-room profit, cash and combined profit).

---

## 8. MO Villa

Screen: **More → MO Villa** (owner only), with four views: **Bookings**, **Costs**, **Summary** and **Calendar**.

### MO_Villa tab (one row per booking or villa cost)
| Column | Booking | Cost |
|---|---|---|
| record_id, record_type | `VB-…`, Booking | `VC-…`, Cost |
| date_entered | date the booking was entered | **date of the cost** |
| room_number, room_type | from Settings `villa_rooms` | |
| platform, booking_ref, guest_name, guests | ✓ | |
| check_in, check_out, nights | nights = check_out − check_in (calculated) | |
| status | Confirmed / Completed / Cancelled | |
| total_price | what the guest pays (for Cancelled: the cancellation fee, or 0) | |
| commission_pct, commission_amount | % defaults from the platform; amount = total × %, can be overridden | |
| booking_costs | per-stay out costs (cleaning, laundry, breakfast, transfers) | |
| net_payout | total − commission − booking costs (calculated) | |
| payout_status, payout_date, received_to | Pending / Received, date, Bank / Petty cash | |
| cost_category, cost_description, cost_amount | | ✓ |
| cost_room | | a room or `All rooms` |
| paid_from | | Bank / Petty cash |
| notes | ✓ | ✓ |

### Villa settings (Settings tab)
| key | default |
|---|---|
| villa_rooms | `Room 1:Double:0,Room 2:Double:0,Room 3:Double:0,Room 4:Double:0` (room:type:base price per night, 0 = none) |
| villa_platforms | `Airbnb:15,Booking.com:15,Agoda:18,Direct:0,Other:0` (name:default commission %) |
| villa_cost_categories | Bedsheets & linen, Toiletries (shampoo, soap), Cleaning supplies, Repairs & maintenance, Utilities, Other |
| villa_allocation | `nights` = split across months by nights stayed; `check_in` = count everything in the check-in month |

### Villa formulas
- **Monthly split:** with `nights`, a stay from 30 Jan to 2 Feb counts 2/3 in January and 1/3 in February. Gross, commission and booking costs are split the same way, in whole rupees that always add up exactly.
- **Cancelled bookings** count only when a cancellation fee is in `total_price`, all in the check-in month. They never occupy nights or block a room.
- **Double booking:** saving is blocked when the dates overlap a Confirmed or Completed booking for the same room. Checking in on another guest's check-out day is allowed.
- Gross bookings = Σ total_price · Commission = Σ commission_amount · Booking costs = Σ booking_costs · Villa costs = Σ cost_amount of Cost rows dated in the month
- **Villa net profit** = Gross − Commission − Booking costs − Villa costs
- **Occupancy** = booked nights ÷ (number of rooms × days in month), overall and per room
- **Average price per night** = revenue of the nights stayed in the month ÷ booked nights
- **Room net profit** = the room's bookings net − its own costs − an equal share of "All rooms" costs. The rooms add up to the villa total.

### Links to the rest of the app
- **Cash:** a booking marked **Received** adds its `net_payout` to `received_to` on `payout_date`. Villa costs reduce the `paid_from` account on their date.
- **Dashboard:** villa net profit, occupancy, check-ins in the next 7 days, pending payouts, and total profit (Cafe + Villa).
- **Profit page:** "Business profit: Cafe + Villa" (owner only). **Partner share = Cafe net profit × cafe % (`partners`) + Villa net profit × villa % (`villa_partners`).** With the defaults, Rajitha gets 50% of cafe profit plus 100% of villa profit, and Janith gets 50% of cafe profit.
- **To-do:** each task can be linked to a booking.

---

## 9. Opening budget & partner capital

Screen: **More → Capital** (partners; only the owner sees MO Villa and shared ("Both") entries).

**Capital tab:** `capital_id, date, partner, business (MO Cafe / MO Villa / Both), description, amount, paid_into (Bank / Petty cash / Paid directly), notes`

- Shows each partner's total contribution and **share of capital** (e.g. Rajitha 95% / Janith 5%), overall and per business.
- **Tracked only:** capital does **not** change the profit split. Profit stays at the Settings split (50/50), because Rajitha contributes money and Janith contributes cooking and management.
- `paid_into` = Bank or Petty cash raises that balance on the Cash page. **Paid directly** (straight to a supplier) is recorded but doesn't touch the business accounts.
- Record money a partner puts into the business here, not as a cash "Opening balance", so it isn't counted twice.
