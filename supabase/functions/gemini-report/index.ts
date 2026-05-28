// Supabase Edge Function: gemini-report (v7)
// Stronger structured prompt, larger output budget, thinking disabled for 2.5
// (so all tokens go to the answer, not reasoning).

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
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `คุณคือ Senior Inventory Analyst ของบริษัทอาหารแช่แข็ง/แช่เย็น
เขียนรายงานให้ CEO / COO อ่านเข้าใจใน 60 วินาที

ห้ามเด็ดขาด:
- ห้ามขึ้นต้นด้วยคำทักทาย (เรียนท่านผู้บริหาร ...) — ขึ้นต้นด้วยหัวข้อแรกเลย
- ห้ามใช้ตัวเลขที่ไม่มีในข้อมูล
- ห้ามบรรยายฟุ่มเฟือย — ตรงประเด็นทุกประโยค

รูปแบบ output (ต้องมีครบทุกหัวข้อ ใช้ markdown ตามตัวอย่าง):

## 🎯 บทสรุปสถานการณ์
[2-3 ประโยค สั้น คม ระบุสถานะรวม "**ดี**"/"**ปกติ**"/"**น่ากังวล**"/"**วิกฤต**" + ตัวเลข headline]

## 💰 ภาพ Working Capital
[เงินจมเท่าไหร่ เทียบ COGS เป็นกี่ปี → หมายความว่าอย่างไร + Carrying cost ต่อปี]

## ⚙️ ประสิทธิภาพการหมุนเวียน
[Turnover ปัจจุบัน vs มาตรฐาน 4× · Dead stock + Slow moving มูลค่ารวม]

## ⚠️ ความเสี่ยง Top 3
1. **[ประเด็น]**: [มูลค่า/รายละเอียด]
2. **[ประเด็น]**: ...
3. **[ประเด็น]**: ...

## 💸 มูลค่าที่ป้องกันกันได้
[รวมมูลค่า expired + dead stock + lots ใกล้หมดอายุ → ตัวเลขรวมประมาณที่ป้องกันได้ถ้าจัดการทัน]

## ✅ คำแนะนำเชิงรุก 3 ข้อ
1. **[Action]**: [ผลที่คาดหวังเป็นตัวเลข]
2. **[Action]**: ...
3. **[Action]**: ...

เกณฑ์มาตรฐานอาหาร:
- Turnover ≥ 4×/ปี = ดี · 2-4× = ควรปรับปรุง · < 2× = วิกฤต
- Dead stock > 25% = อันตราย · 15-25% = ต้องดูแล
- Carrying cost ≈ 15%/ปี ของเงินจม
- Inventory cover > 0.5 ปีของยอดขาย = สะสมเกิน

ตัวเลข + หน่วย: ใช้ ฿ X.X M ถ้าเกิน 1 ล้าน · ขั้นต่ำล้านใช้จุลภาค · % ทศนิยม 1 ตำแหน่ง`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 200);

  if (!GEMINI_API_KEY) {
    return json({
      ok: false,
      error: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน Supabase secrets',
    }, 200);
  }

  let kpi: Record<string, unknown> = {};
  try { kpi = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 200); }

  const ctx = JSON.stringify(kpi, null, 2);
  const userPrompt = `ข้อมูล KPI สถานการณ์สต็อกจริง ณ snapshot ล่าสุด:\n\n${ctx}\n\nเขียนรายงานตามโครงสร้างที่กำหนด ขึ้นต้นด้วย ## 🎯 บทสรุปสถานการณ์ อย่ามีคำทักทายใดๆ`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents:           [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction:  { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig:   {
      temperature:     0.5,
      maxOutputTokens: 4096,
      topP:            0.9,
      // Disable reasoning so all tokens go to the answer (2.5 family).
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
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    // deno-lint-ignore no-explicit-any
    let data: any = null;
    try { data = JSON.parse(raw); } catch { /* not JSON */ }
    if (!res.ok) {
      return json({
        ok: false,
        error: data?.error?.message || `Gemini HTTP ${res.status}`,
        status: res.status,
        model:  GEMINI_MODEL,
      }, 200);
    }
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? '').join('') ?? '';
    if (!text) {
      return json({
        ok: false,
        error: 'Gemini returned empty content',
        finish_reason: data?.candidates?.[0]?.finishReason ?? null,
      }, 200);
    }
    return json({ ok: true, model: GEMINI_MODEL, text, usage: data?.usageMetadata ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return json({ ok: false, error: `Fetch error: ${msg}` }, 200);
  }
});
