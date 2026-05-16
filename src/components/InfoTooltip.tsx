import { useState, useRef, useEffect, useLayoutEffect } from 'react';
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

const POPOVER_WIDTH = 320; // matches w-80 (Tailwind)
const VIEWPORT_PADDING = 8;

/**
 * Hover-aware info bubble. Clickable to keep open on touch devices.
 *
 * Auto-flips horizontally when the icon is near the right edge of the
 * viewport, so the popover never gets clipped. Falls back to a centred
 * layout on narrow screens (< POPOVER_WIDTH + padding) so the bubble
 * spans the available width.
 */
export function InfoTooltip({ title, children, size = 14, color, placement = 'below' }: Props) {
  const [open, setOpen] = useState(false);
  const [hAlign, setHAlign] = useState<'left' | 'right' | 'center'>('left');
  const [centerOffset, setCenterOffset] = useState(0);
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

  // Decide horizontal placement before paint to avoid clipping flash
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw   = window.innerWidth;

    // Narrow viewport: anchor to viewport, not the icon, and centre.
    if (vw < POPOVER_WIDTH + VIEWPORT_PADDING * 2) {
      setHAlign('center');
      // distance from icon's left edge to (viewport_left + padding)
      setCenterOffset(VIEWPORT_PADDING - rect.left);
      return;
    }

    const spaceRight = vw - rect.left;
    if (spaceRight >= POPOVER_WIDTH + VIEWPORT_PADDING) {
      setHAlign('left');                  // popover extends to the right of the icon
    } else {
      setHAlign('right');                 // not enough room → anchor to icon's right edge
    }
  }, [open]);

  const horizontalStyle: React.CSSProperties =
    hAlign === 'left'   ? { left:  0 } :
    hAlign === 'right'  ? { right: 0 } :
    /* center */         { left: centerOffset, width: `calc(100vw - ${VIEWPORT_PADDING * 2}px)` };

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
          className="absolute z-50 w-80 max-w-[calc(100vw-16px)] rounded-lg shadow-lg border text-left"
          style={{
            top:    placement === 'below' ? '100%' : 'auto',
            bottom: placement === 'above' ? '100%' : 'auto',
            ...horizontalStyle,
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
