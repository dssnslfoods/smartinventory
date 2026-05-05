import { useState, type ReactNode } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HelpContent {
  title: string;
  body: ReactNode;
}

/**
 * Small `?` icon — clicking opens a modal explaining what the chart/card means.
 * Use as an absolutely-positioned element inside a card with `relative` parent.
 */
export function HelpButton({ title, body }: HelpContent) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-3 right-3 p-1.5 rounded-full transition-colors hover:bg-[var(--bg-alt,#f8fafc)] text-[var(--text-muted)] hover:text-[var(--color-primary)] z-10"
        title="ช่วยเหลือ / Help"
        aria-label="ช่วยเหลือ"
      >
        <HelpCircle size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-card)',
                background: 'linear-gradient(135deg, rgba(31,56,100,0.04) 0%, rgba(46,117,182,0.02) 100%)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  <HelpCircle size={18} />
                </div>
                <h2 className="font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-[var(--bg-alt)] transition-colors"
                style={{ color: 'var(--text-muted)' }}
                aria-label="ปิด"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 text-sm leading-relaxed space-y-3" style={{ color: 'var(--text)' }}>
              {body}
            </div>
            <div className="px-6 pb-5 pt-2 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg text-sm bg-[var(--color-primary)] text-white"
              >
                เข้าใจแล้ว
              </button>
            </div>
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
