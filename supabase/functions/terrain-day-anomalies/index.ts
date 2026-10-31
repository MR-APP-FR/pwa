import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  TERRAIN_DAY_ANOMALIES_SCOPE,
  TERRAIN_DAY_ANOMALIES_OPENING_SCOPE,
  TERRAIN_DAY_ANOMALIES_CLOSING_SCOPE,
  TERRAIN_DAY_ANOMALIES_PROMPT_VERSION,
  TERRAIN_DAY_ANOMALIES_SYSTEM,
  CLOSING_VISION_SEAU_SCOPE,
  CLOSING_VISION_PARKING_SCOPE,
  terrainDayAnomaliesUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Anomalies jour O/F → `ai_insight`.
 * `?board=opening|closing` → scopes séparés + flags filtrés.
 * Gates Paris (ensure) : opening ≥14h, closing ≥21h (jour courant).
 */

type Board = "opening" | "closing" | "all";

const OPENING_KINDS = new Set([
  "opening_missing",
  "opening_late",
  "panne",
]);
const CLOSING_KINDS = new Set([
  "closing_missing",
  "closing_forced",
  "enveloppe_neg",
  "vision_seau_fail",
  "vision_parking_fail",
]);

function scopeForBoard(board: Board): string {
  if (board === "opening") return TERRAIN_DAY_ANOMALIES_OPENING_SCOPE;
  if (board === "closing") return TERRAIN_DAY_ANOMALIES_CLOSING_SCOPE;
  return TERRAIN_DAY_ANOMALIES_SCOPE;
}

function filterFlags(flags: Flag[], board: Board): Flag[] {
  if (board === "opening") return flags.filter((f) => OPENING_KINDS.has(f.kind));
  if (board === "closing") return flags.filter((f) => CLOSING_KINDS.has(f.kind));
  return flags;
}

function parisHour(now = new Date()): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** Ensure jour courant : opening ≥14h, closing ≥21h. */
function gateBoard(dateIso: string, board: Board): "ok" | "too_early" | "future" {
  const today = parisParts().dateIso;
  if (dateIso > today) return "future";
  if (dateIso < today) return "ok";
  if (board === "all") return "ok";
  const hour = parisHour();
  const min = board === "opening" ? 14 : 21;
  return hour >= min ? "ok" : "too_early";
}

type Flag = { site: string; kind: string; detail: string };

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
    dateIso: `${pick("year")}-${pick("month")}-${pick("day")}`,
  };
}

function formatFrDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function enveloppeAnomaly(row: {
  recette_totale?: unknown;
  carte_bleue?: unknown;
  paye_jour?: unknown;
  paye_double?: unknown;
  paye_manquante_recuperee?: unknown;
  frais?: unknown;
}): boolean {
  const especes =
    toNum(row.recette_totale) -
    toNum(row.carte_bleue) -
    toNum(row.paye_jour) -
    toNum(row.paye_double) -
    toNum(row.paye_manquante_recuperee) -
    toNum(row.frais);
  return especes < 0;
}

/** Clé `heures_semaine` : 1=lundi … 7=dimanche (ISO Paris via UTC noon). */
function jourSemaineKey(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return String(js === 0 ? 7 : js);
}

/** Instant UTC pour `HH:mm` Europe/Paris sur `dateIso` (approx CET/CEST). */
function parisWallMs(dateIso: string, hhmm: string): number | null {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const [y, mo, d] = dateIso.split("-").map(Number);
  for (const offsetH of [2, 1]) {
    const ms = Date.UTC(y, mo - 1, d, h, min, 0) - offsetH * 3_600_000;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));
    const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    if (
      `${pick("year")}-${pick("month")}-${pick("day")}` === dateIso &&
      Number(pick("hour")) === h &&
      Number(pick("minute")) === min
    ) {
      return ms;
    }
  }
  return Date.UTC(y, mo - 1, d, h - 1, min, 0);
}

async function loadSnapshot(supabase: SupabaseClient, dateIso: string) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const todayIso = parisParts().dateIso;
  const isPastDay = dateIso < todayIso;
  const nowMs = Date.now();
  const dayKey = jourSemaineKey(dateIso);

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

  const { data: planning } = await supabase
    .from("planning")
    .select("site_id, user_id, closed")
    .eq("year", y)
    .eq("month", m)
    .eq("day", d);

  const assigned = new Set<number>();
  const closed = new Set<number>();
  for (const p of planning ?? []) {
    const sid = Number(p.site_id);
    if (!activeIds.has(sid)) continue;
    if (p.closed === true) closed.add(sid);
    else if (p.user_id != null) assigned.add(sid);
  }

  const [
    openingsRes,
    closingsRes,
    lateRes,
    infosRes,
    visionsRes,
    dayHoursRes,
    siteInfosRes,
  ] = await Promise.all([
    supabase.from("opening_form").select("site_id").eq("date", dateIso),
    supabase
      .from("closing_form")
      .select(
        "site_id, force_early, force_geo_failed, force_distance_m, recette_totale, carte_bleue, paye_jour, paye_double, paye_manquante_recuperee, frais",
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
      .select("scope, scope_key, payload, status")
      .in("scope", [CLOSING_VISION_SEAU_SCOPE, CLOSING_VISION_PARKING_SCOPE])
      .like("scope_key", `%:${dateIso}`)
      .eq("status", "ready"),
    supabase
      .from("site_day_hours")
      .select("site_id, ferme")
      .eq("day", dateIso),
    supabase.from("site_infos").select("site_id, heures_semaine"),
  ]);
  if (openingsRes.error) throw openingsRes.error;
  if (closingsRes.error) throw closingsRes.error;
  if (lateRes.error) throw lateRes.error;
  if (infosRes.error) throw infosRes.error;
  // visions / hours : non bloquant
  const openings = openingsRes.data;
  const closings = closingsRes.data;
  const late = lateRes.data;
  const infos = infosRes.data;
  const visions = visionsRes.data;
  const dayHours = dayHoursRes.data;
  const siteInfos = siteInfosRes.data;

  const fermeBySite = new Map<number, string>();
  for (const info of siteInfos ?? []) {
    const hs = info.heures_semaine as Record<string, { ferme?: string | null }> | null;
    const f = hs?.[dayKey]?.ferme;
    if (typeof f === "string" && f.trim()) fermeBySite.set(Number(info.site_id), f.trim());
  }
  for (const row of dayHours ?? []) {
    if (typeof row.ferme === "string" && row.ferme.trim()) {
      fermeBySite.set(Number(row.site_id), row.ferme.trim());
    }
  }

  /** Fermeture « en retard » = jour passé, ou aujourd’hui après l’heure `ferme` (défaut 20h). */
  function closingDue(siteId: number): boolean {
    if (isPastDay) return true;
    if (dateIso > todayIso) return false;
    const raw = fermeBySite.get(siteId) ?? "20:00";
    const ms = parisWallMs(dateIso, raw);
    return ms != null ? nowMs > ms : nowMs > (parisWallMs(dateIso, "20:00") ?? 0);
  }

  const opened = new Set((openings ?? []).map((r) => Number(r.site_id)));
  const closedForms = new Map(
    (closings ?? []).map((r) => [Number(r.site_id), r]),
  );
  const lateSites = new Set((late ?? []).map((r) => Number(r.site_id)));

  const visionFail = new Map<string, string>();
  for (const v of visions ?? []) {
    const verdict = (v.payload as { verdict?: string } | null)?.verdict;
    if (verdict !== "fail" && verdict !== "suspect") continue;
    const key = String(v.scope_key);
    const siteId = Number(key.split(":")[0]);
    if (!Number.isFinite(siteId)) continue;
    const kind =
      v.scope === CLOSING_VISION_PARKING_SCOPE
        ? "vision_parking_fail"
        : "vision_seau_fail";
    visionFail.set(`${siteId}:${kind}`, kind);
  }

  const flags: Flag[] = [];

  for (const sid of assigned) {
    if (closed.has(sid)) continue;
    const name = siteName.get(sid)!;
    if (!opened.has(sid)) {
      flags.push({
        site: name,
        kind: "opening_missing",
        detail: "Ouverture non saisie",
      });
    }
    if (lateSites.has(sid)) {
      flags.push({
        site: name,
        kind: "opening_late",
        detail: "Ouverture en retard",
      });
    }
    // Pas d'alerte « non saisie » tant que l'heure de fermeture n'est pas passée
    // (sinon 20+ sites orange le soir = faux positifs).
    if (!closedForms.has(sid) && opened.has(sid) && closingDue(sid)) {
      flags.push({
        site: name,
        kind: "closing_missing",
        detail: "Fermeture non saisie",
      });
    }
  }

  for (const [sid, row] of closedForms) {
    if (!activeIds.has(sid)) continue;
    const name = siteName.get(sid) ?? `Site ${sid}`;
    if (row.force_early || row.force_geo_failed) {
      flags.push({
        site: name,
        kind: "closing_forced",
        detail: "Fermeture forcée",
      });
    }
    if (enveloppeAnomaly(row)) {
      flags.push({
        site: name,
        kind: "enveloppe_neg",
        detail: "Enveloppe espèces négative",
      });
    }
  }

  for (const [k, kind] of visionFail) {
    const sid = Number(k.split(":")[0]);
    flags.push({
      site: siteName.get(sid) ?? `Site ${sid}`,
      kind,
      detail: kind === "vision_parking_fail" ? "Photo parking douteuse" : "Photo seau douteuse",
    });
  }

  for (const row of infos ?? []) {
    const note = [row.pannes, row.pannes_autre]
      .filter((x) => typeof x === "string" && x.trim())
      .join(" / ");
    if (!note) continue;
    const sid = Number(row.site_id);
    flags.push({
      site: siteName.get(sid) ?? `Site ${sid}`,
      kind: "panne",
      detail: note.slice(0, 80),
    });
  }

  const priority: Record<string, number> = {
    closing_forced: 0,
    enveloppe_neg: 1,
    vision_seau_fail: 2,
    vision_parking_fail: 3,
    opening_late: 4,
    opening_missing: 5,
    closing_missing: 6,
    panne: 7,
  };
  flags.sort((a, b) => (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9));

  const counts: Record<string, number> = {};
  for (const f of flags) counts[f.kind] = (counts[f.kind] ?? 0) + 1;

  return {
    dateIso,
    label: formatFrDate(dateIso),
    flags: flags.slice(0, 40),
    counts,
  };
}

async function buildDigest(
  supabase: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  forceRegen: boolean,
  scope: string,
) {
  const inputHash = await sha256Hex(JSON.stringify({ ...snapshot, scope }));
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope,
      scopeKey: snapshot.dateIso,
      inputHash,
      promptVersion: TERRAIN_DAY_ANOMALIES_PROMPT_VERSION,
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

  if (snapshot.flags.length === 0) {
    const corps = [
      `Aucune anomalie notable pour ${snapshot.label}.`,
      "<<<DETAIL>>>",
      "**À traiter**",
      "- RAS",
      "",
      "**Ouverture**",
      "RAS",
      "",
      "**Fermeture**",
      "RAS",
    ].join("\n");
    const row = await insertInsight(supabase, {
      scope,
      scopeKey: snapshot.dateIso,
      inputHash,
      promptVersion: TERRAIN_DAY_ANOMALIES_PROMPT_VERSION,
      content: corps,
      model: null,
      status: "ready",
      payload: { counts: snapshot.counts, flagsCount: 0, scope },
    });
    return {
      corps: row.content,
      model: null,
      error: null,
      insightId: row.id,
      cached: false,
    };
  }

  try {
    const result = await foundryChatCompletion({
      job: "haiku",
      messages: [
        { role: "system", content: TERRAIN_DAY_ANOMALIES_SYSTEM },
        {
          role: "user",
          content: terrainDayAnomaliesUser(
            snapshot.label,
            snapshot.dateIso,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 900,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope,
      scopeKey: snapshot.dateIso,
      inputHash,
      promptVersion: TERRAIN_DAY_ANOMALIES_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: { counts: snapshot.counts, flagsCount: snapshot.flags.length },
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
      `${snapshot.flags.length} anomalie(s) le ${snapshot.label}.`,
      "<<<DETAIL>>>",
      "**À traiter**",
      ...snapshot.flags.slice(0, 5).map((f) => `- ${f.site} · ${f.detail}`),
      "",
      "**Ouverture**",
      "Voir board.",
      "",
      "**Fermeture**",
      "Voir board.",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope,
        scopeKey: snapshot.dateIso,
        inputHash,
        promptVersion: TERRAIN_DAY_ANOMALIES_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { counts: snapshot.counts, scope },
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
  const dateOverride = url.searchParams.get("date");
  const boardRaw = url.searchParams.get("board");
  const board: Board =
    boardRaw === "opening" || boardRaw === "closing" ? boardRaw : "all";
  const dateIso =
    dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)
      ? dateOverride
      : parisParts().dateIso;

  if (ensure && !regen) {
    const gate = gateBoard(dateIso, board);
    if (gate !== "ok") {
      return Response.json({
        ok: true,
        dateIso,
        board,
        skipped: gate,
        corpsLength: 0,
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Toujours recalculer le snapshot : le cache LLM est sur input_hash dans buildDigest.
  try {
    const full = await loadSnapshot(supabase, dateIso);
    const flags = filterFlags(full.flags, board);
    const counts: Record<string, number> = {};
    for (const f of flags) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    const snapshot = { ...full, flags, counts };
    const scope = scopeForBoard(board);
    const digest = await buildDigest(supabase, snapshot, regen, scope);
    return Response.json({
      ok: true,
      dateIso,
      board,
      scope,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      flagsCount: snapshot.flags.length,
      counts: snapshot.counts,
    });
  } catch (e) {
    return Response.json(
      { ok: false, dateIso, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
