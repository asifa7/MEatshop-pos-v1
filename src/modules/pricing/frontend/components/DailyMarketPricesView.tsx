import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  Save,
  Egg,
  Drumstick,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Sliders,
  History,
  Trash2,
  Plus,
  ExternalLink,
  Check,
} from 'lucide-react';
import type { DailyMarketPrice, EggMarketPrice } from '../../../../core/types/enterprise_types';
import { formatMoney, paiseToRupees, rupeesToPaise } from '../../../../core/shared/math';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

export default function DailyMarketPricesView() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'prices' | 'sources' | 'logs'>('prices');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Chicken Price Manual Form State
  const [selectedVariantId, setSelectedVariantId] = useState<number | ''>('');
  const [productName, setProductName] = useState('CHICKEN DRESSED');
  const [marketRate, setMarketRate] = useState('220');
  const [wholesaleRate, setWholesaleRate] = useState('240');
  const [retailRate, setRetailRate] = useState('265');
  const [sellingRate, setSellingRate] = useState('265');

  // Egg Price Form State
  const [eggType, setEggType] = useState<'Country' | 'Farm' | 'Brown' | 'Duck'>('Farm');
  const [trayPrice, setTrayPrice] = useState('180');
  const [singlePrice, setSinglePrice] = useState('7');

  // New Source Modal / Form State
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceRule, setNewSourceRule] = useState('(\\d{2,3}(?:\\.\\d{1,2})?)');
  const [newSourceSchedule, setNewSourceSchedule] = useState('07:00');
  const [newSourceVariantId, setNewSourceVariantId] = useState<number | ''>('');
  const [newSourceAutoApply, setNewSourceAutoApply] = useState(false);

  // Queries
  const { data: chickenPrices = [], refetch: refetchPrices } = useQuery<any[]>({
    queryKey: ['market-prices', 'chicken'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.GET_CHICKEN_PRICES);
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: eggPrices = [] } = useQuery<EggMarketPrice[]>({
    queryKey: ['market-prices', 'eggs'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.GET_EGG_PRICES);
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: sources = [], refetch: refetchSources } = useQuery<any[]>({
    queryKey: ['market-prices', 'sources'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.GET_SOURCES);
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: fetchLogs = [], refetch: refetchLogs } = useQuery<any[]>({
    queryKey: ['market-prices', 'fetch-logs'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.GET_FETCH_LOGS, { limit: 25 });
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  // Fetch real catalogue variants
  const { data: variants = [] } = useQuery<any[]>({
    queryKey: ['catalogue', 'variants'],
    queryFn: async () => {
      const res = await window.api.invoke('products:get-variants');
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  // Sync selected variant default
  React.useEffect(() => {
    if (!selectedVariantId && variants.length > 0) {
      const dressed = variants.find((v: any) => v.variant_name.toUpperCase().includes('DRESSED')) || variants[0];
      setSelectedVariantId(dressed.id);
      setProductName(dressed.variant_name);
      if (dressed.current_rate_paise_per_unit) {
        setSellingRate(String(paiseToRupees(dressed.current_rate_paise_per_unit)));
      }
    }
  }, [variants, selectedVariantId]);

  // Mutations
  const fetchNowMutation = useMutation({
    mutationFn: async (sourceId: number | void = undefined) => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.FETCH_NOW, { sourceId });
      if (!res?.success) throw new Error(res?.error?.message || 'Fetch failed');
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Market prices fetched from online sources!' });
      refetchSources();
      refetchPrices();
      refetchLogs();
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.message || 'Network fetch timeout. Using offline manual rate.' });
    },
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async ({ sourceId, ratePaise }: { sourceId: number; ratePaise?: number }) => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.APPLY_SUGGESTION, { sourceId, ratePaise });
      if (!res?.success) throw new Error(res?.error?.message || 'Apply failed');
      return res.data;
    },
    onSuccess: (data) => {
      setFeedback({
        type: 'success',
        message: `Applied suggested rate ₹${formatMoney(paiseToRupees(data.appliedRatePaise))} to catalogue!`,
      });
      refetchPrices();
      refetchSources();
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.message || 'Failed to apply rate.' });
    },
  });

  const saveChickenPriceMutation = useMutation({
    mutationFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.SET_CHICKEN_PRICE, {
        product_variant_id: selectedVariantId || undefined,
        product_name: productName,
        market_rate_paise: rupeesToPaise(parseFloat(marketRate) || 0),
        wholesale_rate_paise: rupeesToPaise(parseFloat(wholesaleRate) || 0),
        retail_rate_paise: rupeesToPaise(parseFloat(retailRate) || 0),
        selling_rate_paise: rupeesToPaise(parseFloat(sellingRate) || 0),
      });
      if (!res?.success) throw new Error(res?.error?.message || 'Save failed');
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Manual market price updated & synced with POS catalogue!' });
      refetchPrices();
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.message || 'Save failed.' });
    },
  });

  const saveEggPriceMutation = useMutation({
    mutationFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.SET_EGG_PRICE, {
        egg_type: eggType,
        tray_price_paise: rupeesToPaise(parseFloat(trayPrice) || 0),
        single_price_paise: rupeesToPaise(parseFloat(singlePrice) || 0),
      });
      if (!res?.success) throw new Error(res?.error?.message || 'Save failed');
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Egg prices updated!' });
      queryClient.invalidateQueries({ queryKey: ['market-prices', 'eggs'] });
      setTimeout(() => setFeedback(null), 4000);
    },
  });

  const saveSourceMutation = useMutation({
    mutationFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.SAVE_SOURCE, {
        name: newSourceName.trim(),
        source_url: newSourceUrl.trim(),
        parser_rule: newSourceRule.trim(),
        schedule_time: newSourceSchedule.trim(),
        product_variant_id: newSourceVariantId || undefined,
        auto_apply: newSourceAutoApply ? 1 : 0,
      });
      if (!res?.success) throw new Error(res?.error?.message || 'Failed saving source');
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Price source configured!' });
      setIsAddSourceOpen(false);
      setNewSourceName('');
      setNewSourceUrl('');
      refetchSources();
      setTimeout(() => setFeedback(null), 4000);
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.MARKET_PRICES.DELETE_SOURCE, { id });
      if (!res?.success) throw new Error(res?.error?.message);
      return res.data;
    },
    onSuccess: () => {
      refetchSources();
    },
  });

  return (
    <div className="flex flex-col h-full bg-surface-app text-text-primary p-4 sm:p-6 overflow-hidden gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-subtle pb-3 gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black font-outfit text-text-primary flex items-center gap-2">
            <TrendingUp className="text-emerald-500" size={24} />
            <span>Daily Market Prices & Auto-Fetch Engine</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Automatic web/API price fetch with offline fallback. Applied rates sync directly to live POS selling rates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="inline-flex rounded-xl p-1 bg-surface-card border border-border-subtle">
            <button
              onClick={() => setActiveTab('prices')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'prices'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Daily Rates
            </button>
            <button
              onClick={() => setActiveTab('sources')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'sources'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Sources & Schedule ({sources.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                activeTab === 'logs'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Fetch History
            </button>
          </div>

          <button
            onClick={() => fetchNowMutation.mutate()}
            disabled={fetchNowMutation.isPending}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <RefreshCw size={14} className={fetchNowMutation.isPending ? 'animate-spin' : ''} />
            <span>{fetchNowMutation.isPending ? 'Fetching...' : 'Fetch Now'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Suggested Rates Notification Card (When available from online fetch) */}
      {sources.some((s: any) => s.last_fetched_paise) && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-brand-500/10 to-transparent border border-emerald-500/30 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <Sparkles size={20} />
            </div>
            <div>
              <span className="text-xs font-black text-emerald-300 uppercase tracking-wider block">
                Online Market Suggestion Ready
              </span>
              <div className="flex flex-wrap items-center gap-3 text-xs mt-0.5">
                {sources.map((src: any) => (
                  <span key={src.id} className="text-text-primary font-bold">
                    {src.name}:{' '}
                    <span className="font-mono text-emerald-400 font-black">
                      ₹{formatMoney(paiseToRupees(src.last_fetched_paise || 0))}/kg
                    </span>{' '}
                    <span className="text-[10px] text-text-muted">
                      ({src.last_fetched_at ? new Date(src.last_fetched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sources.map((src: any) => (
              <button
                key={src.id}
                onClick={() => applySuggestionMutation.mutate({ sourceId: src.id })}
                disabled={applySuggestionMutation.isPending}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Check size={14} />
                <span>Apply {src.name.split(' ')[0]} Rate</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab 1: Daily Rates Setter & Current Matrix */}
      {activeTab === 'prices' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 overflow-y-auto">
          {/* Left Column: Update Poultry Rates */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <h3 className="text-xs uppercase font-black tracking-wider text-text-primary flex items-center gap-2">
                  <Drumstick size={18} className="text-emerald-500" />
                  <span>Update Meat & Chicken Catalogue Rate</span>
                </h3>
                <span className="text-[11px] font-mono text-text-muted font-bold">
                  {new Date().toISOString().slice(0, 10)}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase">Linked Catalogue Item *</label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setSelectedVariantId(id);
                      const matched = variants.find((v: any) => v.id === id);
                      if (matched) {
                        setProductName(matched.variant_name);
                        if (matched.current_rate_paise_per_unit) {
                          setSellingRate(String(paiseToRupees(matched.current_rate_paise_per_unit)));
                        }
                      }
                    }}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-bold text-text-primary focus:outline-none focus:border-emerald-500"
                  >
                    {variants.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.variant_name} (Current: ₹{formatMoney(paiseToRupees(v.current_rate_paise_per_unit || 0))})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-text-muted uppercase">Market Buy Cost (₹/kg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={marketRate}
                      onChange={(e) => setMarketRate(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-mono font-bold text-text-primary focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-text-muted uppercase">Wholesale Rate (₹/kg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={wholesaleRate}
                      onChange={(e) => setWholesaleRate(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-mono font-bold text-text-primary focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-text-muted uppercase">Retail Counter Rate (₹/kg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={retailRate}
                      onChange={(e) => setRetailRate(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-mono font-bold text-text-primary focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-emerald-400 uppercase font-black">
                      POS Live Selling Rate (₹/kg) *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={sellingRate}
                      onChange={(e) => setSellingRate(e.target.value)}
                      className="w-full bg-surface-card border-2 border-emerald-500/60 rounded-xl px-3 py-2 mt-1 font-mono font-black text-emerald-400 text-base focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={saveChickenPriceMutation.isPending}
                  onClick={() => saveChickenPriceMutation.mutate()}
                  className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Save size={18} />
                  <span>
                    {saveChickenPriceMutation.isPending
                      ? 'Updating...'
                      : `Set ${productName} Selling Rate to ₹${sellingRate}/kg`}
                  </span>
                </button>
              </div>
            </div>

            {/* Egg Rate Card */}
            <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                <h3 className="text-xs uppercase font-black tracking-wider text-text-primary flex items-center gap-2">
                  <Egg size={18} className="text-amber-400" />
                  <span>Egg Tray & Single Rates</span>
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase">Egg Variety</label>
                  <select
                    value={eggType}
                    onChange={(e: any) => setEggType(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-bold text-text-primary"
                  >
                    <option value="Farm">Farm (White)</option>
                    <option value="Country">Country (Nattu Kozhi)</option>
                    <option value="Brown">Brown</option>
                    <option value="Duck">Duck</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase">Tray Rate (₹30 pcs)</label>
                  <input
                    type="number"
                    value={trayPrice}
                    onChange={(e) => setTrayPrice(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-mono font-bold text-text-primary"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-text-muted uppercase">Single Rate (₹)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={singlePrice}
                    onChange={(e) => setSinglePrice(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-mono font-bold text-text-primary"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => saveEggPriceMutation.mutate()}
                className="py-2.5 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Save size={15} />
                <span>Save {eggType} Egg Rates</span>
              </button>
            </div>
          </div>

          {/* Right Column: Today's Active Rate Cards & Catalogue Sync */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 shadow-sm flex flex-col flex-1">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3 mb-3">
                <h3 className="text-xs uppercase font-black tracking-wider text-text-primary flex items-center gap-2">
                  <Sliders size={18} className="text-brand-400" />
                  <span>Catalogue Meat Rates Live on Billing Counter</span>
                </h3>
              </div>

              <div className="space-y-2.5 overflow-y-auto flex-1">
                {chickenPrices.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-3 bg-surface-card border border-border-subtle rounded-xl flex items-center justify-between gap-3 hover:border-emerald-500/40 transition-all"
                  >
                    <div>
                      <span className="text-sm font-black text-text-primary block">
                        {item.catalogue_variant_name || item.product_name}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                        <span>Cost: ₹{formatMoney(paiseToRupees(item.market_rate_paise))}/kg</span>
                        <span>•</span>
                        <span>Wholesale: ₹{formatMoney(paiseToRupees(item.wholesale_rate_paise))}/kg</span>
                        {item.source_name && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400 font-bold">{item.source_name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black font-mono text-emerald-400">
                        ₹{formatMoney(paiseToRupees(item.selling_rate_paise))}/kg
                      </span>
                      <span className="text-[10px] text-text-muted block leading-none mt-0.5">
                        {item.date}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Sources & Schedule Settings */}
      {activeTab === 'sources' && (
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Add web URLs or API endpoints that publish daily market broiler/chicken rates. Configure regex rules and schedule times (e.g. 07:00 AM).
            </p>
            <button
              onClick={() => setIsAddSourceOpen(true)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={14} />
              <span>+ Add Price Feed Source</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sources.map((src: any) => (
              <div
                key={src.id}
                className="bg-surface-panel border border-border-subtle rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-text-primary flex items-center gap-1.5">
                      <Globe size={16} className="text-emerald-400" />
                      <span>{src.name}</span>
                    </h4>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                        src.last_status === 'success'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : src.last_status === 'error'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          : 'bg-surface-card text-text-muted'
                      }`}
                    >
                      {src.last_status}
                    </span>
                  </div>

                  <p className="text-xs font-mono text-text-muted truncate mt-1">{src.source_url}</p>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] bg-surface-card p-2 rounded-xl border border-border-subtle">
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-bold">Target Item</span>
                      <span className="font-bold text-text-primary">
                        {src.variant_display_name || src.product_name}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-bold">Schedule / Auto</span>
                      <span className="font-bold text-text-primary">
                        {src.schedule_time} {src.auto_apply ? '• Auto Apply ON' : '• Manual Apply'}
                      </span>
                    </div>
                  </div>

                  {src.last_fetched_paise && (
                    <div className="mt-2 text-xs flex items-center justify-between">
                      <span className="text-text-muted">Last Fetched Rate:</span>
                      <span className="font-mono font-black text-emerald-400 text-sm">
                        ₹{formatMoney(paiseToRupees(src.last_fetched_paise))}/kg
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border-subtle pt-2">
                  <button
                    onClick={() => applySuggestionMutation.mutate({ sourceId: src.id })}
                    disabled={!src.last_fetched_paise || applySuggestionMutation.isPending}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-sm"
                  >
                    <Check size={13} />
                    <span>Apply to Catalogue</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fetchNowMutation.mutate(src.id)}
                      disabled={fetchNowMutation.isPending}
                      className="p-1.5 hover:bg-surface-hover rounded-lg text-text-muted hover:text-text-primary"
                      title="Fetch This Source"
                    >
                      <RefreshCw size={14} className={fetchNowMutation.isPending ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => deleteSourceMutation.mutate(src.id)}
                      className="p-1.5 hover:bg-rose-500/10 rounded-lg text-text-muted hover:text-rose-400"
                      title="Delete Source"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Source Modal */}
          {isAddSourceOpen && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-surface-panel border border-border-subtle rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                <h3 className="text-base font-black text-text-primary">Configure Online Price Feed Source</h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-text-muted uppercase">Feed Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Broiler Rate Chennai Feed"
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 text-text-primary"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-text-muted uppercase">Website URL / API Endpoint *</label>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={newSourceUrl}
                      onChange={(e) => setNewSourceUrl(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 text-text-primary font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-text-muted uppercase">Regex / Parser Rule</label>
                    <input
                      type="text"
                      placeholder="(\d{2,3}(?:\.\d{1,2})?)"
                      value={newSourceRule}
                      onChange={(e) => setNewSourceRule(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 text-text-primary font-mono text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-text-muted uppercase">Target Variant</label>
                      <select
                        value={newSourceVariantId}
                        onChange={(e) => setNewSourceVariantId(Number(e.target.value) || '')}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 text-text-primary font-bold"
                      >
                        <option value="">-- Auto-Detect --</option>
                        {variants.map((v: any) => (
                          <option key={v.id} value={v.id}>
                            {v.variant_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-text-muted uppercase">Daily Schedule Time</label>
                      <input
                        type="time"
                        value={newSourceSchedule}
                        onChange={(e) => setNewSourceSchedule(e.target.value)}
                        className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 text-text-primary font-bold"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-2 cursor-pointer font-bold text-text-primary">
                    <input
                      type="checkbox"
                      checked={newSourceAutoApply}
                      onChange={(e) => setNewSourceAutoApply(e.target.checked)}
                      className="rounded accent-emerald-500 w-4 h-4"
                    />
                    <span>Automatically apply fetched rates to POS catalogue</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
                  <button
                    onClick={() => setIsAddSourceOpen(false)}
                    className="px-4 py-2 bg-surface-card hover:bg-surface-hover rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveSourceMutation.mutate()}
                    disabled={!newSourceName || !newSourceUrl || saveSourceMutation.isPending}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black"
                  >
                    Save Source
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Fetch Logs History */}
      {activeTab === 'logs' && (
        <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
          <h3 className="text-xs uppercase font-black tracking-wider text-text-muted flex items-center gap-1.5">
            <History size={16} />
            <span>Automatic & Manual Fetch Activity Log</span>
          </h3>

          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {fetchLogs.length === 0 ? (
              <div className="text-center py-12 text-text-muted text-xs">No fetch logs recorded yet.</div>
            ) : (
              fetchLogs.map((log: any) => (
                <div
                  key={log.id}
                  className="p-3 bg-surface-card border border-border-subtle rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-extrabold text-text-primary block">{log.product_name}</span>
                    <span className="text-[10px] text-text-muted font-mono">{log.fetched_at}</span>
                    {log.error_message && (
                      <span className="text-[10px] text-rose-400 block mt-0.5">{log.error_message}</span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-black text-emerald-400 text-sm">
                      {log.fetched_rate_paise > 0
                        ? `₹${formatMoney(paiseToRupees(log.fetched_rate_paise))}/kg`
                        : 'Offline Fallback'}
                    </span>
                    <span
                      className={`text-[9px] block uppercase font-bold mt-0.5 ${
                        log.applied ? 'text-emerald-400' : 'text-text-muted'
                      }`}
                    >
                      {log.applied ? 'Applied to Catalogue' : 'Suggested only'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
