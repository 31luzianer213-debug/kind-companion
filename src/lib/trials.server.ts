import { tenantSendText } from "./evolution-tenant.server";

/**
 * Avisa clientes que estão em teste grátis pouco antes do acesso expirar.
 * Roda junto com a rotina diária e nunca avisa o mesmo teste duas vezes.
 */
export async function runTrialRemindersForUser(supabase: any, userId: string) {
  const { data: settings } = await supabase
    .from("whatsapp_settings")
    .select("trial_reminder_enabled, business_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (settings && settings.trial_reminder_enabled === false) {
    return { trialsNotified: 0, trialsFailed: 0 };
  }

  const now = new Date();
  const limit = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("client_trials")
    .select("id, name, phone, expires_at, notified_at, converted")
    .eq("user_id", userId)
    .is("notified_at", null)
    .eq("converted", false)
    .lte("expires_at", limit.toISOString())
    .gte("expires_at", now.toISOString());

  if (error) return { trialsNotified: 0, trialsFailed: 0 };

  const trials = Array.isArray(data) ? data : [];
  let trialsNotified = 0;
  let trialsFailed = 0;

  for (const trial of trials) {
    const phone = String(trial?.phone || "").replace(/\D/g, "");
    if (!phone) continue;

    const expires = new Date(trial.expires_at);
    const hours = Math.max(1, Math.round((expires.getTime() - now.getTime()) / 3_600_000));
    const body =
      `Olá ${trial?.name || "tudo bem"}! 👋\n\n` +
      `Seu teste grátis termina em aproximadamente ${hours} hora${hours === 1 ? "" : "s"}.\n` +
      `Gostou da qualidade? Responda *ASSINAR* que eu já libero seu acesso completo sem interrupção. 🍿`;

    const result = await tenantSendText(userId, trial.phone, body);
    if (result.ok) {
      trialsNotified++;
      await supabase
        .from("client_trials")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", trial.id)
        .eq("user_id", userId);
    } else {
      trialsFailed++;
    }
  }

  return { trialsNotified, trialsFailed };
}
