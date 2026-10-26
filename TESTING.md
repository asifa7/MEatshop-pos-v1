# Enterprise POS Manual Testing Guide & Acceptance Verification

This document contains step-by-step manual testing instructions for all 19 enterprise overhaul items implemented in the Electron + SQLite Windows POS application for the retail chicken and mutton shop.

---

## Shared Verification Rules (Apply to All Screens)
- **Decimal Precision**: Quantities / weights must show at most 3 decimals (e.g. `1.250 kg` or `127.59 pcs`, never `127.58999999999999` or `-0.0`).
- **Currency & Money**: Currency is formatted with the rupee symbol and 2 decimal places (e.g. `₹145.20`).
- **Cashier-Friendly UI**: Big, touch-friendly buttons, clear error and empty states, zero developer jargon.
- **Stock Movement Integrity**: Append-only single ledger `stock_movements`, integer quantities in storage (grams for weight, units for piece), deduplication index.

---

## Core Stock Ledger Overhaul & Inventory Acceptance Tests (Migration 083)

### Automated Regression Verification
Run the automated test suite anytime using Electron Node:
```cmd
set ELECTRON_RUN_AS_NODE=1 && .\node_modules\.bin\electron.cmd scripts/stock_ledger_overhaul.test.js
```
All 11 automated test cases must pass:
1. Math & Units formatting (floor(units/30) trays, no `-0.0`)
2. Rounding & currency formatting
3. Single source of truth `getStockStatus`
4. Quais Egg (code 25) classification as OWN tracked item
5. Schema stock mode columns and valid constraints
6. `stock_movements` table with deduplication unique index
7. Yield conversion formula precision (`sold_g * 1000 / yield_g_per_kg`)
8. Outstanding purchase bills query resolving all bills including ₹76,170
9. Payment allocation & atomic reversal with mandatory reason
10. Billing OWN item deduction & snapshot in `invoice_items`
11. Billing LINKED cut yield conversion deduction on parent live stock

### Manual Acceptance Verification Steps

#### A. Product Stock Modes (OWN, LINKED, NONE)
1. Navigate to **Products** (`/products`) and click **+ Add Product** (or edit an existing product).
2. Directly below Rates, observe question 8: **"How is stock kept for this product?"** with 3 distinct buttons:
   - **1. Own Stock**: Product maintains its own physical count/weight on hand. Reorder level applies to itself.
   - **2. Takes Stock**: Product is a cut or pack that deducts stock from another parent product.
   - **3. No Stock**: Non-physical item (dressing charges, delivery fee, services). Zero stock movements recorded.
3. Select **2. Takes Stock**:
   - Verify the Parent Product dropdown only lists active **OWN** products (e.g., Live Broiler Chicken, Live Country Chicken, Live Goat/Sheep).
   - Choose conversion link mode: **Yield (g / kg)** or **Pack Size (Units)**.
   - Enter yield in grams per 1 kg (e.g. `550` for Skinless Chicken, `625` for Dressed Chicken, `350` for Boneless).
   - Observe the **Live Conversion Preview** line: e.g. `"Selling 1.000 kg Chicken Skinless consumes 1.818 kg Broiler Live"`.
4. Click **Save Product** and verify constraints are enforced (parent must be active OWN, no self-link, yield > 0).

#### B. Billing Stock Deductions & Negative Stock Policy
1. Navigate to **Billing** (`/billing`).
2. Add a cut item (e.g. 1.000 kg Chicken Skinless) to cart.
3. Complete the sale with cash.
4. Verify in the database:
   - `invoice_items` contains snapshot: `stock_product_id` (parent live bird ID), `stock_link_mode = 'YIELD'`, `conversion_rate_used = 550`, `deducted_qty = 1818` grams.
   - `stock_movements` contains an append-only row: `movement_type = 'SALE'`, `qty_delta = -1818` grams on parent bird.
5. **Negative Stock Blocking**:
   - If stock is insufficient (e.g. attempting to sell 500 kg when stock is 10 kg), verify the app blocks completion by default with a clear message: `"Insufficient stock for ...: stock is X kg, selling Y kg. Blocked by policy."`
   - If manager override is enabled or reason provided, sale succeeds and logs manager override in oversold audit log.
6. **Void Reversal**:
   - Void the bill: verify `stock_movements` appends `movement_type = 'SALE_CANCEL'` with exact positive `+1818` grams.

#### C. Inventory Full-Width View & Egg Trays Formatting
1. Navigate to **Inventory** (`/inventory`).
2. Verify the empty right-hand panel is removed and the table spans **100% full width**.
3. Inspect the egg cards:
   - Verify trays display as `floor(units / 30) trays (X pcs)`.
   - Verify 0 or negative egg values never display `-0.0` or `-0 trays`.
4. Inspect the **Low Stock / Reorder** section at the top of Inventory:
   - Verify **QUAIS EGG** (code 25, 0 pcs) appears with red **Critical** status.
   - Verify **Mutton** (when at 0.00 kg) appears as critical low stock.

#### D. Purchases Entry Workflow
1. Navigate to **Purchases > Quick Purchase Entry** (`/purchases`).
2. Verify **Expected Pay Date** is removed from the form.
3. Test **Single-Enter Keyboard Workflow**:
   - Type product code (e.g. `1` or `25`) in item search and press **Enter once**.
   - Verify item is selected immediately and focus moves to **Quantity**.
   - Press **Enter** in Quantity -> focus moves to **Rate**.
   - Press **Enter** in Rate -> a new row is added and focus lands in the new row's item search box.

#### E. Vendor Payables & FIFO Payment Overhaul (Migration 084)

##### Automated Test Suite
Run the dedicated automated test suite anytime using Electron Node:
```cmd
set ELECTRON_RUN_AS_NODE=1 && .\node_modules\.bin\electron.cmd scripts/vendor_payables_fifo.test.js
```
All 12 automated test cases pass:
- **T1**: FIFO allocation on bills 10, 20, 30: Pay 15 cash -> Bill 1 cleared, Bill 2 partly paid (bal 15), Bill 3 untouched (bal 30). Vendor balance ₹45.00.
- **T2**: Full settlement: Pay remaining 45 -> all bills Paid, vendor balance 0, tile disappears from Pending.
- **T3**: Overpayment prevention: Paying 70 when outstanding 60 is strictly blocked with error displaying current balance.
- **T4**: Reversal & balance restoration: Reversing payment restores all bill balances to 10/20/30, deactivates shift cash, and marks voucher Reversed.
- **T5**: Same-date bills ordering: Same-date bills allocated in strict `created_at ASC, id ASC` sequence.
- **T6**: Liquid mode distinction: Cash payment generates `cash_out` in `shift_cash_movements`; Bank payment never affects cash box.
- **T7**: Manual allocation mode: Allows targeting specific bills without touching earlier bills.
- **T8**: Double-click prevention: Idempotent duplicate requests return existing voucher with 0 double deductions.
- **T9**: Atomic health check: Zero drift detected across all database purchase bills.
- **T10**: Real production data: Tested on vendor `rahul` (balance ₹58,170.00 -> pay ₹200 -> balance ₹57,970.00 -> reverse -> restored to ₹58,170.00).
- **T11**: Cross-table consistency: `getVendorOutstanding` matches purchase bills sum and ledger.
- **T12**: Money formatter verification: `formatMoney` strictly produces exactly ONE currency symbol (`₹180.00` or `Rs 180.00`).

##### Manual Acceptance Verification Steps
1. Navigate to **Payments & Receipts** (`/ledger/payments-receipts`).
2. **Top Stats Bar**:
   - Verify Total Payable displays the combined outstanding balance of all pending vendors (e.g. ₹83,324.00).
   - Verify Pending Vendors count, Cash in Hand, and Bank / UPI balance cards are clearly visible.
3. **Pending Vendors View (ONLY ONE TILE PER VENDOR)**:
   - Verify there is **EXACTLY ONE tile per vendor** with an outstanding balance (e.g., `rahul` and `Prime Meat Wholesalers Ltd`).
   - Individual purchase bills do NOT clutter the main view.
   - Each tile displays:
     - Vendor name / company name and phone.
     - Large Outstanding Amount (e.g. `₹58,170.00` for rahul, `₹25,154.00` for Prime Meat).
     - Pending bills count badge.
     - "Oldest bill: YYYY-MM-DD (X days old)".
     - Last payment information (date and amount).
     - Two distinct buttons: `[ 💳 Pay ]` and `[ 📄 View Bills ]`.
   - Vendors with zero outstanding balance do NOT appear in the Pending tab.
4. **Pay Flow (Pay Button on Vendor Tile)**:
   - Click `[ 💳 Pay ]` on a vendor tile.
   - Verify the dialog displays:
     - Amount pre-filled with the vendor's total outstanding balance.
     - Quick button: `[ Pay Full ]`.
     - Payment mode toggle: `Cash` | `Bank / Transfer` | `UPI / QR`.
     - Reference field for Bank / UPI payments.
     - Live Allocation Preview Table:
       Columns: `Bill # | Date | Bal Before | Paying Now | Bal After | Result`.
       As you change the payment amount (e.g. pay ₹300), the table updates in real-time in strict FIFO order (oldest bill first)!
     - Cash Warning: If Cash mode is selected and amount exceeds current cash in hand, an amber warning badge appears (does not block).
     - Switch `Choose bills myself` allows manual allocation where amounts must match total payment.
   - Click `Confirm & Pay`:
     - Confirm button disables immediately after one click to prevent double clicks.
     - Success banner displays detailed breakdown: e.g. `"₹300.00 paid to rahul. 2 bills cleared, 1 partly paid. Balance ₹57,870.00."`
     - Tile updates instantly; if balance reaches 0, the tile disappears from Pending.
5. **View Bills Drawer**:
   - Click `[ 📄 View Bills ]` on a vendor tile.
   - Drawer slides in from the right showing all bills for that vendor with tabs: `Pending Bills` | `Settled Bills` | `All Bills`.
   - Click any bill to view its detailed payment history and audit trail.
6. **Settings & Health Check**:
   - Click the `Settings & Health` tab.
   - Configure **Supplier Credit Days** (e.g. 15 days):
     - Click **Save Policy**.
     - Verify vendor tiles with oldest bill > credit days display an **Overdue** badge with amber/red border.
   - Click `[ Run Health Check ]`:
     - Verifies database integrity across all purchase bills.
     - Displays 0 drift confirmation or provides one-click **Auto Repair**.


---

## Item 1: Billing & Express Checkout
- **Test Objective**: Verify Cash Received begins blank, change calculates only upon input, exact cash setting works, skinless ratio uses 550 g/kg, and continuous invoice numbering avoids sequence gaps.
- **Preconditions**: Store shift open, items in product catalogue.
- **Manual Test Steps**:
  1. Open the POS app and navigate to **Billing** (`/billing`).
  2. Add items to cart (e.g., 1.000 kg Live Broiler Chicken).
  3. Look at the **Payment Panel**:
     - Verify **Cash Received** input field is completely **BLANK** (not auto-filled with the bill total).
     - Verify **Change to Return** displays `₹0.00` and does not compute a negative value until cash is entered.
  4. Type an amount into **Cash Received** (e.g., `₹500` for a `₹320` bill):
     - Verify **Change to Return** updates dynamically to `₹180.00`.
  5. Clear the **Cash Received** input so it is blank.
  6. Click **Complete & Print**:
     - With default setting (`assumeExactCashWhenBlank = false`), verify the app prompts for cash amount or payment confirmation.
     - Go to **Settings > Billing**, enable `"Assume exact cash when blank"`, return to Billing, leave Cash Received blank, and click Complete & Print. Verify the bill completes with exact cash paid.
  7. Check **Skinless Available Calculation**:
     - Check the live stock card for skinless available meat. Verify it computes using **550 g per 1 kg** (0.550 ratio), not 625 g/kg.
  8. Check **Bill Number Sequence**:
     - Verify active draft bills display their upcoming continuous sequence (e.g. `Bill #207`) without advancing the counter until finalized.
- **Expected Result**: Blank cash received by default, accurate change math, 0.550 skinless ratio, single continuous sequence.

---

## Item 2: Inventory & Reorder Management
- **Test Objective**: Verify max 3 decimals for quantities, full-width stock table, low-stock reorder moved from Demand Forecast to Inventory, and consistent live-stock pcs vs kg.
- **Preconditions**: Database populated with items and live chicken batches.
- **Manual Test Steps**:
  1. Navigate to **Inventory** (`/inventory`).
  2. Inspect the **Stock Table**:
     - Verify the right-hand panel has been removed and the inventory table spans full width.
     - Inspect all quantity columns (In Stock, Opening, Wastage). Confirm zero floating-point noise and no `-0.0` values for egg trays.
  3. Inspect the **Low Stock / Reorder Section**:
     - Verify the `"Purchasing Reminder: Low Stock Items"` section is present at the top of Inventory.
     - Confirm **Mutton** (when at `0.00 kg`) appears as **CRITICAL** red badge with suggested reorder.
  4. Navigate to **Demand Forecast** (`/forecast`):
     - Confirm that purchasing reminder section has been removed from this page.
  5. Check **Live Stock Metrics**:
     - Look at the live bird summary banner: verify pcs and kg are consistent with active batches (e.g. 63 birds = 91.350 kg).
- **Expected Result**: Clean 3-decimal display, full-width table, critical low stock banner in Inventory, consistent live-stock numbers.

---

## Item 3: Delivery Orders Daily Operations
- **Test Objective**: Verify Delivery Orders defaults to today's date, provides Prev/Next date controls, displays status progression cards, and organizes orders across 4 operational tabs.
- **Preconditions**: Delivery orders exist in database.
- **Manual Test Steps**:
  1. Navigate to **Delivery Orders** (`/delivery`).
  2. Inspect header:
     - Verify the view defaults to **Today's Date** with `◀ Prev Day`, `Today`, and `Next Day ▶` quick buttons.
     - Confirm historical orders (34 records) are NOT loaded on initial view, keeping initial loading instant.
  3. Inspect order cards:
     - Each delivery card shows: Bill No, Customer Name, Phone, Delivery Address, Items summary, Total Amount, Payment Badge, and Current Status.
  4. Test status transitions:
     - Click `Out for Delivery` -> card status badge updates.
     - Click `Delivered` -> status updates.
     - Click `Payment Collected` -> payment status updates.
     - Click `Closed` -> order moves to `Closed Today` tab.
  5. Switch between tabs:
     - `Today Open`: Shows open and out-for-delivery orders for selected date.
     - `Payment Pending`: Shows delivered orders awaiting cash/UPI collection.
     - `Closed Today`: Shows completed and paid orders for today.
     - `History (All Dates)`: Shows searchable list across all past dates with search bar.
- **Expected Result**: Fast daily operational flow, clear progression buttons, tabbed filtering.

---

## Item 4: Procurement & Quick Purchases
- **Test Objective**: Verify Expected Pay Date is removed from quick form, item row is spacious and touch-friendly, double-Enter keyboard workflow works seamlessly, and credit purchases create payable bills.
- **Preconditions**: Suppliers exist in database.
- **Manual Test Steps**:
  1. Navigate to **Purchases > Quick Purchase Entry** (`/purchases`).
  2. Verify **Expected Pay Date**:
     - Confirm the field is hidden and has no required asterisk.
  3. Inspect the **Item Entry Row**:
     - Verify the product search box is tall (`min-h-[48px]`), prominent, and occupies the majority of row width.
  4. Test **Double-Enter Keyboard Workflow**:
     - Focus the product search box, type item code (e.g. `1` or `LIVE`) and press `Enter` **once**.
     - Verify item is selected immediately and focus moves straight to the **Quantity** field on that row.
     - Type quantity (e.g. `50`) and press `Enter`.
     - Verify focus moves directly to **Buying Rate**.
     - Type rate (e.g. `120`) and press `Enter`.
     - Verify a new row is added and focus lands in the new row's product search box.
  5. Save a purchase with **Payment Status = Credit (Outstanding)**:
     - Select supplier, add items, set payment status to `Unpaid / Credit`, and click **Save Purchase**.
     - Navigate to **Payments & Receipts**: confirm the bill appears immediately with full outstanding balance.
- **Expected Result**: Touch-friendly input row, single Enter selection, automatic row advance, credit purchases immediately create payable bills.

---

## Item 5: Payments & Receipts (Payables Dashboard)
- **Test Objective**: Verify big tile/card layout for outstanding purchase bills, per-supplier filtering, 1-click Pay dialog, single-transaction settlement, and payment reversal.
- **Preconditions**: Credit purchase bills exist (e.g. ₹76,170 credit purchases).
- **Manual Test Steps**:
  1. Navigate to **Payments & Receipts** (`/ledger/payments-receipts` or `/purchases/outstanding`).
  2. Inspect top section:
     - Check **Total Payable** tile (shows accurate sum of unpaid and partial bills, e.g. ₹83,324).
     - Check **Cash-in-hand** and **Bank Balance** tiles (reflects real active non-voided transactions).
     - Check **Per-Supplier Subtotal Tiles**: click on a supplier tile (e.g. "Suguna Poultry") and verify bills filter to that supplier only.
  3. Inspect bill tiles:
     - Verify each credit bill is rendered as a large card showing Supplier, Bill No, Date, Total, Paid, Balance, and Status.
  4. Test **Pay Dialog**:
     - Click **Pay** on a bill tile.
     - Confirm dialog opens with **Amount** prefilled with remaining balance.
     - Click **Pay Full** or edit amount to test partial payment.
     - Choose Mode (`Cash`, `UPI`, `Bank`) and click **Confirm Payment**.
     - Confirm the bill card updates to `Paid` or `Partial`, supplier balance decreases, and Day Book reflects balanced entries.
  5. Test **Payment History & Reversal**:
     - Open **Payment History** tab.
     - Click **Reverse** on a payment voucher.
     - Enter mandatory reversal reason and confirm.
     - Verify the original bill balance is restored and reversing journal entries are posted.
- **Expected Result**: Big tile layout, 1-click payment, clean double-entry updates, reversal with mandatory reason.

---

## Item 6: Clean Modular Reports
- **Test Objective**: Verify the old complex reports are replaced with 4 clean reports: Sales, Purchases, Delivery, Inventory, with date presets, summary tiles, headers, totals row, CSV export, and Print.
- **Preconditions**: Completed transactions exist in database.
- **Manual Test Steps**:
  1. Navigate to **Reports** (`/reports`).
  2. Verify UI Structure:
     - Confirm old custom query builder, pivot charts, and static draft invoice banner are removed.
     - Verify 4 clean report tabs: **Sales**, **Purchases**, **Delivery**, **Inventory**.
  3. Test **Date Presets**:
     - Click `Today`, `Yesterday`, `This Week`, `This Month`, and `Custom` date picker. Verify data updates for each preset.
  4. Check Report Columns & Content:
     - **Sales Report**: Bill No, Time, Customer, Mode, Items, Total.
     - **Purchases Report**: Date, Supplier, Ref, Total, Paid, Balance.
     - **Delivery Report**: Date, Bill, Customer, Status, Amount, Collected.
     - **Inventory Report**: Product, Opening, In, Out, Wastage, Closing, Value.
  5. Verify Summary & Export:
     - Check 3-4 Summary Tiles at the top of each report.
     - Verify the bold **Totals Row** at the bottom of the table.
     - Click **Export CSV** -> verify downloaded file contains clean formatted data.
     - Click **Print** -> verify print preview modal renders clean tabular format.
  6. Click **Review Drafts** button in header (if drafts exist) to view or resume open draft invoices.
- **Expected Result**: 4 fast, focused reports with accurate totals and clean export/print capabilities.

---

## Item 7: Products & Bulk Spreadsheet Import
- **Test Objective**: Verify Bulk Add Products opens empty, supports spreadsheet grid editing, copy-paste from Excel, row validation, margin warnings, and standardized units.
- **Preconditions**: Access to Products screen.
- **Manual Test Steps**:
  1. Navigate to **Products** (`/products`).
  2. Click **Bulk Add Products**:
     - Verify the sheet opens **EMPTY** (zero prefilled dummy/existing items).
     - Verify columns: Name, Category, Unit (`kg`, `g`, `pcs`, `tray`, `pack`), Buying Rate, Selling Rate, Code (auto-suggests next free code), Inventory Tracking.
  3. Test **Excel Paste**:
     - Copy tab-separated product rows from Excel or Notepad and click **Paste from Excel** (or paste directly into grid).
     - Verify rows parse correctly into columns.
  4. Test **Validation**:
     - Enter duplicate code or duplicate name -> verify row highlights with error badge.
     - Enter Selling Rate <= Buying Rate (e.g. Buy 250, Sell 240) -> verify warning highlight.
  5. Click **Save All**:
     - Verify summary notification showing `Created X products, Failed Y rows`.
  6. Check **Product Catalogue**:
     - Find any item where selling rate <= buying rate (e.g. Chicken Dressed 250/250) -> verify prominent warning badge: `⚠️ Low/Zero Margin: Sell ≤ Buy`.
- **Expected Result**: Empty spreadsheet grid, auto-suggest code, clipboard paste, row-level validation, margin warning badges.

---

## Item 8: Customer CRM Rules & Dual Party Linking
- **Test Objective**: Verify Customer Tier & Segment Rules Editor modal, saved settings, Recalculate All, manual override, and dual Customer/Supplier party linking.
- **Preconditions**: Customer and supplier records exist (e.g. customer "rahul").
- **Manual Test Steps**:
  1. Navigate to **Customers** (`/customers`).
  2. Click **Rules** button in the toolbar:
     - Verify modal opens showing editable fields:
       - VIP Spend Threshold (`₹5,000`)
       - VIP Visit Count (`5`) and Mode (`Either` / `Both`)
       - Regular Minimum Visits (`2`)
       - New Customer Window (`14` days)
       - At-Risk Gap Multiplier (`2.0x`)
       - Inactive Days Threshold (`30` days)
       - Wholesale Tags (`Wholesale, Distributor`)
       - Restaurant Tags (`Restaurant, Hotel, Catering`)
  3. Edit values and click **Save Rules**.
  4. Click **Recalculate All**:
     - Verify all customers' segments re-evaluate according to the saved criteria.
  5. Edit an individual customer:
     - Set manual tier override (e.g. force VIP) -> confirm manual tier is preserved.
  6. Check **Dual Party Linking**:
     - Inspect customer "rahul" -> verify `🔗 Also Supplier #1` badge is displayed.
     - Edit customer and link/unlink to a supplier without duplicate conflicts.
- **Expected Result**: Fully configurable CRM rules, instant recalculation, manual override support, dual party linking.

---

## Item 9: Credit (A/R) & Khata Management
- **Test Objective**: Verify credit sales appear in Outstanding Dashboard, Top Debtors, Aging, and Statements, with 1-click Collect Payment, advance adjustment, and WhatsApp reminder.
- **Preconditions**: Credit invoices exist.
- **Manual Test Steps**:
  1. Navigate to **Customers > Outstanding Dashboard** (`/customers/outstanding` or `/customers/ar`).
  2. Check **Top Debtors** cards:
     - Verify debtors are ranked by balance due.
     - Check **Aging Schedule** (Current, 1-30 days, 31-60 days, 60+ days).
  3. Test **Collect Payment**:
     - Click **Collect Payment** on a debtor card.
     - Verify modal supports entering full or partial amount, choosing payment mode (`Cash`, `UPI`, `Card`, `Bank`).
     - If the customer has an advance balance, test the **Adjust from Advance** button.
     - Click **Confirm Collection** -> verify customer balance decreases and ledger reflects receipt.
  4. Test **WhatsApp Reminder**:
     - Click **WhatsApp Reminder** button on a debtor card.
     - Verify pre-formatted WhatsApp message preview contains customer name, due balance (`₹...`), and UPI payment details.
- **Expected Result**: Real-time A/R tracking, 1-click payment collection, advance offset, WhatsApp reminder integration.

---

## Item 10: Cashier-Friendly HR & Payroll
- **Test Objective**: Verify default cashier view shows Staff List with big tiles for Today's Attendance, Give Advance, and Pay Salary, with advanced tabs tucked behind "More ▾", and salary entries strictly linked to employee records.
- **Preconditions**: Employee records exist (including seeded EMP-00001 "Kaif").
- **Manual Test Steps**:
  1. Navigate to **HR & Payroll** (`/hr`).
  2. Verify Default View:
     - Screen displays **Staff List with big cashier cards**.
     - Advanced tabs (`Leaves`, `Incentives`, `Overtime`, `Deductions`, `Master Ledger`, `Reports & Audit`) are organized under the **`More ▾`** dropdown.
  3. Test **Today's Attendance Toggle**:
     - On any employee card, click `Present`, `Half Day`, or `Absent`.
     - Verify attendance updates immediately with visual feedback.
  4. Test **+ Give Advance**:
     - Click `+ Give Advance` on a staff card.
     - Enter amount (e.g. `₹2,000`), choose Cash/UPI, and confirm.
     - Verify advance balance increases and entry posts to Expense/Ledger.
  5. Test **Monthly Payslip / Pay Salary**:
     - Click `Monthly Payslip / Pay Salary`.
     - Confirm attendance-based calculation and net salary.
  6. Check **Salary Link Integrity**:
     - Verify the historical `Kaif` salary entry is linked to `EMP-00001`.
- **Expected Result**: Simple 1-tap attendance and advance flow for cashiers, no orphan salary records.

---

## Item 11: Cash Box & Close Shift
- **Test Objective**: Verify denomination breakdown by payment method, Expected vs Counted comparison, yesterday's closing cash tally check with mandatory discrepancy reason, correct IST timestamps, and stale shift detection.
- **Preconditions**: Active POS session.
- **Manual Test Steps**:
  1. Navigate to **Cash Box** (`/cashbox`).
  2. Inspect **Active Shift Header**:
     - Verify opening time matches local system time (IST) with correct AM/PM.
     - Check stale shift alert: if a shift was opened on a previous day, confirm a prominent prompt appears to close the stale shift.
  3. Click **Close Shift**:
     - Verify denomination / count fields for: `Cash`, `Paytm`, `Google Pay`, `PhonePe`, `Card`, and `Other`.
     - Enter counted amounts for each method.
     - Verify the **Expected vs Counted** comparison table shows real-time green/red differences.
  4. Check **Opening Cash Tally**:
     - When opening a new shift, verify the system compares Opening Cash with **Yesterday's Closing Cash**.
     - If amounts differ, verify the system enforces entering a mandatory explanation before shift open.
  5. Check **Cash Sales Total**:
     - Confirm Cash Sales reflect only active non-voided completed bills (excluding the voided 20,500 kg test invoice).
- **Expected Result**: Accurate multi-method reconciliation, discrepancy reasons enforced, accurate IST timestamps.

---

## Item 12: Quick Expenses
- **Test Objective**: Verify quick category tiles, big number pad, mandatory employee picker for Salary expenses, balanced double-entry ledger posting, and today's expense list.
- **Preconditions**: Shift open, employees exist.
- **Manual Test Steps**:
  1. Navigate to **Expenses** (`/expenses`).
  2. Inspect Quick Tiles:
     - Verify large tiles: `Rent`, `Electricity`, `Salary`, `Fuel`, `Packaging`, `Transport`, `Repairs`, `Tea/Misc`, `Other`.
  3. Test Standard Expense (e.g. Tea/Misc):
     - Tap `Tea/Misc` tile.
     - Use big number pad to enter `₹150`.
     - Choose `Cash` and click **Save Expense**.
     - Verify entry appears under **Today's Expenses** and updates cashbox shift cash movement.
  4. Test Salary Expense Rule:
     - Tap `Salary` tile.
     - Enter amount `₹5,000`.
     - Try clicking Save Expense without selecting an employee -> confirm validation error: `"Selecting a Staff Member is required for Salary expenses"`.
     - Select employee `Kaif (EMP-00001)` and click Save Expense -> confirm successful save.
  5. Verify Monthly Category Breakdown:
     - Inspect monthly summary cards showing totals per category.
- **Expected Result**: Rapid quick-tile expense entry, zero orphan salary expenses, double-entry balanced.

---

## Item 13: Daily Market Prices & Auto-Fetch
- **Test Objective**: Verify automatic fetch with timeout & retry, suggestion banner with 1-click Apply, graceful offline fallback, source management, and variant rate syncing.
- **Preconditions**: Internet connection (or test offline fallback).
- **Manual Test Steps**:
  1. Navigate to **Market Prices** (`/pricing/market-rates`).
  2. Check **Active Price Suggestions**:
     - Inspect suggested rate card for live broiler chicken with source name and fetch timestamp.
     - Click **Apply Rate** -> verify rate syncs immediately to `product_variants.current_rate_paise_per_unit`.
  3. Test **Fetch Now**:
     - Click `Fetch Now` button -> verify loader spins and fetched rates update.
  4. Test **Offline / Error Fallback**:
     - Disconnect internet or configure an invalid URL -> click Fetch Now.
     - Verify graceful fallback badge (`Offline / Unreachable`), no crash, and manual rate entry remains fully functional.
  5. Check **Price Sources & Schedule Tab**:
     - View configured sources (URL, parser regex/CSS rule, schedule `07:00`).
     - Inspect the **Fetch & Price History Log** table showing past fetch results.
- **Expected Result**: Reliable market price ingestion, 1-click catalogue rate application, solid offline resilience.

---

## Item 14: Double-Entry Ledger
- **Test Objective**: Verify Day Book, Cash Book, Bank Book, Party Ledger, Trial Balance, Ledger Health check, and 1-click Auto-Balance.
- **Preconditions**: Ledger populated with transaction entries.
- **Manual Test Steps**:
  1. Navigate to **Ledger** (`/ledger`).
  2. Inspect Tabs:
     - **Day Book**: Verify chronological list of balanced debit and credit entries with voucher group IDs.
     - **Cash Book**: Verify cash inflows/outflows with accurate running balance.
     - **Bank Book**: Verify UPI/card/bank settlements with running balance.
     - **Party Ledger**: Filter by Customer or Supplier -> verify party statement.
     - **Trial Balance**: Verify list of accounts, Total Debits, Total Credits, and net balances.
     - **Ledger Health**: Check Total Debits vs Total Credits indicator (green when balanced). If any unbalanced legacy groups exist, click **Auto-Balance / Reconcile** and confirm books balance to zero difference.
     - **Audit Logs**: Inspect log of accounting adjustments and automated reconciliations.
  3. Test filters:
     - Filter by date range, account, party, and search keyword.
     - Click **Export CSV** and **Print**.
- **Expected Result**: Complete double-entry accounting integrity, debit == credit, 1-click auto-balance.

---

## Item 15: Bank Statement Reconciliation
- **Test Objective**: Verify dual modes: Manual CSV/XLSX statement upload with bank presets vs Automatic Gateway Polling adapter.
- **Preconditions**: Access to Bank Reconciliation screen.
- **Manual Test Steps**:
  1. Navigate to **Bank Reconciliation** (`/reconciliation` or `/ledger/reconciliation`).
  2. Test **Manual Mode**:
     - Select bank/aggregator preset (`PhonePe`, `Paytm`, `Google Pay`, `HDFC`, `SBI`).
     - Upload sample CSV statement.
     - Inspect tabs: `Matched`, `Unmatched Bills`, `Unmatched Statement Credits`, `Duplicates / Ignored`.
     - Test manual match and unmatch actions.
  3. Test **Automatic Gateway Mode**:
     - Toggle mode switcher to **Automatic Gateway Sync**.
     - View provider options (`PhonePe Merchant`, `Paytm Business`, `Razorpay`, `HDFC SmartHub`).
     - Check credentials configuration panel and documentation guide.
     - Click **Sync Now** to verify settlement polling.
- **Expected Result**: Seamless dual-mode reconciliation supporting both manual bank CSVs and automated gateway settlements.

---

## Item 16: AI Demand Forecast & Tamil Nadu Calendar
- **Test Objective**: Verify 8-week same-weekday demand baseline, festival multipliers, 7-day purchase suggestions, and Tamil Nadu holiday calendar through Dec 2027.
- **Preconditions**: Historical sales in database.
- **Manual Test Steps**:
  1. Navigate to **Demand Forecast** (`/forecast`).
  2. Inspect Forecast Cards:
     - Check predicted kg/pcs demand based on 8-week same-weekday rolling averages.
     - Verify 7-day purchase recommendations with lead-time buffer.
  3. Inspect **Festival & Fasting Calendar**:
     - View interactive calendar for current and upcoming months.
     - Confirm Tamil Nadu specific dates through Dec 2027:
       - Deepavali / Diwali: High demand multiplier (`1.8x` to `1.85x`).
       - Kaanum Pongal / Kari Naal: Peak demand multiplier (`2.0x`).
       - Purattasi Saturdays & Amavasai: Vegetarian fasting reduction (`0.3x` to `0.45x`).
       - Vinayagar Chathurthi: Verified Panchangam date (`14 Sep 2026`, `0.3x`).
     - Check confidence level tags (`Verified` vs `Low_Confidence`).
- **Expected Result**: Accurate local festival impact modeling and realistic 7-day procurement suggestions.

---

## Item 17: Settings & Payment Methods Manager
- **Test Objective**: Verify placeholder hints in Business Settings, blank field display on receipts, billing toggles, and dynamic payment methods manager.
- **Preconditions**: Admin or Manager login.
- **Manual Test Steps**:
  1. Navigate to **Settings > Business Profile** (`/settings/business`):
     - Verify GSTIN placeholder shows format hint (`e.g. 33AAAAA0000A1Z5`) and PAN shows (`e.g. AAAAA0000A`).
     - Leave GSTIN blank and inspect the receipt preview: verify blank fields do not render placeholder dashes or "Not Registered".
  2. Navigate to **Settings > Billing** (`/settings/billing`):
     - Toggle **"Assume exact cash when blank"** on/off.
     - Set **"Terminal Inactivity Lock Timeout"** (`1h`, `4h`, `8h`, `12h`, `Never`).
     - Save settings and refresh to confirm persistence.
  3. Navigate to **Settings > Payment Methods** (`/settings/payments`):
     - View list of payment methods (`Cash`, `Paytm`, `Google Pay`, `PhonePe`, `Card`, `Other`).
     - Toggle enable/disable on a method.
     - Add a custom payment method (e.g. "PineLabs POS").
     - Verify Cash Box Close Shift and Express Billing reflect the updated payment methods.
- **Expected Result**: All settings persist correctly to database, clear placeholders, modular payment method management.

---

## Item 18: Theme & Visual Polish
- **Test Objective**: Verify high-contrast readability, clean light mode surfaces (`#ffffff`, `#f8fafc`), neutral dark grey palette (`#090d16`, `#111827`, `#1e293b`), and clear text contrast.
- **Preconditions**: Access to theme toggle in app header or settings.
- **Manual Test Steps**:
  1. Switch to **Light Mode**:
     - Inspect table headers, card borders, and muted text tokens.
     - Verify text is crisp and readable without faded grey-on-grey text.
     - Verify active selection badges have high contrast.
  2. Switch to **Dark Mode**:
     - Inspect background surfaces: verify deep neutral charcoal surfaces rather than high-saturation blue/purple.
     - Check muted labels: verify text color (`#94a3b8`) has sufficient contrast ratio against backgrounds (`#111827`).
- **Expected Result**: Clean, readable, eye-strain-free interface in both light and dark modes.

---

## Item 19: System Diagnostics, Lock Screen & Emergency Recovery
- **Test Objective**: Verify idle inactivity lock screen, PIN unlock, active cart preservation, and 1-click emergency database backup restoration.
- **Preconditions**: Shift open, items in cart.
- **Manual Test Steps**:
  1. Test **Terminal Lock Screen**:
     - Press `Ctrl + L` (or wait for configured inactivity lock timeout).
     - Verify the **Terminal Lock Modal** covers the screen.
     - Confirm active cart items and open shift are NOT cleared or closed.
     - Enter cashier/admin PIN (e.g. `1234` or admin credentials) and click Unlock.
     - Verify the screen unlocks and cart items remain intact.
  2. Test **Emergency Database Recovery**:
     - Navigate to **Settings > System & Data** (`/settings/data`).
     - Inspect **Database Backup & Recovery** section:
       - Verify latest backup snapshot is listed with timestamp and file size.
       - Click **Create Immediate Backup** -> confirm new backup file appears.
       - Verify the 1-click **Restore from Latest Backup** button is available with clear confirmation warning.
- **Expected Result**: Seamless security locking without data loss, instant 1-click emergency database restoration.
