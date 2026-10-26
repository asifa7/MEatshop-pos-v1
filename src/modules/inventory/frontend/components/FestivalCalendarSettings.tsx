import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Edit3,
  List,
  Grid,
  Sparkles,
} from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { formatQty } from '../../../../core/shared/math';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function FestivalCalendarSettings() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Form / Edit State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(todayStr);
  const [impactLevel, setImpactLevel] = useState<'High' | 'Normal' | 'Low' | 'Very_Low'>('Low');
  const [customMultiplier, setCustomMultiplier] = useState<string>('0.6');
  const [confidenceLevel, setConfidenceLevel] = useState<'Verified' | 'Lunar_Estimate'>('Verified');
  const [category, setCategory] = useState<string>('Fasting');
  const [notes, setNotes] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const { data: events = [], refetch: refetchEvents } = useQuery({
    queryKey: ['all-calendar-events'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.LIST_CALENDAR_EVENTS, {});
      return res.success ? (res.data || []) : [];
    },
  });

  const { data: bulkOrders = [], refetch: refetchBulk } = useQuery({
    queryKey: ['pending-bulk-orders'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_PENDING_BULK_ORDERS, {});
      return res.success ? (res.data || []) : [];
    },
  });

  // Group events by YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const ev of events) {
      const list = map.get(ev.event_date) || [];
      list.push(ev);
      map.set(ev.event_date, list);
    }
    return map;
  }, [events]);

  const handleImpactChange = (level: 'High' | 'Normal' | 'Low' | 'Very_Low') => {
    setImpactLevel(level);
    if (level === 'Very_Low') setCustomMultiplier('0.3');
    else if (level === 'Low') setCustomMultiplier('0.6');
    else if (level === 'Normal') setCustomMultiplier('1.0');
    else if (level === 'High') setCustomMultiplier('1.6');
  };

  const handleSelectDateFromCalendar = (dateStr: string) => {
    setEventDate(dateStr);
    const existingList = eventsByDate.get(dateStr);
    if (existingList && existingList.length > 0) {
      const ev = existingList[0];
      setEditingId(ev.id);
      setEventName(ev.event_name || '');
      setImpactLevel(ev.impact_level || 'Normal');
      const mult = ev.custom_multiplier ?? (ev.impact_level === 'Very_Low' ? 0.3 : ev.impact_level === 'Low' ? 0.6 : ev.impact_level === 'High' ? 1.5 : 1.0);
      setCustomMultiplier(String(mult));
      setConfidenceLevel(ev.confidence_level === 'Lunar_Estimate' ? 'Lunar_Estimate' : 'Verified');
      setCategory(ev.category || 'Festival');
      setNotes(ev.notes || '');
    } else {
      setEditingId(null);
      setEventName('');
      const dow = new Date(dateStr + 'T00:00:00').getDay();
      if (dow === 0) {
        setImpactLevel('High');
        setCustomMultiplier('1.4');
      } else if (dow === 2 || dow === 5) {
        setImpactLevel('Low');
        setCustomMultiplier('0.75');
      } else {
        setImpactLevel('Normal');
        setCustomMultiplier('1.0');
      }
      setConfidenceLevel('Verified');
      setCategory('Local / Custom');
      setNotes('');
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim() || !eventDate) return;

    const multNum = Math.min(2.0, Math.max(0.3, parseFloat(customMultiplier) || 1.0));
    const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.CREATE_CALENDAR_EVENT, {
      id: editingId || undefined,
      event_name: eventName.trim(),
      event_date: eventDate,
      impact_level: impactLevel,
      custom_multiplier: multNum,
      confidence_level: confidenceLevel,
      category,
      notes: notes.trim(),
    });

    if (res.success) {
      setEditingId(null);
      setEventName('');
      setNotes('');
      refetchEvents();
    }
  };

  const handleDeleteEvent = async (id: number) => {
    const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.DELETE_CALENDAR_EVENT, { id });
    if (res.success) {
      if (editingId === id) {
        setEditingId(null);
        setEventName('');
        setNotes('');
      }
      refetchEvents();
    }
  };

  const handleCancelBulkOrder = async (id: number) => {
    const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.CANCEL_BULK_ORDER, { id });
    if (res.success) refetchBulk();
  };

  // Calendar Grid Generation for currentMonthDate
  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDayDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{
      dateStr: string | null;
      dayNum: number | null;
      dow: number;
      events: any[];
      effectiveMultiplier: number;
      badgeLabel: string;
      colorClass: string;
    }> = [];

    for (let i = 0; i < firstDayDow; i++) {
      cells.push({
        dateStr: null,
        dayNum: null,
        dow: i,
        events: [],
        effectiveMultiplier: 1.0,
        badgeLabel: '',
        colorClass: '',
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${year}-${mStr}-${dStr}`;
      const dow = new Date(year, month, day).getDay();
      const dayEvents = eventsByDate.get(dateStr) || [];

      let mult = 1.0;
      let label = 'Normal';
      if (dayEvents.length > 0) {
        const primary = dayEvents[0];
        mult = primary.custom_multiplier ?? (
          primary.impact_level === 'Very_Low' ? 0.3 :
          primary.impact_level === 'Low' ? 0.6 :
          primary.impact_level === 'High' ? 1.5 : 1.0
        );
        label = primary.event_name;
      } else if (dow === 0) {
        mult = 1.4;
        label = 'Sunday Peak';
      } else if (dow === 2 || dow === 5) {
        mult = 0.75;
        label = dow === 2 ? 'Tue Dip' : 'Fri Dip';
      }

      let colorClass = 'bg-surface-card border-border-subtle text-text-primary';
      if (mult <= 0.4) {
        colorClass = 'bg-rose-500/15 border-rose-500/40 text-rose-500';
      } else if (mult < 0.9) {
        colorClass = 'bg-amber-500/15 border-amber-500/40 text-amber-500';
      } else if (mult >= 1.3) {
        colorClass = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500';
      }

      cells.push({
        dateStr,
        dayNum: day,
        dow,
        events: dayEvents,
        effectiveMultiplier: mult,
        badgeLabel: label,
        colorClass,
      });
    }

    return cells;
  }, [currentMonthDate, eventsByDate]);

  const filteredEvents = useMemo(() => {
    if (!searchFilter.trim()) return events;
    const q = searchFilter.toLowerCase();
    return events.filter((ev: any) =>
      (ev.event_name || '').toLowerCase().includes(q) ||
      (ev.event_date || '').includes(q) ||
      (ev.notes || '').toLowerCase().includes(q) ||
      (ev.category || '').toLowerCase().includes(q)
    );
  }, [events, searchFilter]);

  return (
    <div className="space-y-6">
      {/* Calendar Header & View Toggle */}
      <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
            <CalendarIcon className="text-brand-500" size={18} />
            <span>Tamil Nadu & Pan-India Festival & Fasting Calendar (24-Month Engine)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-500/15 text-brand-500 border border-brand-500/30">
              {events.length} Pre-loaded Dates
            </span>
          </h3>
          <p className="text-text-muted text-xs mt-0.5">
            Includes Ekadashi, Amavasya, Pournami, Pradosham, Krithigai, Purattasi, Margazhi, Aadi, Diwali, Pongal, Bakrid, Christmas, Muhurtham, Sunday Peak (1.4x) & Tue/Fri Dip (0.75x). Click any date to edit or add an event.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              viewMode === 'calendar'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-surface-card text-text-secondary border border-border-subtle hover:text-text-primary'
            }`}
          >
            <Grid size={14} /> Month Calendar
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              viewMode === 'list'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-surface-card text-text-secondary border border-border-subtle hover:text-text-primary'
            }`}
          >
            <List size={14} /> All Events ({events.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Add / Edit Date Event Form */}
        <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 shadow-subtle space-y-4 h-fit">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
            <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
              {editingId ? <Edit3 className="text-amber-500" size={16} /> : <Plus className="text-brand-500" size={16} />}
              <span>{editingId ? `Edit Event (${eventDate})` : `Add / Override Date (${eventDate})`}</span>
            </h4>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setEventName('');
                  setNotes('');
                }}
                className="text-[11px] font-bold text-text-muted hover:text-text-primary cursor-pointer"
              >
                + New Instead
              </button>
            )}
          </div>

          <form onSubmit={handleSaveEvent} className="space-y-3 text-xs">
            <div>
              <label className="block text-text-muted font-bold mb-1">Selected Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={e => handleSelectDateFromCalendar(e.target.value)}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-text-primary font-mono font-bold outline-none focus:border-brand-500"
                required
              />
            </div>

            <div>
              <label className="block text-text-muted font-bold mb-1">Event / Festival Name</label>
              <input
                type="text"
                placeholder="e.g., Vaikunta Ekadashi, Ganesh Chaturthi, Wedding Muhurtham"
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-text-primary outline-none focus:border-brand-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-text-muted font-bold mb-1">Impact Category</label>
                <select
                  value={impactLevel}
                  onChange={e => handleImpactChange(e.target.value as any)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-2.5 py-2 text-text-primary outline-none focus:border-brand-500 font-bold"
                >
                  <option value="Very_Low">Very Low (0.3x Strict Fast)</option>
                  <option value="Low">Low (0.6x Fasting Dip)</option>
                  <option value="Normal">Normal (1.0x Standard)</option>
                  <option value="High">High Spike (1.4x - 2.0x)</option>
                </select>
              </div>

              <div>
                <label className="block text-text-muted font-bold mb-1">Multiplier (0.3x–2.0x)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.3"
                  max="2.0"
                  value={customMultiplier}
                  onChange={e => setCustomMultiplier(e.target.value)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-text-primary font-mono font-bold outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-text-muted font-bold mb-1">Date Confidence</label>
                <select
                  value={confidenceLevel}
                  onChange={e => setConfidenceLevel(e.target.value as any)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-2.5 py-2 text-text-primary outline-none focus:border-brand-500 font-semibold"
                >
                  <option value="Verified">Verified Date</option>
                  <option value="Lunar_Estimate">Lunar Tithi (±1 Day)</option>
                </select>
              </div>

              <div>
                <label className="block text-text-muted font-bold mb-1">Event Type</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-2.5 py-2 text-text-primary outline-none focus:border-brand-500 font-semibold"
                >
                  <option value="Fasting">Fasting / Vrat</option>
                  <option value="Festival">Major Festival</option>
                  <option value="Muhurtham">Wedding Muhurtham</option>
                  <option value="Month_Observance">Purattasi / Margazhi / Aadi</option>
                  <option value="Local / Custom">Local / Custom</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-text-muted font-bold mb-1">Regional / Operational Notes</label>
              <textarea
                placeholder="e.g., Ganesh Chaturthi 2026 verified on Sep 14; expect low meat demand"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-text-primary outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-all shadow-subtle flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>{editingId ? 'Save Event Changes' : 'Save Calendar Event'}</span>
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(editingId)}
                  className="px-3 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 border border-rose-500/30 font-bold rounded-xl transition-all cursor-pointer"
                  title="Delete this event"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </form>

          {/* Legend */}
          <div className="pt-3 border-t border-border-subtle space-y-1.5 text-[11px]">
            <div className="font-bold text-text-muted uppercase text-[10px]">Multiplier Colour Key</div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-500/30 border border-rose-500" />
                <span className="text-text-secondary">0.3x Strict Fast</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500" />
                <span className="text-text-secondary">0.6x–0.75x Dip</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-surface-card border border-border-subtle" />
                <span className="text-text-secondary">1.0x Normal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500" />
                <span className="text-text-secondary">1.4x–2.0x Peak</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center & Right Column: Calendar Month Grid OR Searchable List */}
        <div className="lg:col-span-2 space-y-6">
          {viewMode === 'calendar' ? (
            <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 shadow-subtle space-y-4">
              {/* Month Navigation Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1))}
                    className="p-2 rounded-xl bg-surface-card border border-border-subtle hover:bg-surface-hover text-text-primary cursor-pointer"
                    title="Previous Month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <h4 className="text-base font-black text-text-primary min-w-[160px] text-center">
                    {MONTH_NAMES[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1))}
                    className="p-2 rounded-xl bg-surface-card border border-border-subtle hover:bg-surface-hover text-text-primary cursor-pointer"
                    title="Next Month"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
                      handleSelectDateFromCalendar(todayStr);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-surface-card border border-border-subtle hover:border-brand-500 text-xs font-bold text-text-primary cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentMonthDate(new Date(2026, 8, 1)); // Sep 2026 (Ganesh Chaturthi 2026-09-14)
                      handleSelectDateFromCalendar('2026-09-14');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-500 text-xs font-bold hover:bg-brand-500 hover:text-white transition-colors cursor-pointer"
                    title="Jump to Sep 2026 to inspect verified Ganesh Chaturthi (2026-09-14)"
                  >
                    Sep 2026 (Vinayagar Chaturthi)
                  </button>
                </div>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-black uppercase text-text-muted">
                {WEEKDAYS.map(w => (
                  <div key={w} className="py-1">{w}</div>
                ))}
              </div>

              {/* Calendar Day Cells */}
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((cell, idx) => {
                  if (!cell.dateStr) {
                    return <div key={`empty-${idx}`} className="h-24 rounded-xl bg-surface-app/40 border border-transparent" />;
                  }
                  const isSelected = cell.dateStr === eventDate;
                  const isToday = cell.dateStr === todayStr;
                  const primaryEv = cell.events[0];
                  const isLunar = primaryEv?.confidence_level === 'Lunar_Estimate';

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => handleSelectDateFromCalendar(cell.dateStr!)}
                      className={`h-24 rounded-xl p-2 border text-left flex flex-col justify-between transition-all cursor-pointer ${cell.colorClass} ${
                        isSelected ? 'ring-2 ring-brand-500 shadow-md scale-[1.01]' : 'hover:border-brand-500/50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-xs font-black font-mono ${isToday ? 'underline decoration-brand-500 decoration-2' : ''}`}>
                          {cell.dayNum}
                        </span>
                        <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10">
                          {cell.effectiveMultiplier}x
                        </span>
                      </div>

                      <div className="space-y-0.5 w-full overflow-hidden">
                        <div className="text-[10px] font-bold leading-tight line-clamp-2 text-text-primary">
                          {cell.badgeLabel}
                        </div>
                        {primaryEv && (
                          <div className="flex items-center gap-1 text-[9px] text-text-muted">
                            {isLunar ? (
                              <span className="text-amber-500 flex items-center gap-0.5" title="Lunar tithi estimate (±1 day)">
                                <AlertCircle size={9} /> Lunar
                              </span>
                            ) : (
                              <span className="text-emerald-500 flex items-center gap-0.5" title="Verified calendar date">
                                <CheckCircle2 size={9} /> Verified
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* List View of All Events */
            <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 shadow-subtle space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-text-primary">
                  All Configured Festival & Fasting Dates ({filteredEvents.length})
                </h4>
                <input
                  type="text"
                  placeholder="Search festival, month, or date (e.g. Ganesh, Ekadashi, 2026-09-14)..."
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  className="w-72 bg-surface-card border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
                />
              </div>

              <div className="max-h-96 overflow-y-auto pr-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-card border-b border-border-subtle text-text-muted uppercase text-[10px] font-bold sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Event Name</th>
                      <th className="py-2.5 px-3">Multiplier</th>
                      <th className="py-2.5 px-3">Confidence</th>
                      <th className="py-2.5 px-3">Notes</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50">
                    {filteredEvents.map((ev: any) => {
                      const mult = ev.custom_multiplier ?? (
                        ev.impact_level === 'Very_Low' ? 0.3 :
                        ev.impact_level === 'Low' ? 0.6 :
                        ev.impact_level === 'High' ? 1.5 : 1.0
                      );
                      return (
                        <tr key={ev.id} className="hover:bg-surface-hover/30">
                          <td className="py-2.5 px-3 font-mono font-bold text-text-primary">{ev.event_date}</td>
                          <td className="py-2.5 px-3 font-bold text-text-primary">{ev.event_name}</td>
                          <td className="py-2.5 px-3 font-mono font-bold">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] border ${
                              mult <= 0.4 ? 'bg-rose-500/15 text-rose-500 border-rose-500/30' :
                              mult < 0.9 ? 'bg-amber-500/15 text-amber-500 border-amber-500/30' :
                              mult >= 1.3 ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' :
                              'bg-blue-500/15 text-blue-500 border-blue-500/30'
                            }`}>
                              {mult}x ({ev.impact_level})
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {ev.confidence_level === 'Lunar_Estimate' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
                                <AlertCircle size={11} /> Lunar (±1d)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                                <CheckCircle2 size={11} /> Verified
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-text-muted text-[11px]">{ev.notes || '—'}</td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSelectDateFromCalendar(ev.event_date)}
                                className="px-2 py-1 rounded bg-surface-card border border-border-subtle text-text-secondary hover:text-text-primary text-[10px] font-bold cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEvent(ev.id)}
                                className="p-1 text-text-muted hover:text-rose-500 transition-colors cursor-pointer"
                                title="Delete Event"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pending Bulk Orders List */}
          <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 shadow-subtle space-y-3">
            <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <ShoppingBag size={16} className="text-brand-500" />
              <span>Registered Pending Bulk & Function Orders ({bulkOrders.length})</span>
            </h4>

            <div className="max-h-44 overflow-y-auto pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-card border-b border-border-subtle text-text-muted uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-2 px-3">Delivery Date</th>
                    <th className="py-2 px-3">Item / Variant</th>
                    <th className="py-2 px-3 text-right">Quantity</th>
                    <th className="py-2 px-3">Customer / Note</th>
                    <th className="py-2 px-3 text-center">Cancel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50 font-mono">
                  {bulkOrders.map((bo: any) => {
                    const isWeight = bo.unit_type === 'weight' || bo.unit_type === 'live_dual';
                    const qtyStr = isWeight ? `${formatQty((bo.quantity_grams || 0) / 1000)} kg` : `${formatQty(bo.quantity_units || 0)} pcs`;
                    return (
                      <tr key={bo.id} className="hover:bg-surface-hover/30">
                        <td className="py-2 px-3 font-bold text-text-primary font-sans">{bo.delivery_date}</td>
                        <td className="py-2 px-3 font-sans font-bold text-text-primary">{bo.product_name} ({bo.variant_name})</td>
                        <td className="py-2 px-3 text-right font-bold text-brand-500">{qtyStr}</td>
                        <td className="py-2 px-3 font-sans text-text-secondary">{bo.customer_name_or_notes}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleCancelBulkOrder(bo.id)}
                            className="p-1 text-text-muted hover:text-rose-500 transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {bulkOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-text-muted text-xs font-sans">
                        No pending bulk orders registered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

