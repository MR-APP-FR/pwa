import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  BUREAU_SINCE_YESTERDAY_SCOPE,
  BUREAU_SINCE_YESTERDAY_PROMPT_VERSION,
  BUREAU_SINCE_YESTERDAY_SYSTEM,
  bureauSinceYesterdayUser,
  CA_DIGEST_DETAIL_MARKER,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Digest Bureau « depuis hier » → `ai_insight` + message canal `bureau`
 * (kind `bureau_digest`). CRM ensure on view Messages.
 */

function parisParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    dateIso: `${pick("year")}-${pick("month")}-${pick("day")}`,
  };
}

function shiftDateIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function formatFrDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Minuit Europe/Paris → ISO UTC (gère CET/CEST). */
function parisMidnightUtcIso(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  for (const offsetH of [1, 2]) {
    const ms = Date.UTC(y, m - 1, d) - offsetH * 3_600_000;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    if (
      `${pick("year")}-${pick("month")}-${pick("day")}` === dateIso &&
      pick("hour") === "00" &&
      pick("minute") === "00"
    ) {
      return new Date(ms).toISOString();
    }
  }
  return new Date(Date.UTC(y, m - 1, d, -1, 0, 0)).toISOString();
}

async function loadBureauSnapshot(supabase: SupabaseClient, dateIso: string) {
  const { data: sites } = await supabase.from("site").select("id, name");
  const siteName = new Map(
    (sites ?? []).map((s) => [Number(s.id), (s.name as string)?.trim() || `Site ${s.id}`]),
  );

  const { data: users } = await supabase.from("user").select("id, fullname");
  const userName = new Map(
    (users ?? []).map((u) => [
      Number(u.id),
      (u.fullname as string)?.trim() || `#${u.id}`,
    ]),
  );

  const { data: lateRows } = await supabase
    .from("opening_late_alert")
    .select("site_id, teneur_user_id, reported_at")
    .eq("date", dateIso)
    .not("reported_at", "is", null);

  const lateOpenings = (lateRows ?? []).map((r) => ({
    site: siteName.get(Number(r.site_id)) ?? `Site ${r.site_id}`,
    teneur: r.teneur_user_id != null
      ? userName.get(Number(r.teneur_user_id)) ?? null
      : null,
  }));

  const dayStart = parisMidnightUtcIso(dateIso);
  const dayEnd = parisMidnightUtcIso(shiftDateIso(dateIso, 1));

  const { data: bureauMsgs } = await supabase
    .from("staff_message")
    .select("id, titre, corps, meta, publie_at")
    .eq("channel", "bureau")
    .eq("source", "appli")
    .gte("publie_at", dayStart)
    .lt("publie_at", dayEnd)
    .order("publie_at", { ascending: false })
    .limit(80);

  const alertsByKind: Record<string, number> = {};
  const samples: Array<{ kind: string; titre: string; excerpt: string }> = [];
  for (const msg of bureauMsgs ?? []) {
    const meta = (msg.meta ?? {}) as { kind?: string };
    if (meta.kind === "bureau_digest") continue;
    const kind = meta.kind ?? "autre";
    alertsByKind[kind] = (alertsByKind[kind] ?? 0) + 1;
    if (samples.length < 12) {
      samples.push({
        kind,
        titre: String(msg.titre ?? ""),
        excerpt: String(msg.corps ?? "").slice(0, 160).replace(/\n/g, " · "),
      });
    }
  }

  const { data: pannesRows } = await supabase
    .from("daily_info")
    .select("site_id, pannes, pannes_autre")
    .eq("date", dateIso);

  const pannes: Array<{ site: string; note: string }> = [];
  for (const row of pannesRows ?? []) {
    const note = [row.pannes, row.pannes_autre]
      .filter((x) => typeof x === "string" && x.trim())
      .join(" / ");
    if (!note) continue;
    pannes.push({
      site: siteName.get(Number(row.site_id)) ?? `Site ${row.site_id}`,
      note: note.slice(0, 120),
    });
  }

  return {
    dateIso,
    label: formatFrDate(dateIso),
    lateOpenings,
    alertsByKind,
    samples,
    pannes: pannes.slice(0, 15),
    counts: {
      lateOpenings: lateOpenings.length,
      bureauAlerts: Object.values(alertsByKind).reduce((a, b) => a + b, 0),
      pannes: pannes.length,
    },
  };
}

function splitResume(corps: string): string {
  const idx = corps.indexOf(CA_DIGEST_DETAIL_MARKER);
  if (idx >= 0) return corps.slice(0, idx).trim();
  return corps.split("\n")[0]?.trim() ?? corps.slice(0, 200);
}

async function buildDigest(
  supabase: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadBureauSnapshot>>,
  forceRegen: boolean,
) {
  const inputHash = await sha256Hex(JSON.stringify(snapshot));
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: BUREAU_SINCE_YESTERDAY_SCOPE,
      scopeKey: snapshot.dateIso,
      inputHash,
      promptVersion: BUREAU_SINCE_YESTERDAY_PROMPT_VERSION,
    });
    if (cached) {
      return {
        corps: cached.content,
        model: cached.model,
        error: null as string | null,
        insightId: cached.id as number | null,
        cached: true,
      };
    }
  }

  if (!foundryConfig()) {
    return {
      corps: "",
      model: null,
      error: "llm_not_configured",
      insightId: null,
      cached: false,
    };
  }

  try {
    const result = await foundryChatCompletion({
      job: "sonnet",
      messages: [
        { role: "system", content: BUREAU_SINCE_YESTERDAY_SYSTEM },
        {
          role: "user",
          content: bureauSinceYesterdayUser(
            snapshot.label,
            snapshot.dateIso,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 1100,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: BUREAU_SINCE_YESTERDAY_SCOPE,
      scopeKey: snapshot.dateIso,
      inputHash,
      promptVersion: BUREAU_SINCE_YESTERDAY_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: { counts: snapshot.counts, alertsByKind: snapshot.alertsByKind },
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
    });
    return {
      corps: result.content,
      model: result.model,
      error: null,
      insightId: row.id,
      cached: false,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fallback = [
      `Journée ${snapshot.label} : ${snapshot.counts.lateOpenings} retard(s), ${snapshot.counts.bureauAlerts} alerte(s), ${snapshot.counts.pannes} panne(s).`,
      `${CA_DIGEST_DETAIL_MARKER}`,
      "**Priorités**",
      "- Vérifier le fil Bureau pour le détail.",
      "",
      "**Retards**",
      snapshot.counts.lateOpenings ? `${snapshot.counts.lateOpenings} ouverture(s) en retard.` : "RAS",
      "",
      "**Alertes**",
      Object.keys(snapshot.alertsByKind).length
        ? Object.entries(snapshot.alertsByKind)
          .map(([k, n]) => `${k} : ${n}`)
          .join(" · ")
        : "RAS",
      "",
      "**Pannes**",
      snapshot.counts.pannes ? `${snapshot.counts.pannes} site(s).` : "RAS",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: BUREAU_SINCE_YESTERDAY_SCOPE,
        scopeKey: snapshot.dateIso,
        inputHash,
        promptVersion: BUREAU_SINCE_YESTERDAY_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { counts: snapshot.counts },
        error: msg.slice(0, 500),
      });
      return {
        corps: fallback,
        model: null,
        error: msg.slice(0, 300),
        insightId: row.id,
        cached: false,
      };
    } catch {
      return {
        corps: fallback,
        model: null,
        error: msg.slice(0, 300),
        insightId: null,
        cached: false,
      };
    }
  }
}

async function upsertBureauMessage(
  supabase: SupabaseClient,
  dateIso: string,
  digestCorps: string,
  insightId: number | null,
) {
  const resume = splitResume(digestCorps);
  const corps = [
    `📅 Jour : ${formatFrDate(dateIso)}`,
    "",
    resume,
    "",
    "(Détail dans le bandeau CRM Messages / Bureau.)",
  ].join("\n");

  const { data: existing } = await supabase
    .from("staff_message")
    .select("id")
    .eq("channel", "bureau")
    .eq("source", "appli")
    .filter("meta->>kind", "eq", "bureau_digest")
    .filter("meta->>date", "eq", dateIso)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("staff_message")
      .update({
        corps,
        meta: {
          kind: "bureau_digest",
          date: dateIso,
          insight_id: insightId,
        },
      })
      .eq("id", existing.id);
    return { inserted: false, id: existing.id as number };
  }

  const { data: inserted, error } = await supabase
    .from("staff_message")
    .insert({
      titre: "📋 Digest Bureau",
      corps,
      source: "appli",
      channel: "bureau",
      auteur_uuid: null,
      site_ids: [],
      user_ids: [],
      require_ack: false,
      meta: { kind: "bureau_digest", date: dateIso, insight_id: insightId },
    })
    .select("id")
    .single();
  if (error) throw error;
  return { inserted: true, id: inserted.id as number };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ensure = url.searchParams.get("ensure") === "1";
  const regen = url.searchParams.get("regen") === "1";
  const postMessage = url.searchParams.get("post") !== "0";
  const dateOverride = url.searchParams.get("date");

  const paris = parisParts();
  const dateIso =
    dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)
      ? dateOverride
      : shiftDateIso(paris.dateIso, -1);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (ensure && !regen) {
    const { data: existing } = await supabase
      .from("ai_insight")
      .select("id, content, model, status")
      .eq("scope", BUREAU_SINCE_YESTERDAY_SCOPE)
      .eq("scope_key", dateIso)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.content) {
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        dateIso,
        insightId: existing.id,
        cached: true,
        corpsLength: String(existing.content).length,
      });
    }
  }

  try {
    const snapshot = await loadBureauSnapshot(supabase, dateIso);
    const digest = await buildDigest(supabase, snapshot, regen);
    let messageId: number | null = null;
    if (postMessage && digest.corps) {
      const msg = await upsertBureauMessage(
        supabase,
        dateIso,
        digest.corps,
        digest.insightId,
      );
      messageId = msg.id;
    }
    return Response.json({
      ok: true,
      dateIso,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      messageId,
      counts: snapshot.counts,
    });
  } catch (e) {
    return Response.json(
      { ok: false, dateIso, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
