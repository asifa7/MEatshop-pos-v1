import { db, dbManager } from '../../../../core/backend/db';
import { logger, auditLogger } from '../../../../core/backend/logger';
import { authService } from '../../../auth/backend/service/auth_service';
import { cashBoxService } from '../../../cashbox/backend/service/cashbox_service';
import { ValidationError, NotFoundError } from '../../../../core/backend/errors';
import { formatMoney, paiseToRupees, rupeesToPaise } from '../../../../core/shared/math';
import type { 
  Employee, 
  SalaryStructure, 
  FixedAllowance, 
  DeductionRule, 
  AttendanceStatus, 
  EmployeeAttendance, 
  MonthAttendanceGridData, 
  HRLeaveType, 
  EmployeeLeave, 
  LeaveBalance, 
  HRRole,
  PayType,
  LedgerEntryType,
  EmployeeLedgerEntry,
  EmployeeAdvance,
  EmployeeExpense,
  ExpenseFlag,
  IncentiveRule,
  EmployeeIncentive,
  EmployeeOvertime,
  EmployeeDeduction,
  DeductionType,
  PayrollStatus,
  PayrollPeriodInput,
  PayrollRun,
  PayrollItem,
  HRAuditLog,
  EmployeeSummary360,
  HRPayrollReportSummary
} from '../../shared/hr.types';

export class HRService {
  private accountingColsEnsured = false;

  private ensureAccountingAndExpenseColumns(): void {
    if (this.accountingColsEnsured) return;
    const alterStatements = [
      `ALTER TABLE expenses ADD COLUMN employee_id INTEGER`,
      `ALTER TABLE expenses ADD COLUMN photo_url TEXT`,
      `ALTER TABLE accounting_daily_ledger ADD COLUMN credit_paise INTEGER DEFAULT 0`,
      `ALTER TABLE accounting_daily_ledger ADD COLUMN voucher_group_id TEXT`,
      `ALTER TABLE accounting_daily_ledger ADD COLUMN party_type TEXT`,
      `ALTER TABLE accounting_daily_ledger ADD COLUMN party_id INTEGER`,
      `ALTER TABLE accounting_daily_ledger ADD COLUMN party_name TEXT`,
      `ALTER TABLE accounting_daily_ledger ADD COLUMN payment_mode TEXT`,
      `ALTER TABLE accounting_daily_ledger ADD COLUMN narration TEXT`,
    ];
    for (const stmt of alterStatements) {
      try {
        db.prepare(stmt).run();
      } catch {
        // Column already exists
      }
    }
    try {
      db.prepare(`INSERT OR IGNORE INTO expense_categories (name, is_active) VALUES ('Salary', 1)`).run();
    } catch {
      try {
        db.prepare(`INSERT OR IGNORE INTO expense_categories (name) VALUES ('Salary')`).run();
      } catch {}
    }
    this.accountingColsEnsured = true;
  }

  private postSalaryOrAdvanceToExpensesAndAccounting(params: {
    employeeId: number;
    employeeName: string;
    empCode: string;
    amountPaise: number;
    date: string;
    paymentMode: string;
    referenceId: string;
    notes: string;
    userId: number;
  }): void {
    if (params.amountPaise <= 0) return;
    this.ensureAccountingAndExpenseColumns();

    const salaryCat = db.prepare(`SELECT id FROM expense_categories WHERE LOWER(name) = 'salary' LIMIT 1`).get() as { id: number } | undefined;
    const categoryId = salaryCat?.id || 1;
    const normalizedMode = params.paymentMode.toLowerCase() === 'cash'
      ? 'Cash'
      : params.paymentMode.toLowerCase() === 'upi'
      ? 'UPI'
      : 'Bank';

    // 1. Insert Expense row linked to employee_id under 'Salary' category
    db.prepare(`
      INSERT INTO expenses (
        store_id, category_id, employee_id, vendor_name, amount_paise, gst_paise,
        payment_method, expense_date, notes, status, created_by
      ) VALUES (1, ?, ?, ?, ?, 0, ?, ?, ?, 'Approved', ?)
    `).run(
      categoryId,
      params.employeeId,
      `${params.employeeName} (${params.empCode})`,
      params.amountPaise,
      normalizedMode,
      params.date,
      params.notes,
      params.userId
    );

    // 2. Post balanced double-entry rows to accounting_daily_ledger
    const voucherGroupId = `VCH-HR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const creditAccount = normalizedMode === 'Cash' ? 'Cash' : 'Bank';

    // Row 1: Debit Expense
    db.prepare(`
      INSERT INTO accounting_daily_ledger (
        store_id, date, account_type, reference_id, description,
        debit_paise, credit_paise, voucher_group_id,
        party_type, party_id, party_name, payment_mode, narration, created_by
      ) VALUES (1, ?, 'Expense', ?, ?, ?, 0, ?, 'employee', ?, ?, ?, ?, ?)
    `).run(
      params.date,
      params.referenceId,
      params.notes,
      params.amountPaise,
      voucherGroupId,
      params.employeeId,
      params.employeeName,
      normalizedMode,
      params.notes,
      params.userId
    );

    // Row 2: Credit Cash / Bank
    db.prepare(`
      INSERT INTO accounting_daily_ledger (
        store_id, date, account_type, reference_id, description,
        debit_paise, credit_paise, voucher_group_id,
        party_type, party_id, party_name, payment_mode, narration, created_by
      ) VALUES (1, ?, ?, ?, ?, 0, ?, ?, 'employee', ?, ?, ?, ?, ?)
    `).run(
      params.date,
      params.referenceId,
      params.notes,
      creditAccount,
      params.amountPaise,
      voucherGroupId,
      params.employeeId,
      params.employeeName,
      normalizedMode,
      params.notes,
      params.userId
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION A: EMPLOYEE MASTER
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get all employees with optional search, department filter, and active status.
   */
  public getAllEmployees(filters?: { 
    search?: string; 
    department?: string; 
    role?: string; 
    status?: string; 
    includeInactive?: boolean 
  }): Employee[] {
    let sql = `
      SELECT 
        e.*,
        ss.id as salary_struct_id,
        ss.pay_type as struct_pay_type,
        ss.basic_salary_paise as struct_basic_salary_paise,
        ss.fixed_allowances_json,
        ss.overtime_rate_paise,
        ss.incentive_rule_ref,
        ss.attendance_based_salary,
        ss.deduction_rules_json,
        ss.effective_from as struct_effective_from
      FROM employees e
      LEFT JOIN employee_salary_structures ss ON ss.employee_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (!filters?.includeInactive && filters?.status !== 'Inactive') {
      sql += ` AND e.is_active = 1`;
    }

    if (filters?.status && filters.status !== 'ALL') {
      sql += ` AND e.status = ?`;
      params.push(filters.status);
    }

    if (filters?.department && filters.department !== 'ALL') {
      sql += ` AND e.department = ?`;
      params.push(filters.department);
    }

    if (filters?.role && filters.role !== 'ALL') {
      sql += ` AND e.role = ?`;
      params.push(filters.role);
    }

    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(e.full_name) LIKE ? OR LOWER(e.emp_code) LIKE ? OR LOWER(e.mobile) LIKE ? OR LOWER(e.department) LIKE ? OR LOWER(e.role) LIKE ?)`;
      params.push(q, q, q, q, q);
    }

    sql += ` ORDER BY e.is_active DESC, e.emp_code ASC`;

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(r => {
      let allowances: FixedAllowance[] = [];
      let deductions: DeductionRule[] = [];
      try {
        if (r.fixed_allowances_json) allowances = JSON.parse(r.fixed_allowances_json);
      } catch {}
      try {
        if (r.deduction_rules_json) deductions = JSON.parse(r.deduction_rules_json);
      } catch {}

      const salaryStructure: SalaryStructure | null = r.salary_struct_id ? {
        id: r.salary_struct_id,
        employee_id: r.id,
        pay_type: (r.struct_pay_type || r.salary_type || 'Monthly') as PayType,
        basic_salary_paise: r.struct_basic_salary_paise ?? r.basic_salary_paise ?? 0,
        fixed_allowances_json: r.fixed_allowances_json || '[]',
        fixed_allowances: allowances,
        overtime_rate_paise: r.overtime_rate_paise || 0,
        incentive_rule_ref: r.incentive_rule_ref || null,
        attendance_based_salary: r.attendance_based_salary || 0,
        deduction_rules_json: r.deduction_rules_json || '[]',
        deduction_rules: deductions,
        effective_from: r.struct_effective_from || r.joining_date || new Date().toISOString().slice(0, 10),
      } : null;

      return {
        id: r.id,
        store_id: r.store_id || 1,
        emp_code: r.emp_code,
        full_name: r.full_name,
        gender: r.gender || 'Male',
        dob: r.dob || null,
        mobile: r.mobile,
        email: r.email || null,
        address: r.address || null,
        emergency_contact: r.emergency_contact || null,
        emergency_contact_name: r.emergency_contact_name || null,
        emergency_contact_phone: r.emergency_contact_phone || null,
        joining_date: r.joining_date,
        department: r.department || 'Operations',
        designation: r.designation || r.role || 'Staff',
        role: r.role || 'Cashier',
        employment_type: r.employment_type || 'Full-Time',
        shift: r.shift || 'General',
        salary_type: (r.salary_type || 'Monthly') as PayType,
        salary_cycle: (r.salary_cycle || 'Monthly') as any,
        salary_cycle_start_day: r.salary_cycle_start_day || 'Monday',
        relieving_date: r.relieving_date || null,
        relieving_reason: r.relieving_reason || null,
        relieving_settled: r.relieving_settled || 0,
        status: (r.is_active === 1 ? (r.status || 'Active') : 'Inactive') as any,
        aadhaar_number: r.aadhaar_number || null,
        pan_number: r.pan_number || null,
        bank_account: r.bank_account || null,
        ifsc_code: r.ifsc_code || null,
        upi_id: r.upi_id || null,
        basic_salary_paise: r.basic_salary_paise || 0,
        hra_paise: r.hra_paise || 0,
        allowance_paise: r.allowance_paise || 0,
        photo_url: r.photo_url || null,
        documents_notes: r.documents_notes || null,
        is_active: r.is_active,
        created_at: r.created_at,
        updated_at: r.updated_at,
        salary_structure: salaryStructure,
      };
    });
  }

  /**
   * Get single employee by ID with salary structure.
   */
  public getEmployeeById(id: number): Employee {
    const list = this.getAllEmployees({ includeInactive: true });
    const emp = list.find(e => e.id === id);
    if (!emp) throw new NotFoundError(`Employee with ID ${id} not found.`);
    return emp;
  }

  /**
   * Auto-generate the next sequential Employee ID (e.g. EMP-00001, EMP-00002).
   */
  public generateNextEmpCode(): string {
    const existing = db.prepare("SELECT emp_code FROM employees WHERE emp_code LIKE 'EMP-%'").all() as { emp_code: string }[];
    let maxNum = 0;
    for (const row of existing) {
      const match = row.emp_code.match(/EMP-(\d+)/i);
      if (match && match[1]) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    return `EMP-${String(maxNum + 1).padStart(5, '0')}`;
  }

  /**
   * Create new employee with auto-generated sequential Employee ID and default salary structure.
   */
  public createEmployee(input: Partial<Employee> & { basic_salary?: number }): Employee {
    if (!input.full_name?.trim()) {
      throw new ValidationError('Employee full name is required.');
    }
    if (!input.mobile?.trim()) {
      throw new ValidationError('Employee mobile number is required.');
    }

    const fullName = input.full_name.trim();
    const mobileNum = input.mobile.trim();

    return dbManager.transaction(() => {
      const empCode = this.generateNextEmpCode();
      const joiningDate = input.joining_date || new Date().toISOString().slice(0, 10);
      const salaryType = input.salary_type || 'Monthly';
      const salaryCycle = input.salary_cycle || 'Monthly';
      const cycleStartDay = input.salary_cycle_start_day || 'Monday';
      const basicSalaryPaise = input.basic_salary_paise ?? (input.basic_salary != null ? Math.round(input.basic_salary * 100) : 2000000);

      const stmt = db.prepare(`
        INSERT INTO employees (
          store_id, emp_code, full_name, gender, dob, mobile, email, address,
          emergency_contact, emergency_contact_name, emergency_contact_phone,
          joining_date, department, designation, role, employment_type, shift,
          salary_type, salary_cycle, salary_cycle_start_day, status, aadhaar_number, pan_number, bank_account, ifsc_code,
          upi_id, basic_salary_paise, hra_paise, allowance_paise, photo_url,
          documents_notes, is_active, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, 'Active', ?, ?, ?, ?,
          ?, ?, 0, 0, ?,
          ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      const result = stmt.run(
        input.store_id || 1,
        empCode,
        fullName,
        input.gender || 'Male',
        input.dob || null,
        mobileNum,
        input.email?.trim() || null,
        input.address?.trim() || null,
        input.emergency_contact?.trim() || null,
        input.emergency_contact_name?.trim() || null,
        input.emergency_contact_phone?.trim() || null,
        joiningDate,
        input.department || 'Operations',
        input.designation || input.role || 'Staff',
        input.role || 'Cashier',
        input.employment_type || 'Full-Time',
        input.shift || 'General',
        salaryType,
        salaryCycle,
        cycleStartDay,
        input.aadhaar_number?.trim() || null,
        input.pan_number?.trim() || null,
        input.bank_account?.trim() || null,
        input.ifsc_code?.trim() || null,
        input.upi_id?.trim() || null,
        basicSalaryPaise,
        input.photo_url || null,
        input.documents_notes?.trim() || null
      );

      const employeeId = result.lastInsertRowid as number;

      // Automatically create corresponding Salary Structure record
      db.prepare(`
        INSERT INTO employee_salary_structures (
          employee_id, pay_type, basic_salary_paise, fixed_allowances_json,
          overtime_rate_paise, incentive_rule_ref, attendance_based_salary,
          deduction_rules_json, effective_from, created_at, updated_at
        ) VALUES (?, ?, ?, '[]', 10000, NULL, 0, '[]', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        employeeId,
        salaryType,
        basicSalaryPaise,
        joiningDate
      );

      auditLogger.log(authService.getCurrentUserId() || 1, 'HR_CREATE_EMPLOYEE', { employeeId, empCode, name: input.full_name });
      logger.info('Created employee successfully', { employeeId, empCode });

      return this.getEmployeeById(employeeId);
    });
  }

  /**
   * Update employee profile.
   */
  public updateEmployee(id: number, input: Partial<Employee>): Employee {
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any;
    if (!existing) throw new NotFoundError(`Employee with ID ${id} not found.`);

    return dbManager.transaction(() => {
      const basicSalaryPaise = input.basic_salary_paise ?? existing.basic_salary_paise;
      const salaryType = input.salary_type ?? existing.salary_type ?? 'Monthly';
      const salaryCycle = input.salary_cycle ?? existing.salary_cycle ?? 'Monthly';
      const cycleStartDay = input.salary_cycle_start_day ?? existing.salary_cycle_start_day ?? 'Monday';

      db.prepare(`
        UPDATE employees SET
          full_name = ?,
          gender = ?,
          dob = ?,
          mobile = ?,
          email = ?,
          address = ?,
          emergency_contact = ?,
          emergency_contact_name = ?,
          emergency_contact_phone = ?,
          joining_date = ?,
          department = ?,
          designation = ?,
          role = ?,
          employment_type = ?,
          shift = ?,
          salary_type = ?,
          salary_cycle = ?,
          salary_cycle_start_day = ?,
          aadhaar_number = ?,
          pan_number = ?,
          bank_account = ?,
          ifsc_code = ?,
          upi_id = ?,
          basic_salary_paise = ?,
          photo_url = ?,
          documents_notes = ?,
          relieving_date = ?,
          relieving_reason = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        input.full_name?.trim() ?? existing.full_name,
        input.gender ?? existing.gender,
        input.dob ?? existing.dob,
        input.mobile?.trim() ?? existing.mobile,
        input.email?.trim() ?? existing.email,
        input.address?.trim() ?? existing.address,
        input.emergency_contact?.trim() ?? existing.emergency_contact,
        input.emergency_contact_name?.trim() ?? existing.emergency_contact_name,
        input.emergency_contact_phone?.trim() ?? existing.emergency_contact_phone,
        input.joining_date ?? existing.joining_date,
        input.department ?? existing.department,
        input.designation ?? existing.designation,
        input.role ?? existing.role,
        input.employment_type ?? existing.employment_type,
        input.shift ?? existing.shift,
        salaryType,
        salaryCycle,
        cycleStartDay,
        input.aadhaar_number?.trim() ?? existing.aadhaar_number,
        input.pan_number?.trim() ?? existing.pan_number,
        input.bank_account?.trim() ?? existing.bank_account,
        input.ifsc_code?.trim() ?? existing.ifsc_code,
        input.upi_id?.trim() ?? existing.upi_id,
        basicSalaryPaise,
        input.photo_url ?? existing.photo_url,
        input.documents_notes ?? existing.documents_notes,
        input.relieving_date ?? existing.relieving_date,
        input.relieving_reason ?? existing.relieving_reason,
        id
      );

      // Keep salary structure synchronized if basic salary or pay type was updated directly in master profile
      db.prepare(`
        UPDATE employee_salary_structures SET
          pay_type = ?,
          basic_salary_paise = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE employee_id = ?
      `).run(salaryType, basicSalaryPaise, id);

      auditLogger.log(authService.getCurrentUserId() || 1, 'HR_UPDATE_EMPLOYEE', { employeeId: id, name: input.full_name });
      return this.getEmployeeById(id);
    });
  }

  /**
   * Deactivate or Reactivate employee (Preserves all history).
   */
  public toggleEmployeeActive(id: number, isActive: boolean): Employee {
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any;
    if (!existing) throw new NotFoundError(`Employee with ID ${id} not found.`);

    const newStatus = isActive ? 'Active' : 'Inactive';
    const isActNum = isActive ? 1 : 0;

    db.prepare(`
      UPDATE employees SET
        is_active = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(isActNum, newStatus, id);

    auditLogger.log(authService.getCurrentUserId() || 1, 'HR_TOGGLE_EMPLOYEE_ACTIVE', { employeeId: id, isActive });
    return this.getEmployeeById(id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION B: SALARY STRUCTURE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get salary structure rules for employee.
   */
  public getSalaryStructure(employeeId: number): SalaryStructure {
    const row = db.prepare(`
      SELECT ss.*, e.salary_type as emp_salary_type, e.basic_salary_paise as emp_basic_salary_paise, e.joining_date
      FROM employees e
      LEFT JOIN employee_salary_structures ss ON ss.employee_id = e.id
      WHERE e.id = ?
    `).get(employeeId) as any;

    if (!row) throw new NotFoundError(`Employee with ID ${employeeId} not found.`);

    if (!row.id) {
      // Auto-initialize if missing
      const payType = row.emp_salary_type || 'Monthly';
      const basicPaise = row.emp_basic_salary_paise || 2000000;
      const effective = row.joining_date || new Date().toISOString().slice(0, 10);

      const ins = db.prepare(`
        INSERT INTO employee_salary_structures (
          employee_id, pay_type, basic_salary_paise, fixed_allowances_json,
          overtime_rate_paise, incentive_rule_ref, attendance_based_salary,
          deduction_rules_json, effective_from
        ) VALUES (?, ?, ?, '[]', 0, NULL, 0, '[]', ?)
      `).run(employeeId, payType, basicPaise, effective);

      return this.getSalaryStructure(employeeId);
    }

    let allowances: FixedAllowance[] = [];
    let deductions: DeductionRule[] = [];
    try {
      if (row.fixed_allowances_json) allowances = typeof row.fixed_allowances_json === 'string' ? JSON.parse(row.fixed_allowances_json) : row.fixed_allowances_json;
    } catch {}
    try {
      if (row.deduction_rules_json) deductions = typeof row.deduction_rules_json === 'string' ? JSON.parse(row.deduction_rules_json) : row.deduction_rules_json;
    } catch {}

    return {
      id: row.id,
      employee_id: employeeId,
      pay_type: row.pay_type as PayType,
      basic_salary_paise: row.basic_salary_paise,
      fixed_allowances_json: row.fixed_allowances_json,
      fixed_allowances: allowances,
      overtime_rate_paise: row.overtime_rate_paise || 0,
      incentive_rule_ref: row.incentive_rule_ref || null,
      attendance_based_salary: row.attendance_based_salary || 0,
      deduction_rules_json: row.deduction_rules_json,
      deduction_rules: deductions,
      effective_from: row.effective_from || new Date().toISOString().slice(0, 10),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Update salary structure rules for employee.
   * Stores rules only without running computation.
   */
  public updateSalaryStructure(input: {
    employee_id: number;
    pay_type: PayType;
    basic_salary_paise: number;
    fixed_allowances: FixedAllowance[];
    overtime_rate_paise?: number;
    incentive_rule_ref?: string | null;
    attendance_based_salary?: boolean;
    deduction_rules?: DeductionRule[];
    effective_from?: string;
  }): SalaryStructure {
    if (!input.employee_id) throw new ValidationError('Employee ID is required.');
    if (input.basic_salary_paise < 0) throw new ValidationError('Basic salary cannot be negative.');

    return dbManager.transaction(() => {
      const allowancesJson = JSON.stringify(input.fixed_allowances || []);
      const deductionsJson = JSON.stringify(input.deduction_rules || []);
      const isAttendanceBased = input.attendance_based_salary ? 1 : 0;
      const effectiveFrom = input.effective_from || new Date().toISOString().slice(0, 10);
      const overtimeRatePaise = input.overtime_rate_paise || 0;

      const existing = db.prepare('SELECT id FROM employee_salary_structures WHERE employee_id = ?').get(input.employee_id) as any;

      if (existing) {
        db.prepare(`
          UPDATE employee_salary_structures SET
            pay_type = ?,
            basic_salary_paise = ?,
            fixed_allowances_json = ?,
            overtime_rate_paise = ?,
            incentive_rule_ref = ?,
            attendance_based_salary = ?,
            deduction_rules_json = ?,
            effective_from = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE employee_id = ?
        `).run(
          input.pay_type,
          input.basic_salary_paise,
          allowancesJson,
          overtimeRatePaise,
          input.incentive_rule_ref || null,
          isAttendanceBased,
          deductionsJson,
          effectiveFrom,
          input.employee_id
        );
      } else {
        db.prepare(`
          INSERT INTO employee_salary_structures (
            employee_id, pay_type, basic_salary_paise, fixed_allowances_json,
            overtime_rate_paise, incentive_rule_ref, attendance_based_salary,
            deduction_rules_json, effective_from, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          input.employee_id,
          input.pay_type,
          input.basic_salary_paise,
          allowancesJson,
          overtimeRatePaise,
          input.incentive_rule_ref || null,
          isAttendanceBased,
          deductionsJson,
          effectiveFrom
        );
      }

      // Sync employees summary fields
      db.prepare(`
        UPDATE employees SET
          salary_type = ?,
          basic_salary_paise = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.pay_type, input.basic_salary_paise, input.employee_id);

      auditLogger.log(authService.getCurrentUserId() || 1, 'HR_UPDATE_SALARY_STRUCTURE', { employeeId: input.employee_id, payType: input.pay_type });
      return this.getSalaryStructure(input.employee_id);
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION C: DAILY ATTENDANCE & MONTH LOCK CHECK
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Check if a given month's payroll is locked (defaults to unlocked).
   */
  public isMonthLocked(monthYear: string): boolean {
    const row = db.prepare('SELECT is_locked FROM hr_payroll_locks WHERE month_year = ?').get(monthYear) as { is_locked: number } | undefined;
    return Boolean(row && row.is_locked === 1);
  }

  /**
   * Get Daily Attendance Grid Data for a given month (e.g. '2026-08').
   */
  public getMonthAttendanceGrid(monthYear?: string): MonthAttendanceGridData {
    const today = new Date();
    const targetMonth = monthYear || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-12

    const daysInMonth = new Date(year, month, 0).getDate();
    const isLocked = this.isMonthLocked(targetMonth);

    // Days array
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days: MonthAttendanceGridData['days'] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = dayNames[dateObj.getDay()];
      days.push({
        day_num: d,
        date_str: dateStr,
        day_of_week: dayOfWeek,
        is_weekend: dateObj.getDay() === 0, // Sunday
      });
    }

    // Fetch active employees (and inactive employees with records in this month)
    const startDate = `${targetMonth}-01`;
    const endDate = `${targetMonth}-${String(daysInMonth).padStart(2, '0')}`;

    const emps = db.prepare(`
      SELECT DISTINCT e.id, e.emp_code, e.full_name, e.role, e.department, e.salary_type, e.is_active
      FROM employees e
      LEFT JOIN employee_attendance ea ON ea.employee_id = e.id AND ea.date BETWEEN ? AND ?
      WHERE e.is_active = 1 OR ea.id IS NOT NULL
      ORDER BY e.is_active DESC, e.emp_code ASC
    `).all(startDate, endDate) as any[];

    // Fetch all attendance records for this month
    const attRecords = db.prepare(`
      SELECT * FROM employee_attendance
      WHERE date BETWEEN ? AND ?
    `).all(startDate, endDate) as any[];

    const attMap: Record<number, Record<string, EmployeeAttendance>> = {};
    for (const att of attRecords) {
      if (!attMap[att.employee_id]) attMap[att.employee_id] = {};
      attMap[att.employee_id][att.date] = {
        id: att.id,
        employee_id: att.employee_id,
        date: att.date,
        clock_in: att.clock_in,
        clock_out: att.clock_out,
        status: att.status as AttendanceStatus,
        working_hours: att.working_hours || 0,
        overtime_hours: att.overtime_hours || 0,
        notes: att.notes,
        is_modified: att.is_modified || 0,
        modified_reason: att.modified_reason || null,
        modified_at: att.modified_at || null,
        modified_by: att.modified_by || null,
        is_active: att.is_active,
      };
    }

    const employeeRows: MonthAttendanceGridData['employees'] = emps.map(e => {
      const empAtt = attMap[e.id] || {};
      let presentCount = 0;
      let absentCount = 0;
      let halfDayCount = 0;
      let paidLeaveCount = 0;
      let unpaidLeaveCount = 0;
      let lateCount = 0;
      let holidayCount = 0;
      let weeklyOffCount = 0;
      let otHours = 0;

      for (const d of days) {
        const rec = empAtt[d.date_str];
        if (rec) {
          otHours += rec.overtime_hours || 0;
          switch (rec.status) {
            case 'Present': presentCount++; break;
            case 'Absent': absentCount++; break;
            case 'Half_Day': halfDayCount++; break;
            case 'Leave_Paid': paidLeaveCount++; break;
            case 'Leave_Unpaid': unpaidLeaveCount++; break;
            case 'Late': lateCount++; break;
            case 'Holiday': holidayCount++; break;
            case 'Weekly_Off': weeklyOffCount++; break;
          }
        }
      }

      // Standard worked days weighting: Present (1) + Late (1) + Paid Leave (1) + Holiday (1) + Weekly Off (1) + Half Day (0.5)
      const workedDays = presentCount + lateCount + paidLeaveCount + holidayCount + weeklyOffCount + (halfDayCount * 0.5);

      return {
        id: e.id,
        emp_code: e.emp_code,
        full_name: e.full_name,
        role: e.role || 'Staff',
        department: e.department || 'Operations',
        salary_type: (e.salary_type || 'Monthly') as PayType,
        attendance: empAtt,
        worked_days: workedDays,
        present_count: presentCount,
        absent_count: absentCount,
        half_day_count: halfDayCount,
        paid_leave_count: paidLeaveCount,
        unpaid_leave_count: unpaidLeaveCount,
        late_count: lateCount,
        holiday_count: holidayCount,
        weekly_off_count: weeklyOffCount,
        overtime_hours_total: otHours,
      };
    });

    return {
      month_year: targetMonth,
      is_locked: isLocked,
      days_in_month: daysInMonth,
      days: days,
      employees: employeeRows,
    };
  }

  /**
   * Set or update individual attendance cell status for an employee.
   */
  public markAttendance(input: {
    employee_id: number;
    date: string; // 'YYYY-MM-DD'
    status: AttendanceStatus;
    working_hours?: number;
    overtime_hours?: number;
    notes?: string;
    modified_reason?: string;
  }): EmployeeAttendance {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (input.date > todayStr) {
      throw new ValidationError('Cannot mark attendance for future dates.');
    }

    const monthYear = input.date.slice(0, 7);
    if (this.isMonthLocked(monthYear)) {
      throw new ValidationError(`Cannot edit attendance. Payroll for ${monthYear} is locked.`);
    }

    const workingHours = input.working_hours ?? (input.status === 'Half_Day' ? 4 : input.status === 'Present' ? 8 : 0);
    const overtimeHours = input.overtime_hours || 0;
    const cashierId = authService.getCurrentUserId() ?? 1;

    const existing = db.prepare('SELECT * FROM employee_attendance WHERE employee_id = ? AND date = ?').get(input.employee_id, input.date) as any;

    let isModified = 0;
    let modReason = input.modified_reason?.trim() || null;

    if (existing) {
      if (existing.status !== input.status && input.date < todayStr) {
        if (!modReason) {
          throw new ValidationError('A reason is mandatory when modifying past attendance.');
        }
        isModified = 1;
        this.logHRAudit(
          'attendance',
          existing.id,
          'UPDATE',
          `Attendance changed from ${existing.status} to ${input.status} for date ${input.date}. Reason: ${modReason}`
        );
      }

      db.prepare(`
        UPDATE employee_attendance SET
          status = ?,
          working_hours = ?,
          overtime_hours = ?,
          notes = ?,
          is_modified = CASE WHEN ? = 1 THEN 1 ELSE is_modified END,
          modified_reason = CASE WHEN ? = 1 THEN ? ELSE modified_reason END,
          modified_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE modified_at END,
          modified_by = CASE WHEN ? = 1 THEN ? ELSE modified_by END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        input.status,
        workingHours,
        overtimeHours,
        input.notes || null,
        isModified,
        isModified,
        modReason,
        isModified,
        isModified,
        cashierId,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO employee_attendance (
          store_id, employee_id, date, status, working_hours, overtime_hours, notes, created_at, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(input.employee_id, input.date, input.status, workingHours, overtimeHours, input.notes || null);
    }

    return db.prepare('SELECT * FROM employee_attendance WHERE employee_id = ? AND date = ?').get(input.employee_id, input.date) as EmployeeAttendance;
  }

  /**
   * Bulk action: Mark all active employees 'Present' for target date (default today).
   * Does not overwrite days already recorded unless requested.
   */
  public markBulkPresentToday(targetDate?: string): { success: boolean; count: number; date: string } {
    const date = targetDate || new Date().toISOString().slice(0, 10);
    const monthYear = date.slice(0, 7);

    if (this.isMonthLocked(monthYear)) {
      throw new ValidationError(`Cannot mark attendance. Payroll for ${monthYear} is locked.`);
    }

    return dbManager.transaction(() => {
      const activeEmps = db.prepare('SELECT id FROM employees WHERE is_active = 1').all() as { id: number }[];
      let updatedCount = 0;

      for (const emp of activeEmps) {
        const existing = db.prepare('SELECT id, status FROM employee_attendance WHERE employee_id = ? AND date = ?').get(emp.id, date) as any;
        if (!existing) {
          db.prepare(`
            INSERT INTO employee_attendance (
              store_id, employee_id, date, status, working_hours, overtime_hours, created_at, updated_at
            ) VALUES (1, ?, ?, 'Present', 8, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(emp.id, date);
          updatedCount++;
        }
      }

      auditLogger.log(authService.getCurrentUserId() || 1, 'HR_BULK_MARK_PRESENT', { date, updatedCount });
      return { success: true, count: updatedCount, date };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION D: LEAVE MANAGEMENT & AUTOMATIC ATTENDANCE SYNC
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get all configurable leave types.
   */
  public getLeaveTypes(): HRLeaveType[] {
    return db.prepare('SELECT * FROM hr_leave_types WHERE is_active = 1 ORDER BY id ASC').all() as HRLeaveType[];
  }

  /**
   * Create custom leave type.
   */
  public createLeaveType(input: { name: string; code: string; default_days_per_year: number; is_paid: boolean }): HRLeaveType {
    if (!input.name?.trim()) throw new ValidationError('Leave type name is required.');
    if (!input.code?.trim()) throw new ValidationError('Leave code is required.');

    const res = db.prepare(`
      INSERT INTO hr_leave_types (name, code, default_days_per_year, is_paid, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(input.name.trim(), input.code.trim().toUpperCase(), input.default_days_per_year || 0, input.is_paid ? 1 : 0);

    return db.prepare('SELECT * FROM hr_leave_types WHERE id = ?').get(res.lastInsertRowid) as HRLeaveType;
  }

  /**
   * Get all leave requests.
   */
  public getLeaves(filters?: { employeeId?: number; status?: string; year?: number }): EmployeeLeave[] {
    let sql = `
      SELECT 
        el.*,
        e.emp_code,
        e.full_name,
        e.department,
        u.username as approved_by_name
      FROM employee_leaves el
      JOIN employees e ON el.employee_id = e.id
      LEFT JOIN users u ON el.approved_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.employeeId) {
      sql += ` AND el.employee_id = ?`;
      params.push(filters.employeeId);
    }
    if (filters?.status && filters.status !== 'ALL') {
      sql += ` AND el.status = ?`;
      params.push(filters.status);
    }
    if (filters?.year) {
      sql += ` AND (strftime('%Y', el.start_date) = ? OR strftime('%Y', el.end_date) = ?)`;
      params.push(String(filters.year), String(filters.year));
    }

    sql += ` ORDER BY el.id DESC`;
    return db.prepare(sql).all(...params) as EmployeeLeave[];
  }

  /**
   * Apply for leave.
   */
  public applyLeave(input: {
    employee_id: number;
    leave_type_id?: number;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
    is_paid?: boolean;
  }): EmployeeLeave {
    if (!input.employee_id) throw new ValidationError('Employee is required.');
    if (!input.start_date || !input.end_date) throw new ValidationError('Start and end dates are required.');

    const start = new Date(input.start_date);
    const end = new Date(input.end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      throw new ValidationError('Invalid leave date range.');
    }

    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const isPaid = input.is_paid !== undefined ? (input.is_paid ? 1 : 0) : (input.leave_type?.toLowerCase().includes('unpaid') ? 0 : 1);

    const res = db.prepare(`
      INSERT INTO employee_leaves (
        store_id, employee_id, leave_type_id, leave_type, start_date, end_date,
        total_days, reason, is_paid, status, created_at, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      input.employee_id,
      input.leave_type_id || null,
      input.leave_type,
      input.start_date,
      input.end_date,
      diffDays,
      input.reason?.trim() || 'Leave Request',
      isPaid
    );

    auditLogger.log(authService.getCurrentUserId() || 1, 'HR_APPLY_LEAVE', { employeeId: input.employee_id, leaveId: res.lastInsertRowid });
    return db.prepare('SELECT * FROM employee_leaves WHERE id = ?').get(res.lastInsertRowid) as EmployeeLeave;
  }

  /**
   * Approve or reject leave request.
   * CRITICAL: When approved, automatically writes matching attendance entries into Section C's grid.
   */
  public approveLeave(input: { leave_id: number; status: 'Approved' | 'Rejected'; rejection_reason?: string }): EmployeeLeave {
    const leave = db.prepare('SELECT * FROM employee_leaves WHERE id = ?').get(input.leave_id) as EmployeeLeave | undefined;
    if (!leave) throw new NotFoundError(`Leave request #${input.leave_id} not found.`);

    const userId = authService.getCurrentUserId() || 1;

    return dbManager.transaction(() => {
      db.prepare(`
        UPDATE employee_leaves SET
          status = ?,
          approved_by = ?,
          rejection_reason = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.status, userId, input.rejection_reason || null, input.leave_id);

      // AUTOMATIC ATTENDANCE SYNC: If approved, populate daily attendance records
      if (input.status === 'Approved') {
        const start = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        const attStatus: AttendanceStatus = leave.is_paid ? 'Leave_Paid' : 'Leave_Unpaid';

        const curr = new Date(start);
        while (curr <= end) {
          const dateStr = curr.toISOString().slice(0, 10);
          const monthYear = dateStr.slice(0, 7);

          // Only sync if month is not locked
          if (!this.isMonthLocked(monthYear)) {
            const existing = db.prepare('SELECT id FROM employee_attendance WHERE employee_id = ? AND date = ?').get(leave.employee_id, dateStr) as any;
            const noteText = `Approved Leave (${leave.leave_type}): ${leave.reason}`;

            if (existing) {
              db.prepare(`
                UPDATE employee_attendance SET
                  status = ?,
                  working_hours = 0,
                  overtime_hours = 0,
                  notes = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(attStatus, noteText, existing.id);
            } else {
              db.prepare(`
                INSERT INTO employee_attendance (
                  store_id, employee_id, date, status, working_hours, overtime_hours, notes, created_at, updated_at
                ) VALUES (1, ?, ?, ?, 0, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(leave.employee_id, dateStr, attStatus, noteText);
            }
          }

          curr.setDate(curr.getDate() + 1);
        }
      }

      auditLogger.log(userId, 'HR_APPROVE_LEAVE', { leaveId: input.leave_id, status: input.status });
      return db.prepare('SELECT * FROM employee_leaves WHERE id = ?').get(input.leave_id) as EmployeeLeave;
    });
  }

  /**
   * Get dynamic leave balance per employee per leave type for a given year.
   * Computed automatically from approved leave requests.
   */
  public getLeaveBalances(employeeId?: number, targetYear?: number): LeaveBalance[] {
    const year = targetYear || new Date().getFullYear();
    const yearStr = String(year);

    let empSql = 'SELECT id, emp_code, full_name FROM employees WHERE 1=1';
    const params: any[] = [];
    if (employeeId) {
      empSql += ' AND id = ?';
      params.push(employeeId);
    } else {
      empSql += ' AND is_active = 1';
    }
    empSql += ' ORDER BY emp_code ASC';

    const emps = db.prepare(empSql).all(...params) as { id: number; emp_code: string; full_name: string }[];
    const leaveTypes = this.getLeaveTypes();
    const balances: LeaveBalance[] = [];

    for (const emp of emps) {
      for (const lt of leaveTypes) {
        // Sum total approved days in this year
        const usedRow = db.prepare(`
          SELECT COALESCE(SUM(total_days), 0) as used
          FROM employee_leaves
          WHERE employee_id = ?
            AND (leave_type_id = ? OR LOWER(leave_type) = LOWER(?))
            AND status = 'Approved'
            AND (strftime('%Y', start_date) = ? OR strftime('%Y', end_date) = ?)
        `).get(emp.id, lt.id, lt.name, yearStr, yearStr) as { used: number };

        const used = usedRow?.used || 0;
        const allocated = lt.default_days_per_year || 0;
        const remaining = Math.max(0, allocated - used);

        balances.push({
          employee_id: emp.id,
          emp_code: emp.emp_code,
          full_name: emp.full_name,
          leave_type_id: lt.id,
          leave_type_name: lt.name,
          leave_type_code: lt.code,
          is_paid: lt.is_paid ? 1 : 0,
          allocated_days: allocated,
          used_days: used,
          remaining_days: remaining,
        });
      }
    }

    return balances;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ROLES & METADATA
  // ───────────────────────────────────────────────────────────────────────────

  public getRoles(): HRRole[] {
    return db.prepare('SELECT * FROM hr_roles WHERE is_active = 1 ORDER BY name ASC').all() as HRRole[];
  }

  public createRole(name: string, description?: string): HRRole {
    if (!name?.trim()) throw new ValidationError('Role name is required.');
    const res = db.prepare('INSERT OR IGNORE INTO hr_roles (name, description, is_active) VALUES (?, ?, 1)').run(name.trim(), description?.trim() || null);
    return db.prepare('SELECT * FROM hr_roles WHERE name = ?').get(name.trim()) as HRRole;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PHASE 2: EMPLOYEE LEDGER (SINGLE SOURCE OF TRUTH)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Append an entry to employee_ledger and maintain the running balance.
   */
  public appendLedgerEntry(input: {
    employeeId: number;
    entryDate: string;
    entryType: LedgerEntryType;
    debitPaise: number;
    creditPaise: number;
    referenceType?: string;
    referenceId?: number;
    referenceNumber?: string;
    description: string;
    createdBy?: number;
  }): EmployeeLedgerEntry {
    const cashierId = input.createdBy ?? authService.getCurrentUserId() ?? 1;

    // Get previous running balance for employee
    const lastRow = db.prepare(`
      SELECT running_balance_paise 
      FROM employee_ledger 
      WHERE employee_id = ? AND is_active = 1 
      ORDER BY id DESC LIMIT 1
    `).get(input.employeeId) as { running_balance_paise: number } | undefined;

    const prevBalance = lastRow ? lastRow.running_balance_paise : 0;
    const newBalance = prevBalance + input.creditPaise - input.debitPaise;

    const stmt = db.prepare(`
      INSERT INTO employee_ledger (
        store_id, employee_id, entry_date, entry_type,
        debit_paise, credit_paise, running_balance_paise,
        reference_type, reference_id, reference_number,
        description, created_by, is_active, created_at, updated_at
      ) VALUES (
        1, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run(
      input.employeeId,
      input.entryDate,
      input.entryType,
      input.debitPaise,
      input.creditPaise,
      newBalance,
      input.referenceType || null,
      input.referenceId || null,
      input.referenceNumber || null,
      input.description,
      cashierId
    );

    return db.prepare('SELECT * FROM employee_ledger WHERE id = ?').get(result.lastInsertRowid) as EmployeeLedgerEntry;
  }

  /**
   * Get employee ledger history with optional date range filter.
   */
  public getEmployeeLedger(employeeId: number, dateRange?: { start?: string; end?: string }): EmployeeLedgerEntry[] {
    let sql = `
      SELECT el.*, e.emp_code, e.full_name
      FROM employee_ledger el
      JOIN employees e ON e.id = el.employee_id
      WHERE el.employee_id = ? AND el.is_active = 1
    `;
    const params: any[] = [employeeId];

    if (dateRange?.start) {
      sql += ' AND el.entry_date >= ?';
      params.push(dateRange.start);
    }
    if (dateRange?.end) {
      sql += ' AND el.entry_date <= ?';
      params.push(dateRange.end);
    }

    sql += ' ORDER BY el.entry_date ASC, el.id ASC';
    return db.prepare(sql).all(...params) as EmployeeLedgerEntry[];
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION A: EMPLOYEE ADVANCES
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get employee advances with dynamically computed recovered and remaining balances.
   */
  public getAdvances(filters?: { employeeId?: number; status?: string }): EmployeeAdvance[] {
    let sql = `
      SELECT 
        ea.*,
        e.emp_code,
        e.full_name,
        e.department,
        COALESCE(SUM(ed.amount_paise), 0) AS recovered_amount_paise,
        (ea.amount_paise - COALESCE(SUM(ed.amount_paise), 0)) AS remaining_amount_paise
      FROM employee_advances ea
      JOIN employees e ON e.id = ea.employee_id
      LEFT JOIN employee_deductions ed ON ed.advance_id = ea.id AND ed.is_active = 1
      WHERE ea.is_active = 1
    `;
    const params: any[] = [];

    if (filters?.employeeId) {
      sql += ' AND ea.employee_id = ?';
      params.push(filters.employeeId);
    }

    sql += ' GROUP BY ea.id ORDER BY ea.advance_date DESC, ea.id DESC';

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(r => {
      const remaining = Math.max(0, r.amount_paise - (r.recovered_amount_paise || 0));
      let status: 'Active' | 'Partially_Recovered' | 'Fully_Recovered' = 'Active';
      if (remaining === 0 && r.amount_paise > 0) {
        status = 'Fully_Recovered';
      } else if (r.recovered_amount_paise > 0) {
        status = 'Partially_Recovered';
      }

      if (r.status !== status) {
        db.prepare('UPDATE employee_advances SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, r.id);
      }

      return {
        ...r,
        remaining_amount_paise: remaining,
        status,
      };
    });
  }

  /**
   * Record a new employee advance.
   * If cash, records a matching Cash-Out entry in Cash Box immediately.
   * Writes a Debit entry to employee_ledger.
   */
  public createAdvance(input: {
    employee_id: number;
    amount_paise: number;
    advance_date: string;
    payment_mode?: 'cash' | 'bank' | 'upi';
    reason: string;
  }): EmployeeAdvance {
    const cashierId = authService.getCurrentUserId() ?? 1;

    if (!input.employee_id) throw new ValidationError('Employee is required.');
    if (!Number.isSafeInteger(input.amount_paise) || input.amount_paise <= 0) {
      throw new ValidationError('Advance amount must be a positive number.');
    }
    if (!input.reason?.trim()) throw new ValidationError('Reason is required for salary advance.');

    const emp = db.prepare('SELECT id, full_name, emp_code FROM employees WHERE id = ?').get(input.employee_id) as any;
    if (!emp) throw new NotFoundError('Employee not found.');

    const paymentMode = input.payment_mode || 'cash';
    const advanceDate = input.advance_date || new Date().toISOString().slice(0, 10);

    return dbManager.transaction(() => {
      // 1. Insert into employee_advances
      const advStmt = db.prepare(`
        INSERT INTO employee_advances (
          store_id, employee_id, amount_paise, advance_date,
          payment_mode, reason, status, created_by, is_active,
          created_at, updated_at
        ) VALUES (
          1, ?, ?, ?,
          ?, ?, 'Active', ?, 1,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      const advResult = advStmt.run(
        input.employee_id,
        input.amount_paise,
        advanceDate,
        paymentMode,
        input.reason.trim(),
        cashierId
      );
      const advanceId = Number(advResult.lastInsertRowid);

      // 2. If Cash mode, immediately record matching Cash-Out entry in Cash Box
      if (paymentMode === 'cash') {
        cashBoxService.recordCashAdvance(advanceId, input.amount_paise, emp.full_name, cashierId);
      }

      // 3. Write Debit entry to employee_ledger
      this.appendLedgerEntry({
        employeeId: input.employee_id,
        entryDate: advanceDate,
        entryType: 'advance_disbursement',
        debitPaise: input.amount_paise,
        creditPaise: 0,
        referenceType: 'employee_advances',
        referenceId: advanceId,
        referenceNumber: `ADV-${String(advanceId).padStart(5, '0')}`,
        description: `Salary Advance (${paymentMode.toUpperCase()}): ${input.reason.trim()}`,
        createdBy: cashierId,
      });

      // 4. Record in store expenses ('Salary') and post balanced double-entry to accounting_daily_ledger
      this.postSalaryOrAdvanceToExpensesAndAccounting({
        employeeId: input.employee_id,
        employeeName: emp.full_name,
        empCode: emp.emp_code,
        amountPaise: input.amount_paise,
        date: advanceDate,
        paymentMode,
        referenceId: `ADV-${String(advanceId).padStart(5, '0')}`,
        notes: `Salary Advance (${emp.full_name}): ${input.reason.trim()}`,
        userId: cashierId,
      });

      auditLogger.log(cashierId, 'HR_CREATE_ADVANCE', { advanceId, employeeId: input.employee_id, amountPaise: input.amount_paise, paymentMode });
      logger.info('Employee advance created and ledger updated', { advanceId, employeeId: input.employee_id });

      return {
        id: advanceId,
        store_id: 1,
        employee_id: input.employee_id,
        emp_code: emp.emp_code,
        full_name: emp.full_name,
        amount_paise: input.amount_paise,
        recovered_amount_paise: 0,
        remaining_amount_paise: input.amount_paise,
        remaining_balance_paise: input.amount_paise,
        advance_date: advanceDate,
        payment_mode: paymentMode,
        reason: input.reason.trim(),
        status: 'Active',
        created_by: cashierId,
        is_active: 1,
        created_at: new Date().toISOString(),
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION B: EMPLOYEE EXPENSES (PAID BY SHOP, FOR EMPLOYEE)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get employee expenses.
   */
  public getExpenses(filters?: { employeeId?: number; category?: string; flag?: string }): EmployeeExpense[] {
    let sql = `
      SELECT ee.*, e.emp_code, e.full_name, e.department
      FROM employee_expenses ee
      JOIN employees e ON e.id = ee.employee_id
      WHERE ee.is_active = 1
    `;
    const params: any[] = [];

    if (filters?.employeeId) {
      sql += ' AND ee.employee_id = ?';
      params.push(filters.employeeId);
    }
    if (filters?.category && filters.category !== 'ALL') {
      sql += ' AND ee.category = ?';
      params.push(filters.category);
    }
    if (filters?.flag && filters.flag !== 'ALL') {
      sql += ' AND ee.flag = ?';
      params.push(filters.flag);
    }

    sql += ' ORDER BY ee.expense_date DESC, ee.id DESC';
    return db.prepare(sql).all(...params) as EmployeeExpense[];
  }

  /**
   * Record a new employee expense and write the appropriate entry to employee_ledger based on flag:
   * - Reimbursable -> Credit entry (shop owes employee).
   * - Salary Deduction -> Debit entry (deduct from employee's next payroll).
   * - Company Expense -> Reference entry (0 debit / 0 credit).
   */
  public createExpense(input: {
    employee_id: number;
    expense_date?: string;
    amount_paise: number;
    category: string;
    description: string;
    flag: ExpenseFlag;
    receipt_url?: string;
  }): EmployeeExpense {
    const cashierId = authService.getCurrentUserId() ?? 1;

    if (!input.employee_id) throw new ValidationError('Employee is required.');
    if (!Number.isSafeInteger(input.amount_paise) || input.amount_paise <= 0) {
      throw new ValidationError('Expense amount must be a positive number.');
    }
    if (!input.description?.trim()) throw new ValidationError('Description is required.');
    if (!input.flag) throw new ValidationError('Expense flag is required.');

    const emp = db.prepare('SELECT id, full_name, emp_code FROM employees WHERE id = ?').get(input.employee_id) as any;
    if (!emp) throw new NotFoundError('Employee not found.');

    const expenseDate = input.expense_date || new Date().toISOString().slice(0, 10);

    return dbManager.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO employee_expenses (
          store_id, employee_id, expense_date, amount_paise,
          category, description, flag, receipt_url, status,
          approved_by, created_by, is_active, created_at, updated_at
        ) VALUES (
          1, ?, ?, ?,
          ?, ?, ?, ?, 'Approved',
          ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      const result = stmt.run(
        input.employee_id,
        expenseDate,
        input.amount_paise,
        input.category || 'Other',
        input.description.trim(),
        input.flag,
        input.receipt_url || null,
        cashierId,
        cashierId
      );

      const expenseId = Number(result.lastInsertRowid);

      // Write to employee_ledger based on flag
      if (input.flag === 'Reimbursable') {
        this.appendLedgerEntry({
          employeeId: input.employee_id,
          entryDate: expenseDate,
          entryType: 'expense_reimbursement',
          debitPaise: 0,
          creditPaise: input.amount_paise,
          referenceType: 'employee_expenses',
          referenceId: expenseId,
          referenceNumber: `EXP-${String(expenseId).padStart(5, '0')}`,
          description: `Expense Reimbursement (${input.category}): ${input.description.trim()}`,
          createdBy: cashierId,
        });
      } else if (input.flag === 'Salary Deduction') {
        this.appendLedgerEntry({
          employeeId: input.employee_id,
          entryDate: expenseDate,
          entryType: 'expense_deduction',
          debitPaise: input.amount_paise,
          creditPaise: 0,
          referenceType: 'employee_expenses',
          referenceId: expenseId,
          referenceNumber: `EXP-${String(expenseId).padStart(5, '0')}`,
          description: `Expense Deduction (${input.category}): ${input.description.trim()}`,
          createdBy: cashierId,
        });
      } else {
        // Company Expense -> Informational reference in ledger
        this.appendLedgerEntry({
          employeeId: input.employee_id,
          entryDate: expenseDate,
          entryType: 'company_expense',
          debitPaise: 0,
          creditPaise: 0,
          referenceType: 'employee_expenses',
          referenceId: expenseId,
          referenceNumber: `EXP-${String(expenseId).padStart(5, '0')}`,
          description: `Company Expense (${input.category}): ${input.description.trim()} [Non-payroll]`,
          createdBy: cashierId,
        });
      }

      auditLogger.log(cashierId, 'HR_CREATE_EXPENSE', { expenseId, employeeId: input.employee_id, amountPaise: input.amount_paise, flag: input.flag });
      logger.info('Employee expense created and ledger updated', { expenseId, employeeId: input.employee_id, flag: input.flag });

      return db.prepare(`
        SELECT ee.*, e.emp_code, e.full_name, e.department
        FROM employee_expenses ee
        JOIN employees e ON e.id = ee.employee_id
        WHERE ee.id = ?
      `).get(expenseId) as EmployeeExpense;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION C: INCENTIVE MANAGEMENT (MANUAL & RULE-BASED)
  // ───────────────────────────────────────────────────────────────────────────

  public getIncentiveRules(): IncentiveRule[] {
    return db.prepare('SELECT * FROM employee_incentive_rules WHERE is_active = 1 ORDER BY id ASC').all() as IncentiveRule[];
  }

  public createIncentiveRule(input: {
    rule_name: string;
    rule_type: string;
    target_value: number;
    reward_amount_paise: number;
    description?: string;
  }): IncentiveRule {
    if (!input.rule_name?.trim()) throw new ValidationError('Rule name is required.');
    if (input.reward_amount_paise <= 0) throw new ValidationError('Reward amount must be positive.');

    const stmt = db.prepare(`
      INSERT INTO employee_incentive_rules (
        store_id, rule_name, rule_type, target_value,
        reward_amount_paise, description, is_active, created_at, updated_at
      ) VALUES (
        1, ?, ?, ?,
        ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run(
      input.rule_name.trim(),
      input.rule_type,
      input.target_value,
      input.reward_amount_paise,
      input.description?.trim() || null
    );

    return db.prepare('SELECT * FROM employee_incentive_rules WHERE id = ?').get(result.lastInsertRowid) as IncentiveRule;
  }

  public getIncentives(filters?: { employeeId?: number; monthYear?: string }): EmployeeIncentive[] {
    let sql = `
      SELECT ei.*, e.emp_code, e.full_name, e.department, eir.rule_name
      FROM employee_incentives ei
      JOIN employees e ON e.id = ei.employee_id
      LEFT JOIN employee_incentive_rules eir ON eir.id = ei.rule_id
      WHERE ei.is_active = 1
    `;
    const params: any[] = [];

    if (filters?.employeeId) {
      sql += ' AND ei.employee_id = ?';
      params.push(filters.employeeId);
    }
    if (filters?.monthYear) {
      sql += ' AND ei.month_year = ?';
      params.push(filters.monthYear);
    }

    sql += ' ORDER BY ei.incentive_date DESC, ei.id DESC';
    return db.prepare(sql).all(...params) as EmployeeIncentive[];
  }

  /**
   * Create a manual one-off incentive (e.g. festival bonus) and write Credit to employee_ledger.
   */
  public createManualIncentive(input: {
    employee_id: number;
    amount_paise: number;
    incentive_date?: string;
    reason: string;
  }): EmployeeIncentive {
    const cashierId = authService.getCurrentUserId() ?? 1;

    if (!input.employee_id) throw new ValidationError('Employee is required.');
    if (!Number.isSafeInteger(input.amount_paise) || input.amount_paise <= 0) {
      throw new ValidationError('Incentive amount must be a positive number.');
    }
    if (!input.reason?.trim()) throw new ValidationError('Reason is required.');

    const emp = db.prepare('SELECT id, full_name, emp_code FROM employees WHERE id = ?').get(input.employee_id) as any;
    if (!emp) throw new NotFoundError('Employee not found.');

    const incentiveDate = input.incentive_date || new Date().toISOString().slice(0, 10);
    const monthYear = incentiveDate.slice(0, 7);

    return dbManager.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO employee_incentives (
          store_id, employee_id, incentive_type, amount_paise,
          incentive_date, month_year, reason, created_by, is_active,
          created_at, updated_at
        ) VALUES (
          1, ?, 'manual', ?,
          ?, ?, ?, ?, 1,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      const result = stmt.run(
        input.employee_id,
        input.amount_paise,
        incentiveDate,
        monthYear,
        input.reason.trim(),
        cashierId
      );

      const incentiveId = Number(result.lastInsertRowid);

      // Write Credit to employee_ledger
      this.appendLedgerEntry({
        employeeId: input.employee_id,
        entryDate: incentiveDate,
        entryType: 'incentive',
        debitPaise: 0,
        creditPaise: input.amount_paise,
        referenceType: 'employee_incentives',
        referenceId: incentiveId,
        referenceNumber: `INC-${String(incentiveId).padStart(5, '0')}`,
        description: `Manual Incentive / Bonus: ${input.reason.trim()}`,
        createdBy: cashierId,
      });

      auditLogger.log(cashierId, 'HR_CREATE_INCENTIVE', { incentiveId, employeeId: input.employee_id, amountPaise: input.amount_paise });
      logger.info('Manual incentive recorded and ledger updated', { incentiveId, employeeId: input.employee_id });

      return db.prepare(`
        SELECT ei.*, e.emp_code, e.full_name, e.department
        FROM employee_incentives ei
        JOIN employees e ON e.id = ei.employee_id
        WHERE ei.id = ?
      `).get(incentiveId) as EmployeeIncentive;
    });
  }

  /**
   * Evaluate rule-based incentives for a given month automatically.
   */
  public evaluateRuleIncentives(inputMonthYear?: any): { processed: number; awards: EmployeeIncentive[] } {
    const monthYear = typeof inputMonthYear === 'string' 
      ? inputMonthYear 
      : (inputMonthYear?.monthYear || new Date().toISOString().slice(0, 7));

    const cashierId = authService.getCurrentUserId() ?? 1;
    const rules = this.getIncentiveRules();
    const activeEmployees = this.getAllEmployees({ status: 'Active' });
    const awards: EmployeeIncentive[] = [];

    return dbManager.transaction(() => {
      for (const rule of rules) {
        if (rule.rule_type === 'sales_target') {
          // Check monthly sales total from completed invoices
          const salesRow = db.prepare(`
            SELECT COALESCE(SUM(final_total_paise), 0) AS total_sales
            FROM invoices
            WHERE LOWER(status) IN ('completed', 'paid') 
              AND (
                strftime('%Y-%m', completed_at) = ? 
                OR strftime('%Y-%m', invoice_date) = ? 
                OR strftime('%Y-%m', created_at) = ?
              )
          `).get(monthYear, monthYear, monthYear) as { total_sales: number };

          // Handle target value whether defined in Paise or Rupees
          const targetPaise = rule.target_value > 100000 ? rule.target_value : Math.round(rule.target_value * 100);

          if (salesRow.total_sales >= targetPaise || salesRow.total_sales >= rule.target_value) {
            // Target met! Award incentive to active staff who haven't already received this rule for this month
            for (const emp of activeEmployees) {
              const alreadyAwarded = db.prepare(`
                SELECT id FROM employee_incentives 
                WHERE employee_id = ? AND rule_id = ? AND month_year = ? AND is_active = 1
              `).get(emp.id, rule.id, monthYear);

              if (!alreadyAwarded) {
                const awardDate = `${monthYear}-28`;
                const stmt = db.prepare(`
                  INSERT INTO employee_incentives (
                    store_id, employee_id, incentive_type, rule_id,
                    amount_paise, incentive_date, month_year, reason,
                    created_by, is_active, created_at, updated_at
                  ) VALUES (
                    1, ?, 'rule_based', ?,
                    ?, ?, ?, ?,
                    ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                  )
                `);

                const res = stmt.run(
                  emp.id,
                  rule.id,
                  rule.reward_amount_paise,
                  awardDate,
                  monthYear,
                  `Rule: ${rule.rule_name} (Sales achieved ₹${(salesRow.total_sales / 100).toLocaleString('en-IN')})`,
                  cashierId
                );

                const incId = Number(res.lastInsertRowid);

                this.appendLedgerEntry({
                  employeeId: emp.id,
                  entryDate: awardDate,
                  entryType: 'incentive',
                  debitPaise: 0,
                  creditPaise: rule.reward_amount_paise,
                  referenceType: 'employee_incentives',
                  referenceId: incId,
                  referenceNumber: `INC-${String(incId).padStart(5, '0')}`,
                  description: `Rule Incentive: ${rule.rule_name}`,
                  createdBy: cashierId,
                });

                awards.push(db.prepare('SELECT * FROM employee_incentives WHERE id = ?').get(incId) as EmployeeIncentive);
              }
            }
          }
        } else if (rule.rule_type === 'attendance_target') {
          // Check employee worked days in month
          for (const emp of activeEmployees) {
            const workedRow = db.prepare(`
              SELECT 
                COALESCE(SUM(CASE 
                  WHEN status IN ('Present', 'Late', 'Leave_Paid', 'Holiday', 'Weekly_Off') THEN 1.0
                  WHEN status = 'Half_Day' THEN 0.5
                  ELSE 0.0
                END), 0) AS worked_days
              FROM employee_attendance
              WHERE employee_id = ? AND strftime('%Y-%m', date) = ? AND is_active = 1
            `).get(emp.id, monthYear) as { worked_days: number };

            if (workedRow.worked_days >= rule.target_value) {
              const alreadyAwarded = db.prepare(`
                SELECT id FROM employee_incentives 
                WHERE employee_id = ? AND rule_id = ? AND month_year = ? AND is_active = 1
              `).get(emp.id, rule.id, monthYear);

              if (!alreadyAwarded) {
                const awardDate = `${monthYear}-28`;
                const stmt = db.prepare(`
                  INSERT INTO employee_incentives (
                    store_id, employee_id, incentive_type, rule_id,
                    amount_paise, incentive_date, month_year, reason,
                    created_by, is_active, created_at, updated_at
                  ) VALUES (
                    1, ?, 'rule_based', ?,
                    ?, ?, ?, ?,
                    ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                  )
                `);

                const res = stmt.run(
                  emp.id,
                  rule.id,
                  rule.reward_amount_paise,
                  awardDate,
                  monthYear,
                  `Rule: ${rule.rule_name} (${workedRow.worked_days} days worked)`,
                  cashierId
                );

                const incId = Number(res.lastInsertRowid);

                this.appendLedgerEntry({
                  employeeId: emp.id,
                  entryDate: awardDate,
                  entryType: 'incentive',
                  debitPaise: 0,
                  creditPaise: rule.reward_amount_paise,
                  referenceType: 'employee_incentives',
                  referenceId: incId,
                  referenceNumber: `INC-${String(incId).padStart(5, '0')}`,
                  description: `Attendance Incentive: ${rule.rule_name}`,
                  createdBy: cashierId,
                });

                awards.push(db.prepare('SELECT * FROM employee_incentives WHERE id = ?').get(incId) as EmployeeIncentive);
              }
            }
          }
        }
      }

      return { processed: awards.length, awards };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION D: OVERTIME
  // ───────────────────────────────────────────────────────────────────────────

  public getOvertimeRecords(filters?: { employeeId?: number; monthYear?: string }): EmployeeOvertime[] {
    let sql = `
      SELECT eo.*, e.emp_code, e.full_name, e.department
      FROM employee_overtime eo
      JOIN employees e ON e.id = eo.employee_id
      WHERE eo.is_active = 1
    `;
    const params: any[] = [];

    if (filters?.employeeId) {
      sql += ' AND eo.employee_id = ?';
      params.push(filters.employeeId);
    }
    if (filters?.monthYear) {
      sql += ' AND strftime("%Y-%m", eo.date) = ?';
      params.push(filters.monthYear);
    }

    sql += ' ORDER BY eo.date DESC, eo.id DESC';
    return db.prepare(sql).all(...params) as EmployeeOvertime[];
  }

  /**
   * Record overtime for an employee and write Credit entry to employee_ledger.
   */
  public recordOvertime(input: {
    employee_id: number;
    date: string;
    normal_hours?: number;
    ot_hours: number;
    ot_rate_paise?: number;
    notes?: string;
  }): EmployeeOvertime {
    const cashierId = authService.getCurrentUserId() ?? 1;

    if (!input.employee_id) throw new ValidationError('Employee is required.');
    if (!input.ot_hours || input.ot_hours <= 0) throw new ValidationError('OT hours must be greater than 0.');

    const emp = db.prepare('SELECT id, full_name, emp_code FROM employees WHERE id = ?').get(input.employee_id) as any;
    if (!emp) throw new NotFoundError('Employee not found.');

    const salaryStruct = this.getSalaryStructure(input.employee_id);
    const otRate = input.ot_rate_paise ?? (salaryStruct?.overtime_rate_paise || 10000); // default ₹100/hr if unset
    const computedAmount = Math.round(input.ot_hours * otRate);
    const otDate = input.date || new Date().toISOString().slice(0, 10);

    return dbManager.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO employee_overtime (
          store_id, employee_id, date, normal_hours,
          ot_hours, ot_rate_paise, computed_amount_paise,
          notes, created_by, is_active, created_at, updated_at
        ) VALUES (
          1, ?, ?, ?,
          ?, ?, ?,
          ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      const result = stmt.run(
        input.employee_id,
        otDate,
        input.normal_hours || 8,
        input.ot_hours,
        otRate,
        computedAmount,
        input.notes?.trim() || null,
        cashierId
      );

      const otId = Number(result.lastInsertRowid);

      // Write Credit to employee_ledger
      this.appendLedgerEntry({
        employeeId: input.employee_id,
        entryDate: otDate,
        entryType: 'overtime',
        debitPaise: 0,
        creditPaise: computedAmount,
        referenceType: 'employee_overtime',
        referenceId: otId,
        referenceNumber: `OT-${String(otId).padStart(5, '0')}`,
        description: `Overtime (${input.ot_hours} hrs @ ₹${(otRate / 100).toFixed(2)}/hr): ${input.notes?.trim() || 'Extra shift duty'}`,
        createdBy: cashierId,
      });

      auditLogger.log(cashierId, 'HR_RECORD_OVERTIME', { otId, employeeId: input.employee_id, otHours: input.ot_hours, computedAmount });
      logger.info('Overtime recorded and ledger updated', { otId, employeeId: input.employee_id });

      return db.prepare(`
        SELECT eo.*, e.emp_code, e.full_name, e.department
        FROM employee_overtime eo
        JOIN employees e ON e.id = eo.employee_id
        WHERE eo.id = ?
      `).get(otId) as EmployeeOvertime;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION E: DEDUCTIONS (ADVANCE RECOVERY, PENALTIES, ETC.)
  // ───────────────────────────────────────────────────────────────────────────

  public getDeductions(filters?: { employeeId?: number; deductionType?: string; advanceId?: number }): EmployeeDeduction[] {
    let sql = `
      SELECT ed.*, e.emp_code, e.full_name, e.department, ea.amount_paise AS advance_original_amount_paise
      FROM employee_deductions ed
      JOIN employees e ON e.id = ed.employee_id
      LEFT JOIN employee_advances ea ON ea.id = ed.advance_id
      WHERE ed.is_active = 1
    `;
    const params: any[] = [];

    if (filters?.employeeId) {
      sql += ' AND ed.employee_id = ?';
      params.push(filters.employeeId);
    }
    if (filters?.deductionType && filters.deductionType !== 'ALL') {
      sql += ' AND ed.deduction_type = ?';
      params.push(filters.deductionType);
    }
    if (filters?.advanceId) {
      sql += ' AND ed.advance_id = ?';
      params.push(filters.advanceId);
    }

    sql += ' ORDER BY ed.deduction_date DESC, ed.id DESC';
    return db.prepare(sql).all(...params) as EmployeeDeduction[];
  }

  /**
   * Create a deduction and write Debit to employee_ledger.
   * If Advance Recovery, links to advance_id and checks remaining balance.
   */
  public createDeduction(input: {
    employee_id: number;
    deduction_type: DeductionType;
    advance_id?: number | null;
    amount_paise: number;
    deduction_date?: string;
    reason: string;
    approved_by_name?: string;
  }): EmployeeDeduction {
    const cashierId = authService.getCurrentUserId() ?? 1;

    if (!input.employee_id) throw new ValidationError('Employee is required.');
    if (!input.deduction_type) throw new ValidationError('Deduction type is required.');
    if (!Number.isSafeInteger(input.amount_paise) || input.amount_paise <= 0) {
      throw new ValidationError('Deduction amount must be a positive number.');
    }
    if (!input.reason?.trim()) {
      throw new ValidationError('Reason is required and cannot be saved without one.');
    }

    const emp = db.prepare('SELECT id, full_name, emp_code FROM employees WHERE id = ?').get(input.employee_id) as any;
    if (!emp) throw new NotFoundError('Employee not found.');

    const deductionDate = input.deduction_date || new Date().toISOString().slice(0, 10);
    const approvedByName = input.approved_by_name || 'Admin / Manager';

    return dbManager.transaction(() => {
      // If Advance Recovery, validate against remaining advance balance
      if (input.deduction_type === 'Advance Recovery') {
        if (!input.advance_id) {
          throw new ValidationError('An advance must be selected for Advance Recovery.');
        }

        const advance = db.prepare(`
          SELECT 
            ea.*,
            COALESCE(SUM(ed.amount_paise), 0) AS recovered_sum
          FROM employee_advances ea
          LEFT JOIN employee_deductions ed ON ed.advance_id = ea.id AND ed.is_active = 1
          WHERE ea.id = ? AND ea.is_active = 1
          GROUP BY ea.id
        `).get(input.advance_id) as any;

        if (!advance) throw new NotFoundError('Linked advance record not found.');
        const remaining = advance.amount_paise - advance.recovered_sum;

        if (input.amount_paise > remaining) {
          throw new ValidationError(`Recovery amount (₹${(input.amount_paise / 100).toFixed(2)}) exceeds remaining advance balance (₹${(remaining / 100).toFixed(2)}).`);
        }
      }

      const stmt = db.prepare(`
        INSERT INTO employee_deductions (
          store_id, employee_id, deduction_type, advance_id,
          amount_paise, deduction_date, reason, approved_by,
          approved_by_name, created_by, is_active, created_at, updated_at
        ) VALUES (
          1, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      const result = stmt.run(
        input.employee_id,
        input.deduction_type,
        input.advance_id || null,
        input.amount_paise,
        deductionDate,
        input.reason.trim(),
        cashierId,
        approvedByName,
        cashierId
      );

      const deductionId = Number(result.lastInsertRowid);

      // Write Debit to employee_ledger
      const entryType: LedgerEntryType = input.deduction_type === 'Advance Recovery' ? 'advance_recovery' : 'deduction';
      this.appendLedgerEntry({
        employeeId: input.employee_id,
        entryDate: deductionDate,
        entryType,
        debitPaise: input.amount_paise,
        creditPaise: 0,
        referenceType: 'employee_deductions',
        referenceId: deductionId,
        referenceNumber: `DED-${String(deductionId).padStart(5, '0')}`,
        description: `Deduction [${input.deduction_type}]: ${input.reason.trim()} (Approved by: ${approvedByName})`,
        createdBy: cashierId,
      });

      // Update advance status if needed
      if (input.advance_id) {
        const advSum = db.prepare(`
          SELECT ea.amount_paise, COALESCE(SUM(ed.amount_paise), 0) AS recovered_sum
          FROM employee_advances ea
          LEFT JOIN employee_deductions ed ON ed.advance_id = ea.id AND ed.is_active = 1
          WHERE ea.id = ?
          GROUP BY ea.id
        `).get(input.advance_id) as any;

        if (advSum) {
          const newStatus = advSum.recovered_sum >= advSum.amount_paise ? 'Fully_Recovered' : 'Partially_Recovered';
          db.prepare('UPDATE employee_advances SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, input.advance_id);
        }
      }

      auditLogger.log(cashierId, 'HR_CREATE_DEDUCTION', { deductionId, employeeId: input.employee_id, amountPaise: input.amount_paise, type: input.deduction_type });
      logger.info('Deduction created and ledger updated', { deductionId, employeeId: input.employee_id, type: input.deduction_type });

      return db.prepare(`
        SELECT ed.*, e.emp_code, e.full_name, e.department
        FROM employee_deductions ed
        JOIN employees e ON e.id = ed.employee_id
        WHERE ed.id = ?
      `).get(deductionId) as EmployeeDeduction;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PHASE 3: AUDIT TRAIL LOGGING
  // ───────────────────────────────────────────────────────────────────────────

  public logHRAudit(
    entityType: string,
    entityId: number,
    action: string,
    reason: string,
    oldValue?: any,
    newValue?: any
  ): void {
    const userId = authService.getCurrentUserId() ?? 1;
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const userName = userRow?.username || 'Admin';

    db.prepare(`
      INSERT INTO hr_audit_logs (
        store_id, entity_type, entity_id, action,
        old_value_json, new_value_json, reason,
        performed_by, performed_by_name, created_at
      ) VALUES (
        1, ?, ?, ?,
        ?, ?, ?,
        ?, ?, CURRENT_TIMESTAMP
      )
    `).run(
      entityType,
      entityId,
      action,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      reason,
      userId,
      userName
    );
  }

  public getAuditLogs(filters?: { entityType?: string; entityId?: number; limit?: number }): HRAuditLog[] {
    let sql = 'SELECT * FROM hr_audit_logs WHERE 1=1';
    const params: any[] = [];

    if (filters?.entityType) {
      sql += ' AND entity_type = ?';
      params.push(filters.entityType);
    }
    if (filters?.entityId) {
      sql += ' AND entity_id = ?';
      params.push(filters.entityId);
    }

    sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
    params.push(filters?.limit || 100);

    return db.prepare(sql).all(...params) as HRAuditLog[];
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PHASE 3: MONTHLY PAYROLL ENGINE (THE CORE CALCULATION)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generate or recalculate payroll for monthly, weekly, custom date range, or relieving final settlement.
   */
  public generateMonthlyPayroll(periodInput: string | PayrollPeriodInput, forceRecalculate = false): PayrollRun {
    const userId = authService.getCurrentUserId() ?? 1;

    let periodType: 'monthly' | 'weekly' | 'custom' | 'relieving' = 'monthly';
    let monthYear: string;
    let startDate: string;
    let endDate: string;
    let targetEmployeeId: number | undefined;
    let forceRecalc = forceRecalculate;

    if (typeof periodInput === 'string') {
      monthYear = periodInput;
      const [yearStr, monthStr] = monthYear.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const daysInMonth = new Date(year, month, 0).getDate();
      startDate = `${monthYear}-01`;
      endDate = `${monthYear}-${String(daysInMonth).padStart(2, '0')}`;
    } else {
      periodType = periodInput.periodType || 'monthly';
      monthYear = periodInput.monthYear || periodInput.startDate?.slice(0, 7) || new Date().toISOString().slice(0, 7);
      targetEmployeeId = periodInput.employeeId;
      if (periodInput.forceRecalculate) forceRecalc = true;

      if (periodInput.startDate && periodInput.endDate) {
        startDate = periodInput.startDate;
        endDate = periodInput.endDate;
      } else {
        const [yearStr, monthStr] = monthYear.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const daysInMonth = new Date(year, month, 0).getDate();
        startDate = `${monthYear}-01`;
        endDate = `${monthYear}-${String(daysInMonth).padStart(2, '0')}`;
      }
    }

    // 1. Lock Check
    if (this.isMonthLocked(monthYear)) {
      throw new ValidationError(`Payroll for ${monthYear} is locked. You must explicitly reopen payroll to modify.`);
    }

    const [yearStr, monthStr] = monthYear.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    // Calculate days in selected period
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const daysInPeriod = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

    // 2. Check existing run
    const existingRun = db.prepare('SELECT * FROM payroll_runs WHERE month_year = ? AND is_active = 1').get(monthYear) as PayrollRun | undefined;
    if (existingRun && (existingRun.status === 'Approved' || existingRun.status === 'Paid' || existingRun.status === 'Locked') && !forceRecalc && periodType === 'monthly') {
      return this.getPayrollRun(monthYear)!;
    }

    return dbManager.transaction(() => {
      // Upsert payroll_run master header
      let runId: number;
      if (!existingRun) {
        const runRes = db.prepare(`
          INSERT INTO payroll_runs (
            store_id, month_year, start_date, end_date, cycle_type, status, total_employees,
            total_gross_paise, total_deductions_paise, total_net_paise,
            created_by, is_active, created_at, updated_at
          ) VALUES (
            1, ?, ?, ?, ?, 'Draft', 0,
            0, 0, 0,
            ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `).run(monthYear, startDate, endDate, periodType.toUpperCase(), userId);
        runId = Number(runRes.lastInsertRowid);
      } else {
        runId = existingRun.id;
        db.prepare(`
          UPDATE payroll_runs SET
            start_date = ?, end_date = ?, cycle_type = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(startDate, endDate, periodType.toUpperCase(), runId);
      }

      const allEmployees = this.getAllEmployees({ includeInactive: periodType === 'relieving' });
      const targetEmployees = targetEmployeeId 
        ? allEmployees.filter(e => e.id === targetEmployeeId)
        : allEmployees.filter(e => e.is_active === 1);

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      for (const emp of targetEmployees) {
        // Check if item already exists and was marked Paid
        const existingItem = db.prepare(`
          SELECT * FROM payroll_items WHERE employee_id = ? AND month_year = ? AND is_active = 1
        `).get(emp.id, monthYear) as PayrollItem | undefined;

        if (existingItem && existingItem.status === 'Paid' && !forceRecalc) {
          totalGross += existingItem.gross_salary_paise;
          totalDeductions += existingItem.total_deductions_paise;
          totalNet += existingItem.net_salary_paise;
          continue;
        }

        const salaryStruct = this.getSalaryStructure(emp.id);
        const salaryType = salaryStruct?.pay_type || emp.salary_type || 'Monthly';
        const baseRatePaise = salaryStruct?.basic_salary_paise || emp.basic_salary_paise || 2000000;
        const isStrictAttendance = Boolean(salaryStruct?.attendance_based_salary);

        // A. Attendance Metrics between startDate and endDate
        const attRows = db.prepare(`
          SELECT date, status FROM employee_attendance
          WHERE employee_id = ? AND date BETWEEN ? AND ? AND is_active = 1
        `).all(emp.id, startDate, endDate) as { date: string; status: AttendanceStatus }[];

        let presentDays = 0;
        let halfDays = 0;
        let paidLeaveDays = 0;
        let unpaidLeaveDays = 0;
        let lateDays = 0;
        let holidayDays = 0;
        let weeklyOffDays = 0;

        for (const row of attRows) {
          switch (row.status) {
            case 'Present': presentDays += 1; break;
            case 'Half_Day': halfDays += 1; break;
            case 'Leave_Paid': paidLeaveDays += 1; break;
            case 'Leave_Unpaid': unpaidLeaveDays += 1; break;
            case 'Late': lateDays += 1; break;
            case 'Holiday': holidayDays += 1; break;
            case 'Weekly_Off': weeklyOffDays += 1; break;
          }
        }

        const workedDays = presentDays + lateDays + paidLeaveDays + holidayDays + weeklyOffDays + (halfDays * 0.5);

        // B. Basic Salary Calculation
        let computedBasicPaise = baseRatePaise;
        if (salaryType === 'Daily') {
          computedBasicPaise = Math.round(workedDays * baseRatePaise);
        } else if (salaryType === 'Hourly') {
          computedBasicPaise = Math.round(workedDays * 8 * baseRatePaise);
        } else {
          // Monthly Worker: Prorate if custom date range or strict attendance mode
          if (daysInPeriod < daysInMonth || isStrictAttendance) {
            computedBasicPaise = Math.round(workedDays * (baseRatePaise / daysInMonth));
          } else {
            computedBasicPaise = baseRatePaise;
          }
        }

        // C. Fixed Allowances (prorated if period < month)
        let allowancesPaise = 0;
        const allowancesList = Array.isArray(salaryStruct?.fixed_allowances) ? salaryStruct.fixed_allowances : [];
        for (const a of allowancesList) {
          const rawAmt = a.amount_paise || 0;
          const prorated = daysInPeriod < daysInMonth ? Math.round(rawAmt * (daysInPeriod / daysInMonth)) : rawAmt;
          allowancesPaise += prorated;
        }

        // D. Overtime Amount
        const otRow = db.prepare(`
          SELECT 
            COALESCE(SUM(ot_hours), 0) AS total_ot_hours,
            COALESCE(SUM(computed_amount_paise), 0) AS total_ot_paise
          FROM employee_overtime
          WHERE employee_id = ? AND date BETWEEN ? AND ? AND is_active = 1
        `).get(emp.id, startDate, endDate) as { total_ot_hours: number; total_ot_paise: number };

        const otHours = otRow.total_ot_hours;
        const otAmountPaise = otRow.total_ot_paise;

        // E. Incentives Amount
        const incRow = db.prepare(`
          SELECT COALESCE(SUM(amount_paise), 0) AS total_inc_paise
          FROM employee_incentives
          WHERE employee_id = ? AND (incentive_date BETWEEN ? AND ? OR month_year = ?) AND is_active = 1
        `).get(emp.id, startDate, endDate, monthYear) as { total_inc_paise: number };
        const incentivePaise = incRow.total_inc_paise;

        // F. Reimbursable Expenses
        const expRow = db.prepare(`
          SELECT COALESCE(SUM(amount_paise), 0) AS total_reimb_paise
          FROM employee_expenses
          WHERE employee_id = ? AND expense_date BETWEEN ? AND ? AND flag = 'Reimbursable' AND is_active = 1
        `).get(emp.id, startDate, endDate) as { total_reimb_paise: number };
        const reimbursablePaise = expRow.total_reimb_paise;

        // Gross Salary
        const grossSalaryPaise = computedBasicPaise + allowancesPaise + otAmountPaise + incentivePaise + reimbursablePaise;

        // G. Deductions: Advance Recovery
        const advDeductRow = db.prepare(`
          SELECT COALESCE(SUM(amount_paise), 0) AS total_adv_recovery
          FROM employee_deductions
          WHERE employee_id = ? AND deduction_type = 'Advance Recovery' AND deduction_date BETWEEN ? AND ? AND is_active = 1
        `).get(emp.id, startDate, endDate) as { total_adv_recovery: number };
        let advanceRecoveryPaise = advDeductRow.total_adv_recovery;

        // If no explicit deduction was logged, check outstanding advance balance
        if (advanceRecoveryPaise === 0) {
          const activeAdv = db.prepare(`
            SELECT 
              ea.id,
              (ea.amount_paise - COALESCE(SUM(ed.amount_paise), 0)) AS remaining_paise
            FROM employee_advances ea
            LEFT JOIN employee_deductions ed ON ed.advance_id = ea.id AND ed.is_active = 1
            WHERE ea.employee_id = ? AND ea.is_active = 1
            GROUP BY ea.id
            HAVING remaining_paise > 0
            ORDER BY ea.advance_date ASC LIMIT 1
          `).get(emp.id) as { id: number; remaining_paise: number } | undefined;

          if (activeAdv && activeAdv.remaining_paise > 0) {
            // If Relieving, recover 100% of remaining advance. Otherwise up to 50% of basic.
            if (periodType === 'relieving') {
              advanceRecoveryPaise = activeAdv.remaining_paise;
            } else {
              advanceRecoveryPaise = Math.min(activeAdv.remaining_paise, Math.round(computedBasicPaise * 0.5));
            }
          }
        }

        // H. Deductions: Unpaid Leave
        let unpaidLeaveDeductionPaise = 0;
        if (!isStrictAttendance && salaryType === 'Monthly' && unpaidLeaveDays > 0 && daysInPeriod >= daysInMonth) {
          unpaidLeaveDeductionPaise = Math.round(unpaidLeaveDays * (baseRatePaise / daysInMonth));
        }

        // I. Deductions: Other & Expense Deductions
        const otherDeductRow = db.prepare(`
          SELECT COALESCE(SUM(amount_paise), 0) AS other_deductions
          FROM employee_deductions
          WHERE employee_id = ? AND deduction_type != 'Advance Recovery' AND deduction_date BETWEEN ? AND ? AND is_active = 1
        `).get(emp.id, startDate, endDate) as { other_deductions: number };

        const expDeductRow = db.prepare(`
          SELECT COALESCE(SUM(amount_paise), 0) AS expense_deductions
          FROM employee_expenses
          WHERE employee_id = ? AND expense_date BETWEEN ? AND ? AND flag = 'Salary Deduction' AND is_active = 1
        `).get(emp.id, startDate, endDate) as { expense_deductions: number };

        const otherDeductionsPaise = otherDeductRow.other_deductions + expDeductRow.expense_deductions;

        const totalDeductPaise = advanceRecoveryPaise + unpaidLeaveDeductionPaise + otherDeductionsPaise;
        const computedNetSalaryPaise = Math.max(0, grossSalaryPaise - totalDeductPaise);

        // Preserve manual override if existing item was overridden
        let finalNetPaise = computedNetSalaryPaise;
        let isOverridden = 0;
        let overrideReason: string | null = null;
        let originalNetPaise: number | null = null;

        if (existingItem && existingItem.is_overridden === 1) {
          finalNetPaise = existingItem.net_salary_paise;
          isOverridden = 1;
          overrideReason = existingItem.override_reason ?? null;
          originalNetPaise = computedNetSalaryPaise;
        }

        // Upsert payroll_item
        const itemStmt = db.prepare(`
          INSERT INTO payroll_items (
            payroll_run_id, store_id, employee_id, month_year, start_date, end_date, cycle_type, salary_type,
            total_days_in_month, worked_days, present_days, paid_leave_days,
            unpaid_leave_days, half_days, overtime_hours, basic_salary_paise,
            fixed_allowances_paise, fixed_allowances_breakdown_json,
            overtime_amount_paise, incentive_amount_paise, reimbursable_expenses_paise,
            gross_salary_paise, advance_recovery_paise, unpaid_leave_deduction_paise,
            other_deductions_paise, total_deductions_paise, net_salary_paise,
            is_overridden, original_net_salary_paise, override_reason,
            status, is_active, created_at, updated_at
          ) VALUES (
            ?, 1, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            'Draft', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT(employee_id, month_year, is_active) DO UPDATE SET
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            cycle_type = excluded.cycle_type,
            worked_days = excluded.worked_days,
            present_days = excluded.present_days,
            paid_leave_days = excluded.paid_leave_days,
            unpaid_leave_days = excluded.unpaid_leave_days,
            half_days = excluded.half_days,
            overtime_hours = excluded.overtime_hours,
            basic_salary_paise = excluded.basic_salary_paise,
            fixed_allowances_paise = excluded.fixed_allowances_paise,
            fixed_allowances_breakdown_json = excluded.fixed_allowances_breakdown_json,
            overtime_amount_paise = excluded.overtime_amount_paise,
            incentive_amount_paise = excluded.incentive_amount_paise,
            reimbursable_expenses_paise = excluded.reimbursable_expenses_paise,
            gross_salary_paise = excluded.gross_salary_paise,
            advance_recovery_paise = excluded.advance_recovery_paise,
            unpaid_leave_deduction_paise = excluded.unpaid_leave_deduction_paise,
            other_deductions_paise = excluded.other_deductions_paise,
            total_deductions_paise = excluded.total_deductions_paise,
            net_salary_paise = excluded.net_salary_paise,
            updated_at = CURRENT_TIMESTAMP
        `);

        itemStmt.run(
          runId,
          emp.id,
          monthYear,
          startDate,
          endDate,
          periodType.toUpperCase(),
          salaryType,
          daysInPeriod,
          workedDays,
          presentDays,
          paidLeaveDays,
          unpaidLeaveDays,
          halfDays,
          otHours,
          computedBasicPaise,
          allowancesPaise,
          JSON.stringify(allowancesList),
          otAmountPaise,
          incentivePaise,
          reimbursablePaise,
          grossSalaryPaise,
          advanceRecoveryPaise,
          unpaidLeaveDeductionPaise,
          otherDeductionsPaise,
          totalDeductPaise,
          finalNetPaise,
          isOverridden,
          originalNetPaise,
          overrideReason
        );

        totalGross += grossSalaryPaise;
        totalDeductions += totalDeductPaise;
        totalNet += finalNetPaise;
      }

      // Update payroll_runs totals
      db.prepare(`
        UPDATE payroll_runs
        SET total_employees = ?, total_gross_paise = ?, total_deductions_paise = ?, total_net_paise = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(targetEmployees.length, totalGross, totalDeductions, totalNet, runId);

      this.logHRAudit('payroll_run', runId, 'GENERATE', `Generated payroll for ${startDate} to ${endDate} (${targetEmployees.length} employees, Mode: ${periodType})`);
      logger.info('Payroll generated successfully', { monthYear, startDate, endDate, runId, totalNet });

      return this.getPayrollRun(monthYear)!;
    });
  }

  /**
   * Settle an employee who is leaving / resigning / relieving.
   */
  public settleEmployeeRelieving(input: {
    employee_id: number;
    relieving_date: string;
    reason: string;
    payment_method?: 'cash' | 'bank' | 'upi' | 'cheque';
    payment_reference?: string;
  }): { employee: Employee; payrollItem?: PayrollItem } {
    const emp = this.getEmployeeById(input.employee_id);
    const relievingDate = input.relieving_date || new Date().toISOString().slice(0, 10);
    const monthYear = relievingDate.slice(0, 7);

    return dbManager.transaction(() => {
      // 1. Mark employee status as Relieved
      db.prepare(`
        UPDATE employees SET
          status = 'Relieved',
          relieving_date = ?,
          relieving_reason = ?,
          relieving_settled = 1,
          is_active = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(relievingDate, input.reason.trim(), emp.id);

      // 2. Generate final settlement period
      const lastPaidItem = db.prepare(`
        SELECT * FROM payroll_items 
        WHERE employee_id = ? AND status = 'Paid' AND is_active = 1
        ORDER BY payment_date DESC, id DESC LIMIT 1
      `).get(emp.id) as PayrollItem | undefined;

      const startDate = lastPaidItem?.payment_date 
        ? new Date(new Date(lastPaidItem.payment_date).getTime() + 86400000).toISOString().slice(0, 10)
        : `${monthYear}-01`;

      this.generateMonthlyPayroll({
        periodType: 'relieving',
        startDate,
        endDate: relievingDate,
        monthYear,
        employeeId: emp.id,
        relievingReason: input.reason,
        forceRecalculate: true,
      });

      this.logHRAudit('employee', emp.id, 'UPDATE', `Employee relieved on ${relievingDate}. Reason: ${input.reason.trim()}`);

      const updatedEmp = this.getEmployeeById(emp.id);
      const payrollItem = db.prepare(`
        SELECT * FROM payroll_items WHERE employee_id = ? AND month_year = ? AND is_active = 1 ORDER BY id DESC LIMIT 1
      `).get(emp.id, monthYear) as PayrollItem | undefined;

      return { employee: updatedEmp, payrollItem };
    });
  }

  public getPayrollRun(monthYear: string): PayrollRun | null {
    const run = db.prepare('SELECT * FROM payroll_runs WHERE month_year = ? AND is_active = 1').get(monthYear) as PayrollRun | undefined;
    if (!run) return null;
    run.items = this.getPayrollItems(monthYear);
    return run;
  }

  public getPayrollItems(monthYear: string, filters?: { employeeId?: number; department?: string; status?: string; salaryType?: string }): PayrollItem[] {
    let sql = `
      SELECT 
        pi.*,
        e.emp_code,
        e.full_name,
        e.role,
        e.department
      FROM payroll_items pi
      JOIN employees e ON e.id = pi.employee_id
      WHERE pi.month_year = ? AND pi.is_active = 1
    `;
    const params: any[] = [monthYear];

    if (filters?.employeeId) {
      sql += ' AND pi.employee_id = ?';
      params.push(filters.employeeId);
    }
    if (filters?.department && filters.department !== 'ALL') {
      sql += ' AND e.department = ?';
      params.push(filters.department);
    }
    if (filters?.status && filters.status !== 'ALL') {
      sql += ' AND pi.status = ?';
      params.push(filters.status);
    }
    if (filters?.salaryType && filters.salaryType !== 'ALL') {
      sql += ' AND pi.salary_type = ?';
      params.push(filters.salaryType);
    }

    sql += ' ORDER BY e.full_name ASC, pi.id ASC';

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => {
      let allowancesBreakdown: FixedAllowance[] = [];
      try {
        if (r.fixed_allowances_breakdown_json) {
          allowancesBreakdown = JSON.parse(r.fixed_allowances_breakdown_json);
        }
      } catch (e) {}
      return {
        ...r,
        fixed_allowances_breakdown: allowancesBreakdown,
      };
    });
  }

  /**
   * Manual override of a computed Net Salary for genuine edge cases with mandatory audit logging.
   */
  public overridePayrollItemNet(itemId: number, newNetSalaryPaise: number, reason: string): PayrollItem {
    if (!reason?.trim()) {
      throw new ValidationError('A reason is strictly mandatory for manual salary overrides.');
    }
    if (newNetSalaryPaise < 0) {
      throw new ValidationError('Net salary cannot be negative.');
    }

    const item = db.prepare('SELECT * FROM payroll_items WHERE id = ?').get(itemId) as PayrollItem | undefined;
    if (!item) throw new NotFoundError('Payroll item not found.');
    if (item.status === 'Locked' || item.status === 'Paid') {
      throw new ValidationError(`Cannot override salary when status is ${item.status}.`);
    }

    return dbManager.transaction(() => {
      const originalNet = item.original_net_salary_paise ?? item.net_salary_paise;

      db.prepare(`
        UPDATE payroll_items
        SET net_salary_paise = ?, is_overridden = 1, original_net_salary_paise = ?, override_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newNetSalaryPaise, originalNet, reason.trim(), itemId);

      // Recalculate payroll_run net total
      const sumRow = db.prepare(`
        SELECT COALESCE(SUM(net_salary_paise), 0) AS total_net
        FROM payroll_items
        WHERE payroll_run_id = ? AND is_active = 1
      `).get(item.payroll_run_id) as { total_net: number };

      db.prepare('UPDATE payroll_runs SET total_net_paise = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(sumRow.total_net, item.payroll_run_id);

      this.logHRAudit(
        'payroll_item',
        itemId,
        'OVERRIDE',
        reason.trim(),
        { net_salary_paise: item.net_salary_paise },
        { net_salary_paise: newNetSalaryPaise, reason: reason.trim() }
      );

      return db.prepare(`
        SELECT pi.*, e.emp_code, e.full_name, e.role, e.department
        FROM payroll_items pi
        JOIN employees e ON e.id = pi.employee_id
        WHERE pi.id = ?
      `).get(itemId) as PayrollItem;
    });
  }

  /**
   * Approve a monthly payroll run (Manager/Admin sign-off).
   */
  public approvePayrollRun(monthYear: string): PayrollRun {
    const userId = authService.getCurrentUserId() ?? 1;
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const userName = userRow?.username || 'Manager';

    const run = this.getPayrollRun(monthYear);
    if (!run) throw new NotFoundError(`No payroll run found for ${monthYear}. Please generate first.`);
    if (run.status === 'Locked') throw new ValidationError(`Payroll for ${monthYear} is locked.`);

    return dbManager.transaction(() => {
      db.prepare(`
        UPDATE payroll_runs
        SET status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, run.id);

      db.prepare(`
        UPDATE payroll_items
        SET status = 'Approved', updated_at = CURRENT_TIMESTAMP
        WHERE payroll_run_id = ? AND status = 'Draft'
      `).run(run.id);

      this.logHRAudit('payroll_run', run.id, 'APPROVE', `Payroll run for ${monthYear} approved by ${userName}`);
      return this.getPayrollRun(monthYear)!;
    });
  }

  /**
   * Pay an approved payroll row.
   * If Cash: calls cashBoxService to record Cash-Out immediately.
   * Appends salary_credit and salary_payout in employee_ledger.
   */
  public payPayrollItem(input: {
    itemId: number;
    paymentMethod: 'cash' | 'bank' | 'upi' | 'cheque';
    paymentDate?: string;
    paymentReference?: string;
  }): PayrollItem {
    const userId = authService.getCurrentUserId() ?? 1;
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const userName = userRow?.username || 'Admin';

    const item = db.prepare(`
      SELECT pi.*, e.emp_code, e.full_name
      FROM payroll_items pi
      JOIN employees e ON e.id = pi.employee_id
      WHERE pi.id = ? AND pi.is_active = 1
    `).get(input.itemId) as (PayrollItem & { full_name: string; emp_code: string }) | undefined;

    if (!item) throw new NotFoundError('Payroll item not found.');
    if (item.status === 'Paid') throw new ValidationError('This salary has already been paid.');
    if (item.status === 'Locked') throw new ValidationError('Cannot modify locked payroll.');

    const paymentDate = input.paymentDate || new Date().toISOString().slice(0, 10);
    const paymentMethod = input.paymentMethod || 'cash';
    const paymentRef = input.paymentReference || `SAL-${item.month_year}-${item.emp_code}`;

    return dbManager.transaction(() => {
      // 1. If Cash, immediately record Cash-Out in Cash Box
      if (paymentMethod === 'cash' && item.net_salary_paise > 0) {
        cashBoxService.recordCashAdvance(
          item.id,
          item.net_salary_paise,
          `Salary: ${item.full_name} (${item.month_year})`,
          userId
        );
      }

      // 2. Append Salary Credit to employee_ledger
      this.appendLedgerEntry({
        employeeId: item.employee_id,
        entryDate: paymentDate,
        entryType: 'salary_credit',
        debitPaise: 0,
        creditPaise: item.gross_salary_paise,
        referenceType: 'payroll',
        referenceId: item.id,
        referenceNumber: `SAL-GROSS-${item.id}`,
        description: `Gross Salary for ${item.month_year} (${item.worked_days}d worked)`,
        createdBy: userId,
      });

      // 3. Append Deductions & Net Payout Debit to employee_ledger
      if (item.total_deductions_paise > 0) {
        this.appendLedgerEntry({
          employeeId: item.employee_id,
          entryDate: paymentDate,
          entryType: 'deduction',
          debitPaise: item.total_deductions_paise,
          creditPaise: 0,
          referenceType: 'payroll',
          referenceId: item.id,
          referenceNumber: `SAL-DED-${item.id}`,
          description: `Payroll Deductions for ${item.month_year} (Adv: ₹${(item.advance_recovery_paise / 100).toFixed(2)}, Unpaid: ₹${(item.unpaid_leave_deduction_paise / 100).toFixed(2)})`,
          createdBy: userId,
        });
      }

      this.appendLedgerEntry({
        employeeId: item.employee_id,
        entryDate: paymentDate,
        entryType: 'salary_payout',
        debitPaise: item.net_salary_paise,
        creditPaise: 0,
        referenceType: 'payroll',
        referenceId: item.id,
        referenceNumber: paymentRef,
        description: `Net Salary Disbursed (${paymentMethod.toUpperCase()}): Ref #${paymentRef}`,
        createdBy: userId,
      });

      // Record in store expenses ('Salary') and post balanced double-entry to accounting_daily_ledger
      this.postSalaryOrAdvanceToExpensesAndAccounting({
        employeeId: item.employee_id,
        employeeName: item.full_name,
        empCode: item.emp_code,
        amountPaise: item.net_salary_paise,
        date: paymentDate,
        paymentMode: paymentMethod,
        referenceId: paymentRef,
        notes: `Monthly Salary Payout (${item.month_year} - ${item.full_name}): Ref #${paymentRef}`,
        userId,
      });

      // 4. Update payroll_item status
      db.prepare(`
        UPDATE payroll_items
        SET status = 'Paid', payment_method = ?, payment_date = ?, payment_reference = ?, paid_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(paymentMethod, paymentDate, paymentRef, userId, item.id);

      // 5. Update parent payroll_runs if all items are paid
      const unpaidCount = db.prepare(`
        SELECT COUNT(*) AS c FROM payroll_items
        WHERE payroll_run_id = ? AND status != 'Paid' AND is_active = 1
      `).get(item.payroll_run_id) as { c: number };

      if (unpaidCount.c === 0) {
        db.prepare("UPDATE payroll_runs SET status = 'Paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(item.payroll_run_id);
      }

      this.logHRAudit(
        'payroll_item',
        item.id,
        'PAY',
        `Paid ₹${formatMoney(paiseToRupees(item.net_salary_paise))} via ${paymentMethod.toUpperCase()} (Ref: ${paymentRef}) by ${userName}`
      );

      return db.prepare(`
        SELECT pi.*, e.emp_code, e.full_name, e.role, e.department
        FROM payroll_items pi
        JOIN employees e ON e.id = pi.employee_id
        WHERE pi.id = ?
      `).get(item.id) as PayrollItem;
    });
  }

  /**
   * Reverse a paid salary payment (creates reversal entry and adjustments).
   */
  public reversePayrollItemPayment(itemId: number, reason: string): PayrollItem {
    if (!reason?.trim()) {
      throw new ValidationError('A reason is mandatory for salary payment reversals.');
    }

    const userId = authService.getCurrentUserId() ?? 1;
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const userName = userRow?.username || 'Admin';

    const item = db.prepare(`
      SELECT pi.*, e.emp_code, e.full_name
      FROM payroll_items pi
      JOIN employees e ON e.id = pi.employee_id
      WHERE pi.id = ? AND pi.is_active = 1
    `).get(itemId) as (PayrollItem & { full_name: string; emp_code: string }) | undefined;

    if (!item) throw new NotFoundError('Payroll item not found.');
    if (item.status !== 'Paid') throw new ValidationError('Only Paid salary items can be reversed.');

    return dbManager.transaction(() => {
      // 1. If was paid in Cash, record an adjustment cash-in in Cash Box
      if (item.payment_method === 'cash' && item.net_salary_paise > 0) {
        cashBoxService.recordTransaction(
          'CASH_IN',
          item.net_salary_paise,
          'Salary Reversal',
          `Salary reversal for ${item.full_name} (${item.month_year}): ${reason.trim()}`
        );
      }

      // 2. Insert into payroll_reversals table
      db.prepare(`
        INSERT INTO payroll_reversals (
          store_id, payroll_item_id, reversed_amount_paise,
          reversal_reason, reversed_by, reversed_by_name, created_at
        ) VALUES (
          1, ?, ?,
          ?, ?, ?, CURRENT_TIMESTAMP
        )
      `).run(item.id, item.net_salary_paise, reason.trim(), userId, userName);

      // 3. Post reversal in employee_ledger
      this.appendLedgerEntry({
        employeeId: item.employee_id,
        entryDate: new Date().toISOString().slice(0, 10),
        entryType: 'salary_credit',
        debitPaise: 0,
        creditPaise: item.net_salary_paise,
        referenceType: 'payroll',
        referenceId: item.id,
        referenceNumber: `REV-${item.id}`,
        description: `Payment Reversal for ${item.month_year} Salary: ${reason.trim()}`,
        createdBy: userId,
      });

      // 4. Reset item status back to Approved
      db.prepare(`
        UPDATE payroll_items
        SET status = 'Approved', payment_method = NULL, payment_date = NULL, payment_reference = NULL, paid_by = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(item.id);

      // 5. Reset run status to Approved
      db.prepare("UPDATE payroll_runs SET status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(item.payroll_run_id);

      this.logHRAudit(
        'payroll_item',
        item.id,
        'REVERSE',
        `Reversed salary payout of ₹${(item.net_salary_paise / 100).toFixed(2)}. Reason: ${reason.trim()}`
      );

      return db.prepare(`
        SELECT pi.*, e.emp_code, e.full_name, e.role, e.department
        FROM payroll_items pi
        JOIN employees e ON e.id = pi.employee_id
        WHERE pi.id = ?
      `).get(item.id) as PayrollItem;
    });
  }

  /**
   * Lock a completed payroll run so no further changes are allowed without Admin unlock.
   */
  public lockPayrollRun(monthYear: string, notes?: string): PayrollRun {
    const userId = authService.getCurrentUserId() ?? 1;
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const userName = userRow?.username || 'Admin';

    const run = this.getPayrollRun(monthYear);
    if (!run) throw new NotFoundError(`No payroll run found for ${monthYear}.`);

    return dbManager.transaction(() => {
      // 1. Update payroll_runs
      db.prepare(`
        UPDATE payroll_runs
        SET status = 'Locked', locked_by = ?, locked_at = CURRENT_TIMESTAMP, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, notes || 'Finalized & Locked', run.id);

      // 2. Update items
      db.prepare("UPDATE payroll_items SET status = 'Locked', updated_at = CURRENT_TIMESTAMP WHERE payroll_run_id = ?")
        .run(run.id);

      // 3. Set lock in hr_payroll_locks
      db.prepare(`
        INSERT INTO hr_payroll_locks (store_id, month_year, is_locked, locked_by, locked_at, notes)
        VALUES (1, ?, 1, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(month_year) DO UPDATE SET
          is_locked = 1, locked_by = excluded.locked_by, locked_at = CURRENT_TIMESTAMP, notes = excluded.notes
      `).run(monthYear, userId, notes || 'Locked');

      this.logHRAudit('payroll_run', run.id, 'LOCK', `Locked payroll run for ${monthYear} by ${userName}`);
      return this.getPayrollRun(monthYear)!;
    });
  }

  /**
   * Reopen a locked payroll run (Admin action with mandatory reason).
   */
  public reopenPayrollRun(monthYear: string, reason: string): PayrollRun {
    if (!reason?.trim()) {
      throw new ValidationError('A reason is strictly mandatory to reopen a locked payroll run.');
    }

    const userId = authService.getCurrentUserId() ?? 1;
    const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const userName = userRow?.username || 'Admin';

    const run = this.getPayrollRun(monthYear);
    if (!run) throw new NotFoundError(`No payroll run found for ${monthYear}.`);

    return dbManager.transaction(() => {
      // 1. Reset lock in hr_payroll_locks
      db.prepare(`
        UPDATE hr_payroll_locks
        SET is_locked = 0, notes = ?
        WHERE month_year = ?
      `).run(`Reopened: ${reason.trim()}`, monthYear);

      // 2. Set status to Approved
      db.prepare(`
        UPDATE payroll_runs
        SET status = 'Approved', locked_by = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(run.id);

      db.prepare(`
        UPDATE payroll_items
        SET status = CASE WHEN payment_date IS NOT NULL THEN 'Paid' ELSE 'Approved' END, updated_at = CURRENT_TIMESTAMP
        WHERE payroll_run_id = ?
      `).run(run.id);

      this.logHRAudit('payroll_run', run.id, 'REOPEN', `Reopened locked payroll for ${monthYear}. Reason: ${reason.trim()}`);
      return this.getPayrollRun(monthYear)!;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION E: PAYROLL HISTORY & SECTION G: EMPLOYEE 360 DASHBOARD
  // ───────────────────────────────────────────────────────────────────────────

  public getEmployeePayrollHistory(employeeId: number): PayrollItem[] {
    const rows = db.prepare(`
      SELECT pi.*, e.emp_code, e.full_name, e.role, e.department
      FROM payroll_items pi
      JOIN employees e ON e.id = pi.employee_id
      WHERE pi.employee_id = ? AND pi.is_active = 1
      ORDER BY pi.month_year DESC, pi.id DESC
    `).all(employeeId) as any[];

    return rows.map(r => {
      let allowancesBreakdown: FixedAllowance[] = [];
      try {
        if (r.fixed_allowances_breakdown_json) {
          allowancesBreakdown = JSON.parse(r.fixed_allowances_breakdown_json);
        }
      } catch (e) {}
      return {
        ...r,
        fixed_allowances_breakdown: allowancesBreakdown,
      };
    });
  }

  public getEmployeeSummary360(employeeId: number): EmployeeSummary360 {
    const emp = this.getEmployeeById(employeeId);
    const salaryStruct = this.getSalaryStructure(employeeId);
    const nowMonth = new Date().toISOString().slice(0, 7);

    // Active advances
    const advances = this.getAdvances({ employeeId, status: 'Active' });
    const totalAdvRemaining = advances.reduce((s, a) => s + (a.remaining_amount_paise || 0), 0);

    // This month metrics
    const attGrid = this.getMonthAttendanceGrid(nowMonth);
    const empAtt = attGrid.employees.find(e => e.id === employeeId);

    const otRow = db.prepare(`
      SELECT COALESCE(SUM(ot_hours), 0) AS ot_hours, COALESCE(SUM(computed_amount_paise), 0) AS ot_paise
      FROM employee_overtime WHERE employee_id = ? AND strftime('%Y-%m', date) = ? AND is_active = 1
    `).get(employeeId, nowMonth) as { ot_hours: number; ot_paise: number };

    const incRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) AS inc_paise
      FROM employee_incentives WHERE employee_id = ? AND month_year = ? AND is_active = 1
    `).get(employeeId, nowMonth) as { inc_paise: number };

    const reimbRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) AS reimb_paise
      FROM employee_expenses WHERE employee_id = ? AND strftime('%Y-%m', expense_date) = ? AND flag = 'Reimbursable' AND is_active = 1
    `).get(employeeId, nowMonth) as { reimb_paise: number };

    const dedRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) AS ded_paise
      FROM employee_deductions WHERE employee_id = ? AND strftime('%Y-%m', deduction_date) = ? AND is_active = 1
    `).get(employeeId, nowMonth) as { ded_paise: number };

    // Ledger balance
    const lastLedger = db.prepare(`
      SELECT running_balance_paise FROM employee_ledger
      WHERE employee_id = ? AND is_active = 1
      ORDER BY id DESC LIMIT 1
    `).get(employeeId) as { running_balance_paise: number } | undefined;

    const recentLeaves = this.getLeaves({ employeeId }).slice(0, 5);
    const recentAdvances = this.getAdvances({ employeeId }).slice(0, 5);
    const recentPayrolls = this.getEmployeePayrollHistory(employeeId).slice(0, 6);

    const baseSalary = salaryStruct?.basic_salary_paise || emp.basic_salary_paise || 2000000;
    const workedDays = empAtt?.worked_days || 0;
    const estGross = (emp.salary_type === 'Daily' ? workedDays * baseSalary : baseSalary) + otRow.ot_paise + incRow.inc_paise + reimbRow.reimb_paise;
    const estNet = Math.max(0, estGross - dedRow.ded_paise);

    return {
      employee: emp,
      salary_structure: salaryStruct,
      active_advances_count: advances.length,
      total_advances_outstanding_paise: totalAdvRemaining,
      this_month: {
        month_year: nowMonth,
        worked_days: workedDays,
        present_days: empAtt?.present_count || 0,
        absent_days: empAtt?.absent_count || 0,
        paid_leave_days: empAtt?.paid_leave_count || 0,
        unpaid_leave_days: empAtt?.unpaid_leave_count || 0,
        overtime_hours: otRow.ot_hours,
        overtime_amount_paise: otRow.ot_paise,
        incentives_amount_paise: incRow.inc_paise,
        reimbursable_expenses_paise: reimbRow.reimb_paise,
        deductions_paise: dedRow.ded_paise,
        estimated_net_paise: estNet,
      },
      ledger_balance_paise: lastLedger?.running_balance_paise || 0,
      recent_leaves: recentLeaves,
      recent_advances: recentAdvances,
      recent_payrolls: recentPayrolls,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION H: COMPREHENSIVE REPORTS
  // ───────────────────────────────────────────────────────────────────────────

  public getPayrollSummaryReport(monthYear?: string, year?: number): HRPayrollReportSummary {
    const filterMonth = monthYear || new Date().toISOString().slice(0, 7);

    const row = db.prepare(`
      SELECT 
        COUNT(DISTINCT pi.employee_id) AS total_employees,
        COALESCE(SUM(pi.basic_salary_paise), 0) AS total_basic_paise,
        COALESCE(SUM(pi.fixed_allowances_paise), 0) AS total_allowances_paise,
        COALESCE(SUM(pi.overtime_amount_paise), 0) AS total_ot_paise,
        COALESCE(SUM(pi.incentive_amount_paise), 0) AS total_incentives_paise,
        COALESCE(SUM(pi.reimbursable_expenses_paise), 0) AS total_reimbursements_paise,
        COALESCE(SUM(pi.gross_salary_paise), 0) AS total_gross_paise,
        COALESCE(SUM(pi.advance_recovery_paise), 0) AS total_advance_recoveries_paise,
        COALESCE(SUM(pi.unpaid_leave_deduction_paise), 0) AS total_unpaid_deductions_paise,
        COALESCE(SUM(pi.other_deductions_paise), 0) AS total_other_deductions_paise,
        COALESCE(SUM(pi.total_deductions_paise), 0) AS total_deductions_paise,
        COALESCE(SUM(pi.net_salary_paise), 0) AS total_net_payout_paise,
        COALESCE(SUM(CASE WHEN pi.status = 'Paid' THEN 1 ELSE 0 END), 0) AS paid_count,
        COALESCE(SUM(CASE WHEN pi.status != 'Paid' THEN 1 ELSE 0 END), 0) AS unpaid_count
      FROM payroll_items pi
      WHERE pi.month_year = ? AND pi.is_active = 1
    `).get(filterMonth) as any;

    return {
      month_year: filterMonth,
      total_employees: row.total_employees || 0,
      total_basic_paise: row.total_basic_paise || 0,
      total_allowances_paise: row.total_allowances_paise || 0,
      total_ot_paise: row.total_ot_paise || 0,
      total_incentives_paise: row.total_incentives_paise || 0,
      total_reimbursements_paise: row.total_reimbursements_paise || 0,
      total_gross_paise: row.total_gross_paise || 0,
      total_advance_recoveries_paise: row.total_advance_recoveries_paise || 0,
      total_unpaid_deductions_paise: row.total_unpaid_deductions_paise || 0,
      total_other_deductions_paise: row.total_other_deductions_paise || 0,
      total_deductions_paise: row.total_deductions_paise || 0,
      total_net_payout_paise: row.total_net_payout_paise || 0,
      paid_count: row.paid_count || 0,
      unpaid_count: row.unpaid_count || 0,
    };
  }
}

export const hrService = new HRService();


