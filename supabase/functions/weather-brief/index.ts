import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  truncatePushBody,
  weatherBriefBodyFr,
  weatherBriefTitleFr,
  type CrowdLevel,
  type WeatherBriefInput,
  type WeatherCondition,
} from "../_shared/encourage.ts";

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
  };
}

async function sendPushToUser(
  supabase: ReturnType<typeof createClient>,
  userId: number,
  payload: { title: string; body: string; url: string },
  vapidOk: boolean,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string,
) {
  if (!vapidOk) return 0;
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const { data: subs } = await supabase
    .from("push_subscription")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  let sent = 0;
  const body = JSON.stringify(payload);
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscription").delete().eq("id", sub.id);
      }
    }
  }
  return sent;
}

function isWeatherCondition(value: unknown): value is WeatherCondition {
  return value === "sun" || value === "rain" || value === "snow" || value === "normal";
}

function isCrowdLevel(value: unknown): value is CrowdLevel {
  return value === "busy" || value === "quiet" || value === "typical";
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return Response.json({ ok: false, error: "missing supabase env" }, { status: 500 });
  }

  const paris = parisParts();
  if (paris.hour !== 9) {
    return Response.json({
      ok: true,
      skipped: "outside_window",
      hour: paris.hour,
      date: paris.dateIso,
    });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const vapidPublic = (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim();
  const vapidPrivate = (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim();
  const vapidSubject = (Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@maneges-ravoire.fr").trim();
  const vapidOk = vapidPublic.length > 20 && vapidPrivate.length > 20;

  try {
    const { data: planningRows, error: planningError } = await supabase
      .from("planning")
      .select("site_id, user_id, double_id")
      .eq("year", paris.year)
      .eq("month", paris.month)
      .eq("day", paris.day);
    if (planningError) throw planningError;

    /** userId → siteId ; titulaire prioritaire sur double si déjà vu. */
    const assignments = new Map<number, number>();
    for (const row of planningRows ?? []) {
      const siteId = Number(row.site_id);
      const userId = Number(row.user_id);
      const doubleId = row.double_id == null ? null : Number(row.double_id);
      if (Number.isFinite(userId) && userId > 0 && Number.isFinite(siteId) && siteId > 0) {
        if (!assignments.has(userId)) assignments.set(userId, siteId);
      }
      if (
        doubleId != null &&
        Number.isFinite(doubleId) &&
        doubleId > 0 &&
        Number.isFinite(siteId) &&
        siteId > 0 &&
        !assignments.has(doubleId)
      ) {
        assignments.set(doubleId, siteId);
      }
    }

    if (assignments.size === 0) {
      return Response.json({
        ok: true,
        date: paris.dateIso,
        sent: 0,
        skipped: 0,
        pushes: 0,
        reason: "no_planning",
      });
    }

    const siteIds = [...new Set(assignments.values())];
    const { data: weatherRows, error: weatherError } = await supabase
      .from("site_weather")
      .select(
        "site_id, date, condition, temp_min, temp_max, is_weekend, is_holiday, holiday_name, is_bridge, is_school_holiday, crowd_level",
      )
      .eq("date", paris.dateIso)
      .in("site_id", siteIds);
    if (weatherError) throw weatherError;

    const weatherBySite = new Map<number, WeatherBriefInput>();
    for (const row of weatherRows ?? []) {
      const siteId = Number(row.site_id);
      if (!Number.isFinite(siteId) || !isWeatherCondition(row.condition)) continue;
      weatherBySite.set(siteId, {
        site_id: siteId,
        date: String(row.date).slice(0, 10),
        condition: row.condition,
        temp_min: row.temp_min == null ? null : Number(row.temp_min),
        temp_max: row.temp_max == null ? null : Number(row.temp_max),
        is_weekend: Boolean(row.is_weekend),
        is_holiday: Boolean(row.is_holiday),
        holiday_name: row.holiday_name == null ? null : String(row.holiday_name),
        is_bridge: Boolean(row.is_bridge),
        is_school_holiday: Boolean(row.is_school_holiday),
        crowd_level: isCrowdLevel(row.crowd_level) ? row.crowd_level : null,
      });
    }

    const userIds = [...assignments.keys()];
    const { data: users, error: usersError } = await supabase
      .from("user")
      .select("id, actif")
      .in("id", userIds);
    if (usersError) throw usersError;
    const activeIds = new Set(
      (users ?? [])
        .filter((u) => u.actif !== false)
        .map((u) => Number(u.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );

    let sent = 0;
    let skipped = 0;
    let pushes = 0;
    const errors: string[] = [];

    for (const [userId, siteId] of assignments) {
      if (!activeIds.has(userId)) {
        skipped += 1;
        continue;
      }
      const weather = weatherBySite.get(siteId);
      if (!weather) {
        skipped += 1;
        continue;
      }

      const titre = weatherBriefTitleFr(weather);
      const corps = weatherBriefBodyFr(weather);

      const { error: insertError } = await supabase.from("staff_message").insert({
        titre,
        corps,
        source: "appli",
        channel: "staff",
        auteur_uuid: null,
        site_ids: [],
        user_ids: [userId],
        require_ack: false,
        meta: {
          kind: "weather_brief",
          date: paris.dateIso,
          user_id: userId,
          site_id: siteId,
        },
      });

      if (insertError) {
        // Unique violation = déjà envoyé (2e passage cron DST)
        if (insertError.code === "23505") {
          skipped += 1;
          continue;
        }
        errors.push(`user ${userId}: ${insertError.message}`);
        skipped += 1;
        continue;
      }

      sent += 1;
      pushes += await sendPushToUser(
        supabase,
        userId,
        {
          title: titre,
          body: truncatePushBody(corps),
          url: "/messages",
        },
        vapidOk,
        vapidPublic,
        vapidPrivate,
        vapidSubject,
      );
    }

    return Response.json({
      ok: errors.length === 0,
      date: paris.dateIso,
      candidates: assignments.size,
      sent,
      skipped,
      pushes,
      vapid: vapidOk,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
