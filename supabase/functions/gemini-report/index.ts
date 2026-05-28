// Supabase Edge Function: gemini-report (v3)
// Returns 200 with { ok:false, error, ... } on Gemini failures so supabase-js
// surfaces the body cleanly to the client. Only fatal infra errors return 5xx.

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

const SYSTEM_PROMPT = `คุณคือผู้เชี่ยวชาญด้านการวิเคราะห์สต็อกสินค้าอาหารแช่แข็ง/แช่เย็น
ทำหน้าที่เขียน Executive Summary ภาษาไทย กระชับ ตรงประเด็น ไม่ฟุ่มเฟือย

หลักการ:
- ใช้ภาษาทางการแต่อ่านง่าย เหมือนผู้บริหารคุยกับผู้บริหาร
- ห้ามคาดเดาตัวเลขนอกเหนือจากที่ได้รับ — ใช้เฉพาะตัวเลขในข้อมูล
- ระบุ "สถานการณ์", "ความเสี่ยง", "โอกาส", "สิ่งที่ควรทำต่อ" ให้ครบ
- ไม่ใช้ bullet เกินจำเป็น — เขียนเป็นย่อหน้า 3-5 ย่อหน้า รวมไม่เกิน 350 คำ
- เกณฑ์มาตรฐานอาหาร: Turnover ≥ 4×/ปี = ดี, < 2× = วิกฤต · Dead stock > 25% = อันตราย · Carrying cost ≈ 15%/ปี
- ปิดท้ายด้วย "คำแนะนำ 3 ข้อสูงสุด" เรียงความสำคัญ ใช้รูปแบบ:
  คำแนะนำเชิงรุก
  1. ...
  2. ...
  3. ...`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 200);

  if (!GEMINI_API_KEY) {
    return json({
      ok: false,
      error: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน Supabase secrets',
      hint:  'Supabase Dashboard → Project Settings → Edge Functions → Secrets → Add GEMINI_API_KEY',
    }, 200);
  }

  let kpi: Record<string, unknown> = {};
  try { kpi = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 200); }

  const ctx = JSON.stringify(kpi, null, 2);
  const userPrompt =
`ข้อมูล KPI สถานการณ์สต็อก ณ snapshot ล่าสุด (ตัวเลขจริงจากระบบ):

${ctx}

โปรดเขียน Executive Summary ตามหลักการที่กำหนด`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents:           [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction:  { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig:   { temperature: 0.4, maxOutputTokens: 1024, topP: 0.9 },
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
        gemini_status: data?.error?.status,
        model: GEMINI_MODEL,
        raw_first_200: raw.slice(0, 200),
      }, 200);
    }
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? '').join('') ?? '';
    if (!text) {
      return json({
        ok: false,
        error: 'Gemini returned empty content',
        finish_reason: data?.candidates?.[0]?.finishReason ?? null,
        safety: data?.candidates?.[0]?.safetyRatings ?? null,
      }, 200);
    }
    return json({ ok: true, model: GEMINI_MODEL, text, usage: data?.usageMetadata ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return json({ ok: false, error: `Fetch error: ${msg}` }, 200);
  }
});
