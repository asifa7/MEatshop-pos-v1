import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Settings2, 
  Eye, 
  EyeOff, 
  Check, 
  Layers, 
  Sparkles, 
  Edit2, 
  Search, 
  Scale, 
  Link as LinkIcon, 
  Unlink 
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import AnimalIcon, { ANIMAL_ICON_OPTIONS } from './AnimalIcon';

interface AnimalManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AnimalManagementModal: React.FC<AnimalManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();

  // Queries
  const { data: configs = [], isLoading: isLoadingConfigs } = useQuery({
    queryKey: ['animal-yield-configs'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_ANIMAL_YIELD_CONFIGS);
      if (!res.success) throw new Error(res.error?.message || 'Failed to load animal configs');
      return res.data || [];
    },
  });

  const { data: ratios = [] } = useQuery({
    queryKey: ['yield-ratios-all'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_YIELD_RATIOS_FOR_ANIMAL, { animal_key: 'all' });
      if (!res.success) throw new Error(res.error?.message || 'Failed to load yield ratios');
      return res.data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['stock-status'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_STOCK);
      if (!res.success) throw new Error(res.error?.message || 'Failed to load products');
      return res.data || [];
    },
  });

  // Selected animal for editing cuts
  const [selectedAnimalKey, setSelectedAnimalKey] = useState<string>('chicken');

  // Mapping state for current selected animal
  const [isEditingMapping, setIsEditingMapping] = useState<boolean>(false);
  const [mappingCodeInput, setMappingCodeInput] = useState<string>('');

  // New Animal Form Modal / Section state
  const [isAddingAnimal, setIsAddingAnimal] = useState(false);
  const [newAnimalKey, setNewAnimalKey] = useState('');
  const [newAnimalName, setNewAnimalName] = useState('');
  const [newAnimalIcon, setNewAnimalIcon] = useState('chicken');
  const [newAnimalUnit, setNewAnimalUnit] = useState('birds');
  const [newAnimalStockMode, setNewAnimalStockMode] = useState<'dual' | 'weight_only' | 'count_only'>('dual');
  const [newAnimalProductCode, setNewAnimalProductCode] = useState('');

  // Add Cut Form Modal / Section state
  const [isAddingCut, setIsAddingCut] = useState(false);
  const [newCutVariantId, setNewCutVariantId] = useState<number | ''>('');
  const [newCutRole, setNewCutRole] = useState<'MAIN_CUT' | 'BYPRODUCT'>('MAIN_CUT');
  const [newCutGrams, setNewCutGrams] = useState<number>(600);
  const [cutProductSearch, setCutProductSearch] = useState('');
  const [newCutUnitType, setNewCutUnitType] = useState<'weight' | 'piece'>('weight');

  // Editing state for cut product name / code inline
  const [editingNameCutId, setEditingNameCutId] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>('');
  const [editingCodeCutId, setEditingCodeCutId] = useState<number | null>(null);
  const [editingCodeValue, setEditingCodeValue] = useState<string>('');

  // Reset mapping edit state when switching animals
  useEffect(() => {
    setIsEditingMapping(false);
    setMappingCodeInput('');
  }, [selectedAnimalKey]);

  // Mutations
  const updateConfigMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.UPDATE_ANIMAL_YIELD_CONFIG, payload);
      if (!res.success) throw new Error(res.error?.message || 'Failed to update animal');
      return res.data;
    },
    onMutate: async (updatedPayload: any) => {
      await queryClient.cancelQueries({ queryKey: ['animal-yield-configs'] });
      const previousConfigs = queryClient.getQueryData(['animal-yield-configs']);
      queryClient.setQueryData(['animal-yield-configs'], (old: any[] = []) =>
        old.map(c => c.animal_key === updatedPayload.animal_key ? { ...c, ...updatedPayload } : c)
      );
      return { previousConfigs };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousConfigs) {
        queryClient.setQueryData(['animal-yield-configs'], context.previousConfigs);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['animal-yield-configs'] });
      queryClient.invalidateQueries({ queryKey: ['animal-pool-summaries-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-status'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock'] });
    },
  });

  const createConfigMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.CREATE_ANIMAL_YIELD_CONFIG, payload);
      if (!res.success) throw new Error(res.error?.message || 'Failed to create animal');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animal-yield-configs'] });
      queryClient.invalidateQueries({ queryKey: ['animal-pool-summaries-all'] });
      setIsAddingAnimal(false);
      setNewAnimalKey('');
      setNewAnimalName('');
      setNewAnimalProductCode('');
    },
  });

  const setRatioMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.SET_YIELD_RATIO, payload);
      if (!res.success) throw new Error(res.error?.message || 'Failed to set cut ratio');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yield-ratios-all'] });
      queryClient.invalidateQueries({ queryKey: ['animal-pool-summaries-all'] });
      setIsAddingCut(false);
      setNewCutVariantId('');
      setCutProductSearch('');
    },
  });

  const deleteRatioMutation = useMutation({
    mutationFn: async (ratioId: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.DELETE_YIELD_RATIO, { ratio_id: ratioId });
      if (!res.success) throw new Error(res.error?.message || 'Failed to delete ratio');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yield-ratios-all'] });
      queryClient.invalidateQueries({ queryKey: ['animal-pool-summaries-all'] });
    },
  });

  // Product & Variant Details Mutation (Name, Code, Unit Type)
  const updateProductMutation = useMutation({
    mutationFn: async ({ id, fields }: { id: number; fields: any }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PRODUCTS.UPDATE, { id, fields });
      if (!res.success) throw new Error(res.error?.message || 'Failed to update product details');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['yield-ratios-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-status'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock'] });
      setEditingNameCutId(null);
      setEditingCodeCutId(null);
    },
  });

  const currentAnimal = configs.find((c: any) => c.animal_key === selectedAnimalKey) || configs[0];
  const activeKey = currentAnimal?.animal_key || selectedAnimalKey;
  const currentRatios = (ratios as any[]).filter((r: any) => r.animal_key === activeKey);

  const previewProduct = useMemo(() => {
    if (!mappingCodeInput.trim()) return null;
    const clean = mappingCodeInput.trim().toLowerCase();
    return (products as any[]).find(
      (p: any) => String(p.product_code || '').trim().toLowerCase() === clean
    );
  }, [mappingCodeInput, products]);

  const matchedProductForCurrent = useMemo(() => {
    if (!currentAnimal) return null;
    return (products as any[]).find(
      (p: any) => (currentAnimal.mapped_product_code && String(p.product_code || '').trim().toLowerCase() === String(currentAnimal.mapped_product_code).trim().toLowerCase()) ||
                  (currentAnimal.live_variant_id && p.product_variant_id === currentAnimal.live_variant_id)
    );
  }, [currentAnimal, products]);

  const handleToggleVisibility = (config: any) => {
    const nextVal = (config.show_in_inventory === 0 || config.show_in_inventory === false) ? 1 : 0;
    updateConfigMutation.mutate({
      animal_key: config.animal_key,
      show_in_inventory: nextVal,
    });
  };

  const handleCreateAnimal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnimalKey.trim() || !newAnimalName.trim()) return;
    const cleanKey = newAnimalKey.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
    createConfigMutation.mutate({
      animal_key: cleanKey,
      display_name: newAnimalName.trim(),
      icon_key: newAnimalIcon,
      unit_name: newAnimalUnit.trim() || 'birds',
      stock_mode: newAnimalStockMode,
      product_code: newAnimalProductCode.trim() || undefined,
      show_in_inventory: 1,
      live_tracking_enabled: 1,
    });
  };

  const handleAddCut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCutVariantId) return;
    const selectedProd = (products as any[]).find(p => p.product_variant_id === Number(newCutVariantId));
    if (!selectedProd) return;

    if (newCutUnitType && selectedProd.unit_type !== newCutUnitType) {
      await updateProductMutation.mutateAsync({
        id: selectedProd.product_variant_id,
        fields: { unit_type: newCutUnitType }
      });
    }

    setRatioMutation.mutate({
      animal_key: activeKey,
      product_id: selectedProd.product_id,
      variant_id: selectedProd.product_variant_id,
      role: newCutRole,
      grams_per_kg_live: Number(newCutGrams) || 0,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-4xl bg-surface-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-panel/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500">
              <Settings2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-text-primary uppercase tracking-wider flex items-center gap-2">
                <span>Animal & Yield Management</span>
                <span className="text-xs font-normal normal-case text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                  Custom Logos, Units & Cuts
                </span>
              </h2>
              <p className="text-xs text-text-muted">
                Toggle animal visibility in inventory, customize icons, unit metrics, and cut yield ratios.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Left sidebar (Animals list) + Right workspace (Selected Animal config & cuts) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-0">
          {/* Left Column: Animals List (4 cols) */}
          <div className="md:col-span-4 border-r border-border-subtle bg-surface-panel/30 flex flex-col overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">
                Animals ({configs.length})
              </span>
              <button
                onClick={() => setIsAddingAnimal(true)}
                className="px-2 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all"
              >
                <Plus size={13} />
                <span>Add Animal</span>
              </button>
            </div>

            {/* List of Animals */}
            <div className="space-y-1.5 flex-1 overflow-y-auto pr-0.5">
              {isLoadingConfigs ? (
                <div className="p-4 text-center text-xs text-text-muted">Loading animals...</div>
              ) : (
                configs.map((config: any) => {
                  const isSelected = config.animal_key === activeKey;
                  const isVisible = config.show_in_inventory !== 0;

                  return (
                    <div
                      key={config.animal_key}
                      onClick={() => setSelectedAnimalKey(config.animal_key)}
                      className={`group p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-brand-500/15 border-brand-500/50 shadow-sm'
                          : 'bg-surface-card hover:bg-surface-hover/60 border-border-subtle'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-brand-500 text-white' : 'bg-surface-app text-brand-400'
                        }`}>
                          <AnimalIcon iconKey={config.icon_key || config.animal_key} size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${
                            isSelected ? 'text-brand-300 font-black' : 'text-text-primary'
                          }`}>
                            {config.display_name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {config.mapped_product_code ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                                Code: {config.mapped_product_code}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-text-muted bg-surface-app border border-border-subtle">
                                No Code
                              </span>
                            )}
                            <span className="text-[10px] text-text-muted truncate">
                              • {config.unit_name || 'birds'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* On / Off Visibility Toggle */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleVisibility(config);
                        }}
                        className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
                          isVisible
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                            : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-500 hover:bg-zinc-500/20'
                        }`}
                        title={isVisible ? "Visible in inventory (Click to hide)" : "Hidden from inventory (Click to show)"}
                      >
                        {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Animal Details & Cut Mappings (8 cols) */}
          <div className="md:col-span-8 flex flex-col overflow-y-auto p-5 space-y-5 bg-surface-card">
            {isAddingAnimal ? (
              /* Add New Animal Form */
              <div className="space-y-4 bg-surface-panel/40 p-4 rounded-xl border border-border-subtle">
                <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                  <h3 className="text-sm font-black text-text-primary uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={16} className="text-brand-400" />
                    <span>Create New Animal Category</span>
                  </h3>
                  <button
                    onClick={() => setIsAddingAnimal(false)}
                    className="text-text-muted hover:text-text-primary text-xs"
                  >
                    Cancel
                  </button>
                </div>

                <form onSubmit={handleCreateAnimal} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-text-muted uppercase block mb-1">
                        Internal Key (ID)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. turkey, fish, deer"
                        value={newAnimalKey}
                        onChange={(e) => setNewAnimalKey(e.target.value)}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary font-mono focus:border-brand-500 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-text-muted uppercase block mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Turkey / Kadaknath"
                        value={newAnimalName}
                        onChange={(e) => setNewAnimalName(e.target.value)}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:border-brand-500 outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-text-muted uppercase block mb-1">
                        Logo / Symbol
                      </label>
                      <select
                        value={newAnimalIcon}
                        onChange={(e) => setNewAnimalIcon(e.target.value)}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:border-brand-500 outline-none"
                      >
                        {ANIMAL_ICON_OPTIONS.map((opt) => (
                          <option key={opt.key} value={opt.key}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-text-muted uppercase block mb-1">
                        Unit Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. birds, head, pcs"
                        value={newAnimalUnit}
                        onChange={(e) => setNewAnimalUnit(e.target.value)}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:border-brand-500 outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-text-muted uppercase block mb-1">
                        Stock Mode
                      </label>
                      <select
                        value={newAnimalStockMode}
                        onChange={(e) => setNewAnimalStockMode(e.target.value as any)}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:border-brand-500 outline-none"
                      >
                        <option value="dual">Dual (Kg & Count)</option>
                        <option value="weight_only">Weight Only (Kg)</option>
                        <option value="count_only">Count Only (Units)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-text-muted uppercase block mb-1">
                        Product Code
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1, 8"
                        value={newAnimalProductCode}
                        onChange={(e) => setNewAnimalProductCode(e.target.value)}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary font-mono focus:border-brand-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingAnimal(false)}
                      className="px-3 py-1.5 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createConfigMutation.isPending}
                      className="px-4 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md transition-all"
                    >
                      {createConfigMutation.isPending ? 'Saving...' : 'Create Animal'}
                    </button>
                  </div>
                </form>
              </div>
            ) : currentAnimal ? (
              /* Config Editor for current selected animal */
              <>
                <div className="bg-surface-panel/40 p-4 rounded-xl border border-border-subtle space-y-4">
                  <div className="flex items-center justify-between border-b border-border-subtle/50 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center">
                        <AnimalIcon iconKey={currentAnimal.icon_key || currentAnimal.animal_key} size={22} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-text-primary">{currentAnimal.display_name}</h3>
                        <p className="text-[11px] text-text-muted font-mono">key: {currentAnimal.animal_key}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-text-muted">Show in Inventory:</span>
                      <button
                        onClick={() => handleToggleVisibility(currentAnimal)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                          currentAnimal.show_in_inventory !== 0
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                            : 'bg-zinc-500/15 border-zinc-500/40 text-zinc-400'
                        }`}
                      >
                        {currentAnimal.show_in_inventory !== 0 ? <Eye size={13} /> : <EyeOff size={13} />}
                        <span>{currentAnimal.show_in_inventory !== 0 ? 'ON' : 'OFF'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Editable Settings Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-text-muted block mb-1">
                        Logo / Symbol
                      </label>
                      <select
                        value={currentAnimal.icon_key || currentAnimal.animal_key}
                        onChange={(e) => updateConfigMutation.mutate({
                          animal_key: currentAnimal.animal_key,
                          icon_key: e.target.value,
                        })}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:border-brand-500 outline-none"
                      >
                        {ANIMAL_ICON_OPTIONS.map((opt) => (
                          <option key={opt.key} value={opt.key}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-text-muted block mb-1">
                        Unit Name
                      </label>
                      <input
                        type="text"
                        defaultValue={currentAnimal.unit_name || 'birds'}
                        onBlur={(e) => {
                          if (e.target.value !== currentAnimal.unit_name) {
                            updateConfigMutation.mutate({
                              animal_key: currentAnimal.animal_key,
                              unit_name: e.target.value.trim() || 'birds',
                            });
                          }
                        }}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:border-brand-500 outline-none"
                        placeholder="birds, head, pcs, kg"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-text-muted block mb-1">
                        Tracking Mode
                      </label>
                      <select
                        value={currentAnimal.stock_mode || 'dual'}
                        onChange={(e) => updateConfigMutation.mutate({
                          animal_key: currentAnimal.animal_key,
                          stock_mode: e.target.value,
                        })}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:border-brand-500 outline-none"
                      >
                        <option value="dual">Dual (Weight & Count)</option>
                        <option value="weight_only">Weight Only (Kg)</option>
                        <option value="count_only">Count Only (Units)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Mapped Live POS Product (Master Code) */}
                <div className="bg-surface-panel/40 p-4 rounded-xl border border-border-subtle space-y-3">
                  <div className="flex items-center justify-between border-b border-border-subtle/40 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Scale size={16} className="text-brand-400" />
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-text-primary">
                          Mapped Live POS Product (Product Code)
                        </h4>
                        <p className="text-[11px] text-text-muted">
                          Connects this animal to POS inventory. Live shed stock and product inventory will always have the exact same data.
                        </p>
                      </div>
                    </div>

                    {currentAnimal.mapped_product_code && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Check size={12} />
                        <span>Code: {currentAnimal.mapped_product_code}</span>
                      </span>
                    )}
                  </div>

                  {isEditingMapping ? (
                    <div className="space-y-3 bg-surface-card p-3 rounded-xl border border-brand-500/30">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-text-muted block mb-1">
                            Product Code (e.g. 1 for Broiler Chicken, 8 for Country Chicken)
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={mappingCodeInput}
                              onChange={(e) => setMappingCodeInput(e.target.value)}
                              placeholder="e.g. 1, 8..."
                              className="flex-1 bg-surface-app border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary font-mono focus:border-brand-500 outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  updateConfigMutation.mutate(
                                    {
                                      animal_key: currentAnimal.animal_key,
                                      product_code: mappingCodeInput.trim(),
                                    },
                                    {
                                      onSuccess: () => setIsEditingMapping(false),
                                    }
                                  );
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                updateConfigMutation.mutate(
                                  {
                                    animal_key: currentAnimal.animal_key,
                                    product_code: mappingCodeInput.trim(),
                                  },
                                  {
                                    onSuccess: () => setIsEditingMapping(false),
                                  }
                                );
                              }}
                              disabled={updateConfigMutation.isPending}
                              className="px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm transition-all"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingMapping(false);
                                setMappingCodeInput(currentAnimal.mapped_product_code || '');
                              }}
                              className="px-2.5 py-1.5 rounded-xl border border-border-subtle text-text-muted hover:text-text-primary text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-text-muted block mb-1">
                            Or Select From Product List
                          </label>
                          <select
                            value={matchedProductForCurrent?.product_variant_id || ''}
                            onChange={(e) => {
                              const selectedVar = (products as any[]).find(p => p.product_variant_id === Number(e.target.value));
                              if (selectedVar) {
                                setMappingCodeInput(selectedVar.product_code || '');
                                updateConfigMutation.mutate(
                                  {
                                    animal_key: currentAnimal.animal_key,
                                    live_variant_id: selectedVar.product_variant_id,
                                    product_code: selectedVar.product_code,
                                  },
                                  {
                                    onSuccess: () => setIsEditingMapping(false),
                                  }
                                );
                              }
                            }}
                            className="w-full bg-surface-app border border-border-subtle rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:border-brand-500 outline-none"
                          >
                            <option value="">-- Choose Product --</option>
                            {(products as any[]).map((p: any) => (
                              <option key={p.product_variant_id} value={p.product_variant_id}>
                                Code: {p.product_code || '-'} | {p.product_name} {p.variant_name !== 'Standard' ? `(${p.variant_name})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {previewProduct && (
                        <div className="p-2.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-xs flex items-center justify-between">
                          <div>
                            <span className="font-bold text-brand-300">Matches: {previewProduct.product_name}</span>
                            <span className="text-text-muted ml-1.5 font-mono">(Code: {previewProduct.product_code})</span>
                          </div>
                          <span className="text-[11px] text-text-muted font-mono">
                            Stock: {(previewProduct.quantity_grams ? (previewProduct.quantity_grams / 1000).toFixed(2) + ' kg' : (previewProduct.quantity_units ?? 0) + ' units')}
                            {previewProduct.quantity_count ? ` • ${Math.round(previewProduct.quantity_count)} birds` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : currentAnimal.mapped_product_code ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-card p-3 rounded-xl border border-border-subtle">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-mono font-black text-sm">
                          #{currentAnimal.mapped_product_code}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-text-primary">
                              {currentAnimal.mapped_product_name || 'Mapped Product'}
                            </span>
                            {currentAnimal.mapped_variant_name && currentAnimal.mapped_variant_name !== 'Standard' && (
                              <span className="text-[10px] text-text-muted bg-surface-panel px-1.5 py-0.5 rounded border border-border-subtle">
                                {currentAnimal.mapped_variant_name}
                              </span>
                            )}
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                              Code {currentAnimal.mapped_product_code}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted mt-0.5">
                            {matchedProductForCurrent ? (
                              <>
                                Current Inventory Stock: <span className="font-bold text-text-primary font-mono">
                                  {matchedProductForCurrent.quantity_grams ? `${(matchedProductForCurrent.quantity_grams / 1000).toFixed(2)} kg` : `${matchedProductForCurrent.quantity_units ?? 0} units`}
                                  {matchedProductForCurrent.quantity_count ? ` • ${Math.round(matchedProductForCurrent.quantity_count)} birds` : ''}
                                </span> • Live shed and inventory are identical.
                              </>
                            ) : (
                              'Stock ledger and shed data are linked and always synchronized.'
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            setMappingCodeInput(currentAnimal.mapped_product_code || '');
                            setIsEditingMapping(true);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-border-subtle hover:border-brand-500 text-text-primary text-xs font-medium flex items-center gap-1 transition-colors"
                        >
                          <Edit2 size={12} />
                          <span>Change Code</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateConfigMutation.mutate({
                              animal_key: currentAnimal.animal_key,
                              product_code: '',
                            });
                          }}
                          className="px-2 py-1 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors"
                          title="Unlink product code"
                        >
                          Unlink
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-500/5 p-3 rounded-xl border border-amber-500/20">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-amber-400">
                          ⚠️ No product code mapped yet
                        </p>
                        <p className="text-[11px] text-text-muted">
                          Map this animal to a POS product code (e.g. Broiler Chicken = 1, Country Chicken = 8) to sync stock data.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMappingCodeInput('');
                          setIsEditingMapping(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1 shrink-0"
                      >
                        <Plus size={13} />
                        <span>Map Product Code</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Product Cuts & Yield Ratios Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                        <Layers size={14} className="text-brand-400" />
                        <span>Product Cuts & Yield Ratios for {currentAnimal.display_name}</span>
                      </h4>
                      <p className="text-[11px] text-text-muted">
                        Configure which POS products yield from this animal and grams flesh per 1kg live.
                      </p>
                    </div>

                    <button
                      onClick={() => setIsAddingCut(!isAddingCut)}
                      className="px-2.5 py-1.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 text-xs font-bold flex items-center gap-1 transition-all"
                    >
                      <Plus size={13} />
                      <span>Add Product Cut</span>
                    </button>
                  </div>

                  {/* Add Cut Sub-Form */}
                  {isAddingCut && (
                    <form onSubmit={handleAddCut} className="p-3 bg-surface-panel rounded-xl border border-brand-500/30 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold uppercase text-text-muted block">
                            Link Product (Search by Name or Code)
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Type product code (e.g. 11, 23) or name..."
                              value={cutProductSearch}
                              onChange={(e) => {
                                const term = e.target.value;
                                setCutProductSearch(term);
                                const match = (products as any[]).find(p => 
                                  String(p.product_code || p.id).toLowerCase() === term.trim().toLowerCase()
                                );
                                if (match) {
                                  setNewCutVariantId(match.product_variant_id);
                                  const isPiece = match.unit_type === 'piece';
                                  setNewCutUnitType(isPiece ? 'piece' : 'weight');
                                  if (isPiece) setNewCutGrams(1);
                                }
                              }}
                              className="w-full bg-surface-card border border-border-subtle rounded-lg pl-7 pr-2 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
                            />
                            <Search size={12} className="absolute left-2 top-2.5 text-text-muted" />
                          </div>
                          <select
                            value={newCutVariantId}
                            onChange={(e) => {
                              const vid = Number(e.target.value);
                              setNewCutVariantId(vid);
                              const match = (products as any[]).find(p => p.product_variant_id === vid);
                              if (match) {
                                const isPiece = match.unit_type === 'piece';
                                setNewCutUnitType(isPiece ? 'piece' : 'weight');
                                if (isPiece && newCutGrams === 600) setNewCutGrams(1);
                              }
                            }}
                            className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
                            required
                          >
                            <option value="">Select or choose product ({products.length} available)...</option>
                            {(products as any[])
                              .filter(p => {
                                if (!cutProductSearch.trim()) return true;
                                const s = cutProductSearch.toLowerCase().trim();
                                return (
                                  (p.product_name && p.product_name.toLowerCase().includes(s)) ||
                                  (p.variant_name && p.variant_name.toLowerCase().includes(s)) ||
                                  (p.product_code && String(p.product_code).toLowerCase().includes(s))
                                );
                              })
                              .map((p: any) => (
                                <option key={p.product_variant_id} value={p.product_variant_id}>
                                  [{p.product_code || '—'}] {p.product_name} {p.variant_name ? `(${p.variant_name})` : ''} - {p.unit_name || p.unit_type || 'unit'}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-text-muted block mb-1">Unit Type</label>
                          <div className="flex items-center gap-1 bg-surface-card p-1 rounded-lg border border-border-subtle">
                            <button
                              type="button"
                              onClick={() => {
                                setNewCutUnitType('weight');
                                if (newCutGrams === 1) setNewCutGrams(500);
                              }}
                              className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${
                                newCutUnitType === 'weight'
                                  ? 'bg-brand-500 text-white shadow-sm'
                                  : 'text-text-muted hover:text-text-primary'
                              }`}
                            >
                              Kg
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNewCutUnitType('piece');
                                if (newCutGrams > 50) setNewCutGrams(1);
                              }}
                              className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${
                                newCutUnitType === 'piece'
                                  ? 'bg-brand-500 text-white shadow-sm'
                                  : 'text-text-muted hover:text-text-primary'
                              }`}
                            >
                              Unit
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-text-muted block mb-1">Role</label>
                          <select
                            value={newCutRole}
                            onChange={(e) => setNewCutRole(e.target.value as any)}
                            className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none"
                          >
                            <option value="MAIN_CUT">Main Flesh</option>
                            <option value="BYPRODUCT">Byproduct</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-text-muted block mb-1">
                            {newCutUnitType === 'piece' ? 'Units per Animal' : 'Yield (g/kg Live)'}
                          </label>
                          <input
                            type="number"
                            value={newCutGrams}
                            onChange={(e) => setNewCutGrams(Number(e.target.value))}
                            className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-primary font-mono outline-none"
                            required
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingCut(false);
                            setCutProductSearch('');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-border-subtle text-text-muted text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={setRatioMutation.isPending}
                          className="px-3 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold"
                        >
                          Save Cut
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Cuts List */}
                  <div className="divide-y divide-border-subtle/50 rounded-xl border border-border-subtle bg-surface-panel/20 overflow-hidden">
                    {currentRatios.length === 0 ? (
                      <div className="p-4 text-center text-xs text-text-muted italic">
                        No product cuts configured for this animal yet. Click "Add Product Cut" above.
                      </div>
                    ) : (
                      currentRatios.map((r: any) => {
                        const isMain = r.role === 'MAIN_CUT';
                        const currentUnitType: 'weight' | 'piece' | 'live_dual' = r.unit_type || 'weight';

                        return (
                          <div key={r.id} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-surface-hover/30 transition-colors">
                            {/* Left: Role, Editable Name, Code & Unit Selector */}
                            <div className="flex flex-wrap items-center gap-2.5 min-w-[260px]">
                              {/* Role Toggle Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  const nextRole = isMain ? 'BYPRODUCT' : 'MAIN_CUT';
                                  setRatioMutation.mutate({
                                    animal_key: activeKey,
                                    product_id: r.product_id,
                                    variant_id: r.variant_id,
                                    role: nextRole,
                                    grams_per_kg_live: r.grams_per_kg_live,
                                  });
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                                  isMain
                                    ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30'
                                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                                }`}
                                title="Click to toggle between Main Flesh and Byproduct"
                              >
                                {isMain ? 'Main Flesh' : 'Byproduct'}
                              </button>

                              {/* Editable Product Name */}
                              <div className="flex-1 min-w-[160px]">
                                {editingNameCutId === r.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingNameValue}
                                      onChange={(e) => setEditingNameValue(e.target.value)}
                                      onBlur={() => {
                                        if (editingNameValue.trim() && editingNameValue.trim() !== r.product_name) {
                                          updateProductMutation.mutate({
                                            id: r.variant_id,
                                            fields: { name: editingNameValue.trim() }
                                          });
                                        } else {
                                          setEditingNameCutId(null);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          (e.target as HTMLInputElement).blur();
                                        } else if (e.key === 'Escape') {
                                          setEditingNameCutId(null);
                                        }
                                      }}
                                      className="bg-surface-app border border-brand-500 rounded px-1.5 py-0.5 text-xs text-text-primary font-bold outline-none w-full"
                                    />
                                    <button 
                                      type="button" 
                                      className="text-xs text-emerald-400"
                                      onClick={() => {
                                        if (editingNameValue.trim() && editingNameValue.trim() !== r.product_name) {
                                          updateProductMutation.mutate({
                                            id: r.variant_id,
                                            fields: { name: editingNameValue.trim() }
                                          });
                                        } else {
                                          setEditingNameCutId(null);
                                        }
                                      }}
                                    >
                                      <Check size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <div 
                                    className="flex items-center gap-1.5 group/edit cursor-pointer"
                                    onClick={() => {
                                      setEditingNameCutId(r.id);
                                      setEditingNameValue(r.product_name || '');
                                    }}
                                    title="Click to edit product name"
                                  >
                                    <p className="text-xs font-bold text-text-primary group-hover/edit:text-brand-300 transition-colors">
                                      {r.product_name}
                                    </p>
                                    <span className="text-[10px] text-text-muted font-normal font-mono">
                                      ({r.variant_name})
                                    </span>
                                    <Edit2 size={11} className="text-text-muted opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                  </div>
                                )}

                                {/* Product Code / SKU Mapping */}
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-text-muted">Code:</span>
                                  {editingCodeCutId === r.id ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingCodeValue}
                                      onChange={(e) => setEditingCodeValue(e.target.value)}
                                      onBlur={() => {
                                        if (editingCodeValue.trim() && editingCodeValue.trim() !== r.product_code) {
                                          updateProductMutation.mutate({
                                            id: r.variant_id,
                                            fields: { product_code: editingCodeValue.trim() }
                                          });
                                        } else {
                                          setEditingCodeCutId(null);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          (e.target as HTMLInputElement).blur();
                                        } else if (e.key === 'Escape') {
                                          setEditingCodeCutId(null);
                                        }
                                      }}
                                      className="w-14 bg-surface-app border border-brand-500 rounded px-1 text-[10px] font-mono font-bold text-text-primary outline-none"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCodeCutId(r.id);
                                        setEditingCodeValue(r.product_code || '');
                                      }}
                                      className="font-mono text-[10px] font-black text-brand-400 bg-surface-app hover:bg-brand-500/10 px-1.5 py-0.2 rounded border border-border-subtle hover:border-brand-500/40 transition-colors cursor-pointer"
                                      title="Click to map / change product code number"
                                    >
                                      {r.product_code || 'Map Code'}
                                    </button>
                                  )}

                                  {/* Unit Selector: Kg | Unit | Both */}
                                  <div className="flex items-center gap-0.5 ml-1 bg-surface-app p-0.5 rounded-lg border border-border-subtle">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (currentUnitType !== 'weight') {
                                          updateProductMutation.mutate({
                                            id: r.variant_id,
                                            fields: { unit_type: 'weight' }
                                          });
                                        }
                                      }}
                                      className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase transition-all ${
                                        currentUnitType === 'weight'
                                          ? 'bg-brand-500 text-white shadow-sm'
                                          : 'text-text-muted hover:text-text-primary'
                                      }`}
                                      title="Mark cut as weight (Kg)"
                                    >
                                      Kg
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (currentUnitType !== 'piece') {
                                          updateProductMutation.mutate({
                                            id: r.variant_id,
                                            fields: { unit_type: 'piece' }
                                          });
                                        }
                                      }}
                                      className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase transition-all ${
                                        currentUnitType === 'piece'
                                          ? 'bg-brand-500 text-white shadow-sm'
                                          : 'text-text-muted hover:text-text-primary'
                                      }`}
                                      title="Mark cut as count/piece (Unit)"
                                    >
                                      Unit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (currentUnitType !== 'live_dual') {
                                          updateProductMutation.mutate({
                                            id: r.variant_id,
                                            fields: { unit_type: 'live_dual' }
                                          });
                                        }
                                      }}
                                      className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase transition-all ${
                                        currentUnitType === 'live_dual'
                                          ? 'bg-brand-500 text-white shadow-sm'
                                          : 'text-text-muted hover:text-text-primary'
                                      }`}
                                      title="Mark cut as dual (Both Kg & Unit)"
                                    >
                                      Both
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Right: Editable Yield Grams & Delete */}
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex items-center gap-1.5 bg-surface-card px-2 py-1 rounded-lg border border-border-subtle">
                                <span className="text-[10px] text-text-muted uppercase font-bold">Yield:</span>
                                <input
                                  type="number"
                                  defaultValue={r.grams_per_kg_live}
                                  onBlur={(e) => {
                                    const val = Number(e.target.value);
                                    if (!isNaN(val) && val >= 0 && val !== r.grams_per_kg_live) {
                                      setRatioMutation.mutate({
                                        animal_key: activeKey,
                                        product_id: r.product_id,
                                        variant_id: r.variant_id,
                                        role: r.role,
                                        grams_per_kg_live: val,
                                      });
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  className="w-16 bg-surface-app border border-border-subtle rounded px-1.5 py-0.5 text-xs font-mono font-bold text-brand-400 text-right outline-none focus:border-brand-500"
                                />
                                <span className="text-[11px] font-mono text-text-muted">
                                  {currentUnitType === 'piece' ? 'unit' : 'g/kg'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Remove ${r.product_name} ratio cut from ${currentAnimal.display_name}?`)) {
                                    deleteRatioMutation.mutate(r.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                title="Delete cut"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-xs text-text-muted">
                Select an animal from the left to configure settings and cut ratios.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border-subtle bg-surface-panel/50">
          <span className="text-[11px] text-text-muted">
            All changes update inventory calculations, POS products, and shed display in real-time.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-panel hover:bg-surface-hover border border-border-subtle text-text-primary text-xs font-bold transition-all shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnimalManagementModal;
