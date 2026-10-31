import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  STAFF_VIVIER_DIGEST_SCOPE,
  STAFF_VIVIER_PROMPT_VERSION,
  STAFF_VIVIER_DIGEST_SYSTEM,
  staffVivierDigestUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Alertes vivier mois → `ai_insight` (`staff_vivier_digest`, clé `YYYY-MM`).
 * CRM Users : ensure on view.
 */

type ScoreRow = {
  user_id: number;
  year: number;
  month: number;
  pts_ca: number | null;
  pts_total: number | null;
  category: string | null;
  category_override: string | null;
};

function parisParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: Number(pick("year")), month: Number(pick("month")) };
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

function effectiveCategory(row: ScoreRow): string | null {
  return row.category_override || row.category || null;
}

const CAT_RANK: Record<string, number> = {
  super: 5,
  bon: 4,
  normal: 3,
  bof: 2,
  separer: 1,
};

async function loadVivierSnapshot(
  supabase: SupabaseClient,
  year: number,
  month: number,
) {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }
  const prevMonthKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  const { data: users } = await supabase
    .from("user")
    .select("id, fullname, actif, role")
    .eq("actif", true);
  const activeIds = new Set(
    (users ?? [])
      .filter((u) => u.role !== "maintenance")
      .map((u) => Number(u.id)),
  );
  const nameById = new Map(
    (users ?? []).map((u) => [
      Number(u.id),
      (u.fullname as string)?.trim() || `#${u.id}`,
    ]),
  );

  const { data: scores } = await supabase
    .from("staff_month_score")
    .select(
      "user_id, year, month, pts_ca, pts_total, category, category_override",
    )
    .or(
      `and(year.eq.${year},month.eq.${month}),and(year.eq.${prevYear},month.eq.${prevMonth})`,
    );

  const cur = new Map<number, ScoreRow>();
  const prev = new Map<number, ScoreRow>();
  for (const raw of (scores ?? []) as ScoreRow[]) {
    if (!activeIds.has(Number(raw.user_id))) continue;
    if (raw.year === year && raw.month === month) cur.set(Number(raw.user_id), raw);
    if (raw.year === prevYear && raw.month === prevMonth) {
      prev.set(Number(raw.user_id), raw);
    }
  }

  const categoryCounts: Record<string, number> = {};
  for (const row of cur.values()) {
    const cat = effectiveCategory(row) ?? "none";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  type Flag = {
    name: string;
    category: string | null;
    pts_ca: number | null;
    pts_total: number | null;
    flag: string;
  };
  const flags: Flag[] = [];

  for (const [userId, row] of cur) {
    const cat = effectiveCategory(row);
    const ptsCa = row.pts_ca != null ? Number(row.pts_ca) : null;
    const ptsTotal = row.pts_total != null ? Number(row.pts_total) : null;
    const name = nameById.get(userId) ?? `#${userId}`;
    const prevRow = prev.get(userId);
    const prevCat = prevRow ? effectiveCategory(prevRow) : null;

    if (cat === "super" && ptsCa != null && ptsCa < 0) {
      flags.push({
        name,
        category: cat,
        pts_ca: ptsCa,
        pts_total: ptsTotal,
        flag: "excellent_pts_ca_negatif",
      });
    }
    if (cat === "separer") {
      flags.push({
        name,
        category: cat,
        pts_ca: ptsCa,
        pts_total: ptsTotal,
        flag: "a_remplacer",
      });
    }
    if (ptsCa != null && ptsCa < 0 && cat !== "super") {
      flags.push({
        name,
        category: cat,
        pts_ca: ptsCa,
        pts_total: ptsTotal,
        flag: "ca_faible",
      });
    }
    if (
      prevCat &&
      cat &&
      (CAT_RANK[cat] ?? 0) < (CAT_RANK[prevCat] ?? 0) - 1
    ) {
      flags.push({
        name,
        category: cat,
        pts_ca: ptsCa,
        pts_total: ptsTotal,
        flag: "chute_categorie",
      });
    }
  }

  // Dédup par name+flag
  const seen = new Set<string>();
  const uniqFlags = flags.filter((f) => {
    const k = `${f.name}:${f.flag}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const priority = (f: Flag) => {
    if (f.flag === "excellent_pts_ca_negatif") return 0;
    if (f.flag === "a_remplacer") return 1;
    if (f.flag === "chute_categorie") return 2;
    return 3;
  };
  uniqFlags.sort((a, b) => priority(a) - priority(b));

  return {
    monthKey,
    prevMonthKey,
    label: monthLabel(year, month),
    categoryCounts,
    flags: uniqFlags.slice(0, 20),
    scoredCount: cur.size,
  };
}

async function buildDigest(
  supabase: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadVivierSnapshot>>,
  forceRegen: boolean,
) {
  const inputHash = await sha256Hex(JSON.stringify(snapshot));
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: STAFF_VIVIER_DIGEST_SCOPE,
      scopeKey: snapshot.monthKey,
      inputHash,
      promptVersion: STAFF_VIVIER_PROMPT_VERSION,
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
        { role: "system", content: STAFF_VIVIER_DIGEST_SYSTEM },
        {
          role: "user",
          content: staffVivierDigestUser(
            snapshot.label,
            snapshot.monthKey,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 900,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: STAFF_VIVIER_DIGEST_SCOPE,
      scopeKey: snapshot.monthKey,
      inputHash,
      promptVersion: STAFF_VIVIER_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: {
        categoryCounts: snapshot.categoryCounts,
        flagsCount: snapshot.flags.length,
      },
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
      `Vivier ${snapshot.label} : ${snapshot.flags.length} alerte(s) sur ${snapshot.scoredCount} scorés.`,
      "<<<DETAIL>>>",
      "**Lecture**",
      `🟡 ${snapshot.scoredCount} personnes scorées.`,
      "",
      "**Alertes**",
      ...snapshot.flags.slice(0, 6).map(
        (f) => `⚠️ ${f.name} · ${f.flag.replace(/_/g, " ")}`,
      ),
      "",
      "**À faire**",
      "- Revoir les profils signalés dans Staff.",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: STAFF_VIVIER_DIGEST_SCOPE,
        scopeKey: snapshot.monthKey,
        inputHash,
        promptVersion: STAFF_VIVIER_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { flagsCount: snapshot.flags.length },
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
  const monthOverride = url.searchParams.get("month");

  const paris = parisParts();
  let year = paris.year;
  let month = paris.month;
  if (monthOverride && /^\d{4}-\d{2}$/.test(monthOverride)) {
    const [y, m] = monthOverride.split("-").map(Number);
    year = y;
    month = m;
  }
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

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
      .select("id, content")
      .eq("scope", STAFF_VIVIER_DIGEST_SCOPE)
      .eq("scope_key", monthKey)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.content) {
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        monthKey,
        insightId: existing.id,
        cached: true,
        corpsLength: String(existing.content).length,
      });
    }
  }

  try {
    const snapshot = await loadVivierSnapshot(supabase, year, month);
    const digest = await buildDigest(supabase, snapshot, regen);
    return Response.json({
      ok: true,
      monthKey,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      flagsCount: snapshot.flags.length,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        monthKey,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
});
