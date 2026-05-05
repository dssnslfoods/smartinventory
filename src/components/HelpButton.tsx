import { useState, useEffect, useRef, type ReactNode } from 'react';
import { HelpCircle, X, GripHorizontal } from 'lucide-react';

interface HelpContent {
  title: string;
  body: ReactNode;
  /**
   * 'card'   = absolutely positioned in top-right of a `relative` parent (default)
   * 'inline' = renders inline at normal document flow — for next-to-heading use
   */
  variant?: 'card' | 'inline';
  /** Inline label shown next to the icon (variant='inline' only) */
  label?: string;
}

/**
 * Small `?` icon — clicking opens a draggable, non-blocking help panel.
 * The panel can be dragged by its title bar so users can move it aside
 * to read the data behind it.
 */
export function HelpButton({ title, body, variant = 'card', label }: HelpContent) {
  const [open, setOpen] = useState(false);
  // offset from default position (top: 80px, right: 24px)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  // Reset position whenever the panel re-opens
  useEffect(() => {
    if (open) setOffset({ x: 0, y: 0 });
  }, [open]);

  const triggerCls = variant === 'card'
    ? 'absolute top-3 right-3 p-1.5 rounded-full transition-colors hover:bg-[var(--bg-alt,#f8fafc)] text-[var(--text-muted)] hover:text-[var(--color-primary)] z-10'
    : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors text-[var(--color-primary)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20';

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = { startX: clientX, startY: clientY, baseX: offset.x, baseY: offset.y };
    document.body.style.userSelect = 'none';
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // ignore drags that start on the close button etc.
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const t = e.touches[0];
    if (!t) return;
    startDrag(t.clientX, t.clientY);
  };

  // Document-level move/up listeners while dragging
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const cx = 'touches' in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX;
      const cy = 'touches' in e ? e.touches[0]?.clientY : (e as MouseEvent).clientY;
      if (cx == null || cy == null) return;
      const dx = cx - dragRef.current.startX;
      const dy = cy - dragRef.current.startY;
      setOffset({ x: dragRef.current.baseX + dx, y: dragRef.current.baseY + dy });
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      document.body.style.userSelect = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerCls}
        title="ช่วยเหลือ / Help"
        aria-label="ช่วยเหลือ"
      >
        <HelpCircle size={variant === 'inline' ? 14 : 16} />
        {variant === 'inline' && <span>{label ?? 'ช่วยเหลือ'}</span>}
      </button>

      {open && (
        // No backdrop — panel floats over the page; data behind stays visible & interactive
        <div
          className="fixed top-20 right-6 z-50 w-[min(92vw,520px)] max-h-[calc(100vh-7rem)] flex flex-col rounded-xl shadow-2xl border"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transition: dragRef.current ? 'none' : 'box-shadow 200ms',
          }}
        >
          {/* Drag handle / header */}
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className="flex items-center justify-between px-5 py-3 border-b cursor-grab active:cursor-grabbing rounded-t-xl select-none"
            style={{
              borderColor: 'var(--border)',
              background: 'linear-gradient(135deg, rgba(31,56,100,0.06) 0%, rgba(46,117,182,0.03) 100%)',
            }}
            title="ลากเพื่อเลื่อน"
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal size={14} className="opacity-40 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div className="p-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] shrink-0">
                <HelpCircle size={16} />
              </div>
              <h2 className="font-semibold truncate" style={{ color: 'var(--text)' }}>{title}</h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-[var(--bg-alt)] transition-colors shrink-0 ml-2"
              style={{ color: 'var(--text-muted)' }}
              aria-label="ปิด"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body — scrolls inside the panel */}
          <div
            className="px-5 py-4 text-sm leading-relaxed space-y-3 overflow-y-auto"
            style={{ color: 'var(--text)' }}
          >
            {body}
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 flex justify-end border-t rounded-b-xl"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt, #f8fafc)' }}
          >
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-1.5 rounded-lg text-sm bg-[var(--color-primary)] text-white"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Reusable building blocks for help body ──────────────────────────────────

export function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>{title}</p>
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{children}</div>
    </div>
  );
}

export function HelpFormula({ children }: { children: ReactNode }) {
  return (
    <code
      className="block px-3 py-2 rounded-lg text-xs font-mono my-1"
      style={{
        backgroundColor: 'rgba(99,102,241,0.08)',
        color: '#1e40af',
        border: '1px solid rgba(99,102,241,0.2)',
      }}
    >
      {children}
    </code>
  );
}

export function HelpLegend({ items }: { items: { color: string; label: string; meaning: string }[] }) {
  return (
    <div className="space-y-1.5 mt-1">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className="w-3 h-3 rounded mt-0.5 shrink-0" style={{ backgroundColor: it.color }} />
          <div>
            <span className="font-medium" style={{ color: 'var(--text)' }}>{it.label}</span>
            <span style={{ color: 'var(--text-muted)' }}> — {it.meaning}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
