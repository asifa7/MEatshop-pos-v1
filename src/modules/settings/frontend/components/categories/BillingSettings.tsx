import React from 'react';
import { Receipt, Printer, Zap, FileText, Lock } from 'lucide-react';
import { SettingCard } from '../ui/SettingCard';
import { SettingRow } from '../ui/SettingRow';
import { TextField } from '../ui/TextField';
import { TextAreaField } from '../ui/TextAreaField';
import { SwitchControl } from '../ui/SwitchControl';
import { SegmentedControl } from '../ui/SegmentedControl';
import { NumberStepper } from '../ui/NumberStepper';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';

export const BillingSettings: React.FC = () => {
  const { draftConfig, updateDraftConfig } = useSettingsDraftStore();
  const inv = draftConfig.invoice;
  const tmpl = draftConfig.receiptTemplate;
  const bill = draftConfig.billingSettings;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Bill Edit & Delete Authorization Password */}
      <SettingCard
        title="Bill Modification & Deletion Security"
        description="Password required when cashiers attempt to edit or delete completed bills"
        icon={<Lock size={16} />}
      >
        <SettingRow
          label="Edit / Delete Bill Password"
          description="Enter a manager/admin password required to reopen or delete bills (default: admin123)"
        >
          <TextField
            type="password"
            value={inv?.editDeletePassword || ''}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                invoice: { ...(prev.invoice || {}), editDeletePassword: val },
              }))
            }
            placeholder="admin123"
            className="w-56 font-mono"
          />
        </SettingRow>
      </SettingCard>

      {/* Invoice Sequence & Numbering */}
      <SettingCard
        title="Invoice Sequence & Prefixes"
        description="Automatic numbering rules and bill series generation"
        icon={<Receipt size={16} />}
      >
        <SettingRow
          label="Numbering Mode"
          description="Continuous numbering or reset on each financial year"
        >
          <SegmentedControl<'continuous' | 'reset_annual' | 'custom'>
            value={inv?.numberingMode || 'continuous'}
            options={[
              { value: 'continuous', label: 'Continuous' },
              { value: 'reset_annual', label: 'Reset Annually' },
            ]}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                invoice: { ...(prev.invoice || {}), numberingMode: val },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Invoice Prefix"
          description="Prefix string prepended before the numeric sequence"
        >
          <TextField
            value={inv?.prefix || 'INV-'}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                invoice: { ...(prev.invoice || {}), prefix: val },
              }))
            }
            placeholder="INV-"
            className="w-44 font-mono uppercase"
          />
        </SettingRow>

        <SettingRow
          label="Print Copies per Bill"
          description="Number of physical receipts dispatched on complete checkout"
        >
          <NumberStepper
            value={inv?.copiesCount || 1}
            min={1}
            max={5}
            step={1}
            unit="copy"
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                invoice: { ...(prev.invoice || {}), copiesCount: val },
              }))
            }
          />
        </SettingRow>
      </SettingCard>

      {/* Fast Checkout Speed Switches */}
      <SettingCard
        title="Speed & Automation"
        description="Optimize cashier throughput during peak shop rush hours"
        icon={<Zap size={16} />}
      >
        <SettingRow
          label="Auto-Print Receipt on Checkout"
          description="Immediately sends job to thermal printer upon tender completion"
        >
          <SwitchControl
            checked={tmpl?.autoPrintOnComplete ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                receiptTemplate: { ...(prev.receiptTemplate || {}), autoPrintOnComplete: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Skip Tender Confirmation Prompt"
          description="One-touch fast cash checkout without secondary confirmation popups"
        >
          <SwitchControl
            checked={bill?.skipPaymentConfirmation ?? false}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                billingSettings: { ...(prev.billingSettings || {}), skipPaymentConfirmation: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Quick Tender Calculator Widget"
          description="Show denomination chips and change counter on the billing screen"
        >
          <SwitchControl
            checked={bill?.enableCalculatorWidget ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                billingSettings: { ...(prev.billingSettings || {}), enableCalculatorWidget: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Assume Exact Cash When Blank"
          description="When cashier clicks Complete & Print without typing cash received, treat as exact tender (default: OFF, requires cash entry)"
        >
          <SwitchControl
            checked={bill?.assumeExactCashWhenBlank ?? false}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                billingSettings: { ...(prev.billingSettings || {}), assumeExactCashWhenBlank: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Terminal Inactivity Lock Timeout"
          description="Automatically lock the register after inactivity without ending shift or losing cart items"
        >
          <select
            value={bill?.idleTimeoutHours ?? 12}
            onChange={(e) => {
              const val = Number(e.target.value);
              updateDraftConfig((prev) => ({
                ...prev,
                billingSettings: { ...(prev.billingSettings || {}), idleTimeoutHours: val },
              }));
              localStorage.setItem('pos_idle_timeout_hours', String(val));
            }}
            className="w-48 bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs font-semibold text-text-primary"
          >
            <option value={1}>1 Hour</option>
            <option value={4}>4 Hours</option>
            <option value={8}>8 Hours</option>
            <option value={12}>12 Hours (Default)</option>
            <option value={0}>Never Lock Automatically</option>
          </select>
        </SettingRow>
      </SettingCard>

      {/* Thermal Receipt Layout & Content */}
      <SettingCard
        title="Thermal Receipt Format"
        description="Configure header greetings, disclaimers, and line breakdowns"
        icon={<Printer size={16} />}
      >
        <SettingRow
          label="Paper Roll Width"
          description="Select 58mm (2-inch compact) or 80mm (3-inch standard POS roll)"
        >
          <SegmentedControl<'58mm' | '80mm' | 'A4'>
            value={tmpl?.paperWidth || '80mm'}
            options={[
              { value: '58mm', label: '58 mm' },
              { value: '80mm', label: '80 mm (Standard)' },
            ]}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                receiptTemplate: { ...(prev.receiptTemplate || {}), paperWidth: val },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Show GST Breakdown Table"
          description="Print itemized CGST and SGST summary lines on the bottom of receipt"
        >
          <SwitchControl
            checked={tmpl?.showGstBreakdown ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                receiptTemplate: { ...(prev.receiptTemplate || {}), showGstBreakdown: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Print Cashier Name"
          description="Display logged-in cashier operator on receipt header"
        >
          <SwitchControl
            checked={tmpl?.showCashier ?? true}
            onChange={(checked) =>
              updateDraftConfig((prev) => ({
                ...prev,
                receiptTemplate: { ...(prev.receiptTemplate || {}), showCashier: checked },
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Header Greeting Message"
          description="Custom text printed beneath shop name"
        >
          <TextField
            value={tmpl?.headerMessage || ''}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                receiptTemplate: { ...(prev.receiptTemplate || {}), headerMessage: val },
              }))
            }
            placeholder="Fresh Quality Meats Daily"
            className="w-72"
          />
        </SettingRow>

        <SettingRow
          label="Footer Thank-You Message"
          description="Closing message printed at the bottom"
        >
          <TextField
            value={tmpl?.footerMessage || ''}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                receiptTemplate: { ...(prev.receiptTemplate || {}), footerMessage: val },
              }))
            }
            placeholder="Thank you for your business! Visit again."
            className="w-72"
          />
        </SettingRow>

        <SettingRow
          label="Terms & Conditions Disclaimer"
          description="Legal return and quality assurance notice"
        >
          <TextAreaField
            rows={2}
            value={inv?.termsAndConditions || ''}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                invoice: { ...(prev.invoice || {}), termsAndConditions: val },
              }))
            }
            placeholder="Goods once sold cannot be returned without original receipt."
            className="w-80"
          />
        </SettingRow>
      </SettingCard>

      {/* WhatsApp Bill Dispatch */}
      <SettingCard
        title="WhatsApp Bill Dispatch"
        description="Settings for counter digital bill delivery via WhatsApp"
        icon={<Zap size={16} className="text-emerald-500" />}
      >
        <SettingRow
          label="Auto-Open WhatsApp Bill on Sale Complete"
          description="Launch wa.me window automatically upon checkout when customer has provided mobile and consent. Turn off during busy rush hours to maximize cashier speed."
        >
          <SwitchControl
            checked={bill?.autoOpenWhatsAppBill ?? false}
            onChange={(val: boolean) =>
              updateDraftConfig((prev) => ({
                ...prev,
                billingSettings: { ...(prev.billingSettings || {}), autoOpenWhatsAppBill: val },
              }))
            }
            label={bill?.autoOpenWhatsAppBill ? 'Enabled (Auto-opens on bill completion)' : 'Disabled (High-speed counter mode)'}
          />
        </SettingRow>
      </SettingCard>
    </div>
  );
};
