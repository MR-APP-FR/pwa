import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Slot = "morning" | "afternoon";

const WD_TO_KEY: Record<string, string> = {
  Sun: "7",
  Mon: "1",
  Tue: "2",
  Wed: "3",
  Thu: "4",
  Fri: "5",
  Sat: "6",
};

function parisParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(pick("year"));
  const month = Number(pick("month"));
  const day = Number(pick("day"));
  return {
    year,
    month,
    day,
    dateIso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    jourSemaineKey: WD_TO_KEY[pick("weekday")] ?? "1",
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
  };
}

function getSlot(hour: number, minute: number): Slot | null {
  const minutes = hour * 60 + minute;
  if (minutes >= 10 * 60 && minutes <= 12 * 60) return "morning";
  if (minutes >= 13 * 60 && minutes <= 15 * 60) return "afternoon";
  return null;
}

function parisWallClockToDate(dateIso: string, hour: number, minute: number) {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let lo = Date.UTC(y, mo - 1, d - 1, 0, 0, 0);
  let hi = Date.UTC(y, mo - 1, d + 1, 23, 59, 59);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const asTuple = (utcMs: number) => {
    const parts = fmt.formatToParts(new Date(utcMs));
    const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? NaN);
    return [pick("year"), pick("month"), pick("day"), pick("hour"), pick("minute"), pick("second")] as const;
  };
  const target = [y, mo, d, hour, minute, 0] as const;
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const got = asTuple(mid);
    let cmp = 0;
    for (let k = 0; k < 6; k++) {
      if (got[k] !== target[k]) {
        cmp = got[k] < target[k] ? -1 : 1;
        break;
      }
    }
    if (cmp === 0) return new Date(mid);
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return new Date(Math.floor((lo + hi) / 2));
}

function openingHourFromRaw(ouvreRaw: string) {
  const m = String(ouvreRaw).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) ? h : null;
}

function formatOuvre(value: string) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return value;
  const h = Number.parseInt(m[1], 10);
  return `${h}H${m[2]}`;
}

function parseHeures(raw: unknown): Record<string, { ouvre?: string | null }> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, { ouvre?: string | null }>;
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return Response.json({ ok: false, error: "missing supabase env" }, { status: 500 });
  }

  const now = new Date();
  const paris = parisParts(now);
  const slot = getSlot(paris.hour, paris.minute);
  if (!slot) {
    return Response.json({ ok: true, skipped: "outside_window", notified: 0, hour: paris.hour });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const vapidPublic = (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim();
  const vapidPrivate = (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim();
  const vapidSubject = (Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@maneges-ravoire.fr").trim();
  const vapidOk = vapidPublic.length > 20 && vapidPrivate.length > 20;

  try {
    const [planningRes, infosRes, openingsRes] = await Promise.all([
      supabase
        .from("planning")
        .select("site_id, user_id, double_id")
        .eq("year", paris.year)
        .eq("month", paris.month)
        .eq("day", paris.day),
      supabase.from("site_infos").select("site_id, heures_semaine"),
      supabase.from("opening_form").select("site_id").eq("date", paris.dateIso),
    ]);
    if (planningRes.error) throw planningRes.error;
    if (infosRes.error) throw infosRes.error;
    if (openingsRes.error) throw openingsRes.error;

    const opened = new Set((openingsRes.data ?? []).map((r) => Number(r.site_id)));
    const heuresBySite = new Map<number, ReturnType<typeof parseHeures>>();
    for (const row of infosRes.data ?? []) {
      heuresBySite.set(Number(row.site_id), parseHeures(row.heures_semaine));
    }

    const due: {
      siteId: number;
      teneurUserId: number | null;
      doubleUserId: number | null;
      ouvreLabel: string;
      openingHour: number;
    }[] = [];
    const seen = new Set<number>();

    for (const p of planningRes.data ?? []) {
      const siteId = Number(p.site_id);
      if (!Number.isFinite(siteId) || siteId <= 0 || seen.has(siteId)) continue;
      if (p.user_id == null && p.double_id == null) continue;
      if (opened.has(siteId)) continue;
      const heures = heuresBySite.get(siteId);
      const ouvreRaw = heures?.[paris.jourSemaineKey]?.ouvre;
      if (ouvreRaw == null || String(ouvreRaw).trim() === "") continue;
      const openingHour = openingHourFromRaw(String(ouvreRaw));
      if (openingHour == null) continue;
      if (slot === "morning" ? openingHour >= 12 : openingHour < 12) continue;
      const m = String(ouvreRaw).trim().match(/^(\d{1,2}):(\d{2})/);
      if (!m) continue;
      const deadline = parisWallClockToDate(paris.dateIso, Number(m[1]), Number(m[2]));
      if (!deadline || now.getTime() <= deadline.getTime()) continue;
      seen.add(siteId);
      due.push({
        siteId,
        teneurUserId: typeof p.user_id === "number" ? p.user_id : null,
        doubleUserId: typeof p.double_id === "number" ? p.double_id : null,
        ouvreLabel: formatOuvre(String(ouvreRaw)),
        openingHour,
      });
    }

    if (due.length === 0) {
      return Response.json({ ok: true, skipped: "none_late", notified: 0, slot });
    }

    const { data: already, error: alreadyErr } = await supabase
      .from("opening_late_alert")
      .select("site_id, push_sent_at, reported_at")
      .eq("date", paris.dateIso)
      .in(
        "site_id",
        due.map((s) => s.siteId),
      );
    if (alreadyErr) throw alreadyErr;
    const pushed = new Set(
      (already ?? [])
        .filter((row) => row.push_sent_at != null || row.reported_at != null)
        .map((row) => Number(row.site_id)),
    );

    if (vapidOk) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    }

    let notified = 0;
    for (const site of due) {
      if (pushed.has(site.siteId)) continue;
      const teneurId = site.teneurUserId ?? site.doubleUserId;
      if (teneurId == null) continue;

      if (vapidOk) {
        const { data: subs } = await supabase
          .from("push_subscription")
          .select("id, endpoint, p256dh, auth")
          .eq("user_id", teneurId);
        const body = JSON.stringify({
          title: "Ouverture",
          body: `Tu n'as pas ouvert, il est plus de ${site.ouvreLabel}. Où es-tu ?`,
          url: "/",
        });
        for (const sub of subs ?? []) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              body,
            );
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await supabase.from("push_subscription").delete().eq("id", sub.id);
            }
          }
        }
      }

      const { error } = await supabase.from("opening_late_alert").upsert(
        {
          site_id: site.siteId,
          date: paris.dateIso,
          teneur_user_id: teneurId,
          push_sent_at: new Date().toISOString(),
        },
        { onConflict: "site_id,date" },
      );
      if (error) continue;
      notified += 1;
    }

    return Response.json({
      ok: true,
      skipped: null,
      notified,
      slot,
      late: due.length,
      vapid: vapidOk,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
