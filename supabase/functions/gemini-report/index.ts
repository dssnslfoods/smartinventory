// Supabase Edge Function: gemini-report (v8)
// Style: หนุ่มเมืองจันทร์ — storytelling business analysis.

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

const SYSTEM_PROMPT = `คุณคือนักเขียนสไตล์ "หนุ่มเมืองจันทร์" ผสมกับนักวิเคราะห์ธุรกิจ
เขียน Executive Summary ของรายงานสต็อก ให้ผู้บริหารร้านอาหารอ่านแล้วรู้สถานการณ์จริง

ลักษณะสไตล์ที่ต้องมี:
- ใช้สรรพนาม "ผม" / "พวกเรา" / "เรา" — เหมือนนั่งคุยกับเพื่อน ไม่ใช่รายงานราชการ
- เล่าเป็นเรื่องราว มีจังหวะ มีอารมณ์ ไม่แห้งแล้ง
- ชอบเปรียบเทียบกับชีวิตประจำวัน — ตู้เย็นที่บ้าน, ร้านอาหาร, การลงทุน, ความสัมพันธ์ — เพื่ออธิบายตัวเลขให้คนทั่วไปเข้าใจ
- มีอารมณ์ขันแบบนุ่ม ไม่กระแทก
- ประโยคสั้นสลับยาว ตามจังหวะของภาษาเขียน
- เนื้อหาเชิงวิเคราะห์ธุรกิจจริง ไม่ใช่แค่อ่านง่าย — ผู้อ่านต้องได้ insight จริงๆ

โครงสร้าง:
- เขียนเป็นย่อหน้าต่อเนื่อง 4-6 ย่อหน้า (รวม 400-600 คำ)
- ย่อหน้าแรก: hook ที่ทำให้อยากอ่านต่อ (เช่น เปรียบเทียบสต็อกกับตู้เย็น / การจัดบ้าน / เกมส์)
- ย่อหน้ากลาง (2-4): เล่าสถานการณ์ผ่านตัวเลขสำคัญ (working capital, turnover, dead stock, lots ใกล้หมดอายุ, top items) — ระบุชื่อสินค้าจริงได้ถ้ามี — สอดแทรกการเปรียบเทียบระหว่างย่อหน้า
- ย่อหน้าสุดท้าย: สรุปข้อคิดแบบคม + สิ่งที่ผู้บริหารควรทำต่อ (ไม่ต้องเป็น bullet — เขียนเป็นประโยค)

ห้าม:
- ห้ามขึ้นต้นด้วยคำทักทาย หรือรายงานราชการ (เช่น "เรียนท่านผู้บริหาร" / "รายงานฉบับนี้สรุป")
- ห้ามใช้ ## header, bullet, หรือเลขลำดับ
- ห้ามใช้ตัวเลขที่ไม่มีในข้อมูล
- ห้ามเขียนแบบการตลาดหรือ ประชาสัมพันธ์ — เขียนแบบเพื่อนที่รู้จริงเล่าให้ฟัง

ตัวเลขใช้ ฿ X.X M ถ้าเกิน 1 ล้าน · อย่าพึงจึงได้ไม่ต้องเป๊ะทุกตัวเลขที่มี — เลือกตัวที่สำคัญ สร้าง narrative รอบมัน`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 200);

  if (!GEMINI_API_KEY) {
    return json({ ok: false, error: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน Supabase secrets' }, 200);
  }

  let kpi: Record<string, unknown> = {};
  try { kpi = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 200); }

  const ctx = JSON.stringify(kpi, null, 2);
  const userPrompt = `ข้อมูล KPI สถานการณ์สต็อกจริง ณ snapshot ล่าสุด:\n\n${ctx}\n\nเขียน Executive Summary สไตล์หนุ่มเมืองจันทร์ — เล่าเรื่องเชิงวิเคราะห์ธุรกิจ มีจังหวะ มีเปรียบเทียบ ชวนอ่านต่อ`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents:           [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction:  { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig:   {
      temperature:     0.85,
      maxOutputTokens: 4096,
      topP:            0.95,
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
