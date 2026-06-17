// Supabase Edge Function: ai-chat — unified AI chat router.
// Supports provider: 'gemini' | 'claude' | 'openai'
// Drop-in replacement for gemini-chat and claude-chat.

import Anthropic from 'npm:@anthropic-ai/sdk';
import OpenAI    from 'npm:openai';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY')    ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY')    ?? '';

const GEMINI_MODEL   = Deno.env.get('GEMINI_MODEL')   ?? 'gemini-2.5-flash';
const CLAUDE_MODEL   = Deno.env.get('CLAUDE_MODEL')   ?? 'claude-fable-5';
const OPENAI_MODEL   = Deno.env.get('OPENAI_MODEL')   ?? 'gpt-4o';

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

## รูปแบบการตอบ
- ภาษาไทย กระชับ มีหลัก ไม่อ้อมค้อม
- markdown: ## header, **bold**, list 1./2./3., - bullet
- ใช้ตัวเลขจาก KPI context เท่านั้น
- ถ้าไม่อยู่ในข้อมูลหรือนอกขอบเขต → บอกตรงๆ

## ห้าม
❌ แต่งตัวเลขที่ไม่มีในข้อมูล
❌ ข่าว การเมือง ราคาหุ้น/ข่าวทั่วไป`;

// ── Provider implementations ────────────────────────────────────────────────

async function callGemini(messages: Array<{role:string;text:string}>, kpi?: Record<string,unknown>) {
  if (!GEMINI_API_KEY) return { ok: false as const, error: 'GEMINI_API_KEY ยังไม่ได้ตั้งค่า' };

  const contents: Array<{role:string;parts:Array<{text:string}>}> = [];
  if (kpi) {
    contents.push({ role:'user',  parts:[{text:`KPI:\n${JSON.stringify(kpi,null,2)}\nใช้ข้อมูลนี้ตอบคำถามถัดไป`}] });
    contents.push({ role:'model', parts:[{text:'รับทราบ KPI ล่าสุดแล้วครับ'}] });
  }
  for (const m of messages) {
    if (!m.text) continue;
    contents.push({ role: m.role==='assistant'?'model':'user', parts:[{text:String(m.text)}] });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res  = await fetch(url, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      contents,
      systemInstruction: {parts:[{text:SYSTEM_PROMPT}]},
      generationConfig: { temperature:0.65, maxOutputTokens:4096, topP:0.95, thinkingConfig:{thinkingBudget:2048} },
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
  if (!res.ok) return { ok: false as const, error: data?.error?.message ?? `Gemini HTTP ${res.status}` };
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p:{text?:string}) => p.text??'').join('') ?? '';
  if (!text) return { ok: false as const, error: 'Gemini returned empty content' };
  return { ok: true as const, text, model: GEMINI_MODEL };
}

async function callClaude(messages: Array<{role:string;text:string}>, kpi?: Record<string,unknown>) {
  if (!ANTHROPIC_API_KEY) return { ok: false as const, error: 'ANTHROPIC_API_KEY ยังไม่ได้ตั้งค่า' };

  const anthropicMessages: Array<{role:'user'|'assistant';content:string}> = [];
  if (kpi) {
    anthropicMessages.push({ role:'user',      content:`KPI:\n${JSON.stringify(kpi,null,2)}\nใช้ข้อมูลนี้ตอบคำถามถัดไป` });
    anthropicMessages.push({ role:'assistant', content:'รับทราบ KPI ล่าสุดแล้วครับ' });
  }
  for (const m of messages) {
    if (!m.text) continue;
    anthropicMessages.push({ role: m.role==='assistant'?'assistant':'user', content: String(m.text) });
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const stream = client.messages.stream({ model:CLAUDE_MODEL, max_tokens:4096, system:SYSTEM_PROMPT, messages:anthropicMessages });
    const final  = await stream.finalMessage();
    const text   = final.content.filter(b=>b.type==='text').map(b=>(b as {type:'text';text:string}).text).join('');
    if (!text) return { ok: false as const, error: 'Claude returned empty content' };
    return { ok: true as const, text, model: CLAUDE_MODEL };
  } catch(e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Claude error' };
  }
}

async function callOpenAI(messages: Array<{role:string;text:string}>, kpi?: Record<string,unknown>) {
  if (!OPENAI_API_KEY) return { ok: false as const, error: 'OPENAI_API_KEY ยังไม่ได้ตั้งค่า' };

  const openaiMessages: Array<{role:'system'|'user'|'assistant';content:string}> = [
    { role:'system', content: SYSTEM_PROMPT },
  ];
  if (kpi) {
    openaiMessages.push({ role:'user',      content:`KPI:\n${JSON.stringify(kpi,null,2)}\nใช้ข้อมูลนี้ตอบคำถามถัดไป` });
    openaiMessages.push({ role:'assistant', content:'รับทราบ KPI ล่าสุดแล้วครับ' });
  }
  for (const m of messages) {
    if (!m.text) continue;
    openaiMessages.push({ role: m.role==='assistant'?'assistant':'user', content: String(m.text) });
  }

  try {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const res    = await client.chat.completions.create({ model: OPENAI_MODEL, messages: openaiMessages, max_tokens: 4096 });
    const text   = res.choices[0]?.message?.content ?? '';
    if (!text) return { ok: false as const, error: 'OpenAI returned empty content' };
    return { ok: true as const, text, model: OPENAI_MODEL };
  } catch(e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'OpenAI error' };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' });

  let body: { provider?: string; messages?: Array<{role:string;text:string}>; kpi?: Record<string,unknown> } = {};
  try { body = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON body' }); }

  const provider = (body.provider ?? 'gemini') as 'gemini' | 'claude' | 'openai';
  const messages  = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return json({ ok: false, error: 'messages array is required' });

  let result: { ok: boolean; text?: string; model?: string; error?: string };
  if      (provider === 'claude')  result = await callClaude(messages, body.kpi);
  else if (provider === 'openai')  result = await callOpenAI(messages, body.kpi);
  else                             result = await callGemini(messages, body.kpi);

  if (!result.ok) return json({ ok: false, error: result.error, provider });
  return json({ ok: true, text: result.text, model: result.model, provider });
});
