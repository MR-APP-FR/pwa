import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * 21h Paris : poste un message stub canal CA (pas de PDF).
 * Le PDF est généré au clic admin dans le CRM.
 * pg_cron : ca-daily-pdf-utc19 + utc20 → internal.invoke_edge('ca-daily-pdf')
 * Secrets : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (déjà présents).
 */

function parisParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    dateIso: `${pick("year")}-${pick("month")}-${pick("day")}`,
    hour: Number(pick("hour")),
  };
}

function formatFrDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const dateOverride = url.searchParams.get("date");

  const paris = parisParts();
  if (!force && paris.hour !== 21) {
    return Response.json({ ok: true, skipped: "wrong_hour", hour: paris.hour });
  }

  const dateIso = dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)
    ? dateOverride
    : paris.dateIso;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: lookupError } = await supabase
    .from("staff_message")
    .select("id")
    .eq("channel", "ca")
    .eq("source", "appli")
    .contains("meta", { kind: "ca_daily_pdf", date: dateIso })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return Response.json({ ok: false, error: lookupError.message }, { status: 500 });
  }
  if (existing && !force) {
    return Response.json({ ok: true, inserted: false, skipped: "already_today", dateIso });
  }
  if (existing && force) {
    await supabase.from("staff_message").delete().eq("id", existing.id);
  }

  const label = formatFrDate(dateIso);
  const filename = `CA ${label}.pdf`;
  const { error: insertError } = await supabase.from("staff_message").insert({
    titre: "CA du jour",
    corps: `PDF CA du ${label} — ouvrir pour générer / télécharger.`,
    source: "appli",
    channel: "ca",
    auteur_uuid: null,
    site_ids: [],
    user_ids: [],
    require_ack: false,
    meta: {
      kind: "ca_daily_pdf",
      date: dateIso,
      filename,
    },
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return Response.json({ ok: true, inserted: false, skipped: "already_today", dateIso });
    }
    return Response.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return Response.json({ ok: true, inserted: true, dateIso });
});
