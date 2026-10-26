import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Phone,
  User,
  MapPin,
  DollarSign,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Package,
  AlertTriangle,
  CreditCard,
  Banknote,
  Wallet,
  ArrowRight,
  RotateCcw,
  History,
  Navigation,
} from 'lucide-react';
import {
  useDeliveries,
  useUpdateDeliveryStatus,
  useMarkDelivered,
  useMarkPaymentReceived,
} from '../hooks/useDelivery';
import { DeliveryOrder } from '../../types/delivery.types';
import { formatMoney } from '../../../../core/shared/math';

type TabKey = 'today_open' | 'payment_pending' | 'closed_today' | 'history';

const getTodayIso = (): string => new Date().toISOString().slice(0, 10);

const shiftDateIso = (dateStr: string, deltaDays: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  return dt.toISOString().slice(0, 10);
};

const formatDisplayDate = (dateStr: string): string => {
  const today = getTodayIso();
  const yesterday = shiftDateIso(today, -1);
  const tomorrow = shiftDateIso(today, 1);
  const [y, m, d] = dateStr.split('-').map(Number);
  const formatted = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (dateStr === today) return `Today — ${formatted}`;
  if (dateStr === yesterday) return `Yesterday — ${formatted}`;
  if (dateStr === tomorrow) return `Tomorrow — ${formatted}`;
  return formatted;
};

export const DeliveryManagementView: React.FC = () => {
  const todayIso = getTodayIso();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [activeTab, setActiveTab] = useState<TabKey>('today_open');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Daily query: only fetches records for selectedDate on initial open (never dumps all 34 historical rows by default)
  const dailyFilters = useMemo(
    () => ({
      startDate: selectedDate,
      endDate: selectedDate,
    }),
    [selectedDate]
  );

  const {
    data: dailyDeliveries = [],
    isLoading: isDailyLoading,
    isError: isDailyError,
    error: dailyError,
    refetch: refetchDaily,
    isFetching: isDailyFetching,
  } = useDeliveries(dailyFilters);

  // History query: only enabled when user switches to 'History (All Dates)' tab
  const {
    data: historyDeliveries = [],
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
    refetch: refetchHistory,
    isFetching: isHistoryFetching,
  } = useDeliveries(activeTab === 'history' ? {} : dailyFilters);

  const queryClient = useQueryClient();
  const updateStatusMutation = useUpdateDeliveryStatus();
  const markDeliveredMutation = useMarkDelivered();
  const markPaymentReceivedMutation = useMarkPaymentReceived();

  const isMutating =
    updateStatusMutation.isPending ||
    markDeliveredMutation.isPending ||
    markPaymentReceivedMutation.isPending;

  const handleRefresh = async () => {
    setActionError(null);
    await queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    await queryClient.invalidateQueries({ queryKey: ['delivery-stats'] });
    if (activeTab === 'history') {
      refetchHistory();
    } else {
      refetchDaily();
    }
  };

  // Categorize daily deliveries for the 3 daily operational tabs
  const categorizedDaily = useMemo(() => {
    const todayOpen: DeliveryOrder[] = [];
    const paymentPending: DeliveryOrder[] = [];
    const closedToday: DeliveryOrder[] = [];

    for (const d of dailyDeliveries) {
      const isDelivered = Boolean(d.delivered === 1 || d.status === 'delivered');
      const isOutForDelivery = d.status === 'out_for_delivery';
      const isPaid = Boolean(d.payment_received === 1 || d.payment_status === 'paid');

      if (isDelivered && isPaid) {
        closedToday.push(d);
      } else {
        if (!isDelivered) {
          todayOpen.push(d);
        }
        if ((isDelivered || isOutForDelivery) && !isPaid) {
          paymentPending.push(d);
        }
      }
    }

    return { todayOpen, paymentPending, closedToday };
  }, [dailyDeliveries]);

  const filterBySearch = (list: DeliveryOrder[]) => {
    if (!searchTerm.trim()) return list;
    const query = searchTerm.toLowerCase().trim();
    return list.filter((d) => {
      const matchesBill =
        (d.invoice_number || '').toLowerCase().includes(query) ||
        (d.delivery_number || '').toLowerCase().includes(query) ||
        String(d.id).includes(query);
      const matchesCustomer = (d.customer_name || '').toLowerCase().includes(query);
      const matchesPhone = (d.customer_phone || '').toLowerCase().includes(query);
      const matchesAddress = (d.delivery_address_snapshot || '').toLowerCase().includes(query);
      const matchesItems = (d.items_summary || '').toLowerCase().includes(query);
      return matchesBill || matchesCustomer || matchesPhone || matchesAddress || matchesItems;
    });
  };

  const activeList = useMemo((): DeliveryOrder[] => {
    switch (activeTab) {
      case 'today_open':
        return filterBySearch(categorizedDaily.todayOpen);
      case 'payment_pending':
        return filterBySearch(categorizedDaily.paymentPending);
      case 'closed_today':
        return filterBySearch(categorizedDaily.closedToday);
      case 'history':
        return filterBySearch(historyDeliveries);
      default:
        return [];
    }
  }, [activeTab, categorizedDaily, historyDeliveries, searchTerm]);

  const isLoading = activeTab === 'history' ? isHistoryLoading : isDailyLoading;
  const isError = activeTab === 'history' ? isHistoryError : isDailyError;
  const errorObj = activeTab === 'history' ? historyError : dailyError;
  const isFetching = activeTab === 'history' ? isHistoryFetching : isDailyFetching;

  // Status Progression Handlers
  const handleSetOpen = async (delivery: DeliveryOrder) => {
    setActionError(null);
    try {
      await updateStatusMutation.mutateAsync({
        id: delivery.id,
        status: 'pending',
        notes: 'Reset to Open',
      });
    } catch (err: any) {
      setActionError(err?.message || 'Failed to set order to Open');
    }
  };

  const handleSetOutForDelivery = async (delivery: DeliveryOrder) => {
    setActionError(null);
    try {
      await updateStatusMutation.mutateAsync({
        id: delivery.id,
        status: 'out_for_delivery',
        notes: 'Dispatched Out for Delivery',
      });
    } catch (err: any) {
      setActionError(err?.message || 'Failed to mark Out for Delivery');
    }
  };

  const handleSetDelivered = async (delivery: DeliveryOrder, nextDelivered = true) => {
    setActionError(null);
    try {
      await markDeliveredMutation.mutateAsync({
        deliveryId: delivery.id,
        isDelivered: nextDelivered,
      });
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update Delivered status');
    }
  };

  const handleSetPaymentCollected = async (delivery: DeliveryOrder, nextPaid = true) => {
    setActionError(null);
    try {
      await markPaymentReceivedMutation.mutateAsync({
        deliveryId: delivery.id,
        isPaid: nextPaid,
      });
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update Payment Collected status');
    }
  };

  const handleCloseOrder = async (delivery: DeliveryOrder) => {
    setActionError(null);
    try {
      const isDelivered = Boolean(delivery.delivered === 1 || delivery.status === 'delivered');
      const isPaid = Boolean(delivery.payment_received === 1 || delivery.payment_status === 'paid');
      if (!isDelivered) {
        await markDeliveredMutation.mutateAsync({ deliveryId: delivery.id, isDelivered: true });
      }
      if (!isPaid) {
        await markPaymentReceivedMutation.mutateAsync({ deliveryId: delivery.id, isPaid: true });
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to close delivery order');
    }
  };

  const handleReopenOrder = async (delivery: DeliveryOrder) => {
    setActionError(null);
    try {
      await markDeliveredMutation.mutateAsync({ deliveryId: delivery.id, isDelivered: false });
      await markPaymentReceivedMutation.mutateAsync({ deliveryId: delivery.id, isPaid: false });
    } catch (err: any) {
      setActionError(err?.message || 'Failed to reopen delivery order');
    }
  };

  const tabs: {
    key: TabKey;
    label: string;
    count: number | string;
    color: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'today_open',
      label: 'Today Open',
      count: categorizedDaily.todayOpen.length,
      color: 'amber',
      icon: <Clock size={15} />,
    },
    {
      key: 'payment_pending',
      label: 'Payment Pending',
      count: categorizedDaily.paymentPending.length,
      color: 'blue',
      icon: <Wallet size={15} />,
    },
    {
      key: 'closed_today',
      label: 'Closed Today',
      count: categorizedDaily.closedToday.length,
      color: 'emerald',
      icon: <CheckCircle2 size={15} />,
    },
    {
      key: 'history',
      label: 'History (All Dates)',
      count: activeTab === 'history' ? historyDeliveries.length : 'All',
      color: 'gray',
      icon: <History size={15} />,
    },
  ];

  const getPaymentMethodIcon = (method?: string) => {
    switch (method?.toLowerCase()) {
      case 'upi':
        return <Wallet size={12} className="text-purple-400" />;
      case 'card':
        return <CreditCard size={12} className="text-blue-400" />;
      default:
        return <Banknote size={12} className="text-emerald-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-base text-text-primary overflow-hidden p-4 sm:p-6 gap-4">
      {/* Top Header + Prominent Daily Date Navigator */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-500 shrink-0">
            <Truck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-text-primary tracking-tight">
                Delivery Operations
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-brand-500/15 text-brand-400 border border-brand-500/30">
                {activeTab === 'history' ? 'All Dates Archive' : formatDisplayDate(selectedDate)}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Open → Out for Delivery → Delivered → Payment Collected → Closed
            </p>
          </div>
        </div>

        {/* Date Picker & Quick Day Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-surface-card border border-border-subtle rounded-xl p-1 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setSelectedDate((prev) => shiftDateIso(prev, -1));
                if (activeTab === 'history') setActiveTab('today_open');
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-extrabold text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft size={14} />
              <span>◀ Prev Day</span>
            </button>

            <div className="relative flex items-center px-2 border-x border-border-subtle">
              <Calendar size={13} className="text-brand-500 mr-1.5 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(e.target.value);
                    if (activeTab === 'history') setActiveTab('today_open');
                  }
                }}
                aria-label="Delivery operation date"
                className="bg-transparent text-xs font-black text-text-primary outline-none cursor-pointer font-mono"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedDate(todayIso);
                if (activeTab === 'history') setActiveTab('today_open');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                selectedDate === todayIso && activeTab !== 'history'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-brand-400 hover:bg-brand-500/15'
              }`}
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedDate((prev) => shiftDateIso(prev, 1));
                if (activeTab === 'history') setActiveTab('today_open');
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-extrabold text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
              title="Next Day"
            >
              <span>Next Day ▶</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-xl text-xs font-bold text-text-secondary cursor-pointer transition-colors shadow-xs"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-[11px] underline hover:text-red-300 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Operational Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-surface-card border border-border-subtle rounded-2xl p-1.5 shrink-0 shadow-xs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const colorMap: Record<string, string> = {
            amber: isActive
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'text-text-muted hover:text-amber-400 hover:bg-amber-500/10',
            blue: isActive
              ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
              : 'text-text-muted hover:text-blue-400 hover:bg-blue-500/10',
            emerald: isActive
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'text-text-muted hover:text-emerald-400 hover:bg-emerald-500/10',
            gray: isActive
              ? 'bg-surface-hover border-border-subtle text-text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-hover',
          };
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                isActive ? colorMap[tab.color] : `border-transparent ${colorMap[tab.color]}`
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                className={`ml-0.5 text-[11px] font-black px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-white/15' : 'bg-surface-app'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="p-3 bg-surface-card border border-border-subtle rounded-2xl flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
        <div className="flex-1 min-w-[220px] relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Bill No, Customer Name, Phone, Delivery Address, or Items..."
            className="w-full pl-9 pr-3 py-2 bg-surface-app border border-border-subtle rounded-xl text-xs font-semibold text-text-primary outline-none focus:border-brand-500"
          />
        </div>
        <div className="text-xs font-bold text-text-muted">
          Showing <span className="text-text-primary font-black">{activeList.length}</span> order
          {activeList.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Delivery Order Cards List */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-text-muted">
            <RefreshCw size={24} className="animate-spin text-brand-500" />
            <p className="text-sm font-bold text-text-secondary">Loading delivery orders...</p>
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <AlertTriangle size={36} className="text-red-400 mb-2" />
            <p className="text-sm font-bold text-red-400">Failed to load delivery orders</p>
            <p className="text-xs text-text-muted mt-1 max-w-md">
              {(errorObj as any)?.message || 'An unexpected error occurred while fetching deliveries.'}
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              className="mt-4 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold cursor-pointer"
            >
              Retry Now
            </button>
          </div>
        ) : activeList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted bg-surface-card/40 border border-dashed border-border-subtle rounded-2xl">
            <Truck size={40} className="opacity-25 mb-3" />
            <p className="text-base font-extrabold text-text-secondary">
              {activeTab === 'today_open'
                ? `No open deliveries for ${selectedDate === todayIso ? 'today' : selectedDate}`
                : activeTab === 'payment_pending'
                ? `No deliveries awaiting payment for ${selectedDate === todayIso ? 'today' : selectedDate}`
                : activeTab === 'closed_today'
                ? `No closed deliveries for ${selectedDate === todayIso ? 'today' : selectedDate}`
                : 'No historical delivery orders match your search'}
            </p>
            <p className="text-xs text-text-muted mt-1 max-w-md">
              {activeTab !== 'history'
                ? 'Use ◀ Prev Day / Next Day ▶ to inspect another date, or switch to History (All Dates) to search across all past deliveries.'
                : 'Try clearing your search term to view all past delivery orders.'}
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {activeList.map((delivery) => {
              const isOutForDelivery = delivery.status === 'out_for_delivery';
              const isDelivered = Boolean(
                delivery.delivered === 1 || delivery.status === 'delivered'
              );
              const isPaid = Boolean(
                delivery.payment_received === 1 || delivery.payment_status === 'paid'
              );
              const isClosed = isDelivered && isPaid;

              const billRef =
                delivery.invoice_number?.split('_')[0] ||
                delivery.invoice_number ||
                delivery.delivery_number ||
                `#${delivery.id}`;

              const deliveryDateLabel =
                delivery.requested_date ||
                (delivery.created_at ? delivery.created_at.slice(0, 10) : selectedDate);

              // Current Delivery Status badge config
              const deliveryBadge = isClosed
                ? {
                    label: 'Closed',
                    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                    icon: <CheckCircle2 size={12} />,
                  }
                : isDelivered
                ? {
                    label: 'Delivered',
                    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                    icon: <CheckCircle2 size={12} />,
                  }
                : isOutForDelivery
                ? {
                    label: 'Out for Delivery',
                    cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
                    icon: <Navigation size={12} />,
                  }
                : {
                    label: 'Open',
                    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                    icon: <Clock size={12} />,
                  };

              // Payment Status badge config
              const paymentBadge = isPaid
                ? {
                    label: 'Payment Collected',
                    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                  }
                : {
                    label: 'Payment Pending',
                    cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                  };

              return (
                <div
                  key={delivery.id}
                  className={`bg-surface-card border-2 rounded-2xl p-4 sm:p-5 shadow-xs transition-all ${
                    isClosed
                      ? 'border-emerald-500/25 opacity-85'
                      : isDelivered
                      ? 'border-blue-500/30'
                      : isOutForDelivery
                      ? 'border-purple-500/30'
                      : 'border-amber-500/30'
                  }`}
                >
                  {/* Top Row: Bill No, Customer Name & Phone, Status Badges, Total Amount */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border-subtle/60">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-black ${
                          isClosed
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : isDelivered
                            ? 'bg-blue-500/15 text-blue-400'
                            : isOutForDelivery
                            ? 'bg-purple-500/15 text-purple-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {isClosed ? (
                          <CheckCircle2 size={22} />
                        ) : isOutForDelivery ? (
                          <Navigation size={22} />
                        ) : (
                          <Truck size={22} />
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-brand-400 text-base tracking-tight">
                            Bill #{billRef}
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-text-muted px-2 py-0.5 rounded-md bg-surface-app">
                            {deliveryDateLabel}
                            {delivery.created_at
                              ? ` • ${new Date(delivery.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`
                              : ''}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1.5 text-sm font-extrabold text-text-primary">
                            <User size={14} className="text-brand-500 shrink-0" />
                            <span>{delivery.customer_name || 'Walk-in / Home Delivery'}</span>
                          </div>
                          {delivery.customer_phone && (
                            <div className="flex items-center gap-1 font-mono text-xs font-bold text-text-secondary bg-surface-app px-2 py-0.5 rounded-lg border border-border-subtle">
                              <Phone size={12} className="text-emerald-400 shrink-0" />
                              <span>{delivery.customer_phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side: Status Badges & Big Amount */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold border ${deliveryBadge.cls}`}
                        >
                          {deliveryBadge.icon}
                          <span>{deliveryBadge.label}</span>
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold border ${paymentBadge.cls}`}
                        >
                          <DollarSign size={12} />
                          <span>{paymentBadge.label}</span>
                        </span>
                      </div>

                      <div className="text-right flex items-baseline gap-2 sm:mt-1">
                        <span className="font-mono font-black text-xl text-text-primary">
                          {formatMoney(delivery.total_paise || 0)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-text-muted uppercase">
                          {getPaymentMethodIcon(delivery.payment_method)}
                          {delivery.payment_method || 'CASH'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Delivery Address & Items Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-3 border-b border-border-subtle/60">
                    <div className="flex items-start gap-2 bg-surface-app/60 p-2.5 rounded-xl border border-border-subtle/50">
                      <MapPin size={15} className="text-brand-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
                          Delivery Address
                        </div>
                        <div className="text-xs font-semibold text-text-primary mt-0.5 break-words">
                          {delivery.delivery_address_snapshot || (
                            <span className="italic text-text-muted">No delivery address provided</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 bg-surface-app/60 p-2.5 rounded-xl border border-border-subtle/50">
                      <Package size={15} className="text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
                          Items Summary
                        </div>
                        <div className="text-xs font-bold text-text-primary mt-0.5 break-words">
                          {delivery.items_summary || 'Items as per bill #' + billRef}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Clear Status Progression Action Buttons */}
                  {/* Open -> Out for Delivery -> Delivered -> Payment Collected -> Closed */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Step 1: Open */}
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => handleSetOpen(delivery)}
                        className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          !isOutForDelivery && !isDelivered
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-surface-app text-text-muted border-border-subtle hover:text-text-primary'
                        }`}
                      >
                        1. Open
                      </button>

                      <ArrowRight size={13} className="text-text-muted shrink-0" />

                      {/* Step 2: Out for Delivery */}
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => handleSetOutForDelivery(delivery)}
                        className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          isOutForDelivery && !isDelivered
                            ? 'bg-purple-500/25 text-purple-300 border-purple-500/50 shadow-xs'
                            : !isOutForDelivery && !isDelivered
                            ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shadow-xs'
                            : 'bg-surface-app text-text-muted border-border-subtle hover:text-text-primary'
                        }`}
                      >
                        2. Out for Delivery
                      </button>

                      <ArrowRight size={13} className="text-text-muted shrink-0" />

                      {/* Step 3: Delivered */}
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => handleSetDelivered(delivery, !isDelivered)}
                        className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          isDelivered
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : isOutForDelivery
                            ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-xs'
                            : 'bg-surface-app text-text-secondary border-border-subtle hover:border-blue-500/40'
                        }`}
                      >
                        {isDelivered ? '✓ 3. Delivered' : '3. Mark Delivered'}
                      </button>

                      <ArrowRight size={13} className="text-text-muted shrink-0" />

                      {/* Step 4: Payment Collected */}
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => handleSetPaymentCollected(delivery, !isPaid)}
                        className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          isPaid
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : isDelivered
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-xs'
                            : 'bg-surface-app text-text-secondary border-border-subtle hover:border-emerald-500/40'
                        }`}
                      >
                        {isPaid ? '✓ 4. Payment Collected' : '4. Collect Payment'}
                      </button>

                      <ArrowRight size={13} className="text-text-muted shrink-0" />

                      {/* Step 5: Closed */}
                      {isClosed ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-emerald-500/25 text-emerald-300 border border-emerald-500/40">
                          <CheckCircle2 size={14} /> 5. Closed
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => handleCloseOrder(delivery)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 transition-all cursor-pointer"
                        >
                          <CheckCircle2 size={14} /> 5. Complete & Close
                        </button>
                      )}
                    </div>

                    {isClosed && (
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => handleReopenOrder(delivery)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all cursor-pointer"
                      >
                        <RotateCcw size={13} /> Reopen
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryManagementView;