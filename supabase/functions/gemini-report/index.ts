// Supabase Edge Function: gemini-report (v10)
// Persistent cache: check ai_reports table for (company, snapshot, persona).
// If hit and not force → return cached. Else call Gemini and upsert.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// deno-lint-ignore no-explicit-any
declare const Deno: any;

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL      = Deno.env.get('GEMINI_MODEL')   ?? 'gemini-2.5-flash';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const PROMPT_NOOM = `คุณคือนักเขียนสไตล์ "หนุ่มเมืองจันทร์" ผสมกับนักวิเคราะห์ธุรกิจ
เขียน Executive Summary ของรายงานสต็อก ให้ผู้บริหารร้านอาหารอ่านแล้วรู้สถานการณ์จริง

ลักษณะ: ใช้ "ผม"/"พวกเรา" · เล่าเป็นเรื่องราว มีจังหวะ มีอารมณ์ · ชอบเปรียบเทียบชีวิตประจำวัน (ตู้เย็น, ร้านอาหาร) · อารมณ์ขันแบบนุ่ม ไม่กระแทก

โครงสร้าง: 4-6 ย่อหน้า (400-600 คำ) · ย่อแรก hook · ย่อกลางเล่าตัวเลขสำคัญผ่านการเปรียบเทียบ · ย่อสุดท้ายข้อคิดคม

ห้าม: ขึ้นต้นด้วยคำทักทาย / ## header / bullet / ตัวเลขที่ไม่มีในข้อมูล / ภาษาราชการ
ตัวเลขใช้ ฿ X.X M ถ้าเกิน 1 ล้าน`;

const PROMPT_SUTHICHAI = `คุณคือนักข่าวอาวุโสสไตล์ "สุทธิชัย หยุ่น" — นักข่าวรุ่นใหญ่ของไทย
วิเคราะห์สถานการณ์สต็อกของบริษัทอาหาร ในมุมมองนักวิเคราะห์ข่าวธุรกิจระดับชาติ

ลักษณะ: น้ำเสียงนักข่าวอาวุโส ตรงไปตรงมา ผู้ใหญ่รู้มาก · ตั้งคำถาม "คำถามคือ...", "เราต้องถามตัวเองว่า..." · เชื่อมโยง context ระดับมหภาค · ฟันธงตรง · สรรพนาม "ผม"/"ผู้บริหาร"

โครงสร้าง: 4-5 ย่อหน้า (400-550 คำ) · ย่อแรกตั้งประเด็น · ย่อกลางไล่ตัวเลข+วิเคราะห์+ตั้งคำถาม · ย่อสุดท้ายข้อสรุปชิ้นขาด+คำเตือน

ห้าม: ขึ้นต้นด้วยคำทักทาย / ## header / bullet / ขึ้นต้นแบบเล่าเรื่อง / ตัวเลขที่ไม่มี
ตัวเลขใช้ ฿ X.X M ถ้าเกิน 1 ล้าน`;

function pickPrompt(persona: string) {
  return persona === 'suthichai' ? PROMPT_SUTHICHAI : PROMPT_NOOM;
}

async function callGemini(prompt: string, persona: string, ctx: string) {
  const personaHint = persona === 'suthichai'
    ? 'เขียน Executive Summary สไตล์ สุทธิชัย หยุ่น'
    : 'เขียน Executive Summary สไตล์ หนุ่มเมืองจันทร์';
  const userPrompt = `ข้อมูล KPI สถานการณ์สต็อกจริง:\n\n${ctx}\n\n${personaHint}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:          [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: prompt }] },
      generationConfig:  {
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
    }),
  });
  const raw = await res.text();
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* not JSON */ }
  if (!res.ok) {
    return { ok: false as const, error: data?.error?.message || `Gemini HTTP ${res.status}`, status: res.status };
  }
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? '').join('') ?? '';
  if (!text) return { ok: false as const, error: 'Gemini returned empty content' };
  return { ok: true as const, text, usage: data?.usageMetadata ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 200);

  if (!GEMINI_API_KEY) {
    return json({ ok: false, error: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่าใน Supabase secrets' }, 200);
  }

  // 1. Identify caller
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'Missing Authorization header' }, 200);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, error: 'Invalid session' }, 200);
  const callerId = userData.user.id;

  // 2. Load company_id via service role
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller } = await admin
    .from('user_profiles')
    .select('company_id')
    .eq('id', callerId)
    .single();
  if (!caller) return json({ ok: false, error: 'Caller profile not found' }, 200);
  const companyId = caller.company_id as string;

  // 3. Parse body
  let kpi: Record<string, unknown> = {};
  try { kpi = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }, 200); }

  const persona      = String(kpi.persona ?? 'noom');
  const snapshotDate = String(kpi.snapshot_date ?? '');
  const force        = Boolean(kpi.force);
  if (!snapshotDate) return json({ ok: false, error: 'snapshot_date is required' }, 200);

  // 4. Cache check (unless force)
  if (!force) {
    const { data: cached } = await admin
      .from('ai_reports')
      .select('text, model, usage, generated_at')
      .eq('company_id',    companyId)
      .eq('snapshot_date', snapshotDate)
      .eq('persona',       persona)
      .maybeSingle();
    if (cached) {
      return json({
        ok:     true,
        text:   cached.text,
        model:  cached.model,
        persona,
        usage:  cached.usage,
        cached: true,
        generated_at: cached.generated_at,
      });
    }
  }

  // 5. Generate via Gemini
  const kpiForModel = { ...kpi };
  delete (kpiForModel as any).persona;
  delete (kpiForModel as any).force;
  const ctx = JSON.stringify(kpiForModel, null, 2);
  const result = await callGemini(pickPrompt(persona), persona, ctx);
  if (!result.ok) {
    return json({ ok: false, error: result.error, status: result.status, model: GEMINI_MODEL }, 200);
  }

  // 6. Upsert to cache
  const { error: upErr } = await admin
    .from('ai_reports')
    .upsert(
      {
        company_id:    companyId,
        snapshot_date: snapshotDate,
        persona,
        text:          result.text,
        model:         GEMINI_MODEL,
        usage:         result.usage,
        generated_at:  new Date().toISOString(),
        generated_by:  callerId,
      },
      { onConflict: 'company_id,snapshot_date,persona' },
    );
  if (upErr) {
    return json({
      ok: true, text: result.text, model: GEMINI_MODEL, persona,
      usage: result.usage, cached: false,
      cache_error: upErr.message,
    });
  }

  return json({
    ok: true, text: result.text, model: GEMINI_MODEL, persona,
    usage: result.usage, cached: false,
    generated_at: new Date().toISOString(),
  });
});
