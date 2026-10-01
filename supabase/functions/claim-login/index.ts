import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ClaimBody = {
  login?: unknown;
  password?: unknown;
};

type EmployeeRow = {
  id: number;
  login: string | null;
  email: string | null;
  actif: boolean | null;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Case-insensitive exact match (escape LIKE wildcards). */
function escapeLikeExact(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json(500, { error: "server_misconfigured" });
  }

  let body: ClaimBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  // `login` body field = identifiant OU email (rétrocompat API).
  const identifier = typeof body.login === "string" ? body.login.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!identifier || identifier.length > 128) {
    return json(400, { error: "invalid_login" });
  }
  if (!password || password.length > 200) {
    return json(400, { error: "invalid_password" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const escaped = escapeLikeExact(identifier);
  const selectCols = "id, login, email, actif";

  // Prefers login match; falls back to email.
  // Ne jamais filtrer sur `actif` : un compte inactif doit pouvoir se connecter / claim.
  const byLogin = await admin.from("user").select(selectCols).ilike("login", escaped).limit(2);
  if (byLogin.error) {
    console.error("claim-login lookup login", byLogin.error.message);
    return json(500, { error: "lookup_failed" });
  }

  let employees = (byLogin.data ?? []) as EmployeeRow[];

  if (!employees.length) {
    const byEmail = await admin.from("user").select(selectCols).ilike("email", escaped).limit(2);
    if (byEmail.error) {
      console.error("claim-login lookup email", byEmail.error.message);
      return json(500, { error: "lookup_failed" });
    }
    employees = (byEmail.data ?? []) as EmployeeRow[];
  }

  if (!employees.length) {
    return json(404, { error: "unknown_login" });
  }
  if (employees.length > 1) {
    return json(409, { error: "ambiguous_login" });
  }

  const employee = employees[0];
  const email = typeof employee.email === "string" ? employee.email.trim() : "";
  if (!email) {
    return json(422, { error: "missing_email" });
  }

  async function signIn() {
    const { data, error } = await admin.auth.signInWithPassword({ email, password });
    if (error || !data.session) return null;
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }

  const existingSession = await signIn();
  if (existingSession) {
    return json(200, existingSession);
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      public_user_id: employee.id,
      login: employee.login,
    },
  });

  if (createError) {
    const msg = (createError.message ?? "").toLowerCase();
    // Politique MDP (ex. min 6) → ne pas masquer en « incorrect ».
    if (
      msg.includes("password") ||
      msg.includes("at least") ||
      msg.includes("weak") ||
      msg.includes("shortest")
    ) {
      return json(400, { error: "weak_password" });
    }
    if (
      msg.includes("already") ||
      msg.includes("registered") ||
      msg.includes("exists")
    ) {
      // Auth déjà présent + MDP saisi faux (signIn a échoué juste avant).
      return json(401, { error: "invalid_credentials" });
    }
    console.error("claim-login createUser", createError.message);
    return json(500, { error: "create_failed" });
  }

  const { error: flagError } = await admin
    .from("user")
    .update({ must_change_password: false })
    .eq("id", employee.id);
  if (flagError) {
    console.error("claim-login must_change_password", flagError.message);
  }

  const claimedSession = await signIn();
  if (!claimedSession) {
    return json(500, { error: "sign_in_failed" });
  }

  return json(200, claimedSession);
});
