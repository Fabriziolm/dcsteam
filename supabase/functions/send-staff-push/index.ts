import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!authorization || !serviceKey || !supabaseUrl) return json({ error: "Configuración incompleta" }, 500);

  const db = createClient(supabaseUrl, serviceKey);
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user || userData.user.app_metadata?.role !== "Administrador") return json({ error: "No autorizado" }, 403);

  const body = await request.json().catch(() => ({})) as { alert_id?: string };
  if (!body.alert_id) return json({ error: "Falta alert_id" }, 400);
  const { data: alert, error: alertError } = await db.from("staff_alerts").select("id,target_role,target_user_ids,alert_mode,message").eq("id", body.alert_id).single();
  if (alertError || !alert) return json({ error: alertError?.message || "Alerta no encontrada" }, 404);

  const { data: pushConfig, error: pushConfigError } = await db
    .from("staff_push_config")
    .select("vapid_public_key,vapid_private_key,vapid_subject")
    .eq("id", true)
    .single();
  if (pushConfigError || !pushConfig) return json({ error: "VAPID no configurado" }, 503);
  webpush.setVapidDetails(
    pushConfig.vapid_subject,
    pushConfig.vapid_public_key,
    pushConfig.vapid_private_key,
  );

  let subscriptionsQuery = db.from("staff_push_subscriptions").select("id,endpoint,p256dh,auth");
  if (alert.target_role === "Personas") subscriptionsQuery = subscriptionsQuery.in("user_id", alert.target_user_ids || []);
  else subscriptionsQuery = subscriptionsQuery.eq("role", alert.target_role);
  const { data: subscriptions, error: subscriptionsError } = await subscriptionsQuery;
  if (subscriptionsError) return json({ error: subscriptionsError.message }, 500);

  let delivered = 0;
  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: "Alerta de administración", body: alert.message, tag: alert.id, alert_mode: alert.alert_mode }));
      delivered += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from("staff_push_subscriptions").delete().eq("id", subscription.id);
    }
  }
  return json({ ok: true, delivered, registered: subscriptions?.length || 0 });
});
