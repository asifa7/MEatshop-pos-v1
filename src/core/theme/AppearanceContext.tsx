import React, { createContext, useContext, useState, useEffect } from 'react';
import { AccentColorId, AccentColorOption, ACCENT_COLORS } from './palette';

export type { AccentColorId, AccentColorOption };
export { ACCENT_COLORS };

export interface AppearanceConfig {
  layoutType: 'classic' | 'touch';
  tileSize: 'small' | 'medium' | 'large';
  cartDisplay: 'detailed' | 'comfort' | 'compact';
  mode: 'light' | 'dark' | 'system';
  accentColor: AccentColorId;
  skipPaymentConfirmation: boolean;
  showCalculatorWidget: boolean;
  defaultPaymentMethod: 'cash' | 'upi' | 'card';
  billingStyle?: 'standard' | 'express';
  sidebarCollapsed?: boolean;
  sidebarHoverExpand?: boolean;
}

const DEFAULT_CONFIG: AppearanceConfig = {
  layoutType: 'touch',
  tileSize: 'medium',
  cartDisplay: 'detailed',
  mode: 'light',
  accentColor: 'teal',
  skipPaymentConfirmation: false,
  showCalculatorWidget: true,
  defaultPaymentMethod: 'cash',
  billingStyle: 'standard',
  sidebarCollapsed: false,
  sidebarHoverExpand: true,
};

interface AppearanceContextType {
  config: AppearanceConfig;
  updateConfig: (newConfig: Partial<AppearanceConfig>) => void;
}

const AppearanceContext = createContext<AppearanceContextType>({
  config: DEFAULT_CONFIG,
  updateConfig: () => {},
});

export function applyAppearanceToDOM(config: AppearanceConfig) {
  const root = document.documentElement;

  // 1. Apply Dark/Light Mode
  if (config.mode === 'light') {
    root.classList.remove('dark');
  } else if (config.mode === 'dark') {
    root.classList.add('dark');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }

  // 2. Apply Accent Color CSS Custom Properties
  const colorObj = ACCENT_COLORS.find(c => c.id === config.accentColor) || ACCENT_COLORS[0];
  root.style.setProperty('--brand-500', colorObj.hex);
  root.style.setProperty('--brand-600', colorObj.hover);
  root.style.setProperty('--brand-700', colorObj.active);
  root.style.setProperty('--brand-50', colorObj.tint50);
  root.style.setProperty('--brand-100', colorObj.tint100);
  root.style.setProperty('--color-accent', colorObj.hex);
}

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppearanceConfig>(() => {
    try {
      const saved = localStorage.getItem('pos_appearance');
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  useEffect(() => {
    applyAppearanceToDOM(config);
  }, [config]);

  const updateConfig = (newConfig: Partial<AppearanceConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      try {
        localStorage.setItem('pos_appearance', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save pos_appearance:', e);
      }
      applyAppearanceToDOM(updated);
      return updated;
    });
  };

  return (
    <AppearanceContext.Provider value={{ config, updateConfig }}>
      {children}
    </AppearanceContext.Provider>
  );
};

export const useAppearance = () => useContext(AppearanceContext);
