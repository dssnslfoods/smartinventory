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
 * Auto-flips both axes when the icon is near a viewport edge:
 *   • horizontal: flips left↔right (or centres on phones < 336 px wide)
 *   • vertical:   flips below↔above when there isn't enough room
 *                  in the requested direction
 *
 * Always caps the popover at 75 vh with internal scroll so long tooltips
 * (multiple CalcBlocks + Insight blocks) never run off-screen.
 */
export function InfoTooltip({ title, children, size = 14, color, placement = 'below' }: Props) {
  const [open, setOpen] = useState(false);
  const [hAlign, setHAlign] = useState<'left' | 'right' | 'center'>('left');
  const [vAlign, setVAlign] = useState<'below' | 'above'>(placement);
  const [centerOffset, setCenterOffset] = useState(0);
  const [maxHeight, setMaxHeight] = useState<number>(0);
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

  // Decide horizontal + vertical placement before paint to avoid clipping flash
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;

    // ── Horizontal ──────────────────────────────────────────────────────────
    if (vw < POPOVER_WIDTH + VIEWPORT_PADDING * 2) {
      setHAlign('center');
      setCenterOffset(VIEWPORT_PADDING - rect.left);
    } else {
      const spaceRight = vw - rect.left;
      setHAlign(spaceRight >= POPOVER_WIDTH + VIEWPORT_PADDING ? 'left' : 'right');
    }

    // ── Vertical ────────────────────────────────────────────────────────────
    // Space available below the icon (between icon bottom and viewport bottom)
    const spaceBelow = vh - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    let chosen: 'below' | 'above';
    let available: number;
    if (placement === 'below') {
      // Honour the request unless there's clearly more room above
      // AND below is too tight (< 200 px)
      if (spaceBelow < 200 && spaceAbove > spaceBelow) {
        chosen = 'above'; available = spaceAbove;
      } else {
        chosen = 'below'; available = spaceBelow;
      }
    } else {
      if (spaceAbove < 200 && spaceBelow > spaceAbove) {
        chosen = 'below'; available = spaceBelow;
      } else {
        chosen = 'above'; available = spaceAbove;
      }
    }
    setVAlign(chosen);
    // Cap at min 200 (so very tight viewports still get scrollable content)
    // and never larger than 75 vh.
    setMaxHeight(Math.max(200, Math.min(available, vh * 0.75)));
  }, [open, placement]);

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
          className="absolute z-50 w-80 max-w-[calc(100vw-16px)] rounded-lg shadow-lg border text-left flex flex-col"
          style={{
            top:    vAlign === 'below' ? '100%' : 'auto',
            bottom: vAlign === 'above' ? '100%' : 'auto',
            ...horizontalStyle,
            marginTop:    vAlign === 'below' ? 4 : 0,
            marginBottom: vAlign === 'above' ? 4 : 0,
            maxHeight: maxHeight ? `${maxHeight}px` : '75vh',
            backgroundColor: 'var(--bg-card)',
            borderColor:     'var(--border)',
          }}
        >
          {title && (
            <div className="px-3 py-2 border-b text-xs font-semibold flex-shrink-0"
                 style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
              {title}
            </div>
          )}
          <div className="px-3 py-2.5 text-xs leading-relaxed overflow-y-auto"
               style={{ color: 'var(--text-muted)' }}>
            {children}
          </div>
        </div>
      )}
    </span>
  );
}
