import { useState, useMemo } from 'react';
import { 
  Package, 
  AlertTriangle, 
  History, 
  Settings as AdjustIcon, 
  Search,
  Plus,
  DollarSign,
  FileSpreadsheet,
  Box,
  BarChart3,
  ClipboardCheck,
  Calendar,
  Layers,
  Bird,
  QrCode,
  MapPin,
  Upload,
  Download,
  ArrowRightLeft,
  Snowflake,
  Scale,
  ChevronDown,
  ChevronUp,
  Pencil,
  Repeat,
  RefreshCw,
  Egg
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { exportToCSV } from '../../../../core/shared/csv_exporter';
import { useQrScanner } from '../hooks/useQrScanner';
import { 
  useStockStatus, 
  useStockAdjustments, 
  useLastPhysicalCount
} from '../hooks/useInventory';
import type { StockStatus } from '../types/inventory.types';

// Components
import ProductForm from '../../../products/frontend/components/ProductForm';
import { useSession } from '../../../auth/frontend/hooks/useAuth';
import { useAdminProducts } from '../../../products/frontend/hooks/useProducts';

// Phase 1, 2, 3 & 4 Core Components
import PurchasingSuggestionsPanel from './PurchasingSuggestionsPanel';
import StockAdjustmentModal from './StockAdjustmentModal';
import PhysicalStockCountModal from './PhysicalStockCountModal';
import BatchExplorerModal from './BatchExplorerModal';
import LivestockLossModal from './LivestockLossModal';
import StockTransfersView from './StockTransfersView';
import QrLabelGeneratorModal from './QrLabelGeneratorModal';
import BulkProductImportModal from './BulkProductImportModal';
import StockValuationView from './StockValuationView';
import InventoryReportsView from './InventoryReportsView';
import InventoryStockReportView from './InventoryStockReportView';
import RefrigeratorStockView from './RefrigeratorStockView';
import AdjustLiveStockModal from './AdjustLiveStockModal';
import AnimalIcon from './AnimalIcon';
import AnimalManagementModal from './AnimalManagementModal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatQty, roundQty, getStockStatus, unitsToTraysAndPieces } from '../../../../core/shared/math';

type PrimaryTab = 'stock' | 'valuation' | 'reports';

export default function InventoryView() {
  const { data: session } = useSession();
  const isCashier = session?.role?.toLowerCase() === 'cashier';

  // Navigation State
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('stock');
  const [subTab, setSubTab] = useState<string>('status'); // default for stock is 'status' (All Stock Levels)

  // Location Filter State
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isPhysicalCountOpen, setIsPhysicalCountOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isLivestockModalOpen, setIsLivestockModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [batchVariantId, setBatchVariantId] = useState<number | null>(null);
  const [batchVariantName, setBatchVariantName] = useState<string>('');
  const [adjustTargetVariantId, setAdjustTargetVariantId] = useState<number | null>(null);

  // Queries
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_LOCATIONS, {});
      if (!res.success) return [];
      return res.data || [];
    },
  });

  const [adjustTargetAnimal, setAdjustTargetAnimal] = useState<{
    key: string;
    name: string;
    kg: number;
    count: number;
  } | null>(null);
  const [isShedListCollapsed, setIsShedListCollapsed] = useState<boolean>(false);
  const queryClient = useQueryClient();

  // Multi-Animal Yield Configs Query
  const { data: animalConfigs } = useQuery({
    queryKey: ['animal-yield-configs'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_ANIMAL_YIELD_CONFIGS, {});
      if (!res.success) return [];
      return res.data || [];
    },
  });

  // All Animal Pools for table calculation and shed list
  const { data: allPoolSummaries } = useQuery({
    queryKey: ['animal-pool-summaries-all'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_ANIMAL_POOL_SUMMARY, { animal_key: 'all' });
      if (!res.success) return {};
      return res.data || {};
    },
    refetchInterval: 10000,
  });

  // All Yield Ratios for table calculation and shed list
  const { data: allRatios } = useQuery({
    queryKey: ['yield-ratios-all'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_YIELD_RATIOS_FOR_ANIMAL, { animal_key: 'all' });
      if (!res.success) return [];
      return res.data || [];
    },
  });

  const ratiosByVariantId = useMemo(() => {
    const map = new Map<number, any>();
    for (const r of (allRatios || [])) {
      map.set(r.variant_id, r);
    }
    return map;
  }, [allRatios]);

  const configsByAnimalKey = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of (animalConfigs || [])) {
      map.set(c.animal_key, c);
    }
    return map;
  }, [animalConfigs]);

  const totalLiveKg = useMemo(() => {
    if (!allPoolSummaries) return 0;
    return Object.values(allPoolSummaries).reduce((acc: number, p: any) => acc + (p?.total_live_weight_kg || 0), 0);
  }, [allPoolSummaries]);

  const animalsList = useMemo(() => {
    const defaultList = [
      { key: 'chicken', label: 'Broiler Chicken', unitName: 'birds', iconKey: 'chicken', show: 1 },
      { key: 'country_chicken', label: 'Country Chicken', unitName: 'birds', iconKey: 'rooster', show: 1 },
      { key: 'mutton', label: 'Mutton (Goat/Sheep)', unitName: 'head', iconKey: 'goat', show: 1 },
      { key: 'quils', label: 'Quils (Quail)', unitName: 'birds', iconKey: 'quail', show: 1 },
      { key: 'ducks', label: 'Ducks', unitName: 'birds', iconKey: 'duck', show: 1 },
      { key: 'rabbit', label: 'Rabbit', unitName: 'animals', iconKey: 'rabbit', show: 1 },
    ];
    if (!animalConfigs || animalConfigs.length === 0) return defaultList;
    return animalConfigs
      .filter((c: any) => c.show_in_inventory !== 0 && c.show_in_inventory !== false)
      .map((c: any) => {
        const match = defaultList.find((d: any) => d.key === c.animal_key);
        return {
          key: c.animal_key,
          label: c.display_name || match?.label || c.animal_key,
          unitName: c.unit_name || match?.unitName || 'head',
          iconKey: c.icon_key || match?.iconKey || c.animal_key,
          stockMode: c.stock_mode || 'dual',
          show: c.show_in_inventory,
        };
      });
  }, [animalConfigs]);

  const updateAnimalConfigMutation = useMutation({
    mutationFn: async (updated: { animal_key: string; live_tracking_enabled?: number; track_byproducts?: number }) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.UPDATE_ANIMAL_YIELD_CONFIG, updated);
      if (!res.success) throw new Error(res.error?.message || 'Failed to update config');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animal-yield-configs'] });
      queryClient.invalidateQueries({ queryKey: ['animal-pool-summaries-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-status'] });
    },
  });

  const setYieldRatioMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.SET_YIELD_RATIO, payload);
      if (!res.success) throw new Error(res.error?.message || 'Failed to update ratio');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yield-ratios-all'] });
      queryClient.invalidateQueries({ queryKey: ['animal-pool-summaries-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-status'] });
    },
  });

  // Queries
  const { data: stocks, refetch } = useStockStatus();
  const { data: adjs } = useStockAdjustments();
  const { data: lastPhysicalCountDate } = useLastPhysicalCount();

  // Search & Filters for Stock Status
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'low' | 'good'>('all');
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);

  // Hardware HID QR Scanner Listener
  useQrScanner((code) => {
    setSearchTerm(code);
    setPrimaryTab('stock');
    setSubTab('status');
  });

  // Animal Filter State for Shed and Stock List ('all' | 'chicken' | 'country_chicken' | 'mutton' | 'quils' | 'ducks' | 'rabbit')
  const [selectedAnimalFilter, setSelectedAnimalFilter] = useState<string>('all');

  // Ratio swap mode per ratio ID: 'live_to_flesh' (g per 1kg live) or 'flesh_to_live' (kg live for 1kg flesh)
  const [ratioSwapModes, setRatioSwapModes] = useState<Record<number, 'live_to_flesh' | 'flesh_to_live'>>({});
  // Inline editing state for ratio: { ratioId, value }
  const [editingRatio, setEditingRatio] = useState<{ id: number; value: string } | null>(null);
  // Animal Management Modal state
  const [isAnimalManagementOpen, setIsAnimalManagementOpen] = useState(false);

  const toggleSwapMode = (ratioId: number) => {
    setRatioSwapModes(prev => ({
      ...prev,
      [ratioId]: prev[ratioId] === 'flesh_to_live' ? 'live_to_flesh' : 'flesh_to_live',
    }));
  };

  const { data: adminProducts } = useAdminProducts();

  const trackingMap = useMemo(() => {
    const map = new Map<number, boolean>();
    const untrackedNames = new Set<string>();
    for (const p of (adminProducts || [])) {
      const isTracked = p.track_in_inventory === 1;
      map.set(p.id, isTracked);
      if (!isTracked) {
        if (p.name) untrackedNames.add(p.name.trim().toLowerCase());
        for (const v of (p.variants || [])) {
          if (v.id) map.set(v.id, false);
          if (v.variant_name) untrackedNames.add(v.variant_name.trim().toLowerCase());
        }
      }
    }
    return { map, untrackedNames };
  }, [adminProducts]);

  const isItemTracked = (item: StockStatus) => {
    if (item.track_in_inventory === 0 || item.is_inventory_tracked === 0) {
      return false;
    }
    if (trackingMap.map.has(item.product_variant_id) && !trackingMap.map.get(item.product_variant_id)) {
      return false;
    }
    const pName = (item.product_name || '').trim().toLowerCase();
    const vName = (item.variant_name || '').trim().toLowerCase();
    if (pName && trackingMap.untrackedNames.has(pName)) {
      return false;
    }
    if (vName && trackingMap.untrackedNames.has(vName)) {
      return false;
    }
    return true;
  };

  const isLowStock = (item: StockStatus) => {
    if (!isItemTracked(item)) {
      return false;
    }
    const isWeight = item.unit_type === 'weight' || item.unit_type === 'live_dual';
    const currentVal = isWeight ? ((item.quantity_grams ?? 0) / 1000) : (item.quantity_units ?? 0);
    const thresholdVal = isWeight ? ((item.safety_threshold_grams ?? 5000) / 1000) : (item.safety_threshold_units ?? 10);
    return getStockStatus(currentVal, thresholdVal).isPurchasingAlert;
  };

  const formatStockQty = (item: StockStatus) => {
    if (!isItemTracked(item)) {
      return '—';
    }
    if (item.unit_type === 'live_dual') {
      const pcs = Math.round(roundQty(item.quantity_count ?? 0, 0));
      const kg = formatQty((item.quantity_grams ?? 0) / 1000, { decimals: 3 });
      return `${pcs} pcs / ${kg} kg`;
    }
    if (item.unit_type === 'weight') {
      return `${formatQty((item.quantity_grams ?? 0) / 1000, { decimals: 3 })} kg`;
    }
    const isEgg = (item.category || '').toLowerCase() === 'eggs' || (item.product_name || '').toLowerCase().includes('egg');
    if (isEgg) {
      return unitsToTraysAndPieces(item.quantity_units ?? 0).display;
    }
    return `${formatQty(item.quantity_units ?? 0, { decimals: 0 })} pcs`;
  };

  const formatThresholdQty = (item: StockStatus) => {
    if (!isItemTracked(item)) {
      return '—';
    }
    if (item.unit_type === 'live_dual') {
      return `${Math.round(item.safety_threshold_count ?? 5)} pcs / ${formatQty((item.safety_threshold_grams ?? 5000) / 1000, { decimals: 3 })} kg`;
    }
    if (item.unit_type === 'weight') {
      return `${formatQty((item.safety_threshold_grams ?? 0) / 1000, { decimals: 3 })} kg`;
    }
    const isEgg = (item.category || '').toLowerCase() === 'eggs' || (item.product_name || '').toLowerCase().includes('egg');
    if (isEgg) {
      const u = item.safety_threshold_units ?? 10;
      return `${u} pcs (${roundQty(u / 30, 1)} trays)`;
    }
    return `${formatQty(item.safety_threshold_units ?? 0, { decimals: 0 })} pcs`;
  };

  const categories = ['All', ...new Set((stocks || []).filter(s => isItemTracked(s)).map(s => s.category))];

  const filteredStocks = (stocks || []).filter(item => {
    // Products with tracking OFF must not show in inventory
    if (!isItemTracked(item)) return false;

    const matchesSearch = searchTerm === '' ||
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.variant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product_code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = filterCategory === 'All' || item.category === filterCategory;

    // Filter by selected animal if an animal filter is active
    let matchesAnimal = true;
    if (selectedAnimalFilter !== 'all') {
      const ratio = ratiosByVariantId.get(item.product_variant_id);
      if (ratio && (ratio.animal_key === selectedAnimalFilter || (selectedAnimalFilter === 'mutton' && (ratio.animal_key === 'goat' || ratio.animal_key === 'sheep')))) {
        matchesAnimal = true;
      } else {
        const pName = (item.product_name + ' ' + item.variant_name + ' ' + (item.category || '')).toLowerCase();
        if (selectedAnimalFilter === 'chicken') {
          matchesAnimal = (pName.includes('chicken') || item.category === 'Chicken') && 
                          !pName.includes('country chicken') && 
                          !pName.includes('country') && 
                          !pName.includes('cc') &&
                          !pName.includes('egg');
        } else if (selectedAnimalFilter === 'country_chicken') {
          matchesAnimal = (pName.includes('country chicken') || pName.includes('country') || pName.includes('nattu')) && 
                          !pName.includes('egg');
        } else if (selectedAnimalFilter === 'mutton' || selectedAnimalFilter === 'goat') {
          matchesAnimal = (pName.includes('mutton') || pName.includes('goat') || item.category === 'Mutton' || pName.includes('botti') || pName.includes('brain') || pName.includes('spleen') || pName.includes('keema') || pName.includes('suvaroti')) &&
                          !pName.includes('masala') &&
                          !pName.includes('chicken');
        } else if (selectedAnimalFilter === 'sheep') {
          matchesAnimal = (pName.includes('sheep') || pName.includes('mutton')) && !pName.includes('chicken');
        } else if (selectedAnimalFilter === 'quils') {
          matchesAnimal = (pName.includes('quil') || pName.includes('quail') || pName.includes('kaadai')) && !pName.includes('egg');
        } else if (selectedAnimalFilter === 'ducks') {
          matchesAnimal = pName.includes('duck');
        } else if (selectedAnimalFilter === 'rabbit') {
          matchesAnimal = pName.includes('rabbit');
        } else if (selectedAnimalFilter === 'turkey') {
          matchesAnimal = pName.includes('turkey') || pName.includes('vaan kozhi');
        } else {
          matchesAnimal = false;
        }
      }
    }

    const isLow = isLowStock(item);

    const matchesStatus = filterStockStatus === 'all' ||
      (filterStockStatus === 'low' && isLow) ||
      (filterStockStatus === 'good' && !isLow);

    return matchesSearch && matchesCategory && matchesAnimal && matchesStatus;
  });

  const handlePrimaryTabChange = (tab: PrimaryTab) => {
    setPrimaryTab(tab);
    if (tab === 'stock') setSubTab('status');
    else if (tab === 'reports') setSubTab('activity');
  };

  const handleSubTabClick = (key: string) => {
    if (key === 'adjust') {
      setAdjustTargetVariantId(null);
      setIsAdjustModalOpen(true);
    } else if (key === 'physical_count') {
      setIsPhysicalCountOpen(true);
    } else {
      setSubTab(key);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-surface-app text-text-primary min-h-0">
      {/* Header & Primary Tabs */}
      <div className="border-b border-border-subtle pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-outfit text-text-primary flex items-center gap-2">
            <Package className="text-brand-500" />
            <span>Meat Shop Inventory & Supply Chain</span>
          </h2>
          <p className="text-text-muted text-xs mt-1">Audit stock levels, manage live shed animals, raise POs, and log physical stock counts.</p>
        </div>

        {/* 3 Primary Nav Tabs */}
        <div className="flex bg-surface-panel border border-border-subtle p-1.5 rounded-xl self-start gap-1.5 shadow-sm">
          <button
            onClick={() => handlePrimaryTabChange('stock')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              primaryTab === 'stock'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Box size={15} /> Stock
          </button>

          {!isCashier && (
            <button
              onClick={() => handlePrimaryTabChange('valuation')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                primaryTab === 'valuation'
                  ? 'bg-brand-500 text-white shadow-subtle'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <DollarSign size={15} /> Stock Valuation
            </button>
          )}

          <button
            onClick={() => handlePrimaryTabChange('reports')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              primaryTab === 'reports'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <BarChart3 size={15} /> Reports
          </button>
        </div>
      </div>

      {/* ITEM 2c: Low Stock / Reorder Reminder Section at top of Inventory */}
      {primaryTab === 'stock' && (
        <PurchasingSuggestionsPanel
          onQuickFilterLow={() => {
            setFilterStockStatus('low');
            setSubTab('status');
          }}
        />
      )}

      {/* Live Animals Shed Inventory List */}
      {primaryTab === 'stock' && (
        <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500">
                <Bird size={16} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-text-primary flex items-center gap-2">
                  <span>Live Animal Shed Inventory</span>
                  <span className="text-[10px] text-text-muted font-normal lowercase">({animalsList.length} animals)</span>
                </h3>
                <p className="text-[11px] text-text-muted">
                  Live stock on hand, editable yield ratios (with ⇄ Swap) & total calculated flesh
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-card border border-border-subtle text-xs">
                <span className="text-[11px] font-bold text-text-muted">Total Live in Shed:</span>
                <span className="font-mono font-black text-brand-400 text-sm">
                  {formatQty(totalLiveKg, { decimals: 3 })} kg
                </span>
              </div>
              <button
                onClick={() => setIsAnimalManagementOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Manage Animals, Logos, Units & Yield Cuts"
              >
                <AdjustIcon size={14} />
                <span>Manage Animals & Cuts</span>
              </button>
              <button
                onClick={() => setIsShedListCollapsed(!isShedListCollapsed)}
                className="px-2.5 py-1.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-border-subtle text-text-muted hover:text-text-primary text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title={isShedListCollapsed ? "Expand list" : "Collapse list"}
              >
                {isShedListCollapsed ? (
                  <><span>Expand</span><ChevronDown size={14} /></>
                ) : (
                  <><span>Collapse</span><ChevronUp size={14} /></>
                )}
              </button>
            </div>
          </div>

          {/* Animal Quick-Toggle Selector Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 border-t border-border-subtle/50">
            <span className="text-[10px] font-black uppercase tracking-wider text-text-muted mr-1 shrink-0">
              Animal Filter:
            </span>
            <button
              onClick={() => setSelectedAnimalFilter('all')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedAnimalFilter === 'all'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-surface-card hover:bg-surface-hover text-text-secondary border border-border-subtle'
              }`}
            >
              All Animals
            </button>
            {animalsList.map((a: any) => {
              const pool = allPoolSummaries?.[a.key];
              const kg = roundQty(pool?.total_live_weight_kg || 0, 3);
              const isSelected = selectedAnimalFilter === a.key;
              return (
                <button
                  key={a.key}
                  onClick={() => setSelectedAnimalFilter(isSelected ? 'all' : a.key)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-surface-card hover:bg-surface-hover text-text-secondary border border-border-subtle'
                  }`}
                >
                  <AnimalIcon iconKey={a.iconKey || a.key} size={14} />
                  <span>{a.label}</span>
                  <span className={`text-[10px] font-mono font-bold px-1 py-0.2 rounded ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-surface-app text-brand-400'
                  }`}>
                    {formatQty(kg, { decimals: 3 })} kg
                  </span>
                </button>
              );
            })}
          </div>

          {!isShedListCollapsed && (
            <div className="divide-y divide-border-subtle/50 rounded-xl border border-border-subtle bg-white dark:bg-surface-card overflow-hidden shadow-xs">
              {animalsList
                .filter((a: any) => selectedAnimalFilter === 'all' || selectedAnimalFilter === a.key)
                .map((animal: any) => {
                  const pool = allPoolSummaries?.[animal.key] || {
                    total_live_weight_grams: 0,
                    total_live_weight_kg: 0,
                    total_bird_count: 0,
                    estimated_dressed_kg: 0,
                    is_negative: false,
                  };
                  const ratios = (allRatios || []).filter((r: any) => r.animal_key === animal.key);
                  
                  // Compute primary flesh cut ratio and total estimated flesh
                  const mainFleshRatio = ratios.find((r: any) => (r.role === 'MAIN_CUT' || r.role === 'BYPRODUCT') && r.unit_type !== 'piece' && r.grams_per_kg_live > 50) 
                    || ratios.find((r: any) => r.role === 'MAIN_CUT') 
                    || ratios[0];
                  const gramsPerKg = mainFleshRatio?.grams_per_kg_live || (animal.key === 'chicken' ? 625 : (animal.key === 'mutton' ? 500 : 600));
                  const totalFleshKg = pool.total_live_weight_grams > 0
                    ? roundQty((pool.total_live_weight_grams * gramsPerKg) / 1000000, 3)
                    : 0;

                  return (
                    <div
                      key={animal.key}
                      className="p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white dark:bg-surface-card hover:bg-slate-50/80 dark:hover:bg-surface-hover/30 transition-colors"
                    >
                      {/* 1. Animal Identity */}
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          pool.is_negative ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          (pool.total_live_weight_kg < 15 && pool.total_live_weight_kg > 0) ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' :
                          'bg-brand-500/20 text-brand-500 border border-brand-500/30'
                        }`}>
                          <AnimalIcon iconKey={animal.iconKey || animal.key} size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm text-text-primary">{animal.label}</span>
                            {pool.is_negative && (
                              <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-red-500/20 text-red-500 border border-red-500/30">
                                Deficit
                              </span>
                            )}
                            {pool.total_live_weight_kg === 0 && animal.key === 'mutton' && (
                              <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-red-600 text-white">
                                Critical 0 kg
                              </span>
                            )}
                            {pool.total_live_weight_kg < 15 && pool.total_live_weight_kg > 0 && (
                              <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-600 border border-amber-500/30">
                                Low
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-text-muted mt-0.5 block">
                            Live stock in shed
                          </span>
                        </div>
                      </div>

                      {/* 2. Live Shed Stock (Weight & Count) */}
                      <div className="flex items-center gap-4 min-w-[180px] bg-slate-50 dark:bg-surface-app/70 px-3 py-2 rounded-xl border border-slate-200 dark:border-border-subtle/60">
                        <div>
                          <span className="text-[9px] uppercase font-black text-text-muted block">Live in Shed</span>
                          <div className="text-sm font-mono font-black text-text-primary flex items-baseline gap-1">
                            <span className={pool.is_negative || (pool.total_live_weight_kg === 0 && animal.key === 'mutton') ? 'text-red-500' : 'text-emerald-500'}>
                              {formatQty(pool.total_live_weight_kg, { decimals: 3 })} kg
                            </span>
                            <span className="text-[11px] text-text-muted font-normal">
                              ({Math.round(pool.total_bird_count || 0)} {animal.unitName})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 3. High-Readability Product Cuts & Ratios Summary */}
                      <div className="flex-1 flex flex-wrap items-center gap-2 min-w-[280px]">
                        {ratios.length === 0 ? (
                          <span className="text-[11px] text-text-muted italic">No ratio cuts configured</span>
                        ) : (
                          ratios.map((r: any) => {
                            const liveGrams = r.grams_per_kg_live || 0;
                            const isMain = r.role === 'MAIN_CUT';
                            const isPiece = r.unit_type === 'piece';

                            return (
                              <div
                                key={r.id}
                                className="flex items-center gap-2 bg-slate-50 dark:bg-surface-app/90 py-1.5 px-3 rounded-xl border border-slate-200 dark:border-border-subtle/80 text-xs shadow-xs"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isMain ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                <span className="text-[11px] font-bold text-text-secondary truncate max-w-[130px]" title={r.product_name}>
                                  {r.product_name}
                                </span>
                                <span className="font-mono font-black text-brand-600 dark:text-brand-400 bg-white dark:bg-surface-card px-1.5 py-0.5 rounded border border-border-subtle text-[11px]">
                                  {isPiece ? `${liveGrams} unit` : `${liveGrams}g / kg`}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 4. Total Calculated Flesh */}
                      <div className="flex items-center gap-4 shrink-0 bg-surface-app/70 px-3.5 py-2 rounded-xl border border-border-subtle/60 min-w-[160px]">
                        <div>
                          <span className="text-[9px] uppercase font-black text-text-muted block">Total Flesh</span>
                          <span className="text-sm font-mono font-black text-brand-400">
                            ~{formatQty(totalFleshKg, { decimals: 3 })} kg
                          </span>
                        </div>
                      </div>

                      {/* 5. Adjust Button */}
                      <div className="shrink-0 self-end xl:self-center">
                        <button
                          onClick={() => {
                            setAdjustTargetAnimal({
                              key: animal.key,
                              name: animal.label,
                              kg: pool.total_live_weight_kg || 0,
                              count: pool.total_bird_count || 0,
                            });
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                          title="Record mortality, weight loss or head count adjustment"
                        >
                          <Scale size={13} />
                          <span>Adjust</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Egg Tray Inventory Section (Country Chicken Egg, Normal Farm Egg, Quail Egg) */}
      {primaryTab === 'stock' && (
        <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-subtle space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Egg size={16} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-text-primary flex items-center gap-2">
                  <span>Egg Tray Inventory</span>
                  <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.2 rounded-full border border-amber-500/20">
                    Units & 30-Egg Trays
                  </span>
                </h3>
                <p className="text-[11px] text-text-muted">
                  Real-time stock for Country Chicken Eggs, Farm Eggs, and Quail Eggs
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setFilterCategory('Eggs');
                  setSubTab('status');
                }}
                className="px-3 py-1.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-border-subtle text-text-secondary hover:text-text-primary text-xs font-bold transition-all cursor-pointer"
              >
                View in Stock Table →
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {[
              {
                id: 'country_egg',
                title: 'Country Chicken Eggs',
                subtitle: 'Nattu Kozhi Muttai',
                keys: ['cc egg', 'country egg'],
                iconColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
              },
              {
                id: 'farm_egg',
                title: 'Farm / Normal Eggs',
                subtitle: 'White Commercial Egg',
                keys: ['egg', 'egg 1'],
                iconColor: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
              },
              {
                id: 'quail_egg',
                title: 'Quail Eggs',
                subtitle: 'Kaadai Muttai',
                keys: ['quail egg', 'quais egg'],
                iconColor: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
              },
            ].map(eggType => {
              // Find matching stock item from stocks array
              const matchingItem = (stocks || []).find(s => {
                const nameLower = (s.product_name || '').toLowerCase().trim();
                return eggType.keys.some(k => nameLower === k || nameLower.startsWith(k));
              });

              const isTracked = matchingItem ? isItemTracked(matchingItem) : true;
              const totalPcs = roundQty(matchingItem?.quantity_units ?? 0, 0);
              const eggInfo = unitsToTraysAndPieces(totalPcs);
              const isLow = matchingItem ? isLowStock(matchingItem) : false;

              return (
                <div
                  key={eggType.id}
                  className="bg-surface-card border border-border-subtle/80 hover:border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-3 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${eggType.iconColor}`}>
                      <Egg size={18} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-extrabold text-text-primary truncate">{eggType.title}</h4>
                      <p className="text-[10px] text-text-muted truncate">{eggType.subtitle}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {!isTracked ? (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-surface-card text-text-muted border border-border-subtle">
                            Not Tracked
                          </span>
                        ) : isLow ? (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            In Stock
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base font-mono font-black text-text-primary">
                      {isTracked ? `${formatQty(totalPcs, { decimals: 0 })} ` : '—'}
                      {isTracked && <span className="text-[11px] font-normal text-text-muted">pcs</span>}
                    </div>
                    {isTracked && (
                      <div className="text-[11px] font-mono font-bold text-amber-400">
                        {eggInfo.trays} <span className="text-[10px] font-normal text-text-muted">trays</span>{eggInfo.remainingPieces > 0 ? ` + ${eggInfo.remainingPieces} pcs` : ''}
                      </div>
                    )}
                    {matchingItem && isTracked && (
                      <button
                        onClick={() => {
                          setAdjustTargetVariantId(matchingItem.product_variant_id);
                          setIsAdjustModalOpen(true);
                        }}
                        className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-surface-app hover:bg-surface-hover border border-border-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                      >
                        Adjust
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-Navigation Row */}
      <div className="flex items-center justify-between bg-surface-panel border border-border-subtle p-2 rounded-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {primaryTab === 'stock' && (
            <>
              <button
                onClick={() => handleSubTabClick('status')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  subTab === 'status' ? 'bg-surface-card text-brand-500 border border-border-subtle shadow-sm font-extrabold' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Box size={14} className="text-brand-500" /> All Stock Levels
              </button>

              <button
                onClick={() => handleSubTabClick('refrigerator')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  subTab === 'refrigerator' ? 'bg-surface-card text-blue-400 border border-border-subtle shadow-sm font-extrabold' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Snowflake size={14} className="text-blue-400" /> Refrigerator Stock
              </button>

              <button
                onClick={() => handleSubTabClick('transfers')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  subTab === 'transfers' ? 'bg-surface-card text-brand-500 border border-border-subtle' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <ArrowRightLeft size={13} /> Stock Transfers
              </button>

              <button
                onClick={() => handleSubTabClick('physical_count')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-text-muted hover:text-text-primary transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ClipboardCheck size={13} /> Physical Stock Count
              </button>
            </>
          )}


          {primaryTab === 'reports' && !isCashier && (
            <>
              <button
                onClick={() => handleSubTabClick('activity')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  subTab === 'activity' ? 'bg-surface-card text-brand-500 border border-border-subtle' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <History size={13} /> Stock Activity Ledger
              </button>

              <button
                onClick={() => handleSubTabClick('movement')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  subTab === 'movement' ? 'bg-surface-card text-brand-500 border border-border-subtle' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <FileSpreadsheet size={13} /> Movement Log
              </button>

              <button
                onClick={() => handleSubTabClick('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  subTab === 'history' ? 'bg-surface-card text-brand-500 border border-border-subtle' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Layers size={13} /> Adjustments Trail
              </button>
            </>
          )}
        </div>

        {/* Action Buttons Header Strip */}
        <div className="flex items-center gap-2">

          {primaryTab === 'stock' && (
            <>

              <button
                onClick={() => { setAdjustTargetVariantId(null); setIsAdjustModalOpen(true); }}
                className="px-3 py-1.5 rounded-lg bg-surface-card border border-border-subtle text-text-primary hover:border-brand-500 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <AdjustIcon size={13} /> Adjust Stock
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area - Full Width Stock Table */}
      <div className="w-full">
        <div className="w-full bg-surface-panel rounded-2xl border border-border-subtle overflow-hidden flex flex-col shadow-elevation">
          {/* REFRIGERATOR TAB */}
          {primaryTab === 'stock' && subTab === 'refrigerator' && <RefrigeratorStockView />}

          {/* VALUATION TAB */}
          {primaryTab === 'valuation' && <StockValuationView />}

          {/* STOCK TRANSFERS TAB */}
          {primaryTab === 'stock' && subTab === 'transfers' && <div className="p-4"><StockTransfersView /></div>}

          {/* REPORTS TAB */}
          {primaryTab === 'reports' && (subTab === 'activity' || subTab === 'reports') && (
            <div className="p-4">
              <InventoryStockReportView />
            </div>
          )}
          {primaryTab === 'reports' && subTab === 'movement' && <InventoryReportsView />}
          {primaryTab === 'reports' && subTab === 'history' && (
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-bold text-text-primary">Stock Movement Audit Log</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle text-text-muted uppercase text-[10px] font-bold">
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Reason</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50 font-mono">
                    {(adjs || []).map(adj => (
                      <tr key={adj.id} className="hover:bg-surface-hover">
                        <td className="py-2 px-3 text-text-muted text-[11px]">{new Date(adj.created_at).toLocaleString()}</td>
                        <td className="py-2 px-3 font-semibold text-text-primary">{adj.product_name} ({adj.variant_name})</td>
                        <td className="py-2 px-3 capitalize text-brand-500 font-bold">{adj.adjustment_type.replace('_', ' ')}</td>
                        <td className="py-2 px-3 text-text-secondary">{adj.reason}</td>
                        <td className="py-2 px-3 text-right font-bold">
                          {adj.unit_type === 'weight' ? `${((adj.quantity_grams ?? 0)/1000).toFixed(3)} kg` : `${adj.quantity_units ?? 0} pcs`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STOCK TAB: STOCK LEVELS VIEW */}
          {primaryTab === 'stock' && subTab === 'status' && (
            <div className="flex flex-col">
              {/* Header Info Strip: Last Physical Count Timestamp */}
              <div className="px-4 py-2.5 bg-surface-app border-b border-border-subtle flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-text-muted">
                  <Calendar size={13} className="text-brand-500" />
                  <span>Last Physical Stock Count: </span>
                  <strong className="text-text-primary font-mono">
                    {lastPhysicalCountDate ? new Date(lastPhysicalCountDate).toLocaleString() : 'Never recorded'}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsProductFormOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-white font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} /> Add New Product
                  </button>
                </div>
              </div>

              {/* Search & Filters Bar */}
              <div className="p-3.5 bg-surface-panel border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5 w-64">
                  <Search size={14} className="text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search stock items..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="bg-transparent border-none text-xs text-text-primary outline-none w-full"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Location Filter */}
                  <div className="flex items-center gap-1.5 bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5">
                    <MapPin size={13} className="text-brand-500" />
                    <select
                      value={selectedLocationId}
                      onChange={e => setSelectedLocationId(e.target.value)}
                      className="bg-transparent border-none text-xs font-bold text-text-primary outline-none"
                    >
                      <option value="all">All Locations</option>
                      {(locations || []).map((loc: any) => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category Filter */}
                  <select
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value)}
                    className="bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {/* Stock Status Filter */}
                  <select
                    value={filterStockStatus}
                    onChange={e => setFilterStockStatus(e.target.value as any)}
                    className="bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="low">Low Stock Only</option>
                    <option value="good">Healthy Only</option>
                  </select>

                  {/* CSV Export Button */}
                  <button
                    onClick={() => {
                      const headers = ['SKU', 'Product', 'Variant', 'Category', 'Current Stock', 'Threshold', 'Status'];
                      const rows = (filteredStocks || []).map((s: StockStatus) => {
                        const isTracked = s.track_in_inventory !== 0 && s.is_inventory_tracked !== 0;
                        const statusLabel = !isTracked ? 'Not Tracked' : isLowStock(s) ? 'Low Stock' : 'Healthy';
                        return [
                          s.product_code, s.product_name, s.variant_name, s.category,
                          formatStockQty(s), formatThresholdQty(s), statusLabel
                        ];
                      });
                      exportToCSV(`stock_levels_location_${selectedLocationId}`, headers, rows);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-surface-card border border-border-subtle hover:bg-surface-hover font-bold text-xs text-text-primary transition-all flex items-center gap-1 cursor-pointer"
                    title="Export currently visible stock data to CSV"
                  >
                    <Download size={13} /> Export CSV
                  </button>

                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-surface-card border border-border-subtle hover:bg-surface-hover font-bold text-xs text-text-primary transition-all flex items-center gap-1 cursor-pointer"
                    title="Bulk import products from CSV template"
                  >
                    <Upload size={13} /> Bulk Import
                  </button>

                  <button
                    onClick={() => setIsQrModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-500 hover:bg-brand-500 hover:text-white font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
                    title="Print Product QR Sticker Labels"
                  >
                    <QrCode size={13} /> Print QR Labels
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-surface-panel border-b border-border-subtle text-text-muted uppercase text-[10px] font-bold z-10">
                    <tr>
                      <th className="py-3 px-4">Product / Variant</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Current Stock</th>
                      <th className="py-3 px-4 text-right">Safety Threshold</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50">
                    {(filteredStocks || []).map((s: StockStatus) => {
                      const isTracked = s.track_in_inventory !== 0 && s.is_inventory_tracked !== 0;
                      const isLow = isLowStock(s);
                      const ratioInfo = ratiosByVariantId.get(s.product_variant_id);
                      const animalConfig = ratioInfo ? configsByAnimalKey.get(ratioInfo.animal_key) : null;
                      const isMainCutWithLivePool = ratioInfo?.role === 'MAIN_CUT' && Boolean(animalConfig?.live_tracking_enabled);
                      const livePool = isMainCutWithLivePool ? (allPoolSummaries as any)?.[ratioInfo.animal_key] : null;
                      const liveGrams = livePool?.total_live_weight_grams || 0;
                      const availableFromLiveGrams = (isMainCutWithLivePool && liveGrams > 0 && ratioInfo.grams_per_kg_live > 0)
                        ? Math.floor((liveGrams * ratioInfo.grams_per_kg_live) / 1000)
                        : 0;
                      const totalAvailableKg = ((s.quantity_grams ?? 0) + availableFromLiveGrams) / 1000;

                      return (
                        <tr key={s.product_variant_id} className="hover:bg-surface-hover/30 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-text-primary">{s.product_name}</span>
                              {ratioInfo?.role === 'MAIN_CUT' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider">
                                  Main Cut
                                </span>
                              )}
                              {ratioInfo?.role === 'BYPRODUCT' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold uppercase tracking-wider">
                                  Byproduct
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-text-muted mt-0.5 font-mono">{s.variant_name} • {s.product_code}</div>
                          </td>
                          <td className="py-3.5 px-4 text-text-secondary">{s.category}</td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary">
                            <div>{formatStockQty(s)}</div>
                            {isTracked && isMainCutWithLivePool && (
                              <div className="text-[10px] text-emerald-400 font-bold font-sans mt-0.5" title={`Available to sell based on ${formatQty(liveGrams / 1000, { decimals: 3 })} kg live ${animalConfig?.display_name || ''} in shed`}>
                                Avail: ~{formatQty(totalAvailableKg, { decimals: 3 })} kg
                                <span className="text-text-muted font-normal text-[9px] block">
                                  (+{formatQty(availableFromLiveGrams / 1000, { decimals: 3 })} kg live)
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-text-muted">
                            {formatThresholdQty(s)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {!isTracked ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-card text-text-muted border border-border-subtle" title="Inventory tracking is disabled for this product">
                                  Not Tracked
                                </span>
                              ) : isLow ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                                  <AlertTriangle size={10} /> Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20">
                                  Healthy
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setAdjustTargetVariantId(s.product_variant_id);
                                  setIsAdjustModalOpen(true);
                                }}
                                disabled={!isTracked}
                                className={`px-2.5 py-1 rounded-lg border font-bold text-[11px] transition-all ${
                                  !isTracked
                                    ? 'bg-surface-card/40 text-text-muted/40 border-border-subtle/40 cursor-not-allowed'
                                    : 'bg-surface-card hover:bg-brand-500 hover:text-white border-border-subtle text-text-secondary cursor-pointer'
                                }`}
                                title={!isTracked ? 'Enable inventory tracking to record adjustments' : undefined}
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => {
                                  setBatchVariantId(s.product_variant_id);
                                  setBatchVariantName(`${s.product_name} - ${s.variant_name}`);
                                  setIsBatchModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-surface-card hover:bg-brand-500 hover:text-white border border-border-subtle text-text-secondary font-bold text-[11px] transition-all flex items-center gap-1"
                              >
                                <Layers size={10} /> Batches
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredStocks?.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-text-muted text-xs">
                          No stock items matching current search and filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ProductForm
        isOpen={isProductFormOpen}
        onClose={() => setIsProductFormOpen(false)}
      />

      <StockAdjustmentModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        initialVariantId={adjustTargetVariantId}
      />

      <PhysicalStockCountModal
        isOpen={isPhysicalCountOpen}
        onClose={() => setIsPhysicalCountOpen(false)}
      />

      <BatchExplorerModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        productVariantId={batchVariantId}
        productName={batchVariantName}
      />

      <LivestockLossModal
        isOpen={isLivestockModalOpen}
        onClose={() => setIsLivestockModalOpen(false)}
      />

      <BulkProductImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => refetch()}
      />

      <QrLabelGeneratorModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        selectedItems={(filteredStocks || []).map((s: any) => ({
          product_code: s.product_code,
          product_name: s.product_name,
          variant_name: s.variant_name,
          unit_type: s.unit_type,
          rate_paise_per_unit: s.current_rate_paise_per_unit || 20000,
        }))}
      />

      {adjustTargetAnimal && (
        <AdjustLiveStockModal
          isOpen={Boolean(adjustTargetAnimal)}
          onClose={() => setAdjustTargetAnimal(null)}
          animalKey={adjustTargetAnimal.key}
          animalName={adjustTargetAnimal.name}
          currentKg={adjustTargetAnimal.kg}
          currentCount={adjustTargetAnimal.count}
        />
      )}

      <AnimalManagementModal
        isOpen={isAnimalManagementOpen}
        onClose={() => setIsAnimalManagementOpen(false)}
      />
    </div>
  );
}
