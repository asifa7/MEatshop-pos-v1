import { db } from '../../../../core/backend/db';
import { logger, auditLogger } from '../../../../core/backend/logger';
import { authService } from '../../../auth/backend/service/auth_service';
import type { 
  PosSession, 
  ShiftCashMovement, 
  ShiftClosingRecord, 
  ShiftCorrection, 
  ShiftSummaryItem,
  ShiftMovementType 
} from '../../../../core/types/enterprise_types';

export interface ShiftMovementInput {
  movement_type: ShiftMovementType;
  category: string;
  amount_paise: number;
  reason: string;
  added_by?: string;
  taken_by?: string;
  expense_category_id?: number;
}

export interface ShiftClosingInput {
  sessionId: number;
  closingCashPaise: number;
  denominations?: Record<string, number>;
  countedByMethod?: Record<string, number>; // method_key -> counted_paise
  declaredReason?: string;
  notes?: string;
}

export interface PaymentMethodConfigRow {
  id: number;
  method_key: string;
  display_name: string;
  method_type: string;
  is_enabled: number;
  sort_order: number;
}

export interface MethodExpectedBreakdown {
  methodKey: string;
  displayName: string;
  methodType: string;
  expectedPaise: number;
  txCount: number;
}

export interface ShiftCorrectionInput {
  sessionId: number;
  movementId?: number;
  action: 'update_movement' | 'delete_movement' | 'adjust_closing';
  amount_paise?: number;
  category?: string;
  reason: string;
  authPinOrPassword?: string;
}

export interface ShiftHistoryFilter {
  startDate?: string;
  endDate?: string;
  cashierId?: number;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Normalizes SQLite UTC timestamps ("YYYY-MM-DD HH:MM:SS") into valid ISO-8601 UTC strings
 * so JavaScript Date always converts accurately to local time (IST).
 */
export function normalizeSqliteTimestamp(ts?: string | null): string | null {
  if (!ts) return null;
  const trimmed = String(ts).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) {
    return trimmed.replace(' ', 'T') + 'Z';
  }
  return trimmed;
}

export function isShiftFromPreviousDay(openedAt?: string | null): boolean {
  const norm = normalizeSqliteTimestamp(openedAt);
  if (!norm) return false;
  const openedDate = new Date(norm);
  if (isNaN(openedDate.getTime())) return false;
  const now = new Date();
  return (
    openedDate.getFullYear() !== now.getFullYear() ||
    openedDate.getMonth() !== now.getMonth() ||
    openedDate.getDate() !== now.getDate()
  );
}

export class CashBoxService {
  public getPaymentMethods(includeDisabled = false): PaymentMethodConfigRow[] {
    try {
      const sql = includeDisabled
        ? 'SELECT * FROM payment_methods_config ORDER BY sort_order ASC, id ASC'
        : 'SELECT * FROM payment_methods_config WHERE is_enabled = 1 ORDER BY sort_order ASC, id ASC';
      const rows = db.prepare(sql).all() as PaymentMethodConfigRow[];
      if (rows.length > 0) return rows;
    } catch {
      // Fallback if table not migrated yet
    }
    return [
      { id: 1, method_key: 'cash', display_name: 'Cash', method_type: 'CASH', is_enabled: 1, sort_order: 1 },
      { id: 2, method_key: 'paytm', display_name: 'Paytm', method_type: 'UPI', is_enabled: 1, sort_order: 2 },
      { id: 3, method_key: 'gpay', display_name: 'Google Pay', method_type: 'UPI', is_enabled: 1, sort_order: 3 },
      { id: 4, method_key: 'phonepe', display_name: 'PhonePe', method_type: 'UPI', is_enabled: 1, sort_order: 4 },
      { id: 5, method_key: 'card', display_name: 'Card', method_type: 'CARD', is_enabled: 1, sort_order: 5 },
      { id: 6, method_key: 'other', display_name: 'Other', method_type: 'OTHER', is_enabled: 1, sort_order: 6 },
    ];
  }

  public savePaymentMethod(input: {
    id?: number;
    method_key?: string;
    display_name: string;
    method_type?: string;
    is_enabled?: boolean | number;
    sort_order?: number;
  }): PaymentMethodConfigRow[] {
    const cleanName = (input.display_name || '').trim();
    if (!cleanName) throw new Error('Payment method name is required');
    const enabledInt = input.is_enabled === undefined ? 1 : input.is_enabled ? 1 : 0;
    const methodType = (input.method_type || 'OTHER').toUpperCase();

    if (input.id) {
      db.prepare(`
        UPDATE payment_methods_config
        SET display_name = ?, method_type = COALESCE(?, method_type), is_enabled = ?, sort_order = COALESCE(?, sort_order), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cleanName, methodType, enabledInt, input.sort_order ?? null, input.id);
    } else {
      const key = (input.method_key || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')).replace(/^_+|_+$/g, '') || `method_${Date.now()}`;
      const maxOrderRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as max_order FROM payment_methods_config').get() as { max_order: number };
      db.prepare(`
        INSERT INTO payment_methods_config (method_key, display_name, method_type, is_enabled, sort_order)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(method_key) DO UPDATE SET
          display_name = excluded.display_name,
          method_type = excluded.method_type,
          is_enabled = excluded.is_enabled,
          updated_at = CURRENT_TIMESTAMP
      `).run(key, cleanName, methodType, enabledInt, input.sort_order ?? ((maxOrderRow?.max_order || 0) + 1));
    }

    return this.getPaymentMethods(true);
  }

  public getLastClosedShiftSummary(): {
    previousSessionId: number | null;
    previousClosingCashPaise: number;
    previousClosedAt: string | null;
    previousCashierName: string | null;
  } {
    const row = db.prepare(`
      SELECT 
        ps.id as session_id,
        COALESCE(scr.physical_cash_paise, ps.closing_cash_paise, 0) as closing_cash_paise,
        COALESCE(scr.closed_at, ps.closed_at) as closed_at,
        COALESCE(u.full_name, u.username, 'Cashier #' || ps.cashier_id) as cashier_name
      FROM pos_sessions ps
      LEFT JOIN shift_closing_records scr ON scr.session_id = ps.id
      LEFT JOIN users u ON u.id = ps.cashier_id
      WHERE ps.status = 'Closed'
      ORDER BY ps.id DESC
      LIMIT 1
    `).get() as { session_id: number; closing_cash_paise: number; closed_at: string | null; cashier_name: string } | undefined;

    if (!row) {
      return {
        previousSessionId: null,
        previousClosingCashPaise: 0,
        previousClosedAt: null,
        previousCashierName: null,
      };
    }

    return {
      previousSessionId: row.session_id,
      previousClosingCashPaise: row.closing_cash_paise || 0,
      previousClosedAt: normalizeSqliteTimestamp(row.closed_at),
      previousCashierName: row.cashier_name,
    };
  }

  /**
   * Calculates live expected cash from the unified formula:
   * Expected = Opening Float + Cash Sales (completed invoices only) + Cash In - Cash Expenses - Cash Refunds - Cash Out
   */
  public calculateExpectedCash(sessionId: number): {
    openingCashPaise: number;
    cashSalesPaise: number;
    cashInPaise: number;
    cashExpensesPaise: number;
    cashRefundsPaise: number;
    cashOutPaise: number;
    expectedCashPaise: number;
  } {
    const session = db.prepare('SELECT * FROM pos_sessions WHERE id = ?').get(sessionId) as PosSession | undefined;
    if (!session) {
      return {
        openingCashPaise: 0,
        cashSalesPaise: 0,
        cashInPaise: 0,
        cashExpensesPaise: 0,
        cashRefundsPaise: 0,
        cashOutPaise: 0,
        expectedCashPaise: 0,
      };
    }

    const openingCashPaise = session.opening_cash_paise || 0;

    // 1. Cash Sales from store_cash_box - strictly verified against completed non-void invoices
    const salesRow = db.prepare(`
      SELECT COALESCE(SUM(scb.amount_paise), 0) as total
      FROM store_cash_box scb
      LEFT JOIN invoices i ON i.id = scb.invoice_id
      WHERE scb.session_id = ?
        AND scb.type = 'CASH_SALE'
        AND scb.is_active = 1
        AND (scb.invoice_id IS NULL OR i.status = 'completed')
    `).get(sessionId) as { total: number };
    const cashSalesPaise = salesRow?.total || 0;

    // 2. Cash In from shift_cash_movements
    const cashInRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as total
      FROM shift_cash_movements
      WHERE session_id = ? AND movement_type = 'cash_in' AND is_active = 1
    `).get(sessionId) as { total: number };
    const cashInPaise = cashInRow?.total || 0;

    // 3. Cash Expenses from shift_cash_movements
    const expenseRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as total
      FROM shift_cash_movements
      WHERE session_id = ? AND movement_type = 'expense' AND is_active = 1
    `).get(sessionId) as { total: number };
    const cashExpensesPaise = expenseRow?.total || 0;

    // 4. Cash Refunds from store_cash_box
    const refundRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as total
      FROM store_cash_box
      WHERE session_id = ? AND type = 'CASH_REFUND' AND is_active = 1
    `).get(sessionId) as { total: number };
    const cashRefundsPaise = refundRow?.total || 0;

    // 5. Cash Out from shift_cash_movements (and supplier cash payments in store_cash_box not in shift_cash_movements)
    const cashOutRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as total
      FROM shift_cash_movements
      WHERE session_id = ? AND movement_type = 'cash_out' AND is_active = 1
    `).get(sessionId) as { total: number };
    const cashOutPaise = cashOutRow?.total || 0;

    const expectedCashPaise = openingCashPaise + cashSalesPaise + cashInPaise - cashExpensesPaise - cashRefundsPaise - cashOutPaise;

    return {
      openingCashPaise,
      cashSalesPaise,
      cashInPaise,
      cashExpensesPaise,
      cashRefundsPaise,
      cashOutPaise,
      expectedCashPaise,
    };
  }

  /**
   * Computes Non-Cash sales summary AND per-payment-method expected breakdown for a session
   */
  public calculateNonCashSummary(sessionId: number): {
    upiSalesPaise: number;
    upiCount: number;
    cardSalesPaise: number;
    cardCount: number;
    creditSalesPaise: number;
    creditCount: number;
    totalNonCashPaise: number;
    expectedByMethod: MethodExpectedBreakdown[];
  } {
    const session = db.prepare('SELECT * FROM pos_sessions WHERE id = ?').get(sessionId) as PosSession | undefined;
    const configuredMethods = this.getPaymentMethods(false);
    const expectedCash = session ? this.calculateExpectedCash(sessionId).expectedCashPaise : 0;

    const methodMap = new Map<string, MethodExpectedBreakdown>();
    for (const m of configuredMethods) {
      methodMap.set(m.method_key, {
        methodKey: m.method_key,
        displayName: m.display_name,
        methodType: m.method_type,
        expectedPaise: m.method_key === 'cash' ? expectedCash : 0,
        txCount: 0,
      });
    }

    if (!session) {
      return {
        upiSalesPaise: 0,
        upiCount: 0,
        cardSalesPaise: 0,
        cardCount: 0,
        creditSalesPaise: 0,
        creditCount: 0,
        totalNonCashPaise: 0,
        expectedByMethod: Array.from(methodMap.values()),
      };
    }

    const timeClause = session.closed_at
      ? 'AND (datetime(i.completed_at) >= datetime(?) AND datetime(i.completed_at) <= datetime(?))'
      : 'AND datetime(i.completed_at) >= datetime(?)';
    const params = session.closed_at
      ? [session.opened_at, session.closed_at]
      : [session.opened_at];

    const payments = db.prepare(`
      SELECT p.method, p.reference, COALESCE(SUM(p.amount_paise), 0) as total, COUNT(p.id) as count
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      WHERE i.status = 'completed' ${timeClause}
      GROUP BY p.method, p.reference
    `).all(...params) as Array<{ method: string; reference: string | null; total: number; count: number }>;

    let upiSalesPaise = 0, upiCount = 0;
    let cardSalesPaise = 0, cardCount = 0;
    let creditSalesPaise = 0, creditCount = 0;

    payments.forEach(p => {
      const m = (p.method || '').toLowerCase();
      const ref = (p.reference || '').toLowerCase();
      const combined = `${m} ${ref}`;

      if (m === 'cash') {
        const cashEntry = methodMap.get('cash');
        if (cashEntry) cashEntry.txCount += p.count;
        return;
      }

      if (m.includes('credit') || m.includes('ar') || m.includes('customer') || m.includes('udhaar')) {
        creditSalesPaise += p.total;
        creditCount += p.count;
        return;
      }

      if (combined.includes('paytm')) {
        upiSalesPaise += p.total;
        upiCount += p.count;
        const target = methodMap.get('paytm') || methodMap.get('other');
        if (target) { target.expectedPaise += p.total; target.txCount += p.count; }
      } else if (combined.includes('gpay') || combined.includes('google')) {
        upiSalesPaise += p.total;
        upiCount += p.count;
        const target = methodMap.get('gpay') || methodMap.get('other');
        if (target) { target.expectedPaise += p.total; target.txCount += p.count; }
      } else if (combined.includes('phonepe')) {
        upiSalesPaise += p.total;
        upiCount += p.count;
        const target = methodMap.get('phonepe') || methodMap.get('other');
        if (target) { target.expectedPaise += p.total; target.txCount += p.count; }
      } else if (m.includes('upi') || m.includes('qr')) {
        upiSalesPaise += p.total;
        upiCount += p.count;
        // Check if custom method matches `m`, otherwise put in gpay/phonepe/paytm or other
        const exact = methodMap.get(m) || methodMap.get('gpay') || methodMap.get('phonepe') || methodMap.get('paytm') || methodMap.get('other');
        if (exact) { exact.expectedPaise += p.total; exact.txCount += p.count; }
      } else if (m.includes('card') || m.includes('pos') || m.includes('debit') || m.includes('swipe')) {
        cardSalesPaise += p.total;
        cardCount += p.count;
        const target = methodMap.get('card') || methodMap.get('other');
        if (target) { target.expectedPaise += p.total; target.txCount += p.count; }
      } else {
        const custom = methodMap.get(m) || methodMap.get('other');
        if (custom) { custom.expectedPaise += p.total; custom.txCount += p.count; }
      }
    });

    return {
      upiSalesPaise,
      upiCount,
      cardSalesPaise,
      cardCount,
      creditSalesPaise,
      creditCount,
      totalNonCashPaise: upiSalesPaise + cardSalesPaise + creditSalesPaise,
      expectedByMethod: Array.from(methodMap.values()),
    };
  }

  public getCurrentSession(): (PosSession & {
    opened_at_iso?: string | null;
    is_stale_previous_day?: boolean;
    previous_closing_cash_paise?: number;
    previous_session_id?: number | null;
    previous_closed_at?: string | null;
  }) | null {
    const cashierId = authService.getCurrentUserId();
    let session = (db.prepare("SELECT * FROM pos_sessions WHERE cashier_id = ? AND status = 'Open' ORDER BY id DESC LIMIT 1").get(cashierId) as PosSession | undefined) || null;
    if (!session) {
      session = (db.prepare("SELECT * FROM pos_sessions WHERE status = 'Open' ORDER BY id DESC LIMIT 1").get() as PosSession | undefined) || null;
    }
    if (!session) return null;

    const prev = this.getLastClosedShiftSummary();
    const openedIso = normalizeSqliteTimestamp(session.opened_at);
    return {
      ...session,
      opened_at: openedIso || session.opened_at,
      opened_at_iso: openedIso,
      is_stale_previous_day: isShiftFromPreviousDay(session.opened_at),
      previous_closing_cash_paise: prev.previousClosingCashPaise,
      previous_session_id: prev.previousSessionId,
      previous_closed_at: prev.previousClosedAt,
    };
  }

  public openSession(
    openingCashPaise: number,
    denominations?: Record<string, number>,
    openingVarianceReason?: string
  ): PosSession {
    const cashierId = authService.getCurrentUserId();
    const existing = this.getCurrentSession();
    if (existing) return existing;

    if (!Number.isSafeInteger(openingCashPaise) || openingCashPaise < 0) throw new Error('Invalid opening cash float');

    const prev = this.getLastClosedShiftSummary();
    const diffFromPrev = prev.previousSessionId !== null ? openingCashPaise - prev.previousClosingCashPaise : 0;
    if (prev.previousSessionId !== null && diffFromPrev !== 0 && !openingVarianceReason?.trim()) {
      throw new Error(
        `Opening cash (₹${(openingCashPaise / 100).toFixed(2)}) does not match previous shift #${prev.previousSessionId} closing cash (₹${(prev.previousClosingCashPaise / 100).toFixed(2)}). A reason is required.`
      );
    }

    const nowIso = new Date().toISOString();
    const openingNote =
      prev.previousSessionId !== null && diffFromPrev !== 0
        ? `Opening cash variance vs Shift #${prev.previousSessionId} (${diffFromPrev > 0 ? '+' : ''}₹${(diffFromPrev / 100).toFixed(2)}): ${openingVarianceReason?.trim()}`
        : null;

    return db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO pos_sessions (store_id, cashier_id, opened_at, opening_cash_paise, opening_denominations_json, status, notes, created_by)
        VALUES (1, ?, ?, ?, ?, 'Open', ?, ?)
      `).run(cashierId, nowIso, openingCashPaise, JSON.stringify(denominations ?? {}), openingNote, cashierId);

      const sessionId = Number(result.lastInsertRowid);

      if (openingCashPaise > 0 || prev.previousSessionId !== null) {
        db.prepare(`
          INSERT INTO store_cash_box
          (store_id, session_id, type, direction, amount_paise, category, reason, denomination_snapshot_json, expected_before_paise, expected_after_paise, performed_by, created_by)
          VALUES (1, ?, 'OPENING_BALANCE', 'IN', ?, 'Opening float', ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          openingCashPaise,
          openingNote || 'Counted opening cash (tallied with previous shift)',
          JSON.stringify(denominations ?? {}),
          prev.previousClosingCashPaise,
          openingCashPaise,
          cashierId,
          cashierId
        );
      }

      auditLogger.log(cashierId, 'CASHBOX_OPEN_SESSION', {
        sessionId,
        openingCashPaise,
        previousClosingCashPaise: prev.previousClosingCashPaise,
        diffFromPrev,
        openingVarianceReason,
      });
      logger.info('POS shift session opened', { cashierId, sessionId, openingCashPaise, diffFromPrev });
      return this.getCurrentSession() as PosSession;
    })();
  }

  /**
   * Section A: Record real categorized cash movement (Cash In, Cash Out, Shop Expense)
   */
  public recordMovement(input: ShiftMovementInput): { success: boolean; movement: ShiftCashMovement; liveExpectedCashPaise: number } {
    const cashierId = authService.getCurrentUserId();
    const session = this.getCurrentSession();
    if (!session) throw new Error('Open a cash shift before recording cash movements');

    if (!Number.isSafeInteger(input.amount_paise) || input.amount_paise <= 0) {
      throw new Error('Cash movement amount must be a positive whole number of paise');
    }
    if (!input.reason?.trim()) {
      throw new Error('Reason / description is mandatory for all cash movements');
    }

    const today = new Date().toISOString().split('T')[0];

    return db.transaction(() => {
      let expenseId: number | null = null;

      // 1. If Expense, sync with store expenses table and daily ledger
      if (input.movement_type === 'expense') {
        const expResult = db.prepare(`
          INSERT INTO expenses (store_id, category_id, vendor_name, amount_paise, gst_paise, payment_method, expense_date, notes, status, created_by)
          VALUES (1, ?, ?, ?, 0, 'Cash', ?, ?, 'Approved', ?)
        `).run(
          input.expense_category_id || 1,
          input.taken_by || null,
          input.amount_paise,
          today,
          `Shift #${session.id} Expense (${input.category}): ${input.reason.trim()}`,
          cashierId
        );
        expenseId = Number(expResult.lastInsertRowid);

        db.prepare(`
          INSERT INTO accounting_daily_ledger (store_id, date, account_type, reference_id, description, debit_paise, created_by)
          VALUES (1, ?, 'Expense', ?, ?, ?, ?)
        `).run(
          today,
          `EXP-SHIFT-${session.id}-${expenseId}`,
          `Shift #${session.id} Expense: ${input.reason.trim()}`,
          input.amount_paise,
          cashierId
        );
      }

      // 2. Insert into shift_cash_movements
      const moveResult = db.prepare(`
        INSERT INTO shift_cash_movements
        (store_id, session_id, movement_type, category, amount_paise, reason, added_by, taken_by, expense_id, is_active, created_by)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        session.id,
        input.movement_type,
        input.category.trim() || input.movement_type,
        input.amount_paise,
        input.reason.trim(),
        input.added_by?.trim() || null,
        input.taken_by?.trim() || null,
        expenseId,
        cashierId
      );
      const movementId = Number(moveResult.lastInsertRowid);

      // 3. Mirror into store_cash_box for unified transaction view
      const direction = input.movement_type === 'cash_in' ? 'IN' : 'OUT';
      const boxType = input.movement_type === 'cash_in' ? 'CASH_IN' : input.movement_type === 'expense' ? 'CASH_EXPENSE' : 'CASH_WITHDRAWAL';
      
      const before = this.calculateExpectedCash(session.id).expectedCashPaise - (direction === 'IN' ? input.amount_paise : -input.amount_paise);
      const after = before + (direction === 'IN' ? input.amount_paise : -input.amount_paise);

      db.prepare(`
        INSERT INTO store_cash_box
        (store_id, session_id, type, direction, amount_paise, category, reason, reference_type, reference_id, expected_before_paise, expected_after_paise, performed_by, created_by)
        VALUES (1, ?, ?, ?, ?, ?, ?, 'SHIFT_MOVEMENT', ?, ?, ?, ?, ?)
      `).run(
        session.id,
        boxType,
        direction,
        input.amount_paise,
        input.category.trim(),
        input.reason.trim(),
        String(movementId),
        before,
        after,
        cashierId,
        cashierId
      );

      const liveExpected = this.calculateExpectedCash(session.id).expectedCashPaise;

      auditLogger.log(cashierId, 'SHIFT_RECORD_MOVEMENT', {
        sessionId: session.id,
        movementId,
        movementType: input.movement_type,
        amountPaise: input.amount_paise,
        category: input.category,
      });

      const movement = db.prepare('SELECT * FROM shift_cash_movements WHERE id = ?').get(movementId) as ShiftCashMovement;
      return { success: true, movement, liveExpectedCashPaise: liveExpected };
    })();
  }

  /**
   * Edit movement on a still-OPEN shift directly
   */
  public updateOpenMovement(movementId: number, input: Partial<ShiftMovementInput>): ShiftCashMovement {
    const cashierId = authService.getCurrentUserId();
    const movement = db.prepare('SELECT * FROM shift_cash_movements WHERE id = ?').get(movementId) as ShiftCashMovement | undefined;
    if (!movement) throw new Error('Shift movement not found');

    const session = db.prepare('SELECT * FROM pos_sessions WHERE id = ?').get(movement.session_id) as PosSession | undefined;
    if (!session || session.status !== 'Open') {
      throw new Error('Direct editing is locked on closed shifts. Use the Correction action instead.');
    }

    return db.transaction(() => {
      const newAmount = input.amount_paise !== undefined ? input.amount_paise : movement.amount_paise;
      const newCategory = input.category !== undefined ? input.category.trim() : movement.category;
      const newReason = input.reason !== undefined ? input.reason.trim() : movement.reason;
      const newAddedBy = input.added_by !== undefined ? input.added_by.trim() : movement.added_by;
      const newTakenBy = input.taken_by !== undefined ? input.taken_by.trim() : movement.taken_by;

      if (!Number.isSafeInteger(newAmount) || newAmount <= 0) throw new Error('Invalid cash amount');
      if (!newReason) throw new Error('Reason cannot be blank');

      db.prepare(`
        UPDATE shift_cash_movements
        SET amount_paise = ?, category = ?, reason = ?, added_by = ?, taken_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newAmount, newCategory, newReason, newAddedBy, newTakenBy, movementId);

      // Update linked store_cash_box
      db.prepare(`
        UPDATE store_cash_box
        SET amount_paise = ?, category = ?, reason = ?
        WHERE session_id = ? AND reference_type = 'SHIFT_MOVEMENT' AND reference_id = ?
      `).run(newAmount, newCategory, newReason, movement.session_id, String(movementId));

      // Update linked expense if applicable
      if (movement.expense_id) {
        db.prepare('UPDATE expenses SET amount_paise = ?, notes = ? WHERE id = ?').run(newAmount, newReason, movement.expense_id);
        db.prepare("UPDATE accounting_daily_ledger SET debit_paise = ?, description = ? WHERE reference_id = ?").run(
          newAmount,
          `Shift #${session.id} Expense: ${newReason}`,
          `EXP-SHIFT-${session.id}-${movement.expense_id}`
        );
      }

      auditLogger.log(cashierId, 'SHIFT_UPDATE_OPEN_MOVEMENT', { movementId, newAmount });
      return db.prepare('SELECT * FROM shift_cash_movements WHERE id = ?').get(movementId) as ShiftCashMovement;
    })();
  }

  /**
   * Delete movement on a still-OPEN shift directly
   */
  public deleteOpenMovement(movementId: number): { success: boolean } {
    const cashierId = authService.getCurrentUserId();
    const movement = db.prepare('SELECT * FROM shift_cash_movements WHERE id = ?').get(movementId) as ShiftCashMovement | undefined;
    if (!movement) throw new Error('Shift movement not found');

    const session = db.prepare('SELECT * FROM pos_sessions WHERE id = ?').get(movement.session_id) as PosSession | undefined;
    if (!session || session.status !== 'Open') {
      throw new Error('Direct deletion is locked on closed shifts. Use the Correction action instead.');
    }

    return db.transaction(() => {
      db.prepare('UPDATE shift_cash_movements SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(movementId);
      db.prepare("UPDATE store_cash_box SET is_active = 0 WHERE session_id = ? AND reference_type = 'SHIFT_MOVEMENT' AND reference_id = ?").run(
        movement.session_id,
        String(movementId)
      );

      if (movement.expense_id) {
        db.prepare("UPDATE expenses SET status = 'Rejected', is_active = 0 WHERE id = ?").run(movement.expense_id);
      }

      auditLogger.log(cashierId, 'SHIFT_DELETE_OPEN_MOVEMENT', { movementId, sessionId: session.id });
      return { success: true };
    })();
  }

  /**
   * Section B: Step-by-Step Shift Closing Flow
   */
  public closeSession(input: ShiftClosingInput): { session: PosSession; closingRecord: ShiftClosingRecord } {
    const cashierId = authService.getCurrentUserId();
    const session = db.prepare('SELECT * FROM pos_sessions WHERE id = ?').get(input.sessionId) as PosSession | undefined;
    if (!session || session.status !== 'Open') throw new Error('Only an open shift can be closed');

    if (!Number.isSafeInteger(input.closingCashPaise) || input.closingCashPaise < 0) {
      throw new Error('Invalid physical cash count');
    }

    const calculation = this.calculateExpectedCash(input.sessionId);
    const expectedCashPaise = calculation.expectedCashPaise;
    const differencePaise = input.closingCashPaise - expectedCashPaise;

    const nonCash = this.calculateNonCashSummary(input.sessionId);
    const countedMap = input.countedByMethod || {};
    const methodReconciliation = nonCash.expectedByMethod.map(m => {
      const countedPaise = m.methodKey === 'cash'
        ? input.closingCashPaise
        : Math.max(0, Math.round(Number(countedMap[m.methodKey] ?? m.expectedPaise)));
      const diffPaise = countedPaise - m.expectedPaise;
      return {
        ...m,
        countedPaise,
        differencePaise: diffPaise,
      };
    });

    const anyMethodMismatch = methodReconciliation.some(m => m.differencePaise !== 0);
    const isMatched = differencePaise === 0 && !anyMethodMismatch;

    if (!isMatched && !input.declaredReason?.trim()) {
      throw new Error('A declared reason is strictly required when counted cash or payment method totals differ from expected');
    }

    const closingStatus = isMatched ? 'matched' : 'explained_difference';
    const now = new Date().toISOString();
    const fullNonCashPayload = {
      ...nonCash,
      methodReconciliation,
    };

    return db.transaction(() => {
      // 1. Insert or Replace Shift Closing Record
      db.prepare(`
        INSERT INTO shift_closing_records
        (store_id, session_id, expected_cash_paise, physical_cash_paise, difference_paise, status, declared_reason, closing_denominations_json, non_cash_summary_json, closed_by, closed_at, notes)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          expected_cash_paise = excluded.expected_cash_paise,
          physical_cash_paise = excluded.physical_cash_paise,
          difference_paise = excluded.difference_paise,
          status = excluded.status,
          declared_reason = excluded.declared_reason,
          closing_denominations_json = excluded.closing_denominations_json,
          non_cash_summary_json = excluded.non_cash_summary_json,
          closed_by = excluded.closed_by,
          closed_at = excluded.closed_at,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        session.id,
        expectedCashPaise,
        input.closingCashPaise,
        differencePaise,
        closingStatus,
        input.declaredReason?.trim() || null,
        JSON.stringify(input.denominations ?? {}),
        JSON.stringify(fullNonCashPayload),
        cashierId,
        now,
        input.notes?.trim() || null
      );

      // 2. Update pos_sessions (including payment_methods_breakdown_json)
      db.prepare(`
        UPDATE pos_sessions
        SET closed_at = ?, closing_cash_paise = ?, closing_denominations_json = ?, payment_methods_breakdown_json = ?, expected_cash_paise = ?, variance_paise = ?, variance_reason = ?, status = 'Closed', notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        now,
        input.closingCashPaise,
        JSON.stringify(input.denominations ?? {}),
        JSON.stringify(methodReconciliation),
        expectedCashPaise,
        differencePaise,
        input.declaredReason?.trim() || null,
        input.notes?.trim() || null,
        session.id
      );

      auditLogger.log(cashierId, 'SHIFT_CLOSE_SESSION', {
        sessionId: session.id,
        closingCashPaise: input.closingCashPaise,
        expectedCashPaise,
        differencePaise,
        closingStatus,
        methodReconciliation,
      });

      logger.info('POS shift session successfully closed and locked', {
        sessionId: session.id,
        differencePaise,
        status: closingStatus,
      });

      const updatedSession = db.prepare('SELECT * FROM pos_sessions WHERE id = ?').get(session.id) as PosSession;
      const closingRecord = db.prepare('SELECT * FROM shift_closing_records WHERE session_id = ?').get(session.id) as ShiftClosingRecord;
      return { session: updatedSession, closingRecord };
    })();
  }

  /**
   * Section C: Filterable Shift History List
   */
  public getShiftHistory(filter: ShiftHistoryFilter = {}): { shifts: ShiftSummaryItem[]; total: number } {
    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (filter.startDate) {
      where += ' AND DATE(ps.opened_at) >= DATE(?)';
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      where += ' AND DATE(ps.opened_at) <= DATE(?)';
      params.push(filter.endDate);
    }
    if (filter.cashierId) {
      where += ' AND ps.cashier_id = ?';
      params.push(filter.cashierId);
    }
    if (filter.status && filter.status !== 'ALL') {
      if (filter.status === 'Open') {
        where += " AND ps.status = 'Open'";
      } else {
        where += ' AND scr.status = ?';
        params.push(filter.status);
      }
    }
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      where += ' AND (u.username LIKE ? OR u.full_name LIKE ? OR u.emp_code LIKE ? OR ps.id LIKE ?)';
      params.push(term, term, term, term);
    }

    const countRow = db.prepare(`
      SELECT COUNT(DISTINCT ps.id) as total
      FROM pos_sessions ps
      LEFT JOIN users u ON u.id = ps.cashier_id
      LEFT JOIN shift_closing_records scr ON scr.session_id = ps.id
      ${where}
    `).get(...params) as { total: number };

    const limit = Math.min(filter.limit || 50, 200);
    const offset = Math.max(filter.offset || 0, 0);

    const rows = db.prepare(`
      SELECT 
        ps.id,
        ps.id as session_id,
        ps.cashier_id,
        COALESCE(u.full_name, u.username, 'Cashier #' || ps.cashier_id) as cashier_name,
        COALESCE(u.emp_code, u.code, 'EMP-' || ps.cashier_id) as cashier_code,
        ps.opened_at,
        ps.closed_at,
        ps.status,
        COALESCE(scr.status, ps.status) as reconciliation_status,
        ps.opening_cash_paise,
        COALESCE((
          SELECT SUM(scb.amount_paise)
          FROM store_cash_box scb
          LEFT JOIN invoices i ON i.id = scb.invoice_id
          WHERE scb.session_id = ps.id
            AND scb.type = 'CASH_SALE'
            AND scb.is_active = 1
            AND (scb.invoice_id IS NULL OR i.status = 'completed')
        ), 0) as cash_sales_paise,
        COALESCE((SELECT SUM(amount_paise) FROM shift_cash_movements WHERE session_id = ps.id AND movement_type = 'cash_in' AND is_active = 1), 0) as cash_in_paise,
        COALESCE((SELECT SUM(amount_paise) FROM shift_cash_movements WHERE session_id = ps.id AND movement_type = 'expense' AND is_active = 1), 0) as cash_expenses_paise,
        COALESCE((SELECT SUM(amount_paise) FROM store_cash_box WHERE session_id = ps.id AND type = 'CASH_REFUND' AND is_active = 1), 0) as cash_refunds_paise,
        COALESCE((SELECT SUM(amount_paise) FROM shift_cash_movements WHERE session_id = ps.id AND movement_type = 'cash_out' AND is_active = 1), 0) as cash_out_paise,
        COALESCE(scr.expected_cash_paise, ps.expected_cash_paise, ps.opening_cash_paise) as expected_cash_paise,
        COALESCE(scr.physical_cash_paise, ps.closing_cash_paise) as physical_cash_paise,
        COALESCE(scr.difference_paise, ps.variance_paise) as difference_paise,
        COALESCE(scr.declared_reason, ps.variance_reason) as declared_reason,
        (SELECT COUNT(*) FROM shift_corrections WHERE session_id = ps.id) as has_corrections
      FROM pos_sessions ps
      LEFT JOIN users u ON u.id = ps.cashier_id
      LEFT JOIN shift_closing_records scr ON scr.session_id = ps.id
      ${where}
      ORDER BY ps.opened_at DESC, ps.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as ShiftSummaryItem[];

    const normalizedRows = rows.map(r => ({
      ...r,
      opened_at: normalizeSqliteTimestamp(r.opened_at) || r.opened_at,
      closed_at: normalizeSqliteTimestamp(r.closed_at) || r.closed_at,
    }));

    return { shifts: normalizedRows, total: countRow?.total || 0 };
  }

  /**
   * Section C: Full Shift Drill-down Details
   */
  public getShiftDetails(sessionId: number) {
    const session = db.prepare(`
      SELECT ps.*, COALESCE(u.full_name, u.username) as cashier_name, u.emp_code as cashier_code
      FROM pos_sessions ps
      LEFT JOIN users u ON u.id = ps.cashier_id
      WHERE ps.id = ?
    `).get(sessionId) as any;
    if (!session) throw new Error(`Shift #${sessionId} not found`);

    session.opened_at = normalizeSqliteTimestamp(session.opened_at) || session.opened_at;
    session.closed_at = normalizeSqliteTimestamp(session.closed_at) || session.closed_at;

    const closingRecord = db.prepare(`
      SELECT scr.*, COALESCE(u.full_name, u.username) as closed_by_name
      FROM shift_closing_records scr
      LEFT JOIN users u ON u.id = scr.closed_by
      WHERE scr.session_id = ?
    `).get(sessionId) as ShiftClosingRecord | undefined;

    const movements = db.prepare(`
      SELECT scm.*, COALESCE(u.full_name, u.username) as created_by_name
      FROM shift_cash_movements scm
      LEFT JOIN users u ON u.id = scm.created_by
      WHERE scm.session_id = ? AND scm.is_active = 1
      ORDER BY scm.created_at ASC
    `).all(sessionId) as ShiftCashMovement[];

    const corrections = db.prepare(`
      SELECT sc.*, COALESCE(ua.full_name, ua.username) as authorized_by_name, COALESCE(uc.full_name, uc.username) as created_by_name
      FROM shift_corrections sc
      LEFT JOIN users ua ON ua.id = sc.authorized_by
      LEFT JOIN users uc ON uc.id = sc.created_by
      WHERE sc.session_id = ?
      ORDER BY sc.created_at ASC
    `).all(sessionId) as ShiftCorrection[];

    const transactions = this.getShiftTransactions(sessionId);
    const nonCash = this.calculateNonCashSummary(sessionId);
    const liveExpected = this.calculateExpectedCash(sessionId);

    return {
      session,
      closingRecord: closingRecord || null,
      movements,
      corrections,
      transactions,
      nonCashSummary: nonCash,
      liveExpected,
    };
  }

  /**
   * Section C: Safe Manager Corrections on Closed Shifts
   */
  public applyShiftCorrection(input: ShiftCorrectionInput): { success: boolean; recalculatedExpectedPaise: number; differencePaise: number } {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const managerId = authService.getCurrentUserId();

    if (!input.reason?.trim()) {
      throw new Error('A detailed reason is mandatory for auditing historical shift corrections');
    }

    const session = db.prepare('SELECT * FROM pos_sessions WHERE id = ?').get(input.sessionId) as PosSession | undefined;
    if (!session) throw new Error('Shift session not found');

    return db.transaction(() => {
      if (input.action === 'update_movement' && input.movementId) {
        const movement = db.prepare('SELECT * FROM shift_cash_movements WHERE id = ?').get(input.movementId) as ShiftCashMovement | undefined;
        if (!movement) throw new Error('Movement not found');

        const origAmount = movement.amount_paise;
        const newAmount = input.amount_paise !== undefined ? input.amount_paise : origAmount;
        const origCategory = movement.category;
        const newCategory = input.category || origCategory;

        // 1. Audit log in shift_corrections
        db.prepare(`
          INSERT INTO shift_corrections
          (store_id, session_id, entity_type, entity_id, field_name, original_value, new_value, reason, authorized_by, created_by)
          VALUES (1, ?, 'cash_movement', ?, 'amount_paise', ?, ?, ?, ?, ?)
        `).run(session.id, input.movementId, String(origAmount), String(newAmount), input.reason.trim(), managerId, managerId);

        // 2. Update movement
        db.prepare(`
          UPDATE shift_cash_movements
          SET amount_paise = ?, category = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newAmount, newCategory, input.movementId);

        // 3. Update store_cash_box
        db.prepare(`
          UPDATE store_cash_box
          SET amount_paise = ?, category = ?
          WHERE session_id = ? AND reference_type = 'SHIFT_MOVEMENT' AND reference_id = ?
        `).run(newAmount, newCategory, session.id, String(input.movementId));

        if (movement.expense_id) {
          db.prepare('UPDATE expenses SET amount_paise = ? WHERE id = ?').run(newAmount, movement.expense_id);
        }
      } else if (input.action === 'delete_movement' && input.movementId) {
        const movement = db.prepare('SELECT * FROM shift_cash_movements WHERE id = ?').get(input.movementId) as ShiftCashMovement | undefined;
        if (!movement) throw new Error('Movement not found');

        db.prepare(`
          INSERT INTO shift_corrections
          (store_id, session_id, entity_type, entity_id, field_name, original_value, new_value, reason, authorized_by, created_by)
          VALUES (1, ?, 'cash_movement', ?, 'is_active', '1', '0', ?, ?, ?)
        `).run(session.id, input.movementId, input.reason.trim(), managerId, managerId);

        db.prepare('UPDATE shift_cash_movements SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(input.movementId);
        db.prepare("UPDATE store_cash_box SET is_active = 0 WHERE session_id = ? AND reference_type = 'SHIFT_MOVEMENT' AND reference_id = ?").run(
          session.id,
          String(input.movementId)
        );

        if (movement.expense_id) {
          db.prepare("UPDATE expenses SET status = 'Rejected', is_active = 0 WHERE id = ?").run(movement.expense_id);
        }
      } else if (input.action === 'adjust_closing') {
        const closing = db.prepare('SELECT * FROM shift_closing_records WHERE session_id = ?').get(session.id) as ShiftClosingRecord | undefined;
        if (!closing) throw new Error('Closing record not found');

        const origCount = closing.physical_cash_paise;
        const newCount = input.amount_paise !== undefined ? input.amount_paise : origCount;

        db.prepare(`
          INSERT INTO shift_corrections
          (store_id, session_id, entity_type, entity_id, field_name, original_value, new_value, reason, authorized_by, created_by)
          VALUES (1, ?, 'closing_record', ?, 'physical_cash_paise', ?, ?, ?, ?, ?)
        `).run(session.id, closing.id, String(origCount), String(newCount), input.reason.trim(), managerId, managerId);

        db.prepare('UPDATE shift_closing_records SET physical_cash_paise = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(
          newCount,
          session.id
        );
      }

      // 4. Recalculate Expected Cash and Difference
      const recalc = this.calculateExpectedCash(session.id);
      const closing = db.prepare('SELECT * FROM shift_closing_records WHERE session_id = ?').get(session.id) as ShiftClosingRecord | undefined;
      const physicalCash = closing ? closing.physical_cash_paise : (session.closing_cash_paise || 0);
      const newDiff = physicalCash - recalc.expectedCashPaise;

      if (closing) {
        db.prepare(`
          UPDATE shift_closing_records
          SET expected_cash_paise = ?, difference_paise = ?, status = 'corrected', updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ?
        `).run(recalc.expectedCashPaise, newDiff, session.id);
      }

      db.prepare(`
        UPDATE pos_sessions
        SET expected_cash_paise = ?, variance_paise = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(recalc.expectedCashPaise, newDiff, session.id);

      auditLogger.log(managerId, 'SHIFT_APPLY_CORRECTION', {
        sessionId: session.id,
        action: input.action,
        newExpectedPaise: recalc.expectedCashPaise,
        newDifferencePaise: newDiff,
      });

      return {
        success: true,
        recalculatedExpectedPaise: recalc.expectedCashPaise,
        differencePaise: newDiff,
      };
    })();
  }

  /**
   * Inspection view: all shift transactions for Cashier Check View during shift closing
   */
  public getShiftTransactions(sessionId: number) {
    const rows = db.prepare(`
      SELECT 
        scb.id,
        scb.type,
        scb.direction,
        scb.amount_paise,
        scb.category,
        scb.reason,
        scb.reference_type,
        scb.reference_id,
        scb.invoice_id,
        scb.created_at,
        CASE WHEN scb.direction = 'IN' THEN scb.amount_paise ELSE 0 END as cash_in_paise,
        CASE WHEN scb.direction = 'OUT' THEN scb.amount_paise ELSE 0 END as cash_out_paise
      FROM store_cash_box scb
      LEFT JOIN invoices i ON i.id = scb.invoice_id
      WHERE scb.session_id = ?
        AND scb.is_active = 1
        AND (scb.invoice_id IS NULL OR i.status = 'completed')
      ORDER BY scb.created_at DESC, scb.id DESC
    `).all(sessionId) as any[];
    return rows.map(r => ({
      ...r,
      created_at: normalizeSqliteTimestamp(r.created_at) || r.created_at,
    }));
  }

  /**
   * Dashboard & Legacy compatibility wrappers
   */
  public getDashboard(sessionId?: number) {
    const prevSummary = this.getLastClosedShiftSummary();
    const paymentMethods = this.getPaymentMethods(false);
    const session: PosSession | null = sessionId
      ? (db.prepare('SELECT * FROM pos_sessions WHERE id = ?').get(sessionId) as PosSession | undefined) ?? null
      : this.getCurrentSession();
    if (!session) return null;

    const normalizedOpenedAt = normalizeSqliteTimestamp(session.opened_at) || session.opened_at;
    const isStaleShift = session.status === 'Open' && isShiftFromPreviousDay(session.opened_at);
    const expected = this.calculateExpectedCash(session.id);
    const nonCash = this.calculateNonCashSummary(session.id);
    const recentMovements = (db.prepare(`
      SELECT * FROM shift_cash_movements
      WHERE session_id = ? AND is_active = 1
      ORDER BY created_at DESC LIMIT 20
    `).all(session.id) as ShiftCashMovement[]).map(m => ({
      ...m,
      created_at: normalizeSqliteTimestamp(m.created_at) || m.created_at,
    }));

    return {
      session: {
        ...session,
        opened_at: normalizedOpenedAt,
        is_stale_previous_day: isStaleShift,
      },
      isStaleShift,
      previousShiftSummary: prevSummary,
      paymentMethods,
      expectedCashPaise: expected.expectedCashPaise,
      calculation: expected,
      nonCashSummary: nonCash,
      recentMovements,
      totals: {
        OPENING_BALANCE: expected.openingCashPaise,
        CASH_SALE: expected.cashSalesPaise,
        CASH_IN: expected.cashInPaise,
        CASH_EXPENSE: expected.cashExpensesPaise,
        CASH_REFUND: expected.cashRefundsPaise,
        CASH_WITHDRAWAL: expected.cashOutPaise,
      },
    };
  }

  public getTransactions(sessionId?: number, limit = 100, offset = 0) {
    const session = sessionId ? { id: sessionId } : this.getCurrentSession();
    if (!session) return [];
    return db.prepare(`
      SELECT *, 
        CASE WHEN direction = 'IN' THEN amount_paise ELSE 0 END as cash_in_paise, 
        CASE WHEN direction = 'OUT' THEN amount_paise ELSE 0 END as cash_out_paise 
      FROM store_cash_box 
      WHERE session_id = ? AND is_active = 1 
      ORDER BY created_at DESC, id DESC 
      LIMIT ? OFFSET ?
    `).all(session.id, Math.min(limit, 500), Math.max(0, offset));
  }

  public recordTransaction(type: string, amountPaise: number, category: string, reason: string) {
    const movementType: ShiftMovementType = type === 'CASH_IN' || type === 'ADJUSTMENT_IN' 
      ? 'cash_in' 
      : type === 'CASH_EXPENSE' 
      ? 'expense' 
      : 'cash_out';
    return this.recordMovement({
      movement_type: movementType,
      category,
      amount_paise: amountPaise,
      reason,
    });
  }

  public recordCashSale(invoiceId: number, invoiceNumber: string, cashAmountPaise: number, cashierId: number) {
    if (cashAmountPaise <= 0) return;
    const session = db.prepare("SELECT * FROM pos_sessions WHERE cashier_id = ? AND status = 'Open' ORDER BY id DESC LIMIT 1").get(cashierId) as PosSession | undefined;
    if (!session) throw new Error('An open cash shift is required for a cash payment');
    const exists = db.prepare("SELECT id FROM store_cash_box WHERE invoice_id = ? AND type = 'CASH_SALE'").get(invoiceId);
    if (exists) return;

    db.prepare(`
      INSERT INTO store_cash_box
      (store_id, session_id, type, direction, amount_paise, category, reason, reference_type, reference_id, invoice_id, performed_by, created_by)
      VALUES (1, ?, 'CASH_SALE', 'IN', ?, 'Billing', ?, 'INVOICE', ?, ?, ?, ?)
    `).run(session.id, cashAmountPaise, `Cash sale for Bill #${invoiceNumber}`, invoiceNumber, invoiceId, cashierId, cashierId);
  }

  public recordCashRefund(invoiceId: number, invoiceNumber: string, amountPaise: number, reason: string, cashierId: number) {
    const session = this.getCurrentSession();
    if (session) {
      db.prepare(`
        INSERT INTO store_cash_box
        (store_id, session_id, type, direction, amount_paise, category, reason, reference_type, reference_id, invoice_id, performed_by, created_by)
        VALUES (1, ?, 'CASH_REFUND', 'OUT', ?, 'Sales return', ?, 'INVOICE_RETURN', ?, ?, ?, ?)
      `).run(session.id, amountPaise, `Cash refund for Bill #${invoiceNumber}: ${reason}`, invoiceNumber, invoiceId, cashierId, cashierId);
    } else {
      logger.warn('Cash refund processed without an active cash shift session', { invoiceId, invoiceNumber, amountPaise, cashierId });
    }
  }

  public recordCashAdvance(advanceId: number, amountPaise: number, employeeName: string, cashierId: number) {
    if (amountPaise <= 0) return;
    const session = db.prepare("SELECT * FROM pos_sessions WHERE status = 'Open' ORDER BY id DESC LIMIT 1").get() as PosSession | undefined;
    if (session) {
      db.prepare(`
        INSERT INTO store_cash_box
        (store_id, session_id, type, direction, amount_paise, category, reason, reference_type, reference_id, performed_by, created_by)
        VALUES (1, ?, 'CASH_EXPENSE', 'OUT', ?, 'Salary Advance', ?, 'EMPLOYEE_ADVANCE', ?, ?, ?)
      `).run(session.id, amountPaise, `Salary Advance for ${employeeName} (Ref #${advanceId})`, String(advanceId), cashierId, cashierId);
      logger.info('Cash advance recorded in cash box', { advanceId, amountPaise, employeeName });
    } else {
      logger.warn('Cash advance issued without an active open cash shift session', { advanceId, amountPaise, employeeName });
    }
  }
}

export const cashBoxService = new CashBoxService();
