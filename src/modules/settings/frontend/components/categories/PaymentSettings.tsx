import React, { useState, useRef } from 'react';
import { CreditCard, Banknote, QrCode, Upload, CheckCircle2, AlertCircle, Sparkles, Smartphone, Plus } from 'lucide-react';
import jsQR from 'jsqr';
import { SettingCard } from '../ui/SettingCard';
import { SettingRow } from '../ui/SettingRow';
import { SwitchControl } from '../ui/SwitchControl';
import { SelectControl } from '../ui/SelectControl';
import { TextField } from '../ui/TextField';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { useCashBox } from '../../../../cashbox/frontend/hooks/useCashBox';

export const PaymentSettings: React.FC = () => {
  const { draftConfig, updateDraftConfig } = useSettingsDraftStore();
  const pay = draftConfig.payments;
  const tmpl = draftConfig.receiptTemplate;
  const enabled = pay?.enabledMethods || ['cash', 'upi', 'card', 'split'];

  const { paymentMethods: dbMethods, savePaymentMethod } = useCashBox();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');
  const [newMethodType, setNewMethodType] = useState('UPI');

  const [scanStatus, setScanStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleMethod = (method: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'credit' | 'split') => {
    let next: typeof enabled;
    if (enabled.includes(method)) {
      if (enabled.length <= 1) return; // Keep at least one
      next = enabled.filter((m) => m !== method);
    } else {
      next = [...enabled, method];
    }
    updateDraftConfig((prev) => ({
      ...prev,
      payments: { ...(prev.payments || {}), enabledMethods: next },
    }));
  };

  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanStatus(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setScanStatus({ type: 'error', message: 'Could not initialize image scanner context.' });
            setIsScanning(false);
            return;
          }
          ctx.drawImage(img, 0, 0, img.width, img.height);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code && code.data) {
            const rawData = code.data;
            let extractedUpiId = '';
            let extractedName = '';

            if (rawData.startsWith('upi://') || rawData.includes('pa=')) {
              try {
                const queryString = rawData.includes('?') ? rawData.split('?')[1] : rawData;
                const params = new URLSearchParams(queryString);
                extractedUpiId = params.get('pa') || '';
                extractedName = params.get('pn') || '';
              } catch {
                const paMatch = rawData.match(/pa=([^&]+)/);
                if (paMatch) extractedUpiId = decodeURIComponent(paMatch[1]);
                const pnMatch = rawData.match(/pn=([^&]+)/);
                if (pnMatch) extractedName = decodeURIComponent(pnMatch[1]);
              }
            } else if (rawData.includes('@')) {
              // Direct UPI ID string like username@bank
              extractedUpiId = rawData.trim();
            }

            if (extractedUpiId) {
              updateDraftConfig((prev) => ({
                ...prev,
                payments: {
                  ...(prev.payments || {}),
                  upiId: extractedUpiId,
                  upiPayeeName: extractedName || prev.payments?.upiPayeeName || '',
                },
                receiptTemplate: {
                  ...(prev.receiptTemplate || {}),
                  upiId: extractedUpiId,
                  upiPayeeName: extractedName || prev.receiptTemplate?.upiPayeeName || '',
                },
              }));

              setScanStatus({
                type: 'success',
                message: `Decoded UPI ID: ${extractedUpiId}${extractedName ? ` (${extractedName})` : ''}`,
              });
            } else {
              setScanStatus({
                type: 'error',
                message: `QR read successfully, but no standard UPI ID (pa=...) was found in data: "${rawData.slice(0, 60)}..."`,
              });
            }
          } else {
            setScanStatus({
              type: 'error',
              message: 'No readable QR code found in the uploaded image. Please ensure good lighting and clear QR edges.',
            });
          }
        } catch (err: any) {
          setScanStatus({ type: 'error', message: `Scanning failed: ${err?.message || 'Unknown error'}` });
        } finally {
          setIsScanning(false);
        }
      };

      img.onerror = () => {
        setScanStatus({ type: 'error', message: 'Failed to load image file.' });
        setIsScanning(false);
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
    // Reset file input so re-selecting same file triggers onChange
    e.target.value = '';
  };

  const currentUpiId = tmpl?.upiId || pay?.upiId || '';
  const currentPayeeName = tmpl?.upiPayeeName || pay?.upiPayeeName || '';
  const printUpiQrOnDelivery = tmpl?.printUpiQrOnDelivery ?? pay?.printUpiQrOnDelivery ?? true;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Dynamic Delivery UPI QR Code Card */}
      <SettingCard
        title="Delivery UPI Payment QR Code"
        description="Print dynamic UPI scanner with exact bill amount on bills marked for Delivery"
        icon={<QrCode size={16} className="text-brand-500" />}
      >
        <SettingRow
          label="Print Dynamic UPI QR on Delivery"
          description="Automatically print payment scanner on receipt when order is marked as Delivery"
        >
          <SwitchControl
            checked={printUpiQrOnDelivery}
            onChange={(checked) => {
              updateDraftConfig((prev) => ({
                ...prev,
                payments: { ...(prev.payments || {}), printUpiQrOnDelivery: checked },
                receiptTemplate: { ...(prev.receiptTemplate || {}), printUpiQrOnDelivery: checked },
              }));
            }}
          />
        </SettingRow>

        {/* Upload QR Standee */}
        <SettingRow
          label="Upload Standee / Counter QR"
          description="Upload a photo or image of your GPay, PhonePe, or Paytm QR standee to auto-detect details"
        >
          <div className="flex flex-col items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleQrImageUpload}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              disabled={isScanning}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Upload size={14} />
              <span>{isScanning ? 'Scanning QR...' : 'Upload QR Image'}</span>
            </button>
          </div>
        </SettingRow>

        {scanStatus && (
          <div
            className={`mx-4 my-2 p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              scanStatus.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {scanStatus.type === 'success' ? (
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle size={15} className="shrink-0 text-red-400" />
            )}
            <span>{scanStatus.message}</span>
          </div>
        )}

        <SettingRow
          label="UPI ID / VPA (Virtual Payment Address)"
          description="e.g. yourshop@okhdfcbank, 9876543210@paytm, or merchant@upi"
        >
          <TextField
            value={currentUpiId}
            onChange={(val) => {
              updateDraftConfig((prev) => ({
                ...prev,
                payments: { ...(prev.payments || {}), upiId: val.trim() },
                receiptTemplate: { ...(prev.receiptTemplate || {}), upiId: val.trim() },
              }));
            }}
            placeholder="e.g. shopname@upi"
            className="w-72"
          />
        </SettingRow>

        <SettingRow
          label="Merchant / Payee Name"
          description="Business name displayed inside Google Pay / PhonePe when customer scans"
        >
          <TextField
            value={currentPayeeName}
            onChange={(val) => {
              updateDraftConfig((prev) => ({
                ...prev,
                payments: { ...(prev.payments || {}), upiPayeeName: val },
                receiptTemplate: { ...(prev.receiptTemplate || {}), upiPayeeName: val },
              }));
            }}
            placeholder="e.g. Fresh Meat Shop"
            className="w-72"
          />
        </SettingRow>

        <div className="mx-4 p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-start gap-2.5 text-[11px] text-brand-300">
          <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-text-primary">Dynamic Amount Embedding Guarantee:</div>
            The POS never prints a static uploaded QR image. When a receipt is printed for delivery, the system automatically builds an NPCI UPI payment QR with your exact bill total pre-filled. Customers scan and pay directly without typing the amount!
          </div>
        </div>
      </SettingCard>

      {/* Tender Channels Card */}
      <SettingCard
        title="Accepted Payment Methods (General)"
        description="Enable or disable standard checkout payment rails"
        icon={<CreditCard size={16} />}
      >
        <SettingRow
          label="Cash Payment"
          description="Physical currency collection with change calculation"
        >
          <SwitchControl
            checked={enabled.includes('cash')}
            onChange={() => toggleMethod('cash')}
          />
        </SettingRow>

        <SettingRow
          label="UPI & QR Digital Payments"
          description="PhonePe, Google Pay, Paytm, and BHIM QR scan"
        >
          <SwitchControl
            checked={enabled.includes('upi')}
            onChange={() => toggleMethod('upi')}
          />
        </SettingRow>

        <SettingRow
          label="Debit & Credit Cards"
          description="POS card terminal swiping / chip insert"
        >
          <SwitchControl
            checked={enabled.includes('card')}
            onChange={() => toggleMethod('card')}
          />
        </SettingRow>

        <SettingRow
          label="Split Tender Checkout"
          description="Allow customers to pay across multiple modes (e.g. Part Cash + Part UPI)"
        >
          <SwitchControl
            checked={enabled.includes('split')}
            onChange={() => toggleMethod('split')}
          />
        </SettingRow>

        <SettingRow
          label="Customer Store Credit / Khata (A/R)"
          description="Allow approved wholesale/regular customers to buy on credit ledger"
        >
          <SwitchControl
            checked={enabled.includes('credit')}
            onChange={() => toggleMethod('credit')}
          />
        </SettingRow>
      </SettingCard>

      {/* Payment Methods Config Table (Unified Cash Box & Billing Rails) */}
      <SettingCard
        title="Payment Methods Manager (Database Config)"
        description="Add, rename, disable, and order payment methods used in Billing and Cash Box Shift Close"
        icon={<CreditCard size={16} className="text-emerald-500" />}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">
              These methods appear during shift handover in Cash Box and in tender selection.
            </span>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
            >
              <Plus size={13} />
              <span>Add Custom Method</span>
            </button>
          </div>

          <div className="border border-border-subtle rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-card border-b border-border-subtle text-text-muted uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Order</th>
                  <th className="py-2.5 px-3">Display Name</th>
                  <th className="py-2.5 px-3">Key</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface-panel/40">
                {(dbMethods || []).map((m: any) => (
                  <tr key={m.id || m.method_key} className="hover:bg-surface-hover/30">
                    <td className="py-2.5 px-3 font-mono text-[11px] font-bold">{m.sort_order ?? 1}</td>
                    <td className="py-2.5 px-3 font-bold text-text-primary">{m.display_name}</td>
                    <td className="py-2.5 px-3 font-mono text-text-muted text-[11px]">{m.method_key}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-card border border-border-subtle text-text-secondary uppercase">
                        {m.method_type || 'OTHER'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          await savePaymentMethod({
                            id: m.id,
                            method_key: m.method_key,
                            display_name: m.display_name,
                            is_enabled: m.is_enabled ? 0 : 1,
                          });
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                          m.is_enabled
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        {m.is_enabled ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {m.method_key !== 'cash' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const newName = window.prompt('Rename payment method:', m.display_name);
                            if (newName && newName.trim() && newName.trim() !== m.display_name) {
                              await savePaymentMethod({
                                id: m.id,
                                method_key: m.method_key,
                                display_name: newName.trim(),
                              });
                            }
                          }}
                          className="text-[11px] text-brand-500 hover:underline font-bold"
                        >
                          Rename
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-surface-panel border border-border-subtle rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-elevation">
              <h3 className="text-sm font-bold text-text-primary">Add Custom Payment Method</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase">Method Name</label>
                  <input
                    type="text"
                    value={newMethodName}
                    onChange={(e) => setNewMethodName(e.target.value)}
                    placeholder="e.g. Swiggy Dineout, Sodexo"
                    className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs font-semibold text-text-primary mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase">Method Type</label>
                  <select
                    value={newMethodType}
                    onChange={(e) => setNewMethodType(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs font-semibold text-text-primary mt-1"
                  >
                    <option value="UPI">UPI / Digital QR</option>
                    <option value="CARD">Debit / Credit Card</option>
                    <option value="CASH">Cash Float</option>
                    <option value="OTHER">Other / Voucher / Aggregator</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-border-subtle text-xs font-bold text-text-secondary hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newMethodName.trim()) return;
                    await savePaymentMethod({
                      display_name: newMethodName.trim(),
                      method_type: newMethodType,
                      is_enabled: 1,
                    });
                    setNewMethodName('');
                    setShowAddModal(false);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold"
                >
                  Save Method
                </button>
              </div>
            </div>
          </div>
        )}
      </SettingCard>

      {/* Default Checkout Payment Mode */}
      <SettingCard
        title="Checkout Defaults"
        description="Standard tender mode focused on opening checkout"
        icon={<Banknote size={16} />}
      >
        <SettingRow
          label="Default Payment Mode"
          description="Pre-selected payment method on invoice creation"
        >
          <SelectControl
            value={pay?.defaultPaymentMethod || 'cash'}
            options={[
              { value: 'cash', label: 'Cash Tender' },
              { value: 'upi', label: 'UPI / QR Scan' },
              { value: 'card', label: 'Card Payment' },
              { value: 'split', label: 'Split Tender' },
              { value: 'credit', label: 'Customer Credit (A/R)' },
            ]}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                payments: { ...(prev.payments || {}), defaultPaymentMethod: val as any },
                billingSettings: { ...(prev.billingSettings || {}), defaultPaymentMethod: val as any },
              }))
            }
            className="w-72"
          />
        </SettingRow>
      </SettingCard>
    </div>
  );
};

export default PaymentSettings;
