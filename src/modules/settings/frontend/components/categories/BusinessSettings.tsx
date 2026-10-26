import React from 'react';
import { Building2, Phone, MapPin, FileText, Calendar } from 'lucide-react';
import { SettingCard } from '../ui/SettingCard';
import { SettingRow } from '../ui/SettingRow';
import { TextField } from '../ui/TextField';
import { SelectControl } from '../ui/SelectControl';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';

export const BusinessSettings: React.FC = () => {
  const { draftConfig, updateDraftConfig } = useSettingsDraftStore();
  const shop = draftConfig.shopInfo;
  const biz = draftConfig.business;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Shop Identity Card */}
      <SettingCard
        title="Store & Brand Identity"
        description="Core details printed on all invoices, thermal bills, and tax declarations"
        icon={<Building2 size={16} />}
      >
        <SettingRow
          label="Shop / Business Name"
          description="Legal or trading name displayed prominently on top of receipts"
        >
          <TextField
            value={shop.name}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                shopInfo: { ...prev.shopInfo, name: val },
              }))
            }
            placeholder="e.g. Ishanth Proteins"
            className="w-72"
          />
        </SettingRow>

        <SettingRow
          label="Outlet Address"
          description="Physical location and landmark"
        >
          <TextField
            value={shop.address}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                shopInfo: { ...prev.shopInfo, address: val },
              }))
            }
            placeholder="e.g. 123 Market Square, Bangalore"
            className="w-72"
          />
        </SettingRow>

        <SettingRow
          label="Contact Phone"
          description="Customer care or cashier contact number"
        >
          <TextField
            type="tel"
            value={shop.phone}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                shopInfo: { ...prev.shopInfo, phone: val },
              }))
            }
            placeholder="+91 98765 43210"
            className="w-72"
          />
        </SettingRow>

        <SettingRow
          label="Business Email"
          description="For invoices, notifications, and export reports"
        >
          <TextField
            type="email"
            value={biz?.email || ''}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                business: { ...(prev.business || {}), email: val },
              }))
            }
            placeholder="contact@meatshop.com"
            className="w-72"
          />
        </SettingRow>
      </SettingCard>

      {/* Tax & Financial Identification */}
      <SettingCard
        title="Tax & Fiscal Registration"
        description="Official GST, PAN, and accounting period settings"
        icon={<FileText size={16} />}
      >
        <SettingRow
          label="GSTIN Number"
          description="15-character Goods & Services Tax Identification Number"
          badge="15-DIGIT"
        >
          <TextField
            value={shop.gstin}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                shopInfo: { ...prev.shopInfo, gstin: val.toUpperCase() },
              }))
            }
            placeholder="e.g. 29AAAAA0000A1Z5 (Optional - leave blank if not registered)"
            className="w-72 font-mono uppercase"
          />
        </SettingRow>

        <SettingRow
          label="PAN Number"
          description="Permanent Account Number for legal invoices and reports"
          badge="10-DIGIT"
        >
          <TextField
            value={biz?.pan || ''}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                business: { ...(prev.business || {}), pan: val.toUpperCase() },
              }))
            }
            placeholder="e.g. ABCDE1234F (Optional)"
            className="w-72 font-mono uppercase"
          />
        </SettingRow>

        <SettingRow
          label="Currency Symbol"
          description="Primary currency prefix used across catalog and cart"
        >
          <SelectControl
            value={shop.currencySymbol || '₹'}
            options={[
              { value: '₹', label: '₹ (INR - Indian Rupee)' },
              { value: '$', label: '$ (USD - US Dollar)' },
              { value: 'AED', label: 'AED (Dirham)' },
              { value: '£', label: '£ (GBP - British Pound)' },
            ]}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                shopInfo: { ...prev.shopInfo, currencySymbol: String(val) },
              }))
            }
            className="w-72"
          />
        </SettingRow>

        <SettingRow
          label="Financial Year (FY)"
          description="Current accounting financial year cycle"
        >
          <SelectControl
            value={biz?.financialYear || '2026-2027'}
            options={[
              { value: '2025-2026', label: 'FY 2025-2026' },
              { value: '2026-2027', label: 'FY 2026-2027' },
              { value: '2027-2028', label: 'FY 2027-2028' },
            ]}
            onChange={(val) =>
              updateDraftConfig((prev) => ({
                ...prev,
                business: { ...(prev.business || {}), financialYear: String(val) },
              }))
            }
            className="w-72"
          />
        </SettingRow>
      </SettingCard>
    </div>
  );
};
