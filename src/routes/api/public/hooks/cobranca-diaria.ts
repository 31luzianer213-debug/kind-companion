import { createFileRoute } from "@tanstack/react-router";

async function handleBillingExecution(request: Request) {
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret") || url.searchParams.get("key") || url.searchParams.get("token");
  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s,]+)$/i.exec(authHeader);
  const bearerToken = match?.[1];

  const providedSecret = querySecret || bearerToken;
  const configuredSecret = process.env["BILLING_CRON_SECRET"];

  // Sem segredo configurado a rotina fica fechada; nunca expor o valor esperado.
  if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
    return Response.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runBillingForUser } = await import("@/lib/billing.server");
  const { runAutomaticBillingForUser } = await import("@/lib/billing-automation.server");
  const { runTrialRemindersForUser } = await import("@/lib/trials.server");
  const { reconcilePendingSaasPayments } = await import("@/lib/subscription.server");

  // 0) Rede de segurança das assinaturas: libera quem pagou o Pix mas o aviso da
  // operadora não chegou. Roda antes das cobranças, todo dia.
  let saasReconcile: unknown = null;
  try {
    const mistic = await reconcilePendingSaasPayments({ provider: "misticpay", hours: 48, limit: 50 });
    const mercadoPago = await reconcilePendingSaasPayments({ provider: "mercadopago", hours: 48, limit: 50 });
    saasReconcile = {
      approved: mistic.approved + mercadoPago.approved,
      checked: mistic.checked + mercadoPago.checked,
    };
  } catch (err) {
    saasReconcile = { error: err instanceof Error ? err.message : "erro" };
  }

  // Localiza contas com auto_send_enabled ou todas ativas
  const { data: accounts, error } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("user_id, auto_send_enabled");

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const targetAccounts = (accounts ?? []).filter((a) => a.auto_send_enabled !== false);
  const results: Record<string, unknown>[] = [];

  for (const account of targetAccounts) {
    try {
      // 1) Gera/atualiza as faturas do dia (sem enviar nada).
      const result = await runBillingForUser(supabaseAdmin, account.user_id, { sendReminders: false });
      // 2) A régua de cobrança é a única responsável pelos envios, evitando mensagens duplicadas.
      const reminders = await runAutomaticBillingForUser(supabaseAdmin, account.user_id);
      // 3) Avisa quem está com teste grátis prestes a expirar.
      const trials = await runTrialRemindersForUser(supabaseAdmin, account.user_id);
      results.push({ user_id: account.user_id, ...result, ...reminders, ...trials });
    } catch (err) {
      results.push({
        user_id: account.user_id,
        error: err instanceof Error ? err.message : "erro",
      });
    }
  }

  return Response.json({
    ok: true,
    message: "Rotina diária de cobranças executada com sucesso.",
    timestamp: new Date().toISOString(),
    accountsProcessed: results.length,
    saasReconcile,
    results,
  });
}

export const Route = createFileRoute("/api/public/hooks/cobranca-diaria")({
  server: {
    handlers: {
      GET: async ({ request }) => handleBillingExecution(request),
      POST: async ({ request }) => handleBillingExecution(request),
    },
  },
});
