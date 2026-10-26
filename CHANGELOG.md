# Changelog — Enterprise POS Overhaul

All notable changes to the Electron + SQLite Windows POS application for the retail chicken and mutton shop are documented in this file.

---

## [10.0.0-Enterprise] - 2026-10-24

### 🚀 Highlights & Architectural Overview
- **Enterprise Math Engine**: Created central shared precision utilities (`roundQty`, `roundMoney`, `formatQty`, `formatMoney` in `src/core/shared/math.ts`) enforcing max 3 decimals for weights/quantities and 2 decimals for currency everywhere. Zero raw floating point noise (e.g. `127.58999999999999`) and zero `-0.0` values across all screens, receipts, and reports.
- **Database Schema Migrations (080, 081, 082)**:
  - `080_bank_statement_reconciliation.sql`: Schema for bank statements, matched lines, manual reconciliation, and settlement adapters.
  - `081_customer_smart_tiers_and_preferences.sql`: Schema for customer tier criteria, visit thresholds, and preference tags.
  - `082_enterprise_overhaul_schema_and_fixes.sql`:
    - Purchase invoices `due_date` alias column synced with `expected_payment_date`.
    - Cross-linking columns (`customers.linked_supplier_id` and `suppliers.linked_customer_id`) and auto-linked dual parties (e.g. "rahul").
    - Extended `customer_tier_settings` table.
    - Added `employee_id` and `photo_url` to `expenses` and linked orphan salary entries to valid staff record `EMP-00001` (Kaif).
    - `market_price_sources` and `market_price_fetch_logs` tables with auto-fetch and parser rules.
    - `payment_methods_config` table for dynamic payment methods management.
    - Double-entry ledger columns (`voucher_group_id`, `party_type`, `party_id`, `party_name`) in `accounting_daily_ledger`.
    - Tamil Nadu festival and fasting calendar through December 2027 with verified Panchangam dates and impact multipliers.
    - Floating-point noise cleanup and live bird batch count synchronization in `stock_ledger`.
    - Voided anomalous 20,500 kg test invoice (#170, ₹2,15,25,000) reconciling Cash-in-hand and Cash Sales to genuine non-voided transactions.
    - Continuous invoice sequence tracking in `invoice_sequences`.

---

### 📦 Detailed Item-by-Item Breakdown

#### Item 1: Billing & Express Checkout
- **Cash Received Field**: Starts completely blank; never auto-fills with bill total.
- **Change Calculation**: Real-time `Change to return = Cash Received - Net Total` activates only after input.
- **Exact Cash Config**: Added `"Assume exact cash when blank"` toggle in `Settings > Billing` (default off).
- **Skinless Meat Yield**: Updated skinless available formula to use standard 550 g/kg (0.550 ratio), replacing the previous 625 g/kg dressed ratio.
- **Continuous Bill Sequence**: Implemented `invoiceNumberingService` using a single continuous sequence counter. Drafts and held bills preview the upcoming number without incrementing or consuming numbers, eliminating sequence gaps.

#### Item 2: Inventory & Reorder Management
- **Decimal Precision**: Truncated all quantities and egg tray counts to max 3 decimals; zero negative zero (`-0.0`) values.
- **Full-Width Layout**: Removed empty right-hand panel next to stock table; stock table now expands to full container width.
- **Low Stock & Reorders**: Relocated `"Purchasing Reminder: Low Stock Items"` out of Demand Forecast into a prominent section at the top of Inventory. Mutton at 0.00 kg is flagged with a critical red reorder badge.
- **Live Stock Consistency**: Unified bird counts and kilogram calculations across stock ledger, live batch management, and billing cards.

#### Item 3: Delivery Orders Daily Operations
- **Daily Operations View**: Defaults to today's date with fast `◀ Prev Day`, `Today`, and `Next Day ▶` date switcher. Historic records are deferred to prevent initial lag.
- **Touch-Friendly Delivery Cards**: Each order is displayed on a comprehensive operational card with Bill No, Customer, Phone, Address, Items summary, Total Amount, Payment Status, and Delivery Status.
- **Status Progression**: 1-tap progression buttons (`Open` -> `Out for Delivery` -> `Delivered` -> `Payment Collected` -> `Closed`).
- **Operational Tabs**: Organized into `Today Open`, `Payment Pending`, `Closed Today`, and `History (All Dates)` with search filtering.

#### Item 4: Procurement & Quick Purchases
- **Expected Pay Date**: Hidden and made optional in quick purchase entry; removed required asterisk while preserving nullable DB column.
- **Spacious Touch Rows**: Item selection row is tall (`min-h-[48px]`), prominent, and dominates horizontal width for rapid touchscreen operation.
- **Double-Enter Keyboard Workflow**: Typing an item code and pressing `Enter` once selects the item and focuses `Quantity`; `Enter` in `Quantity` moves to `Rate`; `Enter` in `Rate` adds a new row and focuses its search box.
- **Credit Purchases**: Purchases saved with Credit / Outstanding status immediately generate payable bills in `purchase_invoices` and update supplier balances.

#### Item 5: Payments & Receipts (Payables Dashboard)
- **Big Card/Tile Layout**: Rebuilt payables screen with large supplier cards showing Bill No, Date, Total, Paid, Balance, Due Date, and Status.
- **Per-Supplier Filtering**: Top summary tiles include per-supplier subtotals with 1-click filtering.
- **1-Click Payment Dialog**: Amount prefilled with remaining balance, quick "Pay Full" button, partial payment support, mode selector (`Cash`, `UPI`, `Bank`), reference input, and single-transaction execution.
- **Payment Reversal**: Added payment reversal with mandatory reason requirement.
- **Real Liquid Balances**: Derived Cash-in-hand and Bank balances from active non-voided transactions only.

#### Item 6: Clean Modular Reports
- **Streamlined Architecture**: Replaced complex custom query builder and pivot charts with 4 clean, focused reports:
  1. **Sales Report**: Bill No, Time, Customer, Mode, Items, Total.
  2. **Purchases Report**: Date, Supplier, Ref, Total, Paid, Balance.
  3. **Delivery Report**: Date, Bill, Customer, Status, Amount, Collected.
  4. **Inventory Report**: Product, Opening, In, Out, Wastage, Closing, Value.
- **Standard Controls**: Date presets (`Today`, `Yesterday`, `This Week`, `This Month`, `Custom`), 3-4 top summary tiles, bold Totals row, CSV Export, and Print preview.
- **Review Drafts**: Added header action to inspect and manage pending draft invoices.

#### Item 7: Products & Bulk Spreadsheet Import
- **Empty Spreadsheet Start**: Bulk Add Products opens clean and empty with zero prefilled dummy items.
- **Grid Editing**: Columns for Name, Category, Unit (`kg`, `g`, `pcs`, `tray`, `pack`), Buying Rate, Selling Rate, Code (auto-suggests next free code), and Inventory Tracking toggle.
- **Clipboard & Template Support**: Excel / TSV direct paste, CSV import, and downloadable sample CSV template.
- **Validation**: Highlights duplicate codes/names and warns when Selling Rate <= Buying Rate.
- **Margin Badges**: Product catalogue displays warning badge (`⚠️ Low/Zero Margin: Sell ≤ Buy`) on low/zero margin items.

#### Item 8: Customer CRM Rules & Dual Party Linking
- **Rules Settings Modal**: Added cashier-accessible modal on Customer screen to configure:
  - VIP spend threshold and visit count
  - Regular visit criteria
  - New customer window days
  - At-risk gap multiplier
  - Inactive days threshold
  - Wholesale and restaurant classification tags
- **Recalculate All**: 1-click re-evaluation across all customers with support for manual tier overrides.
- **Dual Party Linking**: Display `🔗 Also Supplier` badge and allow linking customer to supplier records (e.g. "rahul") without duplicate conflicts.

#### Item 9: Credit (A/R) & Khata Management
- **Debtor Dashboard**: Real-time A/R dashboard with Top Debtors cards, Aging Schedule, and Statements.
- **1-Click Collection**: Big "Collect Payment" button per debtor supporting full/partial settlement, advance adjustment offset, and cash/UPI/bank modes.
- **WhatsApp Integration**: 1-click WhatsApp payment reminder with pre-formatted balance details.

#### Item 10: Cashier-Friendly HR & Payroll
- **Default Cashier Screen**: Clean Staff List with large cards showing Name, Role, Basic Salary, Attendance, and Advance balance.
- **1-Tap Attendance**: Big buttons for `Present`, `Half Day`, and `Absent`.
- **Quick Advance & Salary**: Direct `+ Give Advance` and `Monthly Payslip / Pay Salary` buttons.
- **Organized Navigation**: Advanced tabs (`Leaves`, `Incentives`, `Overtime`, `Deductions`, `Master Ledger`, `Reports & Audit`) neatly organized under a `"More ▾"` menu.
- **Salary Integrity**: Salary expenses strictly linked to employees; historical Kaif salary entry mapped to `EMP-00001`.

#### Item 11: Cash Box & Close Shift
- **Multi-Method Breakdown**: Denomination/counted fields for Cash, Paytm, Google Pay, PhonePe, Card, and Other methods.
- **Expected vs Counted**: Real-time comparison table with color-coded difference indicators.
- **Opening Cash Tally**: Opening cash automatically tallies with yesterday's closing cash; mandatory explanation required for discrepancies.
- **IST Timezone & Stale Shift Detection**: Correct local timestamp display and 1-click closure for shifts left open from previous days.
- **Sales Aggregation Fix**: Reconciled cash sales aggregation to exclude voided test entries.

#### Item 12: Quick Expenses
- **Quick Category Tiles**: Big touch-friendly tiles for Rent, Electricity, Salary, Fuel, Packaging, Transport, Repairs, Tea/Misc, and Other.
- **Number Pad Entry**: Rapid amount input via on-screen number pad or physical keyboard.
- **Mandatory Employee Picker**: Salary category strictly enforces picking an active employee, preventing orphan salary records.
- **Double-Entry Integration**: Automatically posts balanced debit and credit entries to the general ledger and records cash movements during active shifts.

#### Item 13: Daily Market Prices & Auto-Fetch
- **Automated Price Fetch**: Background fetch service with 6s timeout, 1 retry, and configurable Regex/CSS parser rules.
- **Suggested Rates Banner**: Displays fetched rates with source name, timestamp, and 1-click "Apply Rate" button that syncs directly to catalogue variants.
- **Offline Resilience**: Graceful error handling and fallback badges when offline; manual rate entry remains 100% operational.
- **Sources & Schedule Tab**: Added UI to configure source URLs, parsing rules, refresh schedule, and view price history logs.

#### Item 14: Double-Entry General Ledger
- **Core Ledger Views**: Real double-entry system with Day Book, Cash Book, Bank Book, Party Ledger, Trial Balance, Ledger Health, and Audit Logs.
- **Balanced Journal Posting**: Standardized `postDoubleEntry` inserting paired Debit and Credit rows with shared voucher group IDs.
- **1-Click Auto-Balance**: Automatic reconciliation tool that pairs legacy single-sided entries and brings the ledger into balance.

#### Item 15: Bank Statement Reconciliation
- **Dual Mode Support**:
  - **Manual Mode**: Drag-and-drop CSV/XLSX statement upload with presets for PhonePe, Paytm, Google Pay, HDFC, and SBI. Tabbed views for Matched, Unmatched Bills, Unmatched Credits, and Duplicates.
  - **Automatic Gateway Mode**: Live settlement polling adapter for PhonePe Merchant, Paytm Business, Razorpay, and HDFC SmartHub with credentials setup guide.

#### Item 16: AI Demand Forecast & Tamil Nadu Calendar
- **Predictive Demand Modeling**: Demand estimates based on 8-week same-weekday rolling averages with festival impact multipliers.
- **Procurement Recommendations**: 7-day purchasing recommendations with lead-time buffers.
- **Tamil Nadu Calendar (Nov 2026 - Dec 2027)**: Comprehensive seed data for local festivals and fasting days (Deepavali, Pongal, Kari Naal, Purattasi, Karthigai Deepam, Eid, Christmas) with verified Panchangam dates.

#### Item 17: Settings & Payment Methods Manager
- **Business Profile**: Placeholders with clear format hints (GSTIN, PAN); blank fields display cleanly without placeholder artifacts.
- **Billing Settings**: Added toggles for "Assume exact cash when blank" and "Terminal Inactivity Lock Timeout" (1h, 4h, 8h, 12h, Never).
- **Payment Methods Manager**: Dynamic manager in `Settings > Payment Methods` to add, rename, enable/disable, and reorder payment options.

#### Item 18: Theme & Visual Polish
- **Refined Color Palette**: Light mode neutral surfaces (`#f8fafc`, `#ffffff`) and dark mode neutral charcoal palette (`#090d16`, `#111827`, `#1e293b`).
- **High-Contrast Typography**: Enhanced text contrast tokens (`#64748b` light / `#94a3b8` dark) eliminating faded grey-on-grey text.

#### Item 19: System Diagnostics, Lock Screen & Emergency Recovery
- **Terminal Lock Screen**: Idle inactivity tracker locks terminal after configured timeout or manual `Ctrl + L`. Cashier PIN unlocks without clearing cart or shift.
- **1-Click Emergency Database Recovery**: Emergency recovery feature in Settings restoring from automated pre-migration and exit backups in `db_backups/`.

---

### 🧪 Automated Verification Results
- **TypeScript Node Compilation (`tsc -p tsconfig.node.json`)**: 0 errors.
- **TypeScript Web Compilation (`tsc -p tsconfig.web.json`)**: 0 errors.
- **Vite Web Production Bundle (`npm run build:web`)**: Built successfully in 28.74s.
- **Enterprise Overhaul Test Suite (`enterprise_overhaul.test.js`)**: **21 passed, 0 failed**.
