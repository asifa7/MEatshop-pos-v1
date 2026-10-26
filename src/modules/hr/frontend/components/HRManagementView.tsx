import { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Clock, 
  Calendar, 
  CreditCard, 
  Receipt, 
  Gift, 
  Hourglass, 
  MinusCircle, 
  BookOpen, 
  Calculator,
  BarChart3,
  ChevronDown,
  CheckCircle2,
  Plus,
  Wallet,
  FileText,
  X,
  Check,
  UserPlus,
  Printer
} from 'lucide-react';
import EmployeeMasterView from './EmployeeMasterView';
import DailyAttendanceGrid from './DailyAttendanceGrid';
import LeaveManagementView from './LeaveManagementView';
import AdvancesView from './AdvancesView';
import EmployeeExpensesView from './EmployeeExpensesView';
import IncentivesView from './IncentivesView';
import OvertimeView from './OvertimeView';
import DeductionsView from './DeductionsView';
import MonthlyPayrollView from './MonthlyPayrollView';
import EmployeeLedgerView from './EmployeeLedgerView';
import HRReportsView from './HRReportsView';
import { ErrorBoundary } from '../../../../core/shared/ErrorBoundary';
import { formatMoney, roundMoney, rupeesToPaise, paiseToRupees } from '../../../../core/shared/math';
import type { Employee, MonthAttendanceGridData, EmployeeAdvance, PayrollItem, AttendanceStatus } from '../../shared/hr.types';

export type HRTab = 
  | 'staff_today'
  | 'employees' 
  | 'attendance' 
  | 'leaves' 
  | 'advances' 
  | 'expenses' 
  | 'incentives' 
  | 'overtime' 
  | 'deductions' 
  | 'payroll'
  | 'ledger'
  | 'reports';

export default function HRManagementView() {
  const [activeTab, setActiveTab] = useState<HRTab>('staff_today');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthYear = todayStr.slice(0, 7);

  // ─── Staff & Today's Attendance State ─────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [monthGrid, setMonthGrid] = useState<MonthAttendanceGridData | null>(null);
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [markingEmpId, setMarkingEmpId] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ─── Quick Give Advance Modal State ───────────────────────────
  const [advModalEmp, setAdvModalEmp] = useState<Employee | null>(null);
  const [advAmountRupees, setAdvAmountRupees] = useState('');
  const [advMode, setAdvMode] = useState<'cash' | 'upi' | 'bank'>('cash');
  const [advReason, setAdvReason] = useState('');
  const [isSavingAdv, setIsSavingAdv] = useState(false);

  // ─── Quick Monthly Payslip / Pay Salary Modal State ───────────
  const [payslipEmp, setPayslipEmp] = useState<Employee | null>(null);
  const [payslipMonth, setPayslipMonth] = useState(currentMonthYear);
  const [payslipItem, setPayslipItem] = useState<PayrollItem | null>(null);
  const [isLoadingPayslip, setIsLoadingPayslip] = useState(false);
  const [paySalaryMode, setPaySalaryMode] = useState<'cash' | 'upi' | 'bank'>('cash');
  const [paySalaryRef, setPaySalaryRef] = useState('');
  const [isPayingSalary, setIsPayingSalary] = useState(false);

  // ─── Quick Add Staff Modal State ──────────────────────────────
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffMobile, setNewStaffMobile] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Cashier');
  const [newStaffSalaryRupees, setNewStaffSalaryRupees] = useState('18000');
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadStaffOverview = useCallback(async () => {
    setIsLoadingStaff(true);
    try {
      const [empRes, attRes, advRes] = await Promise.all([
        window.api.invoke('hr:get-employees', { status: 'Active' }),
        window.api.invoke('hr:get-month-attendance', { monthYear: currentMonthYear }),
        window.api.invoke('hr:get-advances', {}),
      ]);
      if (empRes?.success && Array.isArray(empRes.data)) {
        setEmployees(empRes.data);
      }
      if (attRes?.success && attRes.data) {
        setMonthGrid(attRes.data);
      }
      if (advRes?.success && Array.isArray(advRes.data)) {
        setAdvances(advRes.data);
      }
    } catch (e) {
      console.error('Failed to load staff overview:', e);
    } finally {
      setIsLoadingStaff(false);
    }
  }, [currentMonthYear]);

  useEffect(() => {
    if (activeTab === 'staff_today') {
      loadStaffOverview();
    }
  }, [activeTab, loadStaffOverview]);

  const handleMarkTodayAttendance = async (employeeId: number, status: AttendanceStatus) => {
    setMarkingEmpId(employeeId);
    try {
      const res = await window.api.invoke('hr:mark-attendance', {
        employee_id: employeeId,
        date: todayStr,
        status,
      });
      if (res?.success) {
        await loadStaffOverview();
        showToast(`Marked ${status.replace('_', ' ')} for today`);
      } else {
        alert(res?.error?.message || res?.error || 'Failed to mark attendance');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to mark attendance');
    } finally {
      setMarkingEmpId(null);
    }
  };

  const handleMarkAllPresentToday = async () => {
    try {
      const res = await window.api.invoke('hr:mark-bulk-present-today', { date: todayStr });
      if (res?.success) {
        await loadStaffOverview();
        showToast('Marked all active staff Present for today');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to mark all present');
    }
  };

  const handleConfirmGiveAdvance = async () => {
    if (!advModalEmp) return;
    const amountPaise = rupeesToPaise(roundMoney(parseFloat(advAmountRupees || '0')));
    if (amountPaise <= 0) return;

    setIsSavingAdv(true);
    try {
      const res = await window.api.invoke('hr:create-advance', {
        employee_id: advModalEmp.id,
        amount_paise: amountPaise,
        advance_date: todayStr,
        payment_mode: advMode,
        reason: advReason.trim() || 'Staff Salary Advance',
      });
      if (res?.success) {
        showToast(`Advance of ₹${formatMoney(paiseToRupees(amountPaise))} given to ${advModalEmp.full_name}`);
        setAdvModalEmp(null);
        setAdvAmountRupees('');
        setAdvReason('');
        await loadStaffOverview();
      } else {
        alert(res?.error?.message || res?.error || 'Failed to record advance');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to record advance');
    } finally {
      setIsSavingAdv(false);
    }
  };

  const openPayslipModal = async (emp: Employee, targetMonth = currentMonthYear) => {
    setPayslipEmp(emp);
    setPayslipMonth(targetMonth);
    setPayslipItem(null);
    setIsLoadingPayslip(true);
    try {
      await window.api.invoke('hr:payroll-generate', {
        periodInput: {
          periodType: 'monthly',
          monthYear: targetMonth,
          employeeId: emp.id,
        },
        forceRecalculate: false,
      });
      const itemsRes = await window.api.invoke('hr:payroll-get-items', {
        monthYear: targetMonth,
        filters: { employeeId: emp.id },
      });
      if (itemsRes?.success && Array.isArray(itemsRes.data) && itemsRes.data.length > 0) {
        setPayslipItem(itemsRes.data[0]);
      }
    } catch (e) {
      console.error('Failed to generate/load payslip:', e);
    } finally {
      setIsLoadingPayslip(false);
    }
  };

  const handlePayStaffSalary = async () => {
    if (!payslipItem || !payslipEmp) return;
    setIsPayingSalary(true);
    try {
      const res = await window.api.invoke('hr:payroll-pay-item', {
        itemId: payslipItem.id,
        paymentMethod: paySalaryMode,
        paymentDate: todayStr,
        paymentReference: paySalaryRef.trim() || undefined,
      });
      if (res?.success && res.data) {
        setPayslipItem(res.data);
        showToast(`Paid ₹${formatMoney(paiseToRupees(res.data.net_salary_paise))} salary to ${payslipEmp.full_name}`);
        await loadStaffOverview();
      } else {
        alert(res?.error?.message || res?.error || 'Failed to pay salary');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to pay salary');
    } finally {
      setIsPayingSalary(false);
    }
  };

  const handleQuickCreateStaff = async () => {
    if (!newStaffName.trim() || !newStaffMobile.trim()) return;
    setIsCreatingStaff(true);
    try {
      const basicPaise = rupeesToPaise(roundMoney(parseFloat(newStaffSalaryRupees || '0')));
      const res = await window.api.invoke('hr:create-employee', {
        full_name: newStaffName.trim(),
        mobile: newStaffMobile.trim(),
        role: newStaffRole,
        designation: newStaffRole,
        basic_salary_paise: basicPaise,
        salary_type: 'Monthly',
      });
      if (res?.success) {
        showToast(`Added staff member ${newStaffName.trim()}`);
        setAddStaffOpen(false);
        setNewStaffName('');
        setNewStaffMobile('');
        await loadStaffOverview();
      } else {
        alert(res?.error?.message || res?.error || 'Failed to create staff');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to create staff');
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const moreTabs: { key: HRTab; label: string; icon: any }[] = [
    { key: 'employees', label: 'Employee Master', icon: Users },
    { key: 'attendance', label: 'Full Attendance Grid', icon: Clock },
    { key: 'advances', label: 'Advances Register', icon: CreditCard },
    { key: 'leaves', label: 'Leave Requests', icon: Calendar },
    { key: 'expenses', label: 'Staff Expenses', icon: Receipt },
    { key: 'incentives', label: 'Incentives & Bonus', icon: Gift },
    { key: 'overtime', label: 'Overtime Log', icon: Hourglass },
    { key: 'deductions', label: 'Deductions', icon: MinusCircle },
    { key: 'ledger', label: 'Employee Ledger', icon: BookOpen },
    { key: 'reports', label: 'HR Reports & Audit', icon: BarChart3 },
  ];

  const activeMoreTab = moreTabs.find((t) => t.key === activeTab);

  return (
    <ErrorBoundary fallbackTitle="Error loading HR Management">
      <div className="flex flex-col h-full bg-surface-app text-text-primary p-4 space-y-3 overflow-hidden">
        {/* Navigation Header */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-2.5 gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-500">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-base font-black text-text-primary flex items-center gap-2">
                <span>Staff, Attendance & Payroll</span>
                {toastMsg && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                    <Check size={12} />
                    {toastMsg}
                  </span>
                )}
              </h1>
              <p className="text-xs text-text-muted mt-0.5">
                1-Tap Daily Attendance, Instant Salary Advances, Monthly Payslips & Cash Box Sync.
              </p>
            </div>
          </div>

          {/* Streamlined Sub-Tabs Switcher Bar */}
          <div className="flex items-center gap-1.5 bg-surface-panel p-1 rounded-2xl border border-border-subtle relative">
            <button
              type="button"
              onClick={() => {
                setActiveTab('staff_today');
                setMoreMenuOpen(false);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'staff_today'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-card'
              }`}
            >
              <CheckCircle2 size={14} />
              <span>Staff & Today's Attendance</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('payroll');
                setMoreMenuOpen(false);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'payroll'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-card'
              }`}
            >
              <Calculator size={14} />
              <span>Payroll / Payslips</span>
            </button>

            {/* "More ▾" Dropdown for the remaining 10 tabs */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeMoreTab
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-card'
                }`}
              >
                <span>{activeMoreTab ? activeMoreTab.label : 'More'}</span>
                <ChevronDown size={13} />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-surface-card border border-border-subtle shadow-2xl py-1.5 z-50">
                  {moreTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isSelected = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => {
                          setActiveTab(tab.key);
                          setMoreMenuOpen(false);
                        }}
                        className={`w-full px-3.5 py-2 text-left text-xs font-bold flex items-center gap-2.5 transition-colors ${
                          isSelected
                            ? 'bg-brand-500/15 text-brand-500'
                            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                        }`}
                      >
                        <Icon size={14} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab View Container */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'staff_today' && (
            <div className="h-full overflow-y-auto space-y-4 pr-1">
              {/* Top Action Strip */}
              <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                      Today's Attendance Date
                    </span>
                    <span className="text-sm font-black font-mono text-text-primary">{todayStr}</span>
                  </div>
                  <div className="h-8 w-px bg-border-subtle" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                      Active Staff
                    </span>
                    <span className="text-sm font-black font-mono text-brand-500">{employees.length} Staff</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMarkAllPresentToday}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <CheckCircle2 size={14} />
                    <span>Mark All Present Today</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddStaffOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <UserPlus size={14} />
                    <span>+ Add Staff</span>
                  </button>
                </div>
              </div>

              {/* Staff Cards Grid */}
              {isLoadingStaff && employees.length === 0 ? (
                <div className="p-12 text-center text-text-muted text-xs font-bold">
                  Loading staff & today's attendance...
                </div>
              ) : employees.length === 0 ? (
                <div className="bg-surface-card border border-border-subtle rounded-2xl p-12 text-center space-y-3">
                  <Users size={36} className="mx-auto text-text-muted opacity-40" />
                  <p className="text-sm font-bold text-text-primary">No active staff members found</p>
                  <button
                    type="button"
                    onClick={() => setAddStaffOpen(true)}
                    className="px-4 py-2 rounded-xl bg-brand-500 text-white font-bold text-xs inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    <span>Add First Staff Member</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {employees.map((emp) => {
                    const empGridRow = monthGrid?.employees.find((e) => e.id === emp.id);
                    const todayRec = empGridRow?.attendance?.[todayStr];
                    const todayStatus = todayRec?.status || null;

                    const empAdvances = advances.filter(
                      (a) => a.employee_id === emp.id && (a.remaining_amount_paise || 0) > 0
                    );
                    const advanceBalancePaise = empAdvances.reduce(
                      (sum, a) => sum + (a.remaining_amount_paise || 0),
                      0
                    );
                    const basicSalaryPaise =
                      emp.salary_structure?.basic_salary_paise ?? emp.basic_salary_paise ?? 0;

                    return (
                      <div
                        key={emp.id}
                        className="bg-surface-card border border-border-subtle rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-sm hover:border-brand-500/40 transition-all"
                      >
                        {/* Top Profile Row */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-black text-text-primary">{emp.full_name}</h3>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/10 text-brand-500 border border-brand-500/20">
                                {emp.role || emp.designation || 'Staff'}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-text-muted mt-0.5">
                              {emp.emp_code} • {emp.mobile}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-text-muted font-bold uppercase block">
                              Monthly Basic
                            </span>
                            <span className="text-sm font-mono font-extrabold text-text-primary">
                              ₹{formatMoney(paiseToRupees(basicSalaryPaise))}
                            </span>
                          </div>
                        </div>

                        {/* Current Month Summary & Advance Pill */}
                        <div className="grid grid-cols-4 gap-2 bg-surface-panel rounded-xl p-2.5 border border-border-subtle text-center">
                          <div>
                            <span className="text-[10px] text-text-muted font-bold block">Present</span>
                            <span className="font-mono font-extrabold text-xs text-emerald-500">
                              {empGridRow?.present_count ?? 0}d
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-text-muted font-bold block">Half Day</span>
                            <span className="font-mono font-extrabold text-xs text-amber-500">
                              {empGridRow?.half_day_count ?? 0}d
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-text-muted font-bold block">Absent</span>
                            <span className="font-mono font-extrabold text-xs text-red-500">
                              {empGridRow?.absent_count ?? 0}d
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-text-muted font-bold block">Advance Due</span>
                            <span
                              className={`font-mono font-extrabold text-xs ${
                                advanceBalancePaise > 0 ? 'text-amber-500' : 'text-text-secondary'
                              }`}
                            >
                              ₹{formatMoney(paiseToRupees(advanceBalancePaise))}
                            </span>
                          </div>
                        </div>

                        {/* 1. Today's Attendance 1-Tap Toggle */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                              Today's Attendance ({todayStr})
                            </span>
                            {todayStatus && (
                              <span className="text-[10px] font-bold text-brand-500">
                                Marked: {todayStatus.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={markingEmpId === emp.id}
                              onClick={() => handleMarkTodayAttendance(emp.id, 'Present')}
                              className={`py-2 px-2.5 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1 ${
                                todayStatus === 'Present'
                                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                  : 'bg-surface-panel text-text-secondary border-border-subtle hover:border-emerald-500/50 hover:text-emerald-400'
                              }`}
                            >
                              <Check size={13} />
                              <span>Present</span>
                            </button>

                            <button
                              type="button"
                              disabled={markingEmpId === emp.id}
                              onClick={() => handleMarkTodayAttendance(emp.id, 'Half_Day')}
                              className={`py-2 px-2.5 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1 ${
                                todayStatus === 'Half_Day'
                                  ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                                  : 'bg-surface-panel text-text-secondary border-border-subtle hover:border-amber-500/50 hover:text-amber-400'
                              }`}
                            >
                              <Clock size={13} />
                              <span>Half Day</span>
                            </button>

                            <button
                              type="button"
                              disabled={markingEmpId === emp.id}
                              onClick={() => handleMarkTodayAttendance(emp.id, 'Absent')}
                              className={`py-2 px-2.5 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1 ${
                                todayStatus === 'Absent'
                                  ? 'bg-red-600 text-white border-red-500 shadow-sm'
                                  : 'bg-surface-panel text-text-secondary border-border-subtle hover:border-red-500/50 hover:text-red-400'
                              }`}
                            >
                              <X size={13} />
                              <span>Absent</span>
                            </button>
                          </div>
                        </div>

                        {/* 2. + Give Advance & 3. Monthly Payslip / Pay Salary Buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border-subtle">
                          <button
                            type="button"
                            onClick={() => {
                              setAdvModalEmp(emp);
                              setAdvAmountRupees('');
                              setAdvMode('cash');
                              setAdvReason('');
                            }}
                            className="py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Wallet size={13} />
                            <span>+ Give Advance</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openPayslipModal(emp, currentMonthYear)}
                            className="py-2 px-3 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-brand-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <FileText size={13} />
                            <span>Payslip / Pay Salary</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'payroll' && <MonthlyPayrollView />}
          {activeTab === 'employees' && <EmployeeMasterView onNavigateTab={(t) => setActiveTab(t as HRTab)} />}
          {activeTab === 'attendance' && <DailyAttendanceGrid />}
          {activeTab === 'leaves' && <LeaveManagementView />}
          {activeTab === 'advances' && <AdvancesView />}
          {activeTab === 'expenses' && <EmployeeExpensesView />}
          {activeTab === 'incentives' && <IncentivesView />}
          {activeTab === 'overtime' && <OvertimeView />}
          {activeTab === 'deductions' && <DeductionsView />}
          {activeTab === 'ledger' && <EmployeeLedgerView />}
          {activeTab === 'reports' && <HRReportsView />}
        </div>

        {/* ─── MODAL 1: QUICK GIVE ADVANCE ─────────────────────────────── */}
        {advModalEmp && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border-subtle bg-surface-panel flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={18} className="text-amber-500" />
                  <h3 className="text-sm font-black text-text-primary">
                    Give Salary Advance — {advModalEmp.full_name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAdvModalEmp(null)}
                  className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1">
                    Advance Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={advAmountRupees}
                    onChange={(e) => setAdvAmountRupees(e.target.value)}
                    placeholder="e.g. 2000"
                    className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-text-primary focus:outline-none focus:border-brand-500"
                  />
                  <div className="flex gap-1.5 mt-2">
                    {[500, 1000, 2000, 5000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAdvAmountRupees(String(preset))}
                        className="px-2.5 py-1 rounded-lg bg-surface-panel hover:bg-surface-hover border border-border-subtle font-mono font-bold text-[11px] text-text-secondary"
                      >
                        ₹{preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1.5">
                    Payment Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'cash', label: 'Cash (Drawer)' },
                      { id: 'upi', label: 'UPI' },
                      { id: 'bank', label: 'Bank' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAdvMode(m.id as any)}
                        className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                          advMode === m.id
                            ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                            : 'bg-surface-panel text-text-secondary border-border-subtle'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1">
                    Reason / Note *
                  </label>
                  <input
                    type="text"
                    value={advReason}
                    onChange={(e) => setAdvReason(e.target.value)}
                    placeholder="e.g. Personal / Medical / Mid-month advance"
                    className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAdvModalEmp(null)}
                    className="px-4 py-2 rounded-xl bg-surface-panel border border-border-subtle text-text-secondary font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingAdv || !(parseFloat(advAmountRupees || '0') > 0)}
                    onClick={handleConfirmGiveAdvance}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
                  >
                    <Check size={14} />
                    <span>{isSavingAdv ? 'Saving...' : 'Confirm Advance'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL 2: MONTHLY PAYSLIP & PAY SALARY ───────────────────── */}
        {payslipEmp && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border-subtle bg-surface-panel flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-brand-500" />
                  <div>
                    <h3 className="text-sm font-black text-text-primary">
                      Monthly Payslip & Salary Payout
                    </h3>
                    <p className="text-[11px] text-text-muted">
                      {payslipEmp.full_name} ({payslipEmp.emp_code})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="month"
                    value={payslipMonth}
                    onChange={(e) => openPayslipModal(payslipEmp, e.target.value)}
                    className="bg-surface-card border border-border-subtle rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-text-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setPayslipEmp(null)}
                    className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4 text-xs">
                {isLoadingPayslip ? (
                  <div className="py-10 text-center text-text-muted font-bold">
                    Calculating monthly payslip...
                  </div>
                ) : !payslipItem ? (
                  <div className="py-8 text-center text-text-muted">
                    Could not load payslip for {payslipMonth}.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 bg-surface-panel p-3 rounded-xl border border-border-subtle text-center">
                      <div>
                        <span className="text-[10px] text-text-muted font-bold uppercase block">Worked Days</span>
                        <span className="font-mono font-extrabold text-sm text-text-primary">
                          {payslipItem.worked_days} / {payslipItem.total_days_in_month}d
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-muted font-bold uppercase block">Gross Salary</span>
                        <span className="font-mono font-extrabold text-sm text-emerald-500">
                          ₹{formatMoney(paiseToRupees(payslipItem.gross_salary_paise))}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-muted font-bold uppercase block">Deductions</span>
                        <span className="font-mono font-extrabold text-sm text-red-400">
                          -₹{formatMoney(paiseToRupees(payslipItem.total_deductions_paise))}
                        </span>
                      </div>
                    </div>

                    <div className="bg-surface-panel rounded-xl p-3.5 border border-border-subtle space-y-2">
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Basic Earned</span>
                        <span className="font-mono font-bold">
                          ₹{formatMoney(paiseToRupees(payslipItem.basic_salary_paise))}
                        </span>
                      </div>
                      {payslipItem.fixed_allowances_paise > 0 && (
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Allowances</span>
                          <span className="font-mono font-bold text-emerald-400">
                            +₹{formatMoney(paiseToRupees(payslipItem.fixed_allowances_paise))}
                          </span>
                        </div>
                      )}
                      {payslipItem.overtime_amount_paise > 0 && (
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Overtime ({payslipItem.overtime_hours}h)</span>
                          <span className="font-mono font-bold text-emerald-400">
                            +₹{formatMoney(paiseToRupees(payslipItem.overtime_amount_paise))}
                          </span>
                        </div>
                      )}
                      {payslipItem.incentive_amount_paise > 0 && (
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Incentives / Bonus</span>
                          <span className="font-mono font-bold text-emerald-400">
                            +₹{formatMoney(paiseToRupees(payslipItem.incentive_amount_paise))}
                          </span>
                        </div>
                      )}
                      {payslipItem.advance_recovery_paise > 0 && (
                        <div className="flex justify-between">
                          <span className="text-amber-400">Advance Recovery</span>
                          <span className="font-mono font-bold text-amber-400">
                            -₹{formatMoney(paiseToRupees(payslipItem.advance_recovery_paise))}
                          </span>
                        </div>
                      )}
                      {payslipItem.unpaid_leave_deduction_paise > 0 && (
                        <div className="flex justify-between">
                          <span className="text-red-400">Unpaid Leave Deduction</span>
                          <span className="font-mono font-bold text-red-400">
                            -₹{formatMoney(paiseToRupees(payslipItem.unpaid_leave_deduction_paise))}
                          </span>
                        </div>
                      )}
                      <div className="border-t border-border-subtle pt-2 flex justify-between items-center">
                        <span className="font-black text-text-primary uppercase">Net Payable Salary</span>
                        <span className="text-lg font-mono font-black text-brand-500">
                          ₹{formatMoney(paiseToRupees(payslipItem.net_salary_paise))}
                        </span>
                      </div>
                    </div>

                    {payslipItem.status === 'Paid' ? (
                      <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between">
                        <div>
                          <span className="font-black text-emerald-400 block">
                            ✓ Salary Paid ({payslipItem.payment_method?.toUpperCase()})
                          </span>
                          <span className="text-[11px] font-mono text-text-secondary">
                            Date: {payslipItem.payment_date} • Ref: {payslipItem.payment_reference}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="px-3 py-1.5 rounded-lg bg-surface-card border border-border-subtle font-bold text-xs flex items-center gap-1.5"
                        >
                          <Printer size={13} />
                          <span>Print Slip</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-bold text-text-primary mb-1.5">
                            Payout Mode
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { id: 'cash', label: 'Cash (Drawer)' },
                              { id: 'upi', label: 'UPI' },
                              { id: 'bank', label: 'Bank Transfer' },
                            ].map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setPaySalaryMode(m.id as any)}
                                className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                                  paySalaryMode === m.id
                                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                    : 'bg-surface-panel text-text-secondary border-border-subtle'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {paySalaryMode !== 'cash' && (
                          <div>
                            <label className="block text-[11px] font-bold text-text-primary mb-1">
                              Payment Reference / UTR #
                            </label>
                            <input
                              type="text"
                              value={paySalaryRef}
                              onChange={(e) => setPaySalaryRef(e.target.value)}
                              placeholder="Optional UTR / transaction ID"
                              className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono text-text-primary"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => window.print()}
                            className="px-3.5 py-2 rounded-xl bg-surface-panel border border-border-subtle text-text-secondary font-bold text-xs flex items-center gap-1.5"
                          >
                            <Printer size={13} />
                            <span>Print Slip</span>
                          </button>
                          <button
                            type="button"
                            disabled={isPayingSalary}
                            onClick={handlePayStaffSalary}
                            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
                          >
                            <Check size={14} />
                            <span>
                              {isPayingSalary
                                ? 'Recording Payout...'
                                : `Pay ₹${formatMoney(paiseToRupees(payslipItem.net_salary_paise))} Now`}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL 3: QUICK ADD STAFF ────────────────────────────────── */}
        {addStaffOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border-subtle bg-surface-panel flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus size={18} className="text-brand-500" />
                  <h3 className="text-sm font-black text-text-primary">Quick Add Staff Member</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAddStaffOpen(false)}
                  className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs font-bold text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    value={newStaffMobile}
                    onChange={(e) => setNewStaffMobile(e.target.value)}
                    placeholder="10-digit mobile"
                    className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-bold text-text-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-text-primary mb-1">Role</label>
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value)}
                      className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs font-bold text-text-primary"
                    >
                      <option value="Cashier">Cashier</option>
                      <option value="Butcher">Butcher / Cutter</option>
                      <option value="Helper">Shop Helper</option>
                      <option value="Delivery">Delivery Boy</option>
                      <option value="Manager">Manager</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-primary mb-1">Monthly Salary (₹)</label>
                    <input
                      type="number"
                      value={newStaffSalaryRupees}
                      onChange={(e) => setNewStaffSalaryRupees(e.target.value)}
                      className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-bold text-text-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddStaffOpen(false)}
                    className="px-4 py-2 rounded-xl bg-surface-panel border border-border-subtle text-text-secondary font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingStaff || !newStaffName.trim() || !newStaffMobile.trim()}
                    onClick={handleQuickCreateStaff}
                    className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-black text-xs disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>{isCreatingStaff ? 'Adding...' : 'Save Staff'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
