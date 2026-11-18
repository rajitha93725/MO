# MO Cafe & Villa – Operations

Mobile-first Next.js app for the daily operations of MO Cafe & Villa: orders, costs, profit, cash and bank, to-dos.
Currency is LKR (whole rupees). The data lives in Supabase (Postgres), one table per entity.
The public menu card is at **/menu** (no sign-in); everything else needs sign-in.

- **Brand:** the "MO · Stay · Eatery" logo (white letters, black outline) on red `#D7141A`. Original: `logo/MO logo, option 3@2x.png`; app copies: `public/logo.png` (header/login), `src/app/icon.png` (browser tab) and `src/app/apple-icon.png` (phone home screen).
- **Stack:** Next.js 15 (App Router, server actions), NextAuth (Google sign-in or username + password), Supabase REST API with the secret key, Recharts, Vitest.

---

## 1. Quick look without a database (demo mode)

```bash
npm install
# PowerShell:  $env:DATA_BACKEND="memory"; $env:AUTH_DISABLED="true"; $env:DEMO_TODAY="2027-01-20"; npm run dev
DATA_BACKEND=memory AUTH_DISABLED=true DEMO_TODAY=2027-01-20 npm run dev
```

Open http://localhost:3000. Demo mode uses in-memory sample data and resets on every restart. Set `DEMO_ROLE=staff` to see what staff see.

## 2. Setup

### 2.1 Database (Supabase)
Project `wlxjvghrlspurnslimkx` (Singapore). Tables are created by `supabase/schema.sql`: paste it into Supabase → **SQL Editor** → **Run**.
It is safe to run again and only adds missing tables and columns. After changing `src/lib/data/schema.ts`, run
`npm run supabase:sql` and run the new file again.

Row level security is on with no policies and the public (anon) key has no access: only the app's server, using the
**secret** key, can read or write. Access rules (owner / partner / staff, villa hidden from partners) live in the app.
Edit data in the app, or in Supabase → **Table Editor** if you must. Supabase makes daily backups.

### 2.2 Sign-in
- **Username + password:** the owner sets them in **Settings → Users & roles**. Someone without Google can leave the email
  empty (it becomes `<username>@mo.local`). Passwords are stored as scrypt hashes. After 5 wrong tries a login is locked for
  10 minutes.
- **Google:** OAuth client in Google Cloud → **APIs & Services → Credentials**. Redirect URI
  `https://<your-domain>/api/auth/callback/google` (and `http://localhost:3000/...` for local). While the consent screen is
  in **Testing**, add every Google user under **Test users**.

### 2.3 Environment
Copy `.env.example` to `.env.local` and fill it in:

| Variable | Value |
|---|---|
| `DATA_BACKEND` | `supabase` (or `memory` for the demo) |
| `SUPABASE_URL` | `https://wlxjvghrlspurnslimkx.supabase.co` |
| `SUPABASE_SECRET_KEY` | the project's **secret** key (`sb_secret_…`), server only, never commit it. On Firebase: secret `mo-supabase-secret-key` |
| `NEXTAUTH_URL` | `http://localhost:3000` (or the production URL) |
| `NEXTAUTH_SECRET` | a long random string (`npx auth secret` or `openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in (step 2.2) |
| `BOOTSTRAP_PARTNER_EMAILS` | `rajitha93725@gmail.com`. These emails can always sign in with Google as a partner. |
| `OWNER_EMAILS` | `rajitha93725@gmail.com`. The owner(s): the only accounts that see MO Villa, Cash & bank, Settings and Users. Falls back to `BOOTSTRAP_PARTNER_EMAILS` when empty. |

### 2.4 Run
```bash
npm run dev            # development
npm run build && npm start   # production
```

### 2.5 Deploy
Firebase App Hosting (backend `mo-ops`): every push to `main` rolls out. Settings are in `apphosting.yaml`; secrets live in
Cloud Secret Manager (`node scripts/set-firebase-secrets.mjs mo-ops` uploads them from `.env.local`). Don't set
`AUTH_DISABLED` or `DEMO_TODAY` in production.

---

## 3. Roles

| Role | Can do |
|---|---|
| **owner** (a partner listed in `OWNER_EMAILS`) | Everything, including **MO Villa**, **Cash & bank**, **Settings** and **Users** |
| **partner** | The cafe: menu, fixed costs and payments, cafe profit and their cafe share, cafe capital, to-dos, and edit or delete any cafe entry. **No villa information**: no villa page or cards, no villa profit or shares, no villa to-dos (ticked **🏡 MO Villa task** or linked to a booking), the app is called just "MO Cafe", no MO Villa or shared capital, and no Cash & bank (villa money moves through the same accounts) |
| **staff** | Add orders and daily costs, and view the menu, daily sales and to-dos. No profit, cash, settings or editing of existing entries |

Roles are checked on the server inside every page (`requirePage`) and server action (`requireAction`), not only hidden in the UI. Sign-in is limited to the Users table plus `BOOTSTRAP_PARTNER_EMAILS`. The owner comes from the server config (`OWNER_EMAILS`), never from the database, so no one can give themselves owner access from inside the app.

---

## 4. Tables and columns

One Supabase table per entity (lower-case name, e.g. `Daily_Costs` → `daily_costs`), columns as in `src/lib/data/schema.ts`.
Dates are `YYYY-MM-DD`, months are `YYYY-MM`, and amounts are whole rupees.

### Menu
| Column | Meaning |
|---|---|
| item_id | Category letter + number from `menu_categories`: `B01`… Brunch, `A01`… All Day Menu, `D01`… Beverage |
| category | One of `menu_categories` (Brunch / All Day Menu / Beverage) |
| sub_category | e.g. SweetMO, Ceylon Street, Mojito |
| item_name | Name shown on the order screen |
| unit_cost | Ingredient cost per portion (Rs) |
| selling_price | Menu price (Rs) |
| active | yes / no. Inactive items are hidden from order entry. |
| description | Optional dish description, shown on the Menu page |

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
`task_id, task, owner (Rajitha / Janith / Staff), due_date, priority (High / Medium / Low), done (checkbox), done_date, booking_id (optional link to a MO_Villa booking), villa (checkbox: MO Villa task, owner only)`

### Settings (key / value / description)
| key | default | used for |
|---|---|---|
| opening_month | 2026-12 | first month in the profit table and YTD |
| closed_months | 6,7,8,9,10 | greyed months: no monthly fixed costs, plan = 0 |
| food_cost_target_pct | 40 | menu highlight and dashboard |
| partners | Rajitha:50,Janith:50 | cafe profit split (must total 100) |
| villa_partners | Rajitha:100 | villa profit split (must total 100) |
| menu_categories | Brunch:B,All Day Menu:A,Beverage:D | menu categories in display order, with the letter for new item IDs. Breakfast orders open the first one, other meals the second |
| receipt_name | MO Cafe | receipt: name at the top |
| receipt_address | (empty) | receipt: optional address / phone line |
| receipt_footer | Thank you! Come again | receipt: last line |
| receipt_width_mm | 80 | receipt paper width (80 or 58 for receipt printers) |
| uber_markup_pct | 33.4 | Uber orders: % added to the menu price, rounded up to the next Rs 10 |
| uber_commission_pct | 25 | Uber orders: % of the Uber total that Uber keeps, saved as a daily cost |
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
`email, name, role (partner / staff), username, password_hash` (email is the ID; the hash never reaches the browser)

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
src/lib/data/schema.ts      table names + columns (single source of truth)
src/lib/data/store.ts       DataStore interface  ← swap point
src/lib/data/supabaseStore.ts Supabase implementation (+ supabaseSql.ts → supabase/schema.sql)
src/lib/data/memoryStore.ts in-memory implementation (demo/tests)
src/lib/data/index.ts       getStore(): picks the backend
src/lib/data/repo.ts        typed repository used by pages/actions
src/app/actions.ts          server actions (validation + role checks)
src/app/*                   screens
src/lib/password.ts         password hashing + sign-in attempt limit
src/lib/users.ts            Users list checks (Settings → Users)
src/app/menu/               public menu card (/menu) and editor (/menu/edit)
tests/                      unit tests (profit, cash, daily, validation, CSV)
```

## 7. Tests

```bash
npm test
```
138 tests cover the profit formulas, fixed-cost allocation (monthly, closed months, one-time full or spread), planned vs actual, partner split and rounding, YTD, cash and bank balances, transfers, the low-cash warning, the daily view, to-do urgency, validation, CSV escaping, the Supabase store and schema, passwords and the Users list, and MO Villa (nights, commission and payout, splitting stays across months, double booking, monthly villa profit, occupancy, per-room profit, cash and combined profit).

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
- **To-do:** each task can be linked to a booking. Tick **🏡 MO Villa task** (or link a booking) to keep a task owner-only.

---

## 9. Opening budget & partner capital

Screen: **More → Capital** (partners; only the owner sees MO Villa and shared ("Both") entries).

**Capital tab:** `capital_id, date, partner, business (MO Cafe / MO Villa / Both), description, amount, paid_into (Bank / Petty cash / Paid directly), notes`

- Shows each partner's total contribution and **share of capital** (e.g. Rajitha 95% / Janith 5%), overall and per business.
- **Tracked only:** capital does **not** change the profit split. Profit stays at the Settings split (50/50), because Rajitha contributes money and Janith contributes cooking and management.
- `paid_into` = Bank or Petty cash raises that balance on the Cash page. **Paid directly** (straight to a supplier) is recorded but doesn't touch the business accounts.
- Record money a partner puts into the business here, not as a cash "Opening balance", so it isn't counted twice.

## 10. Monthly report

Screen: **More → Reports** (partners). Pick a month with ‹ › or the month box. **Print / PDF** prints the whole report (navigation and buttons are hidden, and it always prints in light colours). **CSV** downloads the summary, and each section has its own CSV.

| Section | Contents |
|---|---|
| Headline | Sales, orders and average order value, total costs, cafe net profit, each compared with the previous month |
| Cafe profit statement | Sales → food cost → gross profit → daily and fixed costs → net profit, margin, food cost %, cafe partner shares, vs previous month, vs plan, food cost check |
| Sales | By meal, by payment method, by menu category, and day by day against target; trading days, best day, average per trading day |
| Items sold | Every item ranked by sales: qty, sales, food cost, gross profit, food cost % (above target shown red) |
| Order details | One row per order: date, time, meal, items, payment, total, entered by |
| Daily costs | By category, by account (Petty cash / Bank), by who paid, plus the full list |
| Fixed costs | Planned vs actual, paid or not, amount counted in profit |
| MO Villa *(owner only)* | Villa profit, occupancy per room, average price per night, by platform, per-room profit, bookings touching the month (nights and gross in this month), villa costs |
| Business profit & partner shares *(owner only)* | Cafe share + villa share per partner (Settings: `partners`, `villa_partners`) |
| Cash & bank *(owner only)* | Opening (previous month end) and closing (month end) balance per account, and the month's movements |

All figures come from the same calculations as the other pages (`src/lib/calc/report.ts`), so the report always matches the Profit, Villa and Cash pages.

## 11. Receipts

After **Save** on the New order screen, the receipt prints straight from that screen. The print dialog opens, the app stays on New order, and the cart is already empty for the next order. The receipt uses the data from the save itself, so it never has to wait for the database. **🖨 Print again** reprints the last order. The **Print receipt after saving** checkbox in the cart turns this on or off, and each phone or tablet remembers its own choice.

- Reprint any order from **Sales** with the 🖨 button next to it. Receipts always read the latest data.
- The receipt shows the date, time, meal, order number, each item (qty × price), total, payment method, item count and the order note.
- Header, footer and paper width come from Settings (`receipt_name`, `receipt_address`, `receipt_footer`, `receipt_width_mm`).
- Browsers always show the print dialog (a web page can't print silently). For one-tap printing on a counter PC, start Chrome with `--kiosk-printing` and set the receipt printer as the default.
- Printing uses the device's normal print dialog, so it works with any printer the phone, tablet or computer can print to: a Bluetooth or USB receipt printer (pick it in the dialog), a Wi-Fi printer, or "Save as PDF".

## 12. Uber orders

On **New order**, switch the top toggle from **☕ Cafe** to **🛵 Uber**. The Home page also has a **+ Uber order** link, which opens `/order?channel=uber`.

- Same menu and the same Breakfast / Lunch / Dinner choice. Every price is the menu price + `uber_markup_pct` (33.4%), rounded up to the next Rs 10, e.g. Rs 1,850 becomes Rs 2,470.
- Payment is always **Uber**, and the money counts towards the **Bank** balance.
- When the order is saved, the app also saves a **Daily cost**:
  - category `Uber commission`
  - amount = order total × `uber_commission_pct` (25%)
  - paid from **Bank** by **Business**
  - its id is `UC-<order id>`
- Deleting the order on Sales also deletes its commission.
- With a 33.4% markup and 25% commission, the cafe keeps at least the normal menu price (1.334 × 0.75 ≈ 1.0).
- Home shows Uber sales and commission for today and for each day. Expected daily net profit = sales − food cost − Uber commission. Monthly net profit includes the commission because it is a daily cost.
- Monthly reports list Uber as a payment method.

## 13. Public menu card

**/menu** is the menu for guests: share the link or put it in a QR code. No sign-in needed. Tabs: **Beverage**, **Brunch**,
**All Day** (from the menu categories; any other category gets its own tab). Only active items are shown, with name,
description and selling price (never costs or Uber prices). Name and address come from Settings (`receipt_name`,
`receipt_address`), and the footer from `receipt_footer`.

Background photos fade from one to the next per tab: `public/menu/beverage-*.jpg`, `brunch-*.jpg`, `allday-*.jpg`
(web-sized copies of the photos in `menuImages/`; change the list in `src/app/menu/page.tsx`).

Signed-in users see an **✏️ Edit menu** button that opens the editor at **/menu/edit** (the app's Menu tab).
