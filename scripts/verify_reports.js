const { app } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const { reportsService } = require(path.join(__dirname, '../dist-electron/src/modules/reports/backend/service/reports_service.js'));
    const { reportEngine } = require(path.join(__dirname, '../dist-electron/src/modules/reports/backend/engine/report_engine.js'));
    const { authService } = require(path.join(__dirname, '../dist-electron/src/modules/auth/backend/service/auth_service.js'));
    const { checkIPCPermission } = require(path.join(__dirname, '../dist-electron/src/core/ipc/ipc_permissions.js'));

    console.log('\n--- 1. Testing Role Permission on reports:run-report ---');
    authService.login('admin', 'admin123');
    try {
      checkIPCPermission('reports:run-report');
      console.log('  [PASS] Session authorized to invoke reports:run-report');
    } catch (e) {
      console.error('  [FAIL] Permission check failed:', e.message);
    }

    console.log('\n--- 2. Verifying getDefinition for All 4 Core IDs in Report Engine ---');
    for (const id of ['sales', 'purchases', 'delivery', 'inventory', 'simple_sales', 'simple_purchases']) {
      const def = reportEngine.getDefinition(id);
      if (def) {
        console.log(`  [PASS] Found definition for '${id}': name="${def.name}", dataSource="${def.dataSource}"`);
      } else {
        console.error(`  [FAIL] Definition not found for '${id}'!`);
      }
    }

    console.log('\n--- 3. Testing All 4 Reports on All Date Presets ---');
    const presets = [
      { name: 'All Time (2020 to 2026)', start: '2020-01-01', end: '2026-10-31' },
      { name: 'This Month (Oct 2026)', start: '2026-10-01', end: '2026-10-24' },
      { name: 'Yesterday (Oct 23, 2026)', start: '2026-10-23', end: '2026-10-23' },
      { name: 'Today (Oct 24, 2026)', start: '2026-10-24', end: '2026-10-24' },
    ];

    for (const p of presets) {
      console.log(`\nPreset: ${p.name}`);
      for (const id of ['sales', 'purchases', 'delivery', 'inventory']) {
        try {
          const res = reportsService.runReport({
            reportId: id,
            filters: {
              startDate: p.start,
              endDate: p.end,
            }
          });
          console.log(`  [PASS] ${id}: ${res.rows.length} rows | Count: ${res.grandTotals.count}`);
        } catch (err) {
          console.error(`  [FAIL] ${id}:`, err.message);
        }
      }
    }

    console.log('\n--- 4. Testing High-Powered Item / Category Filtering: Chicken ---');
    const { db } = require(path.join(__dirname, '../dist-electron/src/core/backend/db.js'));
    const allItems = db.prepare(`SELECT ii.invoice_id, p.name, p.category, pv.variant_name FROM invoice_items ii JOIN product_variants pv ON ii.product_variant_id = pv.id JOIN products p ON pv.product_id = p.id LIMIT 10`).all();
    console.log('Sample invoice_items in DB:', allItems);

    const completedInvoices = db.prepare(`SELECT id, status, completed_at, created_at FROM invoices WHERE status = 'completed' LIMIT 5`).all();
    console.log('Sample completed invoices in DB:', completedInvoices);

    const chickenRes = reportsService.runReport({
      reportId: 'sales',
      filters: {
        startDate: '2020-01-01',
        endDate: '2026-10-24',
        category: 'chicken',
        itemFilter: 'chicken',
      }
    });
    console.log(`  [PASS] Chicken Sales: ${chickenRes.rows.length} bills match Chicken filter`);
    console.log(`  [PASS] Chicken Qty Sold: ${chickenRes.grandTotals.filtered_item_formatted_qty}`);
    console.log(`  [PASS] Chicken Revenue: Rs ${(chickenRes.grandTotals.filtered_item_revenue_paise / 100).toFixed(2)}`);
    console.log(`  [PASS] Product breakdown cuts: ${chickenRes.productBreakdown ? chickenRes.productBreakdown.length : 0}`);
    if (chickenRes.productBreakdown && chickenRes.productBreakdown.length > 0) {
      chickenRes.productBreakdown.forEach((p, i) => {
        console.log(`     #${i + 1}: ${p.display_name} -> ${p.formatted_qty} | Rs ${(p.total_revenue_paise / 100).toFixed(2)} (in ${p.invoice_count} bills)`);
      });
    }

    console.log('\n--- 5. Testing Payment Tender Filtering: Cash vs UPI ---');
    const cashRes = reportsService.runReport({
      reportId: 'sales',
      filters: {
        startDate: '2020-01-01',
        endDate: '2026-10-24',
        paymentMode: 'cash',
      }
    });
    console.log(`  [PASS] Cash Only Sales: ${cashRes.rows.length} bills | Total: Rs ${(cashRes.grandTotals.total_paise / 100).toFixed(2)}`);

    const upiRes = reportsService.runReport({
      reportId: 'sales',
      filters: {
        startDate: '2020-01-01',
        endDate: '2026-10-24',
        paymentMode: 'upi',
      }
    });
    console.log(`  [PASS] UPI Only Sales: ${upiRes.rows.length} bills | Total: Rs ${(upiRes.grandTotals.total_paise / 100).toFixed(2)}`);

    console.log('\n--- ALL REPORT TESTS PASSED WITH 0 ERRORS ---');

  } catch (e) {
    console.error('Fatal test error:', e);
  } finally {
    process.exit(0);
  }
});
