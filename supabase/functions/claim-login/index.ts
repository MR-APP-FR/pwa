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

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  const login = typeof body.login === "string" ? body.login.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!login || login.length > 128) {
    return json(400, { error: "invalid_login" });
  }
  if (!password || password.length < 6 || password.length > 200) {
    return json(400, { error: "invalid_password" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Case-insensitive exact match (escape LIKE wildcards).
  const escaped = login.replace(/[%_]/g, "\\$&");
  const { data: employees, error: lookupError } = await admin
    .from("user")
    .select("id, login, email, actif")
    .ilike("login", escaped)
    .limit(2);

  if (lookupError) {
    console.error("claim-login lookup", lookupError.message);
    return json(500, { error: "lookup_failed" });
  }

  if (!employees?.length) {
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
    if (
      msg.includes("already") ||
      msg.includes("registered") ||
      msg.includes("exists") ||
      createError.status === 422
    ) {
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
