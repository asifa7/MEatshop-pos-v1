import { db } from '../../../../core/backend/db';
import { logger, auditLogger } from '../../../../core/backend/logger';
import { authService } from '../../../auth/backend/service/auth_service';
import { ValidationError } from '../../../../core/backend/errors';
import { ledgerService } from '../../../ledger/backend/service/ledger_service';
import type { Expense } from '../../../../core/types/enterprise_types';

export class ExpenseService {
  public getCategories() {
    return db.prepare('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY id ASC').all();
  }

  public createCategory(name: string) {
    authService.requireRole(['ADMIN', 'MANAGER', 'ACCOUNTANT']);
    db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)').run(name.trim());
    return this.getCategories();
  }

  public recordExpense(input: Partial<Expense>): Expense {
    const userId = authService.getCurrentUserId() || 1;
    const today = new Date().toISOString().split('T')[0];

    // Check category details
    let cat: any = null;
    if (input.category_id) {
      cat = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(input.category_id);
    } else if (input.category_name) {
      cat = db.prepare('SELECT * FROM expense_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(input.category_name);
    }
    const categoryId = cat?.id || input.category_id || 1;
    const categoryName = cat?.name || input.category_name || '';

    // Enforce salary rule: a salary entry must pick a staff record
    let employeeName: string | null = null;
    if (categoryName.toLowerCase() === 'salary' || categoryId === 3) {
      if (!input.employee_id) {
        throw new ValidationError('Selecting a Staff Member is required for Salary expenses');
      }
      const emp = db.prepare('SELECT id, full_name, emp_code FROM employees WHERE id = ?').get(input.employee_id) as any;
      if (!emp) {
        throw new ValidationError(`Staff member #${input.employee_id} not found in employee records`);
      }
      employeeName = emp.full_name;
    } else if (input.employee_id) {
      const emp = db.prepare('SELECT id, full_name, emp_code FROM employees WHERE id = ?').get(input.employee_id) as any;
      if (emp) {
        employeeName = emp.full_name;
      }
    }

    const amountPaise = Number(input.amount_paise) || 0;
    if (amountPaise <= 0) {
      throw new ValidationError('Expense amount must be greater than zero');
    }

    const paymentMethod = input.payment_method || 'Cash';
    const expenseDate = input.expense_date || today;
    const vendorName = employeeName || input.vendor_name || null;
    const notes = input.notes || `${categoryName} expense`;

    const fn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO expenses (
          store_id, category_id, vendor_name, employee_id, photo_url,
          amount_paise, gst_paise, payment_method, expense_date, notes, status, created_by
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?)
      `).run(
        categoryId,
        vendorName,
        input.employee_id || null,
        input.photo_url || null,
        amountPaise,
        input.gst_paise || 0,
        paymentMethod,
        expenseDate,
        notes,
        userId
      );

      const expenseId = Number(result.lastInsertRowid);
      const voucherGroup = `VCH-EXP-${expenseId}`;
      const isCash = paymentMethod.toLowerCase() === 'cash';
      const creditAccount = isCash ? 'Cash' : 'Bank';

      // 1. Post balanced Double-Entry Ledger rows
      ledgerService.postDoubleEntry({
        date: expenseDate,
        referenceId: `EXP-${expenseId}`,
        description: `${categoryName}: ${notes}${employeeName ? ` (${employeeName})` : ''}`,
        debitAccount: 'Expense',
        creditAccount,
        amountPaise,
        partyType: input.employee_id ? 'Employee' : 'Other',
        partyId: input.employee_id || null,
        partyName: employeeName || vendorName || 'General Expense',
        createdBy: userId,
        voucherGroupId: voucherGroup,
        sourceModule: 'EXPENSE',
      });

      // 2. If Cash, update shift cash movement if active cashbox session exists
      if (isCash) {
        try {
          const activeSession = db.prepare("SELECT id FROM pos_sessions WHERE status = 'open' OR status = 'Open' ORDER BY id DESC LIMIT 1").get() as any;
          if (activeSession) {
            db.prepare(`
              INSERT INTO shift_cash_movements (
                store_id, session_id, movement_type, category, amount_paise,
                reason, taken_by, expense_id, is_active, created_by
              ) VALUES (1, ?, 'expense', ?, ?, ?, ?, ?, 1, ?)
            `).run(
              activeSession.id,
              categoryName,
              amountPaise,
              notes,
              employeeName || vendorName,
              expenseId,
              userId
            );
          }
        } catch (err) {
          logger.warn('Failed recording cash movement for expense', { error: err });
        }
      }

      auditLogger.log(userId, 'EXPENSE_RECORDED', {
        expenseId,
        amountPaise,
        category: categoryName,
        vendor: vendorName,
        employeeId: input.employee_id,
        paymentMethod,
      });

      logger.info('Expense recorded successfully', { expenseId, amountPaise });

      return db.prepare(`
        SELECT e.*, c.name as category_name, emp.full_name as employee_name
        FROM expenses e
        LEFT JOIN expense_categories c ON e.category_id = c.id
        LEFT JOIN employees emp ON e.employee_id = emp.id
        WHERE e.id = ?
      `).get(expenseId) as Expense;
    });

    return fn();
  }

  public getExpenses(): Expense[] {
    return db.prepare(`
      SELECT e.*, c.name as category_name, emp.full_name as employee_name
      FROM expenses e
      LEFT JOIN expense_categories c ON e.category_id = c.id
      LEFT JOIN employees emp ON e.employee_id = emp.id
      WHERE e.is_active = 1
      ORDER BY e.expense_date DESC, e.id DESC
      LIMIT 100
    `).all() as Expense[];
  }

  public getTodayExpenses(): Expense[] {
    return db.prepare(`
      SELECT e.*, c.name as category_name, emp.full_name as employee_name
      FROM expenses e
      LEFT JOIN expense_categories c ON e.category_id = c.id
      LEFT JOIN employees emp ON e.employee_id = emp.id
      WHERE e.is_active = 1 AND DATE(e.expense_date) = DATE('now')
      ORDER BY e.id DESC
    `).all() as Expense[];
  }

  public getMonthlyCategoryTotals(): Array<{ category_id: number; category_name: string; total_paise: number; count: number }> {
    return db.prepare(`
      SELECT
        c.id as category_id,
        c.name as category_name,
        COALESCE(SUM(e.amount_paise), 0) as total_paise,
        COUNT(e.id) as count
      FROM expense_categories c
      LEFT JOIN expenses e ON e.category_id = c.id
        AND e.is_active = 1
        AND strftime('%Y-%m', e.expense_date) = strftime('%Y-%m', 'now')
      WHERE c.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY total_paise DESC, c.id ASC
    `).all() as any[];
  }
}

export const expenseService = new ExpenseService();
