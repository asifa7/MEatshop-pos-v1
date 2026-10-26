import { invoiceSequenceRepository } from '../repository/invoice_sequence_repository';
import { db } from '../../../../core/backend/db';

const CONTINUOUS_KEY = 'CONTINUOUS';

function getCurrentDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function ensureContinuousSequenceSeeded(): number {
  const current = invoiceSequenceRepository.getCurrent(CONTINUOUS_KEY);
  const maxCompletedRow = db.prepare(`
    SELECT MAX(
      CASE
        WHEN invoice_number GLOB '[0-9]*' THEN CAST(SUBSTR(invoice_number, 1, CASE WHEN INSTR(invoice_number, '_') > 0 THEN INSTR(invoice_number, '_') - 1 ELSE LENGTH(invoice_number) END) AS INTEGER)
        ELSE 0
      END
    ) as max_seq,
    MAX(CASE WHEN status = 'completed' THEN id ELSE 0 END) as max_completed_id
    FROM invoices
  `).get() as { max_seq: number | null; max_completed_id: number | null } | undefined;

  const baseline = Math.max(current, maxCompletedRow?.max_seq ?? 0, maxCompletedRow?.max_completed_id ?? 0);
  if (baseline > current) {
    db.prepare(`
      INSERT INTO invoice_sequences (financial_year, last_number)
      VALUES (?, ?)
      ON CONFLICT(financial_year) DO UPDATE SET last_number = MAX(last_number, excluded.last_number)
    `).run(CONTINUOUS_KEY, baseline);
  }
  return baseline;
}

function formatInvoiceNumber(_dateKey: string, sequenceNumber: number): string {
  return String(sequenceNumber);
}

const invoiceNumberingService = {
  /**
   * Generates and increments the single continuous bill sequence number.
   * Only called when a bill is completed (drafts and held bills do not consume
   * permanent numbers until completed, avoiding sequence gaps).
   */
  generateNextNumber(): { invoiceNumber: string; financialYear: string } {
    ensureContinuousSequenceSeeded();
    const dateKey = getCurrentDateKey();
    const sequenceNumber = invoiceSequenceRepository.getAndIncrement(CONTINUOUS_KEY);
    const invoiceNumber = formatInvoiceNumber(dateKey, sequenceNumber);
    return { invoiceNumber, financialYear: dateKey };
  },

  /**
   * Peeks the next continuous bill number without incrementing the counter.
   * Used by draft/held bills in the UI so the cashier sees the next continuous bill number
   * rather than an internal SQLite row ID.
   */
  peekNextNumber(): number {
    const current = ensureContinuousSequenceSeeded();
    return current + 1;
  },

  getCurrentFinancialYear: getCurrentDateKey,
  formatInvoiceNumber,
};

export { invoiceNumberingService };
