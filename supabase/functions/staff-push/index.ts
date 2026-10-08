import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type PushItem = {
  userId: number;
  title: string;
  body: string;
  url?: string;
};

function truncate(text: string, max = 140): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

async function sendPushToUser(
  supabase: ReturnType<typeof createClient>,
  userId: number,
  payload: { title: string; body: string; url: string },
  vapidOk: boolean,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string,
): Promise<number> {
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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "method" }, { status: 405 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return Response.json({ ok: false, error: "missing supabase env" }, { status: 500 });
  }

  let payload: { pushes?: PushItem[] };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const pushes = (payload.pushes ?? []).filter(
    (p) =>
      Number.isFinite(p.userId) &&
      p.userId > 0 &&
      typeof p.title === "string" &&
      typeof p.body === "string",
  );
  if (pushes.length === 0) {
    return Response.json({ ok: true, sent: 0, skipped: "empty" });
  }

  const vapidPublic = (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim();
  const vapidPrivate = (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim();
  const vapidSubject = (Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@maneges-ravoire.fr")
    .trim();
  const vapidOk = vapidPublic.length > 20 && vapidPrivate.length > 20;

  const supabase = createClient(url, key);
  let sent = 0;
  for (const item of pushes) {
    sent += await sendPushToUser(
      supabase,
      item.userId,
      {
        title: item.title || "Le Bureau",
        body: truncate(item.body),
        url: item.url ?? "/messages",
      },
      vapidOk,
      vapidPublic,
      vapidPrivate,
      vapidSubject,
    );
  }

  return Response.json({
    ok: true,
    sent,
    attempted: pushes.length,
    vapid: vapidOk,
  });
});
