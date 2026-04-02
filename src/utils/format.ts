export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrency(value: number): string {
  return '฿' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getStockStatusColor(status: string): string {
  switch (status) {
    case 'critical': return 'badge-critical';
    case 'warning': return 'badge-warning';
    case 'normal': return 'badge-success';
    case 'overstock': return 'badge-info';
    default: return 'badge-info';
  }
}

export function getStockStatusLabel(status: string): string {
  switch (status) {
    case 'critical': return 'Critical';
    case 'warning': return 'Warning';
    case 'normal': return 'Normal';
    case 'overstock': return 'Overstock';
    default: return status;
  }
}

export function getDirectionColor(direction: string): string {
  switch (direction) {
    case 'In': return 'text-green-600';
    case 'Out': return 'text-red-600';
    case 'Transfers': return 'text-blue-600';
    case 'Cost': return 'text-orange-600';
    case 'Opening': return 'text-gray-600';
    default: return '';
  }
}

/** Format a date range in Thai Buddhist Era, e.g. "ม.ค. 68 – ธ.ค. 68" */
export function formatThaiMonthRange(minDate: string, maxDate: string): string {
  const min = new Date(minDate);
  const max = new Date(maxDate);
  const fmt = (d: Date) => {
    const m = d.toLocaleDateString('th-TH', { month: 'short' });
    const y = String(d.getFullYear() + 543).slice(-2);
    return `${m} ${y}`;
  };
  return `${fmt(min)} – ${fmt(max)}`;
}

/** Compact number format: 45200000 → "45.2M", 12300 → "12.3K" */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${formatNumber(abs, 0)}`;
}
