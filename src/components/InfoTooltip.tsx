import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface Props {
  /** Short title shown bold at the top of the popover */
  title?: string;
  /** Plain text or JSX explanation body */
  children: React.ReactNode;
  /** Icon size — default 14 */
  size?: number;
  /** Optional override icon colour */
  color?: string;
  /** "below" puts the popover under the icon (default). "above" places it above. */
  placement?: 'below' | 'above';
}

/**
 * Hover-aware info bubble. Clickable to keep open on touch devices.
 * Use next to chart titles, KPI cards, or any concept the user might want
 * a deeper explanation of.
 */
export function InfoTooltip({ title, children, size = 14, color, placement = 'below' }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="inline-flex items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-alt)]"
        style={{ color: color ?? 'var(--text-muted)', width: size + 6, height: size + 6 }}
        aria-label="ดูคำอธิบาย"
      >
        <Info size={size} />
      </button>

      {open && (
        <div
          className="absolute z-50 w-80 max-w-[90vw] rounded-lg shadow-lg border text-left"
          style={{
            top:    placement === 'below' ? '100%' : 'auto',
            bottom: placement === 'above' ? '100%' : 'auto',
            left: 0,
            marginTop:    placement === 'below' ? 4 : 0,
            marginBottom: placement === 'above' ? 4 : 0,
            backgroundColor: 'var(--bg-card)',
            borderColor:     'var(--border)',
          }}
        >
          {title && (
            <div className="px-3 py-2 border-b text-xs font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
              {title}
            </div>
          )}
          <div className="px-3 py-2.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {children}
          </div>
        </div>
      )}
    </span>
  );
}
