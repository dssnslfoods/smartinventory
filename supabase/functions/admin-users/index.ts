// Supabase Edge Function: admin-users
// Privileged user management — only callable by authenticated admin / super_admin.
// Service role key stays on the server (never exposed to the browser).
//
// Operations:
//   POST  /admin-users { action: "create", email, password, full_name, role, company_id }
//   POST  /admin-users { action: "reset-password", user_id, password }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Role = 'super_admin' | 'admin' | 'executive' | 'supervisor' | 'staff';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  // ── 1. Identify caller from JWT ─────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Missing Authorization header' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

  const callerId = userData.user.id;

  // ── 2. Load caller profile (using service role to bypass RLS reliably) ─────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: caller, error: profErr } = await admin
    .from('user_profiles')
    .select('id, role, company_id, is_active')
    .eq('id', callerId)
    .single();

  if (profErr || !caller) return json({ error: 'Caller profile not found' }, 403);
  if (!caller.is_active)  return json({ error: 'Caller is not active' }, 403);

  const callerRole = caller.role as Role;
  if (callerRole !== 'super_admin' && callerRole !== 'admin') {
    return json({ error: 'Forbidden — admin role required' }, 403);
  }

  // ── 3. Parse request body ──────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const action = String(body.action ?? '');

  // ── 4. Dispatch ────────────────────────────────────────────────────────────
  try {
    if (action === 'create') {
      return await handleCreate(admin, callerRole, caller.company_id, body);
    }
    if (action === 'reset-password') {
      return await handleResetPassword(admin, callerRole, caller.company_id, body);
    }
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return json({ error: msg }, 500);
  }
});

// ── Action: create user ──────────────────────────────────────────────────────

async function handleCreate(
  admin: ReturnType<typeof createClient>,
  callerRole: Role,
  callerCompanyId: string | null,
  body: Record<string, unknown>,
) {
  const email      = String(body.email      ?? '').trim().toLowerCase();
  const password   = String(body.password   ?? '');
  const fullName   = String(body.full_name  ?? '').trim();
  const role       = String(body.role       ?? '') as Role;
  const companyId  = String(body.company_id ?? '');

  if (!email)               return json({ error: 'email is required' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email' }, 400);
  if (password.length < 8)  return json({ error: 'Password must be ≥ 8 chars' }, 400);
  if (!fullName)            return json({ error: 'full_name is required' }, 400);
  if (!companyId)           return json({ error: 'company_id is required' }, 400);

  const validRoles: Role[] = ['admin', 'executive', 'supervisor', 'staff'];
  if (callerRole === 'super_admin') validRoles.unshift('super_admin');
  if (!validRoles.includes(role)) {
    return json({ error: `Role '${role}' is not assignable by ${callerRole}` }, 403);
  }

  // admin can only create within their own company
  if (callerRole === 'admin') {
    if (companyId !== callerCompanyId) {
      return json({ error: 'Admin may only create users in their own company' }, 403);
    }
    if (role === 'super_admin') {
      return json({ error: 'Admin may not create super_admin users' }, 403);
    }
  }

  // 1. Create auth user
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authErr) return json({ error: authErr.message }, 400);

  const newUserId = created.user.id;

  // 2. Upsert profile (handle_new_user trigger may have inserted defaults)
  const { error: profileErr } = await admin
    .from('user_profiles')
    .upsert(
      {
        id:         newUserId,
        role,
        company_id: companyId,
        full_name:  fullName,
        email,
        is_active:  true,
      },
      { onConflict: 'id' },
    );

  if (profileErr) {
    // Best-effort cleanup of auth user so we don't leave an orphan
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    return json({ error: profileErr.message }, 500);
  }

  return json({ ok: true, user_id: newUserId });
}

// ── Action: reset password ──────────────────────────────────────────────────

async function handleResetPassword(
  admin: ReturnType<typeof createClient>,
  callerRole: Role,
  callerCompanyId: string | null,
  body: Record<string, unknown>,
) {
  const userId   = String(body.user_id  ?? '');
  const password = String(body.password ?? '');

  if (!userId)              return json({ error: 'user_id is required' }, 400);
  if (password.length < 8)  return json({ error: 'Password must be ≥ 8 chars' }, 400);

  // Lookup target — admins may only reset within their own company
  if (callerRole === 'admin') {
    const { data: target, error: tErr } = await admin
      .from('user_profiles')
      .select('id, role, company_id')
      .eq('id', userId)
      .single();
    if (tErr || !target) return json({ error: 'Target user not found' }, 404);
    if (target.company_id !== callerCompanyId) {
      return json({ error: 'Admin may only reset users in their own company' }, 403);
    }
    if (target.role === 'super_admin') {
      return json({ error: 'Admin may not reset super_admin password' }, 403);
    }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return json({ error: error.message }, 400);

  return json({ ok: true });
}
