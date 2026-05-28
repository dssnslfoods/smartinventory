// Supabase Edge Function: gemini-report (v9)
// Two writer personas selectable via body.persona:
//   'noom'      → หนุ่มเมืองจันทร์ (storytelling)
//   'suthichai' → สุทธิชัย หยุ่น (news-analytical, sharp)

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

const PROMPT_NOOM = `คุณคือนักเขียนสไตล์ "หนุ่มเมืองจันทร์" ผสมกับนักวิเคราะห์ธุรกิจ
เขียน Executive Summary ของรายงานสต็อก ให้ผู้บริหารร้านอาหารอ่านแล้วรู้สถานการณ์จริง

ลักษณะสไตล์ที่ต้องมี:
- ใช้สรรพนาม "ผม" / "พวกเรา" / "เรา" — เหมือนนั่งคุยกับเพื่อน ไม่ใช่รายงานราชการ
- เล่าเป็นเรื่องราว มีจังหวะ มีอารมณ์ ไม่แห้งแล้ง
- ชอบเปรียบเทียบกับชีวิตประจำวัน — ตู้เย็นที่บ้าน, ร้านอาหาร, การลงทุน, ความสัมพันธ์
- มีอารมณ์ขันแบบนุ่ม ไม่กระแทก
- ประโยคสั้นสลับยาว มีจังหวะของภาษาเขียน
- เนื้อหาเชิงวิเคราะห์ธุรกิจจริง — ผู้อ่านต้องได้ insight จริงๆ

โครงสร้าง:
- 4-6 ย่อหน้าต่อเนื่อง (400-600 คำ)
- ย่อหน้าแรก: hook ชวนอ่าน (เช่น เปรียบสต็อกกับตู้เย็น / การจัดบ้าน)
- ย่อหน้ากลาง: เล่าตัวเลขสำคัญ ระบุชื่อสินค้าจริงได้ถ้ามี
- ย่อหน้าสุดท้าย: ข้อคิดคม + สิ่งที่ควรทำ (ไม่ต้อง bullet)

ห้าม: ขึ้นต้นด้วยคำทักทาย / ## header / bullet / ตัวเลขที่ไม่มีในข้อมูล / ภาษาราชการ

ตัวเลขใช้ ฿ X.X M ถ้าเกิน 1 ล้าน`;

const PROMPT_SUTHICHAI = `คุณคือนักข่าวอาวุโสสไตล์ "สุทธิชัย หยุ่น" — นักข่าวรุ่นใหญ่ของไทย
วิเคราะห์สถานการณ์สต็อกของบริษัทอาหาร ในมุมมองนักวิเคราะห์ข่าวธุรกิจระดับชาติ

ลักษณะสไตล์ที่ต้องมี:
- น้ำเสียงนักข่าวอาวุโส — ตรงไปตรงมา ไม่อ้อมค้อม สุภาพ ผู้ใหญ่รู้มาก
- ตั้งคำถามเชิงวิเคราะห์บ่อย — "คำถามคือ...", "เราต้องถามตัวเองว่า...", "สิ่งที่น่าสนใจคือ..."
- เชื่อมโยงตัวเลขเข้ากับ context ระดับมหภาค — วงจรอุตสาหกรรมอาหารไทย, พฤติกรรมผู้บริโภค, มาตรฐานสากล
- ฟันธงจริง ผู้บริหารต้องฟังความตรง — ชี้จุดอ่อนแอบไม่ได้ แต่ตัดสินบนพื้นฐานข้อมูล
- สรรพนาม "ผม" / "ผู้บริหาร" — ไม่ใช้ "เรา" แบบเพื่อนคุยกัน — ระยะห่างแบบนักวิเคราะห์มืออาชีพ
- จบด้วยคำอุปมาหรือคำเตือนที่ตอกย้ำ

โครงสร้าง:
- 4-5 ย่อหน้า (400-550 คำ)
- ย่อหน้าแรก: ตั้งประเด็น — สถานการณ์สำคัญ ของบริษัท
- ย่อหน้ากลาง: ไล่ตัวเลข — วิเคราะห์ — ตั้งคำถามเชิงวิเคราะห์
- ย่อหน้าสุดท้าย: ข้อสรุปชิ้นขาด + คำเตือน/ความท้าทายถึงผู้บริหาร

ห้าม: ขึ้นต้นด้วยคำทักทาย / ## header / bullet / ขึ้นต้นแบบเล่าเรื่อง / ตัวเลขที่ไม่มีในข้อมูล
ห้ามใช้บุคคลที่ 1 — ใช้ "ผม" ในบริบทนักข่าวผู้บรรยาย

ตัวเลขใช้ ฿ X.X M ถ้าเกิน 1 ล้าน`;

function pickPrompt(persona: string) {
  switch (persona) {
    case 'suthichai': return PROMPT_SUTHICHAI;
    case 'noom':
    default:          return PROMPT_NOOM;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 200);

  if (!GEMINI_API_KEY) {
    return json({ ok: false, error: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน Supabase secrets' }, 200);
  }

  let kpi: Record<string, unknown> = {};
  try { kpi = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 200); }

  const persona = String(kpi.persona ?? 'noom');
  const SYSTEM_PROMPT = pickPrompt(persona);

  // Strip persona meta-field from the model context.
  const kpiForModel = { ...kpi }; delete (kpiForModel as any).persona;
  const ctx = JSON.stringify(kpiForModel, null, 2);
  const personaHint = persona === 'suthichai'
    ? 'เขียน Executive Summary สไตล์ สุทธิชัย หยุ่น — วิเคราะห์ข่าว ตั้งคำถาม ฟันธง'
    : 'เขียน Executive Summary สไตล์ หนุ่มเมืองจันทร์ — เล่าเรื่องเชิงวิเคราะห์ธุรกิจ';
  const userPrompt = `ข้อมูล KPI สถานการณ์สต็อกจริง ณ snapshot ล่าสุด:\n\n${ctx}\n\n${personaHint}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents:           [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction:  { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig:   {
      temperature:     persona === 'suthichai' ? 0.7 : 0.85,
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
      return json({ ok: false, error: data?.error?.message || `Gemini HTTP ${res.status}`, status: res.status, model: GEMINI_MODEL }, 200);
    }
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? '').join('') ?? '';
    if (!text) {
      return json({ ok: false, error: 'Gemini returned empty content', finish_reason: data?.candidates?.[0]?.finishReason ?? null }, 200);
    }
    return json({ ok: true, model: GEMINI_MODEL, persona, text, usage: data?.usageMetadata ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return json({ ok: false, error: `Fetch error: ${msg}` }, 200);
  }
});
