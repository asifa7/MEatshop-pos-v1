import React from 'react';
import { Palette, Sun, Moon, Monitor, LayoutGrid, ShoppingCart, PanelLeftClose } from 'lucide-react';
import { SettingCard } from '../ui/SettingCard';
import { SettingRow } from '../ui/SettingRow';
import { AccentSwatchPicker } from '../ui/AccentSwatchPicker';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useSettingsDraftStore } from '../../hooks/useSettingsDraftStore';
import { AccentColorId } from '../../../../../core/theme/palette';

export const AppearanceSettings: React.FC = () => {
  const { draftAppearance, updateDraftAppearance } = useSettingsDraftStore();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 10-Color Accent Palette Card */}
      <SettingCard
        title="Accent Color Palette"
        description="Choose from 10 industry standard brand accent themes applied instantly across the POS"
        icon={<Palette size={16} />}
      >
        <div className="py-2">
          <AccentSwatchPicker
            selectedColor={draftAppearance.accentColor}
            onChange={(colorId: AccentColorId) =>
              updateDraftAppearance((prev) => ({
                ...prev,
                accentColor: colorId,
              }))
            }
          />
        </div>
      </SettingCard>

      {/* Theme & Display Mode */}
      <SettingCard
        title="Theme Mode & Surface"
        description="Light, dark, or system-adaptive interface styling"
        icon={<Sun size={16} />}
      >
        <SettingRow
          label="Display Color Scheme"
          description="Light mode for bright daylight counters, Dark mode for low-glare evening operation"
        >
          <SegmentedControl<'light' | 'dark' | 'system'>
            value={draftAppearance.mode}
            options={[
              { value: 'light', label: 'Light', icon: <Sun size={13} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={13} /> },
              { value: 'system', label: 'System', icon: <Monitor size={13} /> },
            ]}
            onChange={(val) =>
              updateDraftAppearance((prev) => ({
                ...prev,
                mode: val,
              }))
            }
          />
        </SettingRow>
      </SettingCard>

      {/* POS Screen Layout & Cart Density */}
      <SettingCard
        title="Billing Layout Density"
        description="Optimize visual layout for desktop monitors and touch screens"
        icon={<LayoutGrid size={16} />}
      >
        <SettingRow
          label="Billing Screen Design"
          description="Standard POS (catalog grid layout) or Express Counter (streamlined 3-column fast billing)"
        >
          <SegmentedControl<'standard' | 'express'>
            value={draftAppearance.billingStyle || 'standard'}
            options={[
              { value: 'standard', label: 'Standard POS' },
              { value: 'express', label: 'Express Counter' },
            ]}
            onChange={(val) =>
              updateDraftAppearance((prev) => ({
                ...prev,
                billingStyle: val,
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Register Screen Mode"
          description="Touch screen (large touch targets) or Classic desktop (compact fast typing)"
        >
          <SegmentedControl<'touch' | 'classic'>
            value={draftAppearance.layoutType}
            options={[
              { value: 'touch', label: 'Touch Screen' },
              { value: 'classic', label: 'Classic Desktop' },
            ]}
            onChange={(val) =>
              updateDraftAppearance((prev) => ({
                ...prev,
                layoutType: val,
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Product Tile Size"
          description="Dimension of items in catalog matrix"
        >
          <SegmentedControl<'small' | 'medium' | 'large'>
            value={draftAppearance.tileSize}
            options={[
              { value: 'small', label: 'Compact' },
              { value: 'medium', label: 'Standard' },
              { value: 'large', label: 'Large Touch' },
            ]}
            onChange={(val) =>
              updateDraftAppearance((prev) => ({
                ...prev,
                tileSize: val,
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Active Cart Items Density"
          description="Level of detail visible on the cart line items list"
        >
          <SegmentedControl<'detailed' | 'comfort' | 'compact'>
            value={draftAppearance.cartDisplay}
            options={[
              { value: 'detailed', label: 'Detailed' },
              { value: 'comfort', label: 'Comfort' },
              { value: 'compact', label: 'Compact' },
            ]}
            onChange={(val) =>
              updateDraftAppearance((prev) => ({
                ...prev,
                cartDisplay: val,
              }))
            }
          />
        </SettingRow>
      </SettingCard>

      {/* Navigation Sidebar (Brave Style) */}
      <SettingCard
        title="Navigation Sidebar (Brave Style)"
        description="Configure sidebar collapse and mouse hover auto-expansion"
        icon={<PanelLeftClose size={16} />}
      >
        <SettingRow
          label="Auto-Expand on Hover"
          description="When sidebar is collapsed to icon rail, moving mouse cursor over it expands the menu (same as Brave browser)"
        >
          <SegmentedControl<'on' | 'off'>
            value={draftAppearance.sidebarHoverExpand === false ? 'off' : 'on'}
            options={[
              { value: 'on', label: 'Enabled (Brave style)' },
              { value: 'off', label: 'Disabled' },
            ]}
            onChange={(val) =>
              updateDraftAppearance((prev) => ({
                ...prev,
                sidebarHoverExpand: val === 'on',
              }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Sidebar Layout State"
          description="Default view for the navigation sidebar"
        >
          <SegmentedControl<'expanded' | 'collapsed'>
            value={draftAppearance.sidebarCollapsed ? 'collapsed' : 'expanded'}
            options={[
              { value: 'expanded', label: 'Expanded (Full)' },
              { value: 'collapsed', label: 'Collapsed (Icon Rail)' },
            ]}
            onChange={(val) =>
              updateDraftAppearance((prev) => ({
                ...prev,
                sidebarCollapsed: val === 'collapsed',
              }))
            }
          />
        </SettingRow>
      </SettingCard>
    </div>
  );
};
