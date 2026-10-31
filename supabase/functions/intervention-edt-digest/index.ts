import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  INTERVENTION_EDT_WEEK_SCOPE,
  INTERVENTION_EDT_WEEK_PROMPT_VERSION,
  INTERVENTION_EDT_WEEK_SYSTEM,
  interventionEdtWeekUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Résumé EDT interventions semaine → `ai_insight` (`intervention_edt_week`).
 * CRM : Lancer / Relancer (pas d'auto-génération systématique).
 */

function shiftDateIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function mondayOf(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = dt.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return shiftDateIso(dateIso, delta);
}

function parisTodayIso(): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date());
}

function weekLabel(weekStart: string): string {
  const end = shiftDateIso(weekStart, 6);
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Paris",
    }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  };
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

/** Matin / après-midi Paris (aligné edt-place). */
function edtPeriodFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hour: "numeric",
      hour12: false,
    }).format(new Date(iso)),
  );
  if (!Number.isFinite(hour)) return null;
  return hour < 14 ? "matin" : "apres-midi";
}

function parisDayIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

async function loadSnapshot(supabase: SupabaseClient, weekStart: string) {
  const weekEndExclusive = shiftDateIso(weekStart, 7);
  const { data: sites } = await supabase.from("site").select("id, name");
  const siteName = new Map(
    (sites ?? []).map((s) => [
      Number(s.id),
      (s.name as string)?.trim() || `Site ${s.id}`,
    ]),
  );

  const { data: techs } = await supabase
    .from("user")
    .select("id, fullname")
    .eq("actif", true)
    .eq("role", "maintenance");
  const techName = new Map(
    (techs ?? []).map((u) => [
      Number(u.id),
      (u.fullname as string)?.trim() || `#${u.id}`,
    ]),
  );

  const { data: interventions, error: intErr } = await supabase
    .from("intervention")
    .select(
      "id, site_id, sujet_ids, description, pannes_autre, status, urgent, assignee_user_id, scheduled_at, created_at",
    )
    .neq("status", "cloturee")
    .order("urgent", { ascending: false })
    .limit(200);
  if (intErr) throw intErr;

  const sujetIds = new Set<number>();
  for (const row of interventions ?? []) {
    for (const id of (row.sujet_ids as number[] | null) ?? []) {
      if (Number.isFinite(Number(id))) sujetIds.add(Number(id));
    }
  }
  const sujetLabel = new Map<number, string>();
  if (sujetIds.size > 0) {
    const { data: sujets } = await supabase
      .from("sujets")
      .select("id, name")
      .in("id", [...sujetIds]);
    for (const s of sujets ?? []) {
      sujetLabel.set(
        Number(s.id),
        (s.name as string)?.trim() || `Sujet ${s.id}`,
      );
    }
  }

  const open = (interventions ?? []).map((row) => {
    const scheduled = row.scheduled_at as string | null;
    const inWeek =
      scheduled != null &&
      parisDayIso(scheduled) >= weekStart &&
      parisDayIso(scheduled) < weekEndExclusive;
    const ids = (row.sujet_ids as number[] | null) ?? [];
    const labels = ids
      .map((id) => sujetLabel.get(Number(id)))
      .filter(Boolean) as string[];
    const sujet =
      labels.join(", ") ||
      String(row.pannes_autre ?? row.description ?? "").slice(0, 80) ||
      "Sans sujet";
    return {
      id: Number(row.id),
      site: siteName.get(Number(row.site_id)) ?? `Site ${row.site_id}`,
      sujet: sujet.slice(0, 80),
      urgent: row.urgent === true,
      status: row.status,
      assignee: row.assignee_user_id != null
        ? techName.get(Number(row.assignee_user_id)) ?? null
        : null,
      scheduled: inWeek ? scheduled : null,
      period: inWeek ? edtPeriodFromIso(scheduled) : null,
      unscheduled: scheduled == null,
    };
  });

  const loadByTech = new Map<string, number>();
  const slotLoad = new Map<string, number>();
  for (const t of open) {
    if (t.assignee) loadByTech.set(t.assignee, (loadByTech.get(t.assignee) ?? 0) + 1);
    if (t.scheduled && t.period) {
      const day = parisDayIso(t.scheduled);
      const key = `${day}:${t.period}`;
      slotLoad.set(key, (slotLoad.get(key) ?? 0) + 1);
    }
  }

  return {
    weekStart,
    label: weekLabel(weekStart),
    open: open.slice(0, 60),
    techs: [...techName.values()].map((name) => ({
      name,
      load: loadByTech.get(name) ?? 0,
    })),
    slotLoad: Object.fromEntries(slotLoad),
    counts: {
      open: open.length,
      urgentUnscheduled: open.filter((o) => o.urgent && o.unscheduled).length,
      unscheduled: open.filter((o) => o.unscheduled).length,
      techs: techName.size,
    },
  };
}

async function buildDigest(
  supabase: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  forceRegen: boolean,
) {
  const inputHash = await sha256Hex(JSON.stringify(snapshot));
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: INTERVENTION_EDT_WEEK_SCOPE,
      scopeKey: snapshot.weekStart,
      inputHash,
      promptVersion: INTERVENTION_EDT_WEEK_PROMPT_VERSION,
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
        { role: "system", content: INTERVENTION_EDT_WEEK_SYSTEM },
        {
          role: "user",
          content: interventionEdtWeekUser(
            snapshot.label,
            snapshot.weekStart,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 1100,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: INTERVENTION_EDT_WEEK_SCOPE,
      scopeKey: snapshot.weekStart,
      inputHash,
      promptVersion: INTERVENTION_EDT_WEEK_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: { counts: snapshot.counts },
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
      `EDT ${snapshot.label} : ${snapshot.counts.open} ticket(s) ouverts, ${snapshot.counts.urgentUnscheduled} urgent(s) non planifié(s).`,
      "<<<DETAIL>>>",
      "**Urgences**",
      snapshot.counts.urgentUnscheduled
        ? `${snapshot.counts.urgentUnscheduled} à planifier.`
        : "RAS",
      "",
      "**Suggestions**",
      "- Planifier les urgents sur les créneaux les moins chargés.",
      "",
      "**Charge**",
      snapshot.techs.map((t) => `${t.name} : ${t.load}`).join(" · ") || "RAS",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: INTERVENTION_EDT_WEEK_SCOPE,
        scopeKey: snapshot.weekStart,
        inputHash,
        promptVersion: INTERVENTION_EDT_WEEK_PROMPT_VERSION,
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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ensure = url.searchParams.get("ensure") === "1";
  const regen = url.searchParams.get("regen") === "1";
  const weekOverride = url.searchParams.get("week");

  let weekStart: string;
  if (weekOverride && /^\d{4}-\d{2}-\d{2}$/.test(weekOverride)) {
    weekStart = mondayOf(weekOverride);
  } else {
    weekStart = mondayOf(parisTodayIso());
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Manual Lancer: ensure without existing still generates. Cache skip if ready + !regen.
  if (ensure && !regen) {
    const { data: existing } = await supabase
      .from("ai_insight")
      .select("id, content")
      .eq("scope", INTERVENTION_EDT_WEEK_SCOPE)
      .eq("scope_key", weekStart)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.content) {
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        weekStart,
        insightId: existing.id,
        cached: true,
        corpsLength: String(existing.content).length,
      });
    }
  }

  try {
    const snapshot = await loadSnapshot(supabase, weekStart);
    const digest = await buildDigest(supabase, snapshot, regen);
    return Response.json({
      ok: true,
      weekStart,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      counts: snapshot.counts,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        weekStart,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
});
