import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const AVAILABILITY_TITLE = "Disponibilités";
const AVAILABILITY_BODY =
  "Pense à remplir tes disponibilités pour la semaine prochaine.";

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

function shiftDateIso(dateIso: string, deltaDays: number): string {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateIso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d + deltaDays, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function nextWeekRangeFromParisToday(dateIso: string, jourSemaineKey: string) {
  const mondayOffset = Number(jourSemaineKey) - 1;
  const currentWeekMonday = shiftDateIso(dateIso, -mondayOffset);
  const nextWeekStart = shiftDateIso(currentWeekMonday, 7);
  const nextWeekEnd = shiftDateIso(nextWeekStart, 6);
  return { nextWeekStart, nextWeekEnd };
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

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return Response.json({ ok: false, error: "missing supabase env" }, { status: 500 });
  }

  const now = new Date();
  const paris = parisParts(now);
  if (paris.jourSemaineKey !== "3" || paris.hour !== 9) {
    return Response.json({
      ok: true,
      skipped: "outside_window",
      weekday: paris.jourSemaineKey,
      hour: paris.hour,
    });
  }

  const { nextWeekStart, nextWeekEnd } = nextWeekRangeFromParisToday(
    paris.dateIso,
    paris.jourSemaineKey,
  );

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existingDispatch, error: dispatchLookupError } = await supabase
    .from("week_staff_dispatch")
    .select("availability_reminded_at")
    .eq("week_start", nextWeekStart)
    .maybeSingle();
  if (dispatchLookupError) {
    return Response.json({ ok: false, error: dispatchLookupError.message }, { status: 500 });
  }
  if (existingDispatch?.availability_reminded_at) {
    return Response.json({
      ok: true,
      skipped: "already_reminded",
      weekStart: nextWeekStart,
    });
  }

  const vapidPublic = (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim();
  const vapidPrivate = (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim();
  const vapidSubject = (Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@maneges-ravoire.fr").trim();
  const vapidOk = vapidPublic.length > 20 && vapidPrivate.length > 20;

  try {
    const [{ data: users, error: usersError }, { data: availabilityRows, error: availError }] =
      await Promise.all([
        supabase.from("user").select("id, actif"),
        supabase
          .from("availability")
          .select("user_id")
          .gte("date", nextWeekStart)
          .lte("date", nextWeekEnd),
      ]);

    if (usersError) throw usersError;
    if (availError) throw availError;

    const submitted = new Set(
      (availabilityRows ?? [])
        .map((r) => Number(r.user_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );

    const targetIds = (users ?? [])
      .filter((u) => u.actif !== false)
      .map((u) => Number(u.id))
      .filter((id) => Number.isFinite(id) && id > 0 && !submitted.has(id));

    if (targetIds.length === 0) {
      await supabase.from("week_staff_dispatch").upsert(
        {
          week_start: nextWeekStart,
          availability_reminded_at: new Date().toISOString(),
        },
        { onConflict: "week_start" },
      );
      return Response.json({
        ok: true,
        skipped: "none_to_remind",
        weekStart: nextWeekStart,
        reminded: 0,
      });
    }

    const availabilityUrl = `/availability?startDate=${nextWeekStart}&endDate=${nextWeekEnd}`;

    const { data: insertedMessage, error: messageError } = await supabase
      .from("staff_message")
      .insert({
        titre: AVAILABILITY_TITLE,
        corps: AVAILABILITY_BODY,
        source: "appli",
        channel: "staff",
        auteur_uuid: null,
        site_ids: [],
        user_ids: targetIds,
        require_ack: false,
      })
      .select("id")
      .single();
    if (messageError) throw messageError;

    let pushSent = 0;
    for (const userId of targetIds) {
      pushSent += await sendPushToUser(
        supabase,
        userId,
        {
          title: AVAILABILITY_TITLE,
          body: AVAILABILITY_BODY,
          url: availabilityUrl,
        },
        vapidOk,
        vapidPublic,
        vapidPrivate,
        vapidSubject,
      );
    }

    const { error: dispatchError } = await supabase.from("week_staff_dispatch").upsert(
      {
        week_start: nextWeekStart,
        availability_reminded_at: new Date().toISOString(),
      },
      { onConflict: "week_start" },
    );
    if (dispatchError) throw dispatchError;

    return Response.json({
      ok: true,
      weekStart: nextWeekStart,
      weekEnd: nextWeekEnd,
      reminded: targetIds.length,
      messageId: insertedMessage?.id ?? null,
      pushSent,
      vapid: vapidOk,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
