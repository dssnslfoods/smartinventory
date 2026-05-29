/**
 * Ask Me — Conversational AI assistant for the Smart Inventory system.
 *
 * Sends a curated KPI snapshot + the user's chat history to the gemini-chat
 * edge function, which grounds Gemini in the system's knowledge base so
 * answers stay within scope.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, RefreshCw, User } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { AskMeMascot, type MascotState } from '@/components/AskMeMascot';
import {
  useStockOnHand, useMonthlyTotal, useSlowMoving, useLatestLotSnapshot,
  useInventoryTurnover, useLotAging,
} from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/utils/format';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** millis since epoch — animations / sorting */
  ts: number;
}

// ── Tiny markdown renderer (mirrors SmartReportPage) ────────────────────────
function renderMarkdown(src: string): React.ReactNode[] {
  const inline = (line: string, k: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${k}-b${i}`}>{p.slice(2, -2)}</strong>
      : <span key={`${k}-t${i}`}>{p}</span>);
  };
  return src.split('\n').map((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-bold mt-2 mb-1">{inline(line.slice(4), `h4-${i}`)}</h4>;
    if (line.startsWith('## '))  return <h3 key={i} className="text-base font-bold mt-2 mb-1" style={{ color: 'var(--color-primary)' }}>{inline(line.slice(3), `h3-${i}`)}</h3>;
    if (line.startsWith('# '))   return <h2 key={i} className="text-lg font-bold mt-2 mb-1.5">{inline(line.slice(2), `h2-${i}`)}</h2>;
    if (line === '') return <div key={i} className="h-2" />;
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      return (
        <div key={i} className="flex gap-2 text-sm leading-relaxed mb-1">
          <span className="font-semibold shrink-0" style={{ color: 'var(--color-primary-light)' }}>{numMatch[1]}.</span>
          <span className="flex-1">{inline(numMatch[2], `ol-${i}`)}</span>
        </div>
      );
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} className="flex gap-2 text-sm leading-relaxed mb-1">
          <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>•</span>
          <span className="flex-1">{inline(line.slice(2), `ul-${i}`)}</span>
        </div>
      );
    }
    return <p key={i} className="text-sm leading-relaxed mb-1">{inline(line, `p-${i}`)}</p>;
  });
}

const STARTER_QUESTIONS = [
  // วิเคราะห์เชิงลึก
  'ทำไม Dead Stock ของเราถึงสูงผิดปกติ?',
  'ถ้าลด Dead Stock 50% จะประหยัดเท่าไหร่/ปี?',
  'กลุ่มสินค้าไหนมีปัญหามากที่สุด? เปรียบเทียบ FRM vs FFG ให้หน่อย',
  'SKU ตัวไหนควรเลิกขายก่อน?',
  // คำถามทั่วไป + วิเคราะห์
  'Inventory Turnover เราเทียบกับมาตรฐานยังไง? ดี/แย่?',
  'Top 3 ความเสี่ยงสำคัญในสต็อกตอนนี้',
];

export function AskMePage() {
  const { data: stockData = [] }    = useStockOnHand();
  const { data: monthlyTotal = [] } = useMonthlyTotal(24);
  const { data: slowMoving = [] }   = useSlowMoving();
  const { data: turnover = [] }     = useInventoryTurnover();
  const { data: lotAging = [] }     = useLotAging();
  const { data: latestSnap }        = useLatestLotSnapshot();

  // Richer KPI context — enough for Gemini to reason about root causes,
  // comparisons, and what-if scenarios (not just look up single numbers).
  const kpiContext = useMemo(() => {
    const num = (v: unknown) => Number(v ?? 0);
    const nonZero = stockData.filter(x => num(x.current_stock) !== 0);
    const actualValue = nonZero.reduce((s, x) => s + num((x as any).lot_value ?? x.stock_value), 0);
    const wacValue    = nonZero.reduce((s, x) => s + num(x.stock_value), 0);
    const stdValue    = nonZero.reduce((s, x) => s + num(x.current_stock) * num(x.std_cost), 0);
    const last12 = monthlyTotal.slice(-12);
    const cogs12mo = last12.reduce((s, m) => s + num(m.out_value), 0);
    const turn = actualValue > 0 ? cogs12mo / actualValue : 0;

    const dead = slowMoving.filter(s => s.movement_status === 'dead_stock');
    const slow = slowMoving.filter(s => s.movement_status === 'slow_moving');
    const deadValue = dead.reduce((s, r) => s + num(r.stock_value), 0);
    const slowValue = slow.reduce((s, r) => s + num(r.stock_value), 0);

    // Group breakdown (count + value + %)
    const byGroup = new Map<string, { count: number; value: number }>();
    for (const r of nonZero) {
      const g = r.group_name?.split('-')[0] ?? 'อื่นๆ';
      const v = byGroup.get(g) ?? { count: 0, value: 0 };
      v.count += 1;
      v.value += num(r.stock_value);
      byGroup.set(g, v);
    }
    const groups = [...byGroup.entries()]
      .map(([name, v]) => ({ name, sku_count: v.count, value_thb: Math.round(v.value), share_pct: wacValue ? Number(((v.value / wacValue) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.value_thb - a.value_thb);

    // Turnover band distribution
    const bands = {
      very_low_lt_1_5x:  turnover.filter(t => num(t.turnover_ratio) < 1.5).length,
      low_1_5_to_3x:     turnover.filter(t => num(t.turnover_ratio) >= 1.5 && num(t.turnover_ratio) < 3).length,
      mid_3_to_10x:      turnover.filter(t => num(t.turnover_ratio) >= 3 && num(t.turnover_ratio) < 10).length,
      high_gte_10x:      turnover.filter(t => num(t.turnover_ratio) >= 10).length,
    };

    // Top dead/slow with names (so Gemini can recommend specific SKUs)
    const top = (arr: typeof dead) => [...arr]
      .sort((a, b) => num(b.stock_value) - num(a.stock_value))
      .slice(0, 8)
      .map(r => ({
        item_code: r.item_code, itemname: r.itemname,
        group: r.group_name?.split('-')[0],
        value_thb: Math.round(num(r.stock_value)),
        days_since_last_out: num(r.days_since_last_out),
      }));

    // Lot aging bucket sums
    const sumBucket = (b: string) => lotAging
      .filter(x => x.aging_bucket === b)
      .reduce((acc, x) => ({ lots: acc.lots + num(x.lot_count), value: acc.value + num(x.total_value) }), { lots: 0, value: 0 });
    const aging = {
      expired:    sumBucket('expired'),
      '0-30':     sumBucket('0-30'),
      '31-60':    sumBucket('31-60'),
      '61-90':    sumBucket('61-90'),
      '91-180':   sumBucket('91-180'),
      '180+':     sumBucket('180+'),
    };

    // Recent monthly trend (last 6 months)
    const trend = monthlyTotal.slice(-6).map(m => ({
      month: m.month,
      in_value_thb:  Math.round(num(m.in_value)),
      out_value_thb: Math.round(num(m.out_value)),
    }));

    return {
      snapshot_date: latestSnap ?? null,
      // Headline
      working_capital_thb: Math.round(actualValue),
      moving_avg_value_thb: Math.round(wacValue),
      std_cost_value_thb: Math.round(stdValue),
      variance_actual_vs_std_thb: Math.round(actualValue - stdValue),
      carrying_cost_15pct_per_year_thb: Math.round(actualValue * 0.15),
      cogs_12mo_thb: Math.round(cogs12mo),
      inventory_turnover: Number(turn.toFixed(2)),
      dio_days: turn > 0 ? Math.round(365 / turn) : null,
      inventory_cover_years: cogs12mo > 0 ? Number((actualValue / cogs12mo).toFixed(2)) : null,
      total_sku: new Set(stockData.map(r => r.item_code)).size,
      total_warehouses: new Set(stockData.map(r => r.warehouse)).size,
      // Movement health
      dead_stock_count: dead.length,
      dead_stock_value_thb: Math.round(deadValue),
      dead_stock_pct: slowMoving.length ? Number(((dead.length / slowMoving.length) * 100).toFixed(1)) : 0,
      slow_moving_count: slow.length,
      slow_moving_value_thb: Math.round(slowValue),
      // Distribution & comparison data
      group_breakdown: groups,
      turnover_distribution: bands,
      lot_aging_buckets: {
        expired_lots: aging.expired.lots,    expired_value_thb: Math.round(aging.expired.value),
        '0_30d_lots': aging['0-30'].lots,    '0_30d_value_thb': Math.round(aging['0-30'].value),
        '31_60d_lots': aging['31-60'].lots,  '31_60d_value_thb': Math.round(aging['31-60'].value),
        '61_90d_lots': aging['61-90'].lots,  '61_90d_value_thb': Math.round(aging['61-90'].value),
        '91_180d_lots': aging['91-180'].lots,'91_180d_value_thb': Math.round(aging['91-180'].value),
        '180plus_d_lots': aging['180+'].lots,'180plus_d_value_thb': Math.round(aging['180+'].value),
      },
      // Top concerns with names
      top_dead_stock: top(dead),
      top_slow_moving: top(slow),
      // Trend
      recent_monthly_trend: trend,
    };
  }, [stockData, monthlyTotal, slowMoving, turnover, lotAging, latestSnap]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  /** When an AI reply lands, mascot enters "talking" mode for 3s, then back to idle. */
  const [justTalked, setJustTalked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mascot state derived from chat state
  const mascotState: MascotState = loading ? 'thinking' : justTalked ? 'talking' : 'idle';

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: ChatMessage = { role: 'user', text: trimmed, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setError(null);
    setLoading(true);
    try {
      const payload = {
        kpi: kpiContext,
        messages: next.map(m => ({ role: m.role, text: m.text })),
      };
      const { data, error: invErr } = await supabase.functions.invoke('gemini-chat', { body: payload });
      if (invErr) throw new Error(invErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const aiText = (data as any)?.text ?? '';
      setMessages(prev => [...prev, { role: 'assistant', text: aiText, ts: Date.now() }]);
      // Trigger "talking" animation for 3 seconds after each AI reply.
      setJustTalked(true);
      setTimeout(() => setJustTalked(false), 3000);
    } catch (e: any) {
      setError(e?.message ?? 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); send(input); };
  const reset = () => { setMessages([]); setError(null); };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ask Me"
        subtitle="ถามอะไรเกี่ยวกับระบบ Smart Inventory ก็ได้ — AI ตอบให้"
        helpTitle="Ask Me — AI Assistant"
        helpBody={(<>
          <p className="mb-2"><strong>Ask Me</strong> เป็น AI Chatbot ที่ตอบคำถามเกี่ยวกับระบบ Smart Inventory โดยใช้ Gemini</p>
          <p className="mb-2"><strong>ตอบได้:</strong> คำอธิบายฟีเจอร์ • ตัวชี้วัด (Working Capital, Turnover ฯลฯ) • วิธีคิดต้นทุน • ตัวเลขปัจจุบันจาก snapshot</p>
          <p className="mb-2"><strong>ตอบไม่ได้:</strong> คำถามนอกขอบเขตระบบ (ข่าว, ฟีเจอร์ที่ไม่มี)</p>
          <p>ทุกการสนทนาเก็บเฉพาะใน session ปัจจุบัน — รีเฟรชหรือเปิดหน้าใหม่ = เริ่มต้นใหม่</p>
        </>)}
      />

      <div className="card flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: 500 }}>
        {/* Header strip */}
        <div className="flex items-center justify-between px-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <AskMeMascot state={mascotState} size={44} showThinkBubble={false} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>น้องสต๊อก <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(Stock) · Smart Inventory AI</span></p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Powered by Gemini · ใช้ข้อมูล KPI ณ snapshot {latestSnap ? formatDate(latestSnap) : '—'}
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-full border hover:bg-[var(--bg-alt)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <RefreshCw size={12} /> เริ่มใหม่
            </button>
          )}
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <AskMeMascot state={mascotState} size={120} showThinkBubble={false} />
              <h3 className="font-bold text-base mt-2 mb-1" style={{ color: 'var(--text)' }}>สวัสดีครับ ผม <span style={{ color: '#4285F4' }}>น้องสต๊อก</span></h3>
              <p className="text-xs mb-5 max-w-md" style={{ color: 'var(--text-muted)' }}>
                ผมรู้จักระบบ Smart Inventory ทุกซอกทุกมุม + เห็นตัวเลข KPI ปัจจุบันของคุณด้วย<br/>
                ถามได้ทั้งคำถามทั่วไป และคำถามเชิงวิเคราะห์ลึก
              </p>
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>ตัวอย่างคำถาม:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
                {STARTER_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={loading}
                    className="text-left px-3 py-2 rounded-lg border text-xs transition-colors hover:bg-[var(--bg-alt)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    💬 {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isLastAssistant = m.role === 'assistant' && i === messages.length - 1;
            return (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className="shrink-0 flex items-center justify-center" style={{ width: 36, height: 36 }}>
                {m.role === 'user' ? (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                    <User size={14} />
                  </div>
                ) : (
                  <AskMeMascot state={isLastAssistant && justTalked ? 'talking' : 'idle'} size={36} />
                )}
              </div>
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl ${m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                   style={{
                     backgroundColor: m.role === 'user' ? 'var(--color-primary)' : 'var(--bg-alt)',
                     color: m.role === 'user' ? '#fff' : 'var(--text)',
                   }}>
                {m.role === 'user'
                  ? <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                  : <div>{renderMarkdown(m.text)}</div>}
              </div>
            </div>
            );
          })}

          {loading && (
            <div className="flex gap-2 items-center">
              <div className="shrink-0 flex items-center justify-center" style={{ width: 36, height: 36 }}>
                <AskMeMascot state="thinking" size={36} showThinkBubble />
              </div>
              <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-2" style={{ backgroundColor: 'var(--bg-alt)' }}>
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#4285F4', animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#4285F4', animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#4285F4', animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2.5 rounded-lg text-xs leading-relaxed"
                 style={{ backgroundColor: 'rgba(220,38,38,0.06)', color: '#991b1b', border: '1px solid rgba(220,38,38,0.20)' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 px-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="พิมพ์คำถาม..."
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)' }}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#4285F4', color: '#fff' }}
          >
            <Send size={14} /> ส่ง
          </button>
        </form>
      </div>
    </div>
  );
}
