import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  TERRAIN_FORMS_WEEK_SCOPE,
  TERRAIN_FORMS_WEEK_PROMPT_VERSION,
  TERRAIN_FORMS_WEEK_SYSTEM,
  CLOSING_VISION_SEAU_SCOPE,
  CLOSING_VISION_PARKING_SCOPE,
  OPENING_VISION_NETTOYAGE_SCOPE,
  terrainFormsWeekUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Synthèse semaine O/F → `ai_insight` (`terrain_forms_week`).
 * CRM boards : ensure on view (lundi de la date affichée).
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
  return shiftDateIso(dateIso, dow === 0 ? -6 : 1 - dow);
}

function parisTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadSnapshot(supabase: SupabaseClient, weekStart: string) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDateIso(weekStart, i));
  const { data: sites } = await supabase
    .from("site")
    .select("id, name, statut")
    .eq("statut", "actif");
  const siteName = new Map(
    (sites ?? []).map((s) => [
      Number(s.id),
      (s.name as string)?.trim() || `Site ${s.id}`,
    ]),
  );
  const activeIds = new Set(siteName.keys());

  const byDay: Array<{
    date: string;
    lateOpenings: number;
    closingMissing: number;
    forced: number;
    enveloppeNeg: number;
    visionFail: number;
    pannes: number;
  }> = [];
  const outliers: Array<{ day: string; site: string; kind: string; detail: string }> =
    [];

  for (const dateIso of days) {
    const [y, m, d] = dateIso.split("-").map(Number);
    const [
      { data: planning },
      { data: openings },
      { data: closings },
      { data: late },
      { data: infos },
      { data: visions },
    ] = await Promise.all([
      supabase
        .from("planning")
        .select("site_id, user_id, closed")
        .eq("year", y)
        .eq("month", m)
        .eq("day", d),
      supabase.from("opening_form").select("site_id").eq("date", dateIso),
      supabase
        .from("closing_form")
        .select(
          "site_id, force_early, force_geo_failed, recette_totale, carte_bleue, paye_jour, paye_double, paye_manquante_recuperee, frais",
        )
        .eq("date", dateIso),
      supabase
        .from("opening_late_alert")
        .select("site_id")
        .eq("date", dateIso)
        .not("reported_at", "is", null),
      supabase
        .from("daily_info")
        .select("site_id, pannes, pannes_autre")
        .eq("date", dateIso),
      supabase
        .from("ai_insight")
        .select("scope, scope_key, payload")
        .in("scope", [
          CLOSING_VISION_SEAU_SCOPE,
          CLOSING_VISION_PARKING_SCOPE,
          OPENING_VISION_NETTOYAGE_SCOPE,
        ])
        .like("scope_key", `%:${dateIso}`)
        .eq("status", "ready"),
    ]);

    const assigned = new Set<number>();
    const closedPlan = new Set<number>();
    for (const p of planning ?? []) {
      const sid = Number(p.site_id);
      if (!activeIds.has(sid)) continue;
      if (p.closed === true) closedPlan.add(sid);
      else if (p.user_id != null) assigned.add(sid);
    }
    const opened = new Set((openings ?? []).map((r) => Number(r.site_id)));
    const closedForms = new Map(
      (closings ?? []).map((r) => [Number(r.site_id), r]),
    );
    const lateN = (late ?? []).length;

    let closingMissing = 0;
    for (const sid of assigned) {
      if (closedPlan.has(sid)) continue;
      if (opened.has(sid) && !closedForms.has(sid)) {
        // Pour la synthèse semaine : compter seulement jours passés
        if (dateIso < parisTodayIso()) {
          closingMissing += 1;
          if (outliers.length < 12) {
            outliers.push({
              day: dateIso.slice(5),
              site: siteName.get(sid) ?? `Site ${sid}`,
              kind: "closing_missing",
              detail: "Fermeture non saisie",
            });
          }
        }
      }
    }

    let forced = 0;
    let enveloppeNeg = 0;
    for (const [sid, row] of closedForms) {
      if (row.force_early || row.force_geo_failed) {
        forced += 1;
        if (outliers.length < 12) {
          outliers.push({
            day: dateIso.slice(5),
            site: siteName.get(sid) ?? `Site ${sid}`,
            kind: "closing_forced",
            detail: "Fermeture forcée",
          });
        }
      }
      const especes =
        toNum(row.recette_totale) -
        toNum(row.carte_bleue) -
        toNum(row.paye_jour) -
        toNum(row.paye_double) -
        toNum(row.paye_manquante_recuperee) -
        toNum(row.frais);
      if (especes < 0) {
        enveloppeNeg += 1;
        if (outliers.length < 12) {
          outliers.push({
            day: dateIso.slice(5),
            site: siteName.get(sid) ?? `Site ${sid}`,
            kind: "enveloppe_neg",
            detail: "Enveloppe négative",
          });
        }
      }
    }

    let visionFail = 0;
    for (const v of visions ?? []) {
      const verdict = (v.payload as { verdict?: string } | null)?.verdict;
      if (verdict === "fail" || verdict === "suspect") {
        visionFail += 1;
        const sid = Number(String(v.scope_key).split(":")[0]);
        if (outliers.length < 12) {
          outliers.push({
            day: dateIso.slice(5),
            site: siteName.get(sid) ?? `Site ${sid}`,
            kind: "vision",
            detail: String(v.scope).replace(/_/g, " "),
          });
        }
      }
    }

    let pannes = 0;
    for (const row of infos ?? []) {
      if (
        (typeof row.pannes === "string" && row.pannes.trim()) ||
        (typeof row.pannes_autre === "string" && row.pannes_autre.trim())
      ) {
        pannes += 1;
      }
    }

    byDay.push({
      date: dateIso,
      lateOpenings: lateN,
      closingMissing,
      forced,
      enveloppeNeg,
      visionFail,
      pannes,
    });
  }

  const totals = byDay.reduce(
    (acc, d) => {
      acc.lateOpenings += d.lateOpenings;
      acc.closingMissing += d.closingMissing;
      acc.forced += d.forced;
      acc.enveloppeNeg += d.enveloppeNeg;
      acc.visionFail += d.visionFail;
      acc.pannes += d.pannes;
      return acc;
    },
    {
      lateOpenings: 0,
      closingMissing: 0,
      forced: 0,
      enveloppeNeg: 0,
      visionFail: 0,
      pannes: 0,
    },
  );

  return {
    weekStart,
    label: weekLabel(weekStart),
    byDay,
    outliers: outliers.slice(0, 12),
    totals,
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
      scope: TERRAIN_FORMS_WEEK_SCOPE,
      scopeKey: snapshot.weekStart,
      inputHash,
      promptVersion: TERRAIN_FORMS_WEEK_PROMPT_VERSION,
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
      job: "haiku",
      messages: [
        { role: "system", content: TERRAIN_FORMS_WEEK_SYSTEM },
        {
          role: "user",
          content: terrainFormsWeekUser(
            snapshot.label,
            snapshot.weekStart,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 900,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: TERRAIN_FORMS_WEEK_SCOPE,
      scopeKey: snapshot.weekStart,
      inputHash,
      promptVersion: TERRAIN_FORMS_WEEK_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: { totals: snapshot.totals },
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
    const t = snapshot.totals;
    const fallback = [
      `Semaine ${snapshot.label} : ${t.forced} forcée(s), ${t.closingMissing} fermeture(s) manquante(s), ${t.visionFail} vision(s).`,
      "<<<DETAIL>>>",
      "**Tendance**",
      "Voir board jour par jour.",
      "",
      "**Outliers**",
      ...snapshot.outliers.slice(0, 4).map(
        (o) => `⚠️ ${o.day} · ${o.site} · ${o.detail}`,
      ),
      "",
      "**À faire**",
      "- Revoir les sites signalés.",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: TERRAIN_FORMS_WEEK_SCOPE,
        scopeKey: snapshot.weekStart,
        inputHash,
        promptVersion: TERRAIN_FORMS_WEEK_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { totals: snapshot.totals },
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
  const regen = url.searchParams.get("regen") === "1";
  const weekOverride = url.searchParams.get("week");
  const dateOverride = url.searchParams.get("date");
  const weekStart =
    weekOverride && /^\d{4}-\d{2}-\d{2}$/.test(weekOverride)
      ? mondayOf(weekOverride)
      : dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)
      ? mondayOf(dateOverride)
      : mondayOf(parisTodayIso());

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
      totals: snapshot.totals,
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
