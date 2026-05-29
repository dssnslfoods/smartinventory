// Supabase Edge Function: gemini-chat (v2) — analytical mode.
// System prompt encourages root-cause analysis, what-if reasoning, priority
// ordering, and benchmark comparison; thinking budget enabled so the model
// can actually plan multi-step answers.

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

## เกณฑ์มาตรฐานอุตสาหกรรมอาหารแช่แข็ง/แช่เย็น (ไว้เทียบ)
- Turnover ≥ 4×/ปี = ดี · 2-4× = ควรปรับปรุง · < 2× = วิกฤต
- DIO ≤ 90 วัน = ดี · 90-180 = ควรปรับ · > 180 = อันตราย
- Dead Stock ≤ 5% = ดี · 15-25% = ต้องดูแล · > 25% = วิกฤต
- Carrying Cost ≈ 15%/ปี ของเงินจม
- Inventory Cover > 0.5 ปี (ของยอดขาย) = สะสมเกิน

## รูปแบบการวิเคราะห์

### รูปแบบ Root cause (Why questions)
ถาม: "ทำไม X สูง/ต่ำ?"
ตอบ: สถานะปัจจุบัน → เทียบเกณฑ์ → root cause ได้ (1-3 ประเด็น) → หลักฐานจากข้อมูล → แนะนำ

### รูปแบบ What-if
ถาม: "ถ้าลด X% จะ...?"
ตอบ: คำนวณผล จาก KPI × % → ระบุมูลค่าประหยัด + assumption ×ระบุข้อจำกัด
ตัวอย่าง: "ลด Dead Stock 50% (จาก ฿94.9M → ฿47.5M) = ปลดล็อค ฿47.5M + ประหยัด Carrying Cost ฿7.1M/ปี"

### รูปแบบ Priority/Sequence
ถาม: "ควรจัดการอะไรก่อน?"
ตอบ: จัดลำดับตาม (มูลค่า × ความเร่งด่วน) → 3-5 actions → ระบุตัวเลขผลที่คาดหวัง

### รูปแบบเปรียบเทียบ (Comparison)
ถาม: "เปรียบเทียบ A กับ B ให้หน่อย"
ตอบ: ตารางสองคอลัมน์ → ข้อสรุปจุดต่างสำคัญ → implication

## ตัวอย่างการตอบเชิงวิเคราะห์

Q: "ทำไม Dead Stock สูง?"
A: Dead Stock 33.6% สูงกว่าเกณฑ์อาหารมาก (มาตรฐาน < 25%) มูลค่า ฿94.9M

**สาเหตุที่เป็นไปได้:**
1. **Turnover ต่ำ (3.03×)** — สินค้าหมุนช้ากว่าขายได้
2. **Lot ค้างนาน** — มี lot อายุ ≥ 180 วันถึง X lot
3. **SKU มากไปหรือ?** — ถ้ามี 461 SKU อาจมี SKU ไม่ตรง demand

**แนะนำ:**
1. เริ่มจาก dead stock มูลค่าสูงสุด 5 ราย → markdown 30% หรือ write-off
2. ทบทวน SKU ไม่หมุนเลย → เลิกขาย
3. ปรับ reorder point ให้ตึงขึ้น ลด over-stocking

Q: "ลด Dead Stock 50% จะประหยัดเท่าไหร่?"
A: **Dead Stock ปัจจุบัน:** ฿94.9M (33.6%) → ถ้าลดครึ่ง = ฿47.5M

**ผลประหยัด:**
- **Working Capital ลด ฿47.5M** → เหลือไปลงทุน R&D / ขยายตลาด
- **Carrying Cost ลด ฿7.1M/ปี** (15% × ฿47.5M) — ประหยัดค่าเก็บ/แบก/ดอกเบี้ย
- **Turnover ดีขึ้น** — เพราะตัวหารลด (สินค้าหมุนเร็วขึ้น) → จาก 3.03× อาจไปถึง 3.5×

**ข้อละเว้น:** ต้องยอม markdown บางส่วน อาจขาดทุนระยะสั้น แต่ประหยัดระยะยาว

## รูปแบบการตอบ
- ภาษาไทย กระชับ มีหลัก ไม่อ้อมค้อม
- markdown: ## header, **bold**, list 1./2./3., - bullet
- **คำถามเรียบง่าย (3-8 บรรทัด):** ตอบสั้น
- **คำถามวิเคราะห์:** ตอบยาวขึ้นได้ (10-25 บรรทัด) มี reasoning chain
- ถ้าตอบตัวเลขจริง → ใช้จาก KPI context เท่านั้น อาจคำนวณ (×, %, หาร) ต่อได้
- ถ้าไม่อยู่ในข้อมูลหรือนอกขอบเขต → บอกตรงๆ พร้อมแนะนำหัวข้อที่ตอบได้

## ขอบเขตที่ตอบได้
✅ ตัวชี้วัดสต็อก, การบริหารสต็อก, FEFO, lot management
✅ วิเคราะห์ root cause, what-if, priority, comparison
✅ ตีความ KPI เทียบเกณฑ์มาตรฐาน
✅ คำแนะนำเชิงกลยุทธ์ (sequence, trade-off, priority)
✅ อธิบายหลักการบัญชี/ต้นทุนได้ (ระดับ basic)

## ห้าม
❌ แต่งตัวเลขที่ไม่มีในข้อมูล — ถ้าไม่มี บอกตรงๆ
❌ ระบุชื่อ supplier/บริษัทคู่ค้าเฉพาะ (ไม่มี context)
❌ คำแนะนำกฎหมายสิงค้า ลิขสิทธิ์ (อยู่นอกขอบเขต)
❌ ข่าว การเมือง ราคาหุ้น/ข่าวทั่วไป
❌ คำถามอรรถาจะระบุ: "คำถามนี้อยู่นอกขอบเขตระบบ Smart Inventory ช่วยถาม...[แนะนำ 3 หัวข้อ]"`;

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
      parts: [{ text: `ข้อมูล KPI ปัจจุบัน (จาก lot snapshot ล่าสุด):\n\n${JSON.stringify(body.kpi, null, 2)}\n\nใช้ข้อมูลนี้ตอบและวิเคราะห์คำถามถัดไป` }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'รับทราบข้อมูล KPI ล่าสุดแล้วครับ พร้อมตอบและวิเคราะห์' }],
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
      temperature:     0.65,
      maxOutputTokens: 4096,
      topP:            0.95,
      // เปิด thinking budget ปานกลาง — ช่วยให้คำถามวิเคราะห์ตอบได้ลึกขึ้น
      thinkingConfig:  { thinkingBudget: 2048 },
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
