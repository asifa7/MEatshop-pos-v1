import React from 'react';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { ACCENT_COLORS } from '../../../../../core/theme/palette';

export const POSWindowMockupPreview: React.FC = () => {
  const { draftAppearance } = useSettingsDraftStore();
  const activeColor = ACCENT_COLORS.find((c: any) => c.id === draftAppearance.accentColor) || ACCENT_COLORS[0];

  return (
    <div className="w-full space-y-4">
      {/* POS Mini Window Frame */}
      <div className="w-full bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-2xl transition-all">
        {/* Top Accent Titlebar */}
        <div
          className="px-3.5 py-2 flex items-center justify-between text-white transition-colors duration-300"
          style={{ backgroundColor: activeColor.hex }}
        >
          <div className="flex items-center gap-2">
            <span className="font-black text-xs tracking-tight font-outfit">MEAT SHOP POS</span>
            <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded font-mono font-bold">LIVE PREVIEW</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-white/40" />
            <div className="w-2 h-2 rounded-full bg-white/40" />
            <div className="w-2 h-2 rounded-full bg-white/80" />
          </div>
        </div>

        {/* Mock Window Body */}
        <div className="p-3 bg-surface-app space-y-2.5">
          <div className="grid grid-cols-12 gap-2">
            {/* Mock Cart Column (Left) */}
            <div className="col-span-7 bg-surface-panel border border-border-subtle rounded-xl p-2.5 space-y-2">
              <div className="flex justify-between items-center text-[10px] font-black border-b border-border-subtle pb-1.5">
                <span className="text-text-primary uppercase">Current Cart</span>
                <span className="font-mono text-text-muted">2 items</span>
              </div>

              <div className="space-y-1.5 text-[10px]">
                <div className="p-1.5 rounded-lg bg-surface-card border border-border-subtle flex justify-between items-center">
                  <div>
                    <p className="font-bold text-text-primary text-[10px]">Chicken Boneless</p>
                    <p className="text-[8px] text-text-muted font-mono">1.0 kg @ ₹350/kg</p>
                  </div>
                  <span className="font-mono font-black" style={{ color: activeColor.hex }}>
                    ₹350.00
                  </span>
                </div>

                <div className="p-1.5 rounded-lg bg-surface-card border border-border-subtle flex justify-between items-center">
                  <div>
                    <p className="font-bold text-text-primary text-[10px]">Curry Cut (Skinless)</p>
                    <p className="text-[8px] text-text-muted font-mono">0.5 kg @ ₹320/kg</p>
                  </div>
                  <span className="font-mono font-black" style={{ color: activeColor.hex }}>
                    ₹160.00
                  </span>
                </div>
              </div>

              {/* Checkout Mock Button */}
              <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                <span className="text-[9px] font-bold text-text-muted">Total: ₹510.00</span>
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black text-white shadow-sm transition-transform hover:scale-105"
                  style={{ backgroundColor: activeColor.hex }}
                >
                  Pay (Space)
                </button>
              </div>
            </div>

            {/* Mock Product Grid (Right) */}
            <div className="col-span-5 grid grid-cols-2 gap-1.5">
              <div className="p-2 rounded-xl bg-surface-panel border border-border-subtle flex flex-col justify-between aspect-square">
                <span className="text-[9px] font-bold text-text-primary">Chicken Leg</span>
                <span className="text-[9px] font-mono font-bold" style={{ color: activeColor.hex }}>₹280</span>
              </div>
              <div className="p-2 rounded-xl bg-surface-panel border border-border-subtle flex flex-col justify-between aspect-square">
                <span className="text-[9px] font-bold text-text-primary">Mutton Curry</span>
                <span className="text-[9px] font-mono font-bold" style={{ color: activeColor.hex }}>₹750</span>
              </div>
              <div className="p-2 rounded-xl bg-surface-panel border border-border-subtle flex flex-col justify-between aspect-square">
                <span className="text-[9px] font-bold text-text-primary">Liver Cut</span>
                <span className="text-[9px] font-mono font-bold" style={{ color: activeColor.hex }}>₹380</span>
              </div>
              <div className="p-2 rounded-xl bg-surface-panel border border-border-subtle flex flex-col justify-between aspect-square">
                <span className="text-[9px] font-bold text-text-primary">Boneless</span>
                <span className="text-[9px] font-mono font-bold" style={{ color: activeColor.hex }}>₹350</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="text-xs font-bold text-text-primary">
          Accent: <span style={{ color: activeColor.hex }}>{activeColor.name}</span>
        </p>
        <p className="text-[10px] text-text-muted">
          Design: <strong className="text-text-secondary uppercase">{draftAppearance.billingStyle === 'express' ? 'Express Counter' : 'Standard POS'}</strong> ·
          Theme: <strong className="text-text-secondary uppercase">{draftAppearance.mode}</strong> ·
          Cart: <strong className="text-text-secondary uppercase">{draftAppearance.cartDisplay}</strong>
        </p>
      </div>
    </div>
  );
};
