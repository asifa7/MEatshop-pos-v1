import { create } from 'zustand';

export interface QuickPurchaseItemInput {
  product_variant_id: string;
  quantity: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  unit_price: string;
  subtotal: number;
}

export interface QuickPurchaseDraft {
  supplierId: string;
  receivedDate: string;
  billNumber: string;
  supplierInvoiceNumber: string;
  billAmount: string;
  notes: string;
  billPhotoPath: string | null;
  paymentMethod: 'cash' | 'upi' | 'card' | 'credit' | 'partial';
  paidAmount: string;
  expectedPaymentDate: string;
  discount: string;
  tax: string;
  freight: string;
  otherCharges: string;
  editingInvoiceId: number | null;
  items: QuickPurchaseItemInput[];
}

interface QuickPurchaseStore {
  draft: QuickPurchaseDraft;
  setDraftField: <K extends keyof QuickPurchaseDraft>(field: K, value: QuickPurchaseDraft[K]) => void;
  setItems: (itemsOrFn: QuickPurchaseItemInput[] | ((prev: QuickPurchaseItemInput[]) => QuickPurchaseItemInput[])) => void;
  resetDraft: () => void;
  hasUnsavedDraft: () => boolean;
  startEditInvoice: (invoice: any, items: any[]) => void;
}

const initialDraft = (): QuickPurchaseDraft => ({
  supplierId: '',
  receivedDate: new Date().toISOString().split('T')[0],
  billNumber: '',
  supplierInvoiceNumber: '',
  billAmount: '',
  notes: '',
  billPhotoPath: null,
  paymentMethod: 'credit',
  paidAmount: '',
  expectedPaymentDate: '',
  discount: '',
  tax: '',
  freight: '',
  otherCharges: '',
  editingInvoiceId: null,
  items: [],
});

export const useQuickPurchaseStore = create<QuickPurchaseStore>((set, get) => ({
  draft: initialDraft(),
  setDraftField: (field, value) => set((state) => ({
    draft: {
      ...state.draft,
      [field]: value,
    },
  })),
  setItems: (itemsOrFn) => set((state) => ({
    draft: {
      ...state.draft,
      items: typeof itemsOrFn === 'function' ? itemsOrFn(state.draft.items) : itemsOrFn,
    },
  })),
  resetDraft: () => set({ draft: initialDraft() }),
  hasUnsavedDraft: () => {
    const d = get().draft;
    return !!(
      !d.editingInvoiceId && (
        d.supplierId ||
        d.billNumber ||
        d.supplierInvoiceNumber ||
        d.billAmount ||
        d.notes ||
        d.billPhotoPath ||
        d.paidAmount ||
        d.discount ||
        d.tax ||
        d.freight ||
        d.otherCharges ||
        d.items.length > 0
      )
    );
  },
  startEditInvoice: (invoice, items) => set(() => ({
    draft: {
      supplierId: String(invoice.supplier_id),
      receivedDate: invoice.invoice_date,
      billNumber: invoice.purchase_ref_number || '',
      supplierInvoiceNumber: invoice.supplier_invoice_number || '',
      billAmount: String(invoice.total_amount_paise / 100),
      notes: invoice.notes || '',
      billPhotoPath: invoice.file_path || null,
      paymentMethod: invoice.outstanding_amount_paise === 0 ? 'cash' : (invoice.paid_amount_paise > 0 ? 'partial' : 'credit'),
      paidAmount: invoice.paid_amount_paise ? String(invoice.paid_amount_paise / 100) : '',
      expectedPaymentDate: invoice.expected_payment_date || '',
      discount: invoice.discount_paise ? String(invoice.discount_paise / 100) : '',
      tax: invoice.gst_paise ? String(invoice.gst_paise / 100) : '',
      freight: invoice.freight_charges_paise ? String(invoice.freight_charges_paise / 100) : '',
      otherCharges: invoice.other_charges_paise ? String(invoice.other_charges_paise / 100) : '',
      editingInvoiceId: invoice.id,
      items: items.map(item => ({
        product_variant_id: String(item.product_variant_id),
        quantity: String(item.quantity),
        unit_type: item.unit_type || 'piece',
        unit_price: String(item.unit_price_paise / 100),
        subtotal: item.total_amount_paise,
      })),
    }
  })),
}));
