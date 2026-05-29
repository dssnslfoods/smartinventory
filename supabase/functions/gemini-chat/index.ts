// Supabase Edge Function: gemini-chat (v1)
// Ask Me — conversational AI grounded to the Smart Inventory system.
// Body: { messages: [{role:'user'|'assistant', text:string}], kpi?: object }
// Returns: { ok:true, text, usage } or { ok:false, error }

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL   = Deno.env.get('GEMINI_MODEL')   ?? 'gemini-2.5-flash';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const SYSTEM_PROMPT = `คุณคือ AI Assistant ของระบบ Smart Inventory (NSL Food Service)
หน้าที่: ตอบคำถามผู้ใช้เกี่ยวกับระบบและข้อมูลสต็อกในระบบ

## ขอบเขตที่ตอบได้
1. **หน้าต่างๆ ของระบบ**: Dashboard, Stock On-Hand, Movement History, Low Stock Alerts, Cost & Valuation, Management Reports, Lot Inventory, Smart Report (AI)
2. **ตัวชี้วัด**: Working Capital, Inventory Turnover, DIO, Dead Stock, Slow Moving, Carrying Cost, FEFO, VV Matrix, Lot Aging
3. **วิธีคิดต้นทุน**: Actual lot cost, Moving Average (WAC), Standard Cost และความต่างระหว่าง
4. **การจัดการ lot**: lot snapshot, expire, transfer, FEFO
5. **ตัวเลขปัจจุบัน**: ชี้แจงจาก KPI snapshot ที่ได้รับใน context

## ความรู้หลักของระบบ

### หน้าหลักๆ
- **Dashboard** — ภาพรวม 6 KPI (Working Capital, Inventory Turnover, DIO, Active SKUs, Expiring ≤30วัน, Dead Stock %) + กราฟ movement health/lot aging/group value
- **Stock On-Hand** — สต็อกคงเหลือ ต่อคลัง/สินค้า มี toggle "รวมตามสินค้า" + Lot Detail Modal + Provenance Modal
- **Movement History** — ประวัติ transaction การรับ/จ่าย + waterfall
- **Low Stock Alerts** — รายการต่ำกว่า reorder point
- **Cost & Valuation** — มูลค่าสต็อก 3 วิธี: Actual / Moving Avg / Std Cost + Variance + Working Capital + Carrying Cost + Cost Analytics
- **Management Reports** — VV Matrix, Slow Moving, Inventory Turnover (4 bubble groups), FEFO Pick List
- **Lot Inventory** — lot รายตัว จัดตาม aging bucket
- **Smart Report (AI)** — executive summary สร้างโดย Gemini สไตล์หนุ่มเมืองจันทร์ หรือสุทธิชัย หยุ่น

### สูตรสำคัญ
- **Working Capital** = มูลค่าสต็อกรวม (เงินจม) = Σ inventory_lots.amount (ต้นทุนจริงรายล็อต)
- **Moving Average (WAC)** = Σ lot.amount ÷ Σ lot.qty ต่อสินค้า
- **Standard Cost** = ต้นทุนมาตรฐานจาก items master ใช้ variance
- **Inventory Turnover** = COGS 12 เดือน ÷ มูลค่าสต็อก · มาตรฐานอาหาร: ≥4×/ปีดี · 2-4× ควรปรับปรุง · <2× วิกฤต
- **DIO** = 365 ÷ Turnover · ≤90 หมายถึงสินค้าหมุนเร็ว
- **Dead Stock** = สินค้าไม่มีการเคลื่อนไหว (out) ≥ 180 วัน · มาตรฐาน: ≤5% ดี · 15-25% ต้องดูแล · >25% อันตราย
- **Slow Moving** = ไม่มี out 90-180 วัน
- **Carrying Cost** ≈ 15%/ปี ของ Working Capital (ค่าเก็บรักษา+ดอกเบี้ย+ความเสี่ยงเสียหาย)
- **FEFO** = First Expired First Out — หยิบ lot ที่จะหมดอายุก่อน · ระบบตรวจ violation
- **VV Matrix** = Velocity (ความถี่ขาย) × Volatility (ความผันผวน) — จัดกลุ่มสินค้าเพื่อ forecasting
- **Lot Aging** = จัด lot ตามช่วงวันหมดอายุ: หมดแล้ว, 0-30, 31-60, 61-90, 91-180, 180+

### ข้อมูลตัวเลขปัจจุบัน (จาก lot snapshot ล่าสุด)
- Lot snapshot: 30 เม.ย. 2569 · รวมรายการสต็อก: ~688 บรรทัด · SKU: ~461 รายการ · คลัง: 11 แห่ง
- มูลค่าสต็อกรวม ~฿174.7M (Actual = Moving Avg เพราะ SAP ใช้ moving average costing)
- COGS 12 เดือน ~฿529.8M · Turnover ~3.03× · DIO ~120 วัน
- Dead Stock ~33.6% (ต้องดูแล)

### ประเด็นพิเศษของ NSL
- Transfer Imbalance: SAP export ขา transfer-OUT หาย ระบบจึงใช้ lot snapshot (นับจริง) แทน
- WAC = Actual เพราะ SAP ตีต้นทุนทุก lot ที่รับเข้าด้วย moving average
- Working Capital, Inventory Value (MA), Std Cost — ตัวเลขตรงกันทุกหน้า (สลับไปมา ตรงเป๊ะ)

## ลักษณะการตอบ
- ภาษาไทย กระชับ ตรงประเด็น
- ใช้ markdown ได้: ## header, **bold**, list 1./2./3. หรือ - bullet
- ถ้าตอบตัวเลข ใช้ตัวเลขจริงจาก KPI context เท่านั้น ห้ามแต่งขึ้นเอง
- ถ้าไม่อยู่ในขอบเขต: ตอบ "ขอโทษ คำถามนี้อยู่นอกขอบเขตระบบ Smart Inventory" + แนะนำหัวข้อที่ตอบได้
- ตอบสั้น: 3-8 บรรทัด หรือ 2-3 ย่อหน้าสั้นๆ ไม่ยาวเกินจำเป็น

## ห้าม
- ห้ามตอบคำถามนอกขอบเขต (ข่าวทั่วไป, การเงินส่วนตัว, ระบบอื่น)
- ห้ามแต่งตัวเลข — ถ้าไม่มีใน context บอกตรงๆ
- ห้ามให้คำแนะนำการเงิน/ลงทุนนอกบริบทระบบ`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 200);

  if (!GEMINI_API_KEY) {
    return json({ ok: false, error: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน Supabase secrets' }, 200);
  }

  let body: { messages?: Array<{role:string; text:string}>; kpi?: Record<string, unknown> } = {};
  try { body = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 200); }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return json({ ok: false, error: 'messages array is required' }, 200);

  const contents: Array<{role:string; parts:Array<{text:string}>}> = [];
  if (body.kpi) {
    contents.push({
      role: 'user',
      parts: [{ text: `ข้อมูล KPI ปัจจุบัน (จาก lot snapshot ล่าสุด):\n\n${JSON.stringify(body.kpi, null, 2)}\n\nใช้ข้อมูลนี้ตอบคำถามถัดไป` }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'รับทราบข้อมูล KPI ล่าสุดแล้วครับ พร้อมตอบคำถาม' }],
    });
  }
  for (const m of messages) {
    if (!m.text) continue;
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.text) }],
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const reqBody = {
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature:     0.6,
      maxOutputTokens: 2048,
      topP:            0.9,
      thinkingConfig:  { thinkingBudget: 0 },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',threshold: 'BLOCK_NONE' },
    ],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    const raw = await res.text();
    // deno-lint-ignore no-explicit-any
    let data: any = null;
    try { data = JSON.parse(raw); } catch { /* not JSON */ }
    if (!res.ok) {
      return json({ ok: false, error: data?.error?.message || `Gemini HTTP ${res.status}`, status: res.status, model: GEMINI_MODEL }, 200);
    }
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? '').join('') ?? '';
    if (!text) {
      return json({ ok: false, error: 'Gemini returned empty content', finish_reason: data?.candidates?.[0]?.finishReason ?? null }, 200);
    }
    return json({ ok: true, text, model: GEMINI_MODEL, usage: data?.usageMetadata ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return json({ ok: false, error: `Fetch error: ${msg}` }, 200);
  }
});
