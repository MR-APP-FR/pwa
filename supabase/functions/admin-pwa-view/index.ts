import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Vue terrain admin CRM (prod-safe, équivalent switcher local).
 *
 * verify_jwt: false — auth custom :
 * - mint : Bearer JWT admin (session CRM Auth)
 * - list / impersonate : view_token HMAC (émis au mint, cookie PWA)
 *
 * Pas de service role côté Vercel.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VIEW_TTL_SEC = 60 * 60 * 24 * 7; // 7 jours

type Body = {
  action?: unknown;
  view_token?: unknown;
  userId?: unknown;
};

type EmployeeRow = {
  id: number;
  fullname: string | null;
  login: string | null;
  email: string | null;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlFromString(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

function fromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signViewToken(
  secret: string,
  payload: { uid: string; email: string; exp: number },
): Promise<string> {
  const body = b64urlFromString(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function verifyViewToken(
  secret: string,
  token: string,
): Promise<{ uid: string; email: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sigPart] = parts;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    fromB64url(sigPart),
    new TextEncoder().encode(body),
  );
  if (!ok) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64url(body)),
    ) as { uid?: string; email?: string; exp?: number };
    if (
      typeof payload.uid !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp * 1000 < Date.now()) return null;
    return { uid: payload.uid, email: payload.email };
  } catch {
    return null;
  }
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() || null;
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) {
    return json(500, { error: "server_misconfigured" });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function assertStillAdmin(email: string): Promise<boolean> {
    const { data, error } = await admin.rpc("is_email_admin", {
      check_email: email,
    });
    if (error) {
      console.error("admin-pwa-view is_email_admin", error.message);
      return false;
    }
    return data === true;
  }

  async function listEmployees(): Promise<EmployeeRow[]> {
    const { data, error } = await admin
      .from("user")
      .select("id, fullname, login, email")
      .eq("actif", true)
      .order("fullname");
    if (error) {
      console.error("admin-pwa-view list", error.message);
      return [];
    }
    return (data ?? []) as EmployeeRow[];
  }

  if (action === "mint") {
    const jwt = bearerToken(req);
    if (!jwt) return json(401, { error: "missing_jwt" });

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user?.email) {
      return json(401, { error: "invalid_jwt" });
    }

    const email = userData.user.email.trim().toLowerCase();
    if (!(await assertStillAdmin(email))) {
      return json(403, { error: "not_admin" });
    }

    // Garantit is_admin() RLS si le compte Auth n'a pas encore le rôle portal.
    const { error: roleError } = await userClient.rpc("ensure_portal_admin_role");
    if (roleError) {
      console.error("admin-pwa-view ensure role", roleError.message);
    }

    const exp = Math.floor(Date.now() / 1000) + VIEW_TTL_SEC;
    const view_token = await signViewToken(serviceKey, {
      uid: userData.user.id,
      email,
      exp,
    });

    const employees = await listEmployees();
    return json(200, {
      view_token,
      admin_email: email,
      employees: employees.map((e) => ({
        id: e.id,
        fullname: e.fullname ?? "",
        login: e.login ?? "",
      })),
    });
  }

  if (action === "list" || action === "impersonate") {
    const viewToken =
      typeof body.view_token === "string" ? body.view_token.trim() : "";
    if (!viewToken) return json(401, { error: "missing_view_token" });

    const claims = await verifyViewToken(serviceKey, viewToken);
    if (!claims) return json(401, { error: "invalid_view_token" });
    if (!(await assertStillAdmin(claims.email))) {
      return json(403, { error: "not_admin" });
    }

    if (action === "list") {
      const employees = await listEmployees();
      return json(200, {
        admin_email: claims.email,
        employees: employees.map((e) => ({
          id: e.id,
          fullname: e.fullname ?? "",
          login: e.login ?? "",
        })),
      });
    }

    const userId = Number(body.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return json(400, { error: "invalid_user_id" });
    }

    const { data: userRow, error: userErr } = await admin
      .from("user")
      .select("id, email")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !userRow?.email) {
      return json(404, { error: "user_not_found" });
    }

    const email = String(userRow.email).trim();
    if (!email) return json(422, { error: "missing_email" });

    async function generateTokenHash(): Promise<string | null> {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error || !data.properties?.hashed_token) {
        console.error("admin-pwa-view generateLink", error?.message);
        return null;
      }
      return data.properties.hashed_token;
    }

    let tokenHash = await generateTokenHash();
    if (!tokenHash) {
      // Employé jamais provisionné Auth : crée un compte confirmé (MDP aléatoire).
      const randomPassword = crypto.randomUUID() + crypto.randomUUID();
      const { error: createError } = await admin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { public_user_id: userId, provisioned_by: "admin-pwa-view" },
      });
      if (createError) {
        const msg = (createError.message ?? "").toLowerCase();
        if (
          !(
            msg.includes("already") ||
            msg.includes("registered") ||
            msg.includes("exists") ||
            createError.status === 422
          )
        ) {
          console.error("admin-pwa-view createUser", createError.message);
          return json(500, { error: "create_failed" });
        }
      }
      tokenHash = await generateTokenHash();
    }

    if (!tokenHash) {
      return json(500, { error: "generate_link_failed" });
    }

    return json(200, {
      token_hash: tokenHash,
      employee_id: userId,
      employee_email: email,
    });
  }

  return json(400, { error: "unknown_action" });
});
