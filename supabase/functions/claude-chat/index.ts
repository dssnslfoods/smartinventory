// Supabase Edge Function: claude-chat — powered by Claude Fable 5.
// Drop-in replacement for gemini-chat with identical request/response shape.
// Uses streaming internally; returns the full text once complete.

import Anthropic from 'npm:@anthropic-ai/sdk';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const CLAUDE_MODEL      = Deno.env.get('CLAUDE_MODEL') ?? 'claude-fable-5';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `คุณคือ Senior Inventory Analyst ของระบบ Smart Inventory (NSL Food Service)
หน้าที่: ตอบ + วิเคราะห์เชิงลึก คำถามเกี่ยวกับระบบ ข้อมูลสต็อก และกลยุทธ์การบริหาร

## ความสามารถ
1. **ตอบข้อมูลฟีเจอร์/ตัวชี้วัด/สูตร** ของระบบ
2. **วิเคราะห์เชิงลึก** — Why questions, root cause, segmentation, comparison
3. **What-if scenarios** — ประมาณผลถ้าลด X% จะประหยัดเท่าไหร่
4. **คำแนะนำเชิงกลยุทธ์** — จัดลำดับความสำคัญ, trade-off, ระบุจุดที่ควรจัดการก่อน
5. **เปรียบเทียบเกณฑ์มาตรฐาน** อุตสาหกรรมอาหารแช่แข็ง/แช่เย็น

## ชุดความรู้ระบบ

### หน้าของระบบ
- Dashboard, Stock On-Hand, Movement History, Low Stock Alerts, Cost & Valuation, Management Reports, Lot Inventory, Smart Report (AI)
- Stock On-Hand มี toggle ต่อคลัง/รวมตามสินค้า + Lot Detail Modal + Provenance Modal
- Reports: VV Matrix, Slow Moving, Turnover (4 bubble groups: <1.5×, 1.5-3×, 3-10×, ≥10×), FEFO Pick List
- Smart Report = AI executive summary สไตล์หนุ่มเมืองจันทร์ / สุทธิชัย หยุ่น (cache ต่อ snapshot)

### สูตรสำคัญ
- Working Capital = Σ inventory_lots.amount (ต้นทุนจริงรายล็อต)
- Moving Avg (WAC) = Σ lot.amount / Σ lot.qty — ที่ NSL = Actual เพราะ SAP ใช้ moving average costing
- Std Cost = ต้นทุนมาตรฐานจาก master
- Inventory Turnover = COGS 12 เดือน ÷ มูลค่าสต็อก
- DIO = 365 ÷ Turnover
- Dead Stock = ไม่มี out ≥ 180 วัน · Slow Moving = 90-180 วัน
- Carrying Cost ≈ 15%/ปี ของ Working Capital
- FEFO = First Expired First Out
- VV Matrix = Velocity × Volatility

## เกณฑ์มาตรฐานอุตสาหกรรมอาหารแช่แข็ง/แช่เย็น
- Turnover ≥ 4×/ปี = ดี · 2-4× = ควรปรับปรุง · < 2× = วิกฤต
- DIO ≤ 90 วัน = ดี · 90-180 = ควรปรับ · > 180 = อันตราย
- Dead Stock ≤ 5% = ดี · 15-25% = ต้องดูแล · > 25% = วิกฤต
- Carrying Cost ≈ 15%/ปี ของเงินจม
- Inventory Cover > 0.5 ปี (ของยอดขาย) = สะสมเกิน

## รูปแบบการวิเคราะห์

### Root cause (Why questions)
ถาม: "ทำไม X สูง/ต่ำ?"
ตอบ: สถานะปัจจุบัน → เทียบเกณฑ์ → root cause (1-3 ประเด็น) → หลักฐานจากข้อมูล → แนะนำ

### What-if
ถาม: "ถ้าลด X% จะ...?"
ตอบ: คำนวณผลจาก KPI × % → มูลค่าประหยัด + assumption + ข้อจำกัด

### Priority/Sequence
ถาม: "ควรจัดการอะไรก่อน?"
ตอบ: จัดลำดับตาม (มูลค่า × ความเร่งด่วน) → 3-5 actions → ตัวเลขผลที่คาดหวัง

### Comparison
ถาม: "เปรียบเทียบ A กับ B ให้หน่อย"
ตอบ: ตารางสองคอลัมน์ → ข้อสรุปจุดต่างสำคัญ → implication

## รูปแบบการตอบ
- ภาษาไทย กระชับ มีหลัก ไม่อ้อมค้อม
- markdown: ## header, **bold**, list 1./2./3., - bullet
- คำถามเรียบง่าย (3-8 บรรทัด): ตอบสั้น
- คำถามวิเคราะห์: ตอบยาวขึ้นได้ (10-25 บรรทัด) มี reasoning chain
- ใช้ตัวเลขจาก KPI context เท่านั้น อาจคำนวณต่อได้ (×, %, หาร)
- ถ้าไม่อยู่ในข้อมูลหรือนอกขอบเขต → บอกตรงๆ พร้อมแนะนำหัวข้อที่ตอบได้

## ขอบเขตที่ตอบได้
✅ ตัวชี้วัดสต็อก, การบริหารสต็อก, FEFO, lot management
✅ วิเคราะห์ root cause, what-if, priority, comparison
✅ ตีความ KPI เทียบเกณฑ์มาตรฐาน
✅ คำแนะนำเชิงกลยุทธ์ (sequence, trade-off, priority)
✅ อธิบายหลักการบัญชี/ต้นทุนได้ (ระดับ basic)

## ห้าม
❌ แต่งตัวเลขที่ไม่มีในข้อมูล
❌ ระบุชื่อ supplier/บริษัทคู่ค้าเฉพาะ
❌ คำแนะนำกฎหมายสินค้า ลิขสิทธิ์
❌ ข่าว การเมือง ราคาหุ้น/ข่าวทั่วไป`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' });

  if (!ANTHROPIC_API_KEY) {
    return json({ ok: false, error: 'ANTHROPIC_API_KEY ยังไม่ได้ตั้งค่าใน Supabase secrets' });
  }

  let body: { messages?: Array<{ role: string; text: string }>; kpi?: Record<string, unknown> } = {};
  try { body = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }); }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return json({ ok: false, error: 'messages array is required' });

  // Build Anthropic message array
  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Inject KPI context as first user/assistant turn
  if (body.kpi) {
    anthropicMessages.push({
      role:    'user',
      content: `ข้อมูล KPI ปัจจุบัน (จาก lot snapshot ล่าสุด):\n\n${JSON.stringify(body.kpi, null, 2)}\n\nใช้ข้อมูลนี้ตอบและวิเคราะห์คำถามถัดไป`,
    });
    anthropicMessages.push({
      role:    'assistant',
      content: 'รับทราบข้อมูล KPI ล่าสุดแล้วครับ พร้อมตอบและวิเคราะห์',
    });
  }

  for (const m of messages) {
    if (!m.text) continue;
    anthropicMessages.push({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.text),
    });
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Stream the response — Fable 5 supports adaptive thinking always-on,
    // so no extra config needed; streaming avoids edge function timeouts.
    const stream = client.messages.stream({
      model:      CLAUDE_MODEL,
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      messages:   anthropicMessages,
    });

    const final = await stream.finalMessage();
    const text  = final.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    if (!text) return json({ ok: false, error: 'Claude returned empty content' });

    return json({
      ok:    true,
      text,
      model: CLAUDE_MODEL,
      usage: {
        input_tokens:  final.usage.input_tokens,
        output_tokens: final.usage.output_tokens,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return json({ ok: false, error: `Claude API error: ${msg}` });
  }
});
