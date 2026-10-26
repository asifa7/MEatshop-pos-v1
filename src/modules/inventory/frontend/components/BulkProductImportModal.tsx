import React from 'react';
import BulkProductSheetModal from '../../../products/frontend/components/BulkProductSheetModal';

export interface BulkProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Unified Bulk Add / Import Products modal used across Inventory and Products modules.
 * Opens EMPTY with spreadsheet columns: Name, Category, Unit (kg/g/pcs/tray/pack),
 * Buying Rate (₹), Selling Rate (₹), Code (auto-suggested), Inventory Tracking (on/off),
 * plus + Add Row, Paste from Excel, Import CSV, Download CSV Template, and row-level validation.
 */
export default function BulkProductImportModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkProductImportModalProps) {
  return (
    <BulkProductSheetModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
