// src/components/finance/shared.jsx
// ─── Shared utilities, hooks, and UI primitives ───────────────────────────

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axiosInstance';

// ─── Data Fetching Hook ──────────────────────────────────────────────────────
export function useFinanceQuery(endpoint, params = {}) {
  const query = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: [endpoint, params],
    queryFn: () => api.get(`/finance/${endpoint}${query ? `?${query}` : ''}`).then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Date Range Picker ───────────────────────────────────────────────────────
export function DateRangePicker({ startDate, endDate, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-stone-500 uppercase tracking-wider">From</label>
      <input
        type="date"
        value={startDate}
        onChange={e => onChange({ startDate: e.target.value, endDate })}
        className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
      />
      <label className="text-xs text-stone-500 uppercase tracking-wider">To</label>
      <input
        type="date"
        value={endDate}
        onChange={e => onChange({ startDate, endDate: e.target.value })}
        className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
      />
    </div>
  );
}

// ─── Period Selector ─────────────────────────────────────────────────────────
export function PeriodSelector({ value, onChange }) {
  const periods = [
    { label: 'This Month', value: 'month' },
    { label: 'This Quarter', value: 'quarter' },
    { label: 'YTD', value: 'ytd' },
    { label: 'Full Year', value: 'year' },
  ];
  return (
    <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
      {periods.map(p => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
            value === p.value
              ? 'bg-white text-emerald-700 shadow-sm font-semibold'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, trend, accent = 'emerald' }) {
  const accents = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber:   'bg-amber-50 border-amber-100 text-amber-700',
    red:     'bg-red-50 border-red-100 text-red-600',
    blue:    'bg-blue-50 border-blue-100 text-blue-700',
    stone:   'bg-stone-50 border-stone-200 text-stone-700',
  };
  return (
    <div className={`rounded-2xl border p-5 ${accents[accent]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-60 mb-2">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
      {trend != null && (
        <p className={`text-xs mt-1 font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs prior period
        </p>
      )}
    </div>
  );
}

// ─── Statement Table ─────────────────────────────────────────────────────────
export function StatementTable({ children }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function SectionHead({ label, colSpan = 3 }) {
  return (
    <tr className="bg-stone-50">
      <td
        colSpan={colSpan}
        className="px-6 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-stone-500"
      >
        {label}
      </td>
    </tr>
  );
}

export function DataRow({ label, current, prior, indent = false, isTotal = false, isSubtotal = false, isNegative = false }) {
  const base = 'transition-colors duration-100';
  const rowClass = isTotal
    ? `${base} border-t-2 border-stone-300 bg-stone-50`
    : isSubtotal
    ? `${base} border-t border-stone-200`
    : `${base} hover:bg-stone-50/70`;

  const valueClass = isTotal
    ? 'font-bold text-stone-800'
    : isSubtotal
    ? 'font-semibold text-stone-700'
    : 'text-stone-700';

  const labelClass = isTotal
    ? 'font-bold text-stone-800'
    : isSubtotal
    ? 'font-semibold text-stone-700'
    : 'text-stone-600';

  // Format as currency
  const fmt = (v) => {
    if (v == null) return '—';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return '—';
    const abs = Math.abs(n);
    const formatted = abs >= 1_000_000
      ? `$${(abs / 1_000_000).toFixed(2)}M`
      : `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return n < 0 || isNegative ? `(${formatted})` : formatted;
  };

  // Variance
  const variance = (prior != null && current != null)
    ? (((current - prior) / Math.abs(prior || 1)) * 100).toFixed(1)
    : null;

  return (
    <tr className={rowClass}>
      <td className={`px-6 py-2.5 ${labelClass} ${indent ? 'pl-10' : ''}`}>{label}</td>
      <td className={`px-6 py-2.5 text-right tabular-nums ${valueClass}`}>{fmt(current)}</td>
      <td className={`px-6 py-2.5 text-right tabular-nums text-stone-400`}>{fmt(prior)}</td>
      <td className={`px-6 py-2.5 text-right text-xs tabular-nums ${
        variance == null ? '' : parseFloat(variance) >= 0 ? 'text-emerald-600' : 'text-red-500'
      }`}>
        {variance != null ? `${parseFloat(variance) >= 0 ? '+' : ''}${variance}%` : ''}
      </td>
    </tr>
  );
}

export function TableHeader({ columns }) {
  return (
    <thead>
      <tr className="border-b border-stone-200">
        {columns.map((col, i) => (
          <th
            key={i}
            className={`px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.1em] text-stone-400 bg-stone-50 ${
              i === 0 ? 'text-left' : 'text-right'
            }`}
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ─── Print / Export Bar ──────────────────────────────────────────────────────
export function StatementToolbar({ title, onPrint }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h2
        className="text-lg font-bold text-stone-800"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        {title}
      </h2>
      <button
        onClick={onPrint || (() => window.print())}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-600 hover:bg-stone-50 hover:border-stone-300 transition-all duration-150"
      >
        ↓ Export PDF
      </button>
    </div>
  );
}

// ─── Loading / Error / Empty States ─────────────────────────────────────────
export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-stone-400">Loading statement…</p>
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-2">
      <p className="text-sm font-semibold text-red-500">Failed to load</p>
      <p className="text-xs text-stone-400">{message || 'An error occurred. Please try again.'}</p>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-2">
      <p className="text-sm text-stone-400">No data available for this period.</p>
    </div>
  );
}

// ─── Currency Formatter (exported for use in components) ────────────────────
export const fmtCurrency = (n, opts = {}) => {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.cents === false ? 0 : 2,
  }).format(n);
};

// ─── Date helpers ─────────────────────────────────────────────────────────
export function getDefaultDates(period = 'year') {
  const now = new Date();
  const y = now.getFullYear();
  switch (period) {
    case 'month':
      return {
        startDate: `${y}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        endDate: now.toISOString().slice(0, 10),
      };
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return {
        startDate: `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`,
        endDate: now.toISOString().slice(0, 10),
      };
    }
    case 'ytd':
      return { startDate: `${y}-01-01`, endDate: now.toISOString().slice(0, 10) };
    default: // year
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
  }
}
