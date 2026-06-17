// Supabase Edge Function: ai-report — unified AI report router.
// Supports provider: 'gemini' | 'claude' | 'openai'
// Cache key: `${provider}_${persona}` in ai_reports table (no schema change needed).

import Anthropic from 'npm:@anthropic-ai/sdk';
import OpenAI    from 'npm:openai';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY')    ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY')    ?? '';
const GEMINI_MODEL      = Deno.env.get('GEMINI_MODEL')      ?? 'gemini-2.5-flash';
const CLAUDE_MODEL      = Deno.env.get('CLAUDE_MODEL')      ?? 'claude-fable-5';
const OPENAI_MODEL      = Deno.env.get('OPENAI_MODEL')      ?? 'gpt-4o';

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

const PROMPT_NOOM = `คุณคือนักเขียนสไตล์ "หนุ่มเมืองจันทร์" ผสมกับนักวิเคราะห์ธุรกิจ
เขียน Executive Summary ของรายงานสต็อก ให้ผู้บริหารร้านอาหารอ่านแล้วรู้สถานการณ์จริง

ลักษณะ: ใช้ "ผม"/"พวกเรา" · เล่าเป็นเรื่องราว มีจังหวะ มีอารมณ์ · ชอบเปรียบเทียบชีวิตประจำวัน · อารมณ์ขันแบบนุ่ม
โครงสร้าง: 4-6 ย่อหน้า (400-600 คำ) · ย่อแรก hook · ย่อกลางเล่าตัวเลขผ่านการเปรียบเทียบ · ย่อสุดท้ายข้อคิดคม
ห้าม: ขึ้นต้นด้วยคำทักทาย / ## header / bullet / ตัวเลขที่ไม่มีในข้อมูล / ภาษาราชการ
ตัวเลขใช้ ฿ X.X M ถ้าเกิน 1 ล้าน`;

const PROMPT_SUTHICHAI = `คุณคือนักข่าวอาวุโสสไตล์ "สุทธิชัย หยุ่น"
วิเคราะห์สถานการณ์สต็อกของบริษัทอาหาร ในมุมมองนักวิเคราะห์ข่าวธุรกิจระดับชาติ

ลักษณะ: น้ำเสียงนักข่าวอาวุโส ตรงไปตรงมา · ตั้งคำถาม "คำถามคือ...", "เราต้องถามตัวเองว่า..." · ฟันธงตรง · สรรพนาม "ผม"
โครงสร้าง: 4-5 ย่อหน้า (400-550 คำ) · ย่อแรกตั้งประเด็น · ย่อกลางไล่ตัวเลข+วิเคราะห์+ตั้งคำถาม · ย่อสุดท้ายข้อสรุปชิ้นขาด
ห้าม: ขึ้นต้นด้วยคำทักทาย / ## header / bullet / ตัวเลขที่ไม่มี
ตัวเลขใช้ ฿ X.X M ถ้าเกิน 1 ล้าน`;

function pickPrompt(persona: string) {
  return persona === 'suthichai' ? PROMPT_SUTHICHAI : PROMPT_NOOM;
}
function personaHint(persona: string) {
  return persona === 'suthichai'
    ? 'เขียน Executive Summary สไตล์ สุทธิชัย หยุ่น'
    : 'เขียน Executive Summary สไตล์ หนุ่มเมืองจันทร์';
}

type CallResult =
  | { ok: true;  text: string; model: string; usage?: unknown }
  | { ok: false; error: string };

async function callGemini(systemPrompt: string, userContent: string): Promise<CallResult> {
  if (!GEMINI_API_KEY) return { ok: false, error: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่า' };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res  = await fetch(url, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      contents: [{ role:'user', parts:[{text:userContent}] }],
      systemInstruction: { parts:[{text:systemPrompt}] },
      generationConfig: { temperature:0.75, maxOutputTokens:4096, topP:0.95, thinkingConfig:{thinkingBudget:0} },
      safetySettings: [
        {category:'HARM_CATEGORY_HARASSMENT',       threshold:'BLOCK_NONE'},
        {category:'HARM_CATEGORY_HATE_SPEECH',      threshold:'BLOCK_NONE'},
        {category:'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold:'BLOCK_NONE'},
        {category:'HARM_CATEGORY_DANGEROUS_CONTENT',threshold:'BLOCK_NONE'},
      ],
    }),
  });
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data?.error?.message ?? `Gemini HTTP ${res.status}` };
  const text = data?.candidates?.[0]?.content?.parts?.map((p:{text?:string}) => p.text??'').join('') ?? '';
  if (!text) return { ok: false, error: 'Gemini returned empty content' };
  return { ok: true, text, model: GEMINI_MODEL, usage: data?.usageMetadata };
}

async function callClaude(systemPrompt: string, userContent: string): Promise<CallResult> {
  if (!ANTHROPIC_API_KEY) return { ok: false, error: 'ANTHROPIC_API_KEY ยังไม่ได้ตั้งค่า' };
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const stream = client.messages.stream({
      model: CLAUDE_MODEL, max_tokens: 4096, system: systemPrompt,
      messages: [{ role:'user', content: userContent }],
    });
    const final = await stream.finalMessage();
    const text  = final.content.filter(b=>b.type==='text').map(b=>(b as {type:'text';text:string}).text).join('');
    if (!text) return { ok: false, error: 'Claude returned empty content' };
    return { ok: true, text, model: CLAUDE_MODEL, usage: { input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens } };
  } catch(e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Claude error' };
  }
}

async function callOpenAI(systemPrompt: string, userContent: string): Promise<CallResult> {
  if (!OPENAI_API_KEY) return { ok: false, error: 'OPENAI_API_KEY ยังไม่ได้ตั้งค่า' };
  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const res    = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role:'system', content: systemPrompt },
        { role:'user',   content: userContent  },
      ],
      max_tokens: 4096,
    });
    const text = res.choices[0]?.message?.content ?? '';
    if (!text) return { ok: false, error: 'OpenAI returned empty content' };
    return { ok: true, text, model: OPENAI_MODEL, usage: res.usage };
  } catch(e) {
    return { ok: false, error: e instanceof Error ? e.message : 'OpenAI error' };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' });

  // 1. Auth
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'Missing Authorization header' });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, error: 'Invalid session' });

  // 2. company_id
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller } = await admin
    .from('user_profiles').select('company_id').eq('id', userData.user.id).single();
  if (!caller) return json({ ok: false, error: 'Caller profile not found' });
  const companyId = caller.company_id as string;

  // 3. Parse body
  let kpi: Record<string, unknown> = {};
  try { kpi = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }); }

  const provider     = String(kpi.provider     ?? 'gemini') as 'gemini'|'claude'|'openai';
  const persona      = String(kpi.persona      ?? 'noom');
  const snapshotDate = String(kpi.snapshot_date ?? '');
  const force        = Boolean(kpi.force);
  if (!snapshotDate) return json({ ok: false, error: 'snapshot_date is required' });

  // Cache key includes provider prefix to avoid collisions
  const cachePersona = `${provider}_${persona}`;

  // 4. Cache check
  if (!force) {
    const { data: cached } = await admin
      .from('ai_reports')
      .select('text, model, usage, generated_at')
      .eq('company_id',    companyId)
      .eq('snapshot_date', snapshotDate)
      .eq('persona',       cachePersona)
      .maybeSingle();
    if (cached) {
      return json({ ok:true, text:cached.text, model:cached.model, persona, provider,
        usage:cached.usage, cached:true, generated_at:cached.generated_at });
    }
  }

  // 5. Generate
  const kpiForModel = { ...kpi };
  // deno-lint-ignore no-explicit-any
  delete (kpiForModel as any).provider;
  // deno-lint-ignore no-explicit-any
  delete (kpiForModel as any).persona;
  // deno-lint-ignore no-explicit-any
  delete (kpiForModel as any).force;
  const ctx         = JSON.stringify(kpiForModel, null, 2);
  const systemPmt   = pickPrompt(persona);
  const userContent = `ข้อมูล KPI สถานการณ์สต็อกจริง:\n\n${ctx}\n\n${personaHint(persona)}`;

  let result: CallResult;
  if      (provider === 'claude')  result = await callClaude(systemPmt, userContent);
  else if (provider === 'openai')  result = await callOpenAI(systemPmt, userContent);
  else                             result = await callGemini(systemPmt, userContent);

  if (!result.ok) return json({ ok:false, error:result.error, provider });

  // 6. Cache upsert
  const usedModel = result.model;
  await admin.from('ai_reports').upsert(
    { company_id:companyId, snapshot_date:snapshotDate, persona:cachePersona,
      text:result.text, model:usedModel, usage:result.usage,
      generated_at:new Date().toISOString(), generated_by:userData.user.id },
    { onConflict:'company_id,snapshot_date,persona' },
  );

  return json({ ok:true, text:result.text, model:usedModel, persona, provider,
    usage:result.usage, cached:false, generated_at:new Date().toISOString() });
});
