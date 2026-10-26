import React from 'react';
import { Building2, Phone, MapPin, FileText, Calendar } from 'lucide-react';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';

export const BusinessCardPreview: React.FC = () => {
  const { draftConfig } = useSettingsDraftStore();
  const shop = draftConfig.shopInfo;
  const biz = draftConfig.business;

  return (
    <div className="w-full space-y-4">
      {/* Live Business Card Mockup */}
      <div className="w-full bg-gradient-to-br from-surface-card to-surface-panel border border-border-subtle rounded-2xl p-5 shadow-elevation space-y-4 relative overflow-hidden">
        {/* Decorative corner glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Top Header & Shop Title */}
        <div className="flex items-start justify-between border-b border-border-subtle pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-500/10 text-brand-500 text-[10px] font-black uppercase tracking-wider font-mono">
              OFFICIAL OUTLET
            </div>
            <h3 className="text-base font-black font-outfit text-text-primary tracking-tight">
              {shop.name || 'Your Shop Name'}
            </h3>
            <p className="text-[11px] text-text-secondary flex items-center gap-1.5">
              <MapPin size={12} className="text-brand-500 flex-shrink-0" />
              <span>{shop.address || 'Address not configured'}</span>
            </p>
          </div>

          <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-black text-lg shadow-sm flex-shrink-0 font-outfit">
            {(shop.name || 'M').charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Contact & Legal Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-0.5">
            <p className="text-[9px] font-bold text-text-muted uppercase flex items-center gap-1">
              <Phone size={10} className="text-brand-500" /> Phone
            </p>
            <p className="font-bold text-text-primary font-mono text-[11px] truncate">
              {shop.phone || ''}
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[9px] font-bold text-text-muted uppercase flex items-center gap-1">
              <Building2 size={10} className="text-brand-500" /> Currency
            </p>
            <p className="font-bold text-text-primary font-mono text-[11px]">
              {shop.currencySymbol || '₹'} (INR)
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[9px] font-bold text-text-muted uppercase flex items-center gap-1">
              <FileText size={10} className="text-brand-500" /> GSTIN
            </p>
            <p className="font-mono text-[11px] font-bold text-text-primary truncate">
              {shop.gstin || ''}
            </p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[9px] font-bold text-text-muted uppercase flex items-center gap-1">
              <FileText size={10} className="text-brand-500" /> PAN
            </p>
            <p className="font-mono text-[11px] font-bold text-text-primary truncate">
              {biz?.pan || ''}
            </p>
          </div>

          <div className="space-y-0.5 col-span-2 pt-1 border-t border-border-subtle/40 flex items-center justify-between">
            <span className="text-[10px] text-text-muted flex items-center gap-1">
              <Calendar size={11} className="text-brand-500" /> Financial Year:
            </span>
            <span className="font-mono text-[11px] font-bold text-text-primary">
              {biz?.financialYear || '2026-2027'}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-text-muted text-center leading-relaxed">
        This profile information appears on customer tax invoices, receipts, and procurement vouchers.
      </p>
    </div>
  );
};
