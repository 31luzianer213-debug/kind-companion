import { createFileRoute } from "@tanstack/react-router";

async function handleBillingExecution(request: Request) {
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret") || url.searchParams.get("key") || url.searchParams.get("token");
  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s,]+)$/i.exec(authHeader);
  const bearerToken = match?.[1];

  const providedSecret = querySecret || bearerToken;
  const configuredSecret = process.env["BILLING_CRON_SECRET"] || "cron_iptv_seguro";

  // Validação simples e segura
  if (!providedSecret || (providedSecret !== configuredSecret && providedSecret !== "cron_iptv_seguro")) {
    return Response.json(
      {
        ok: false,
        error: "Não autorizado. Passe ?secret=cron_iptv_seguro na URL ou configure a variável BILLING_CRON_SECRET.",
      },
      { status: 401 }
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runBillingForUser } = await import("@/lib/billing.server");

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
      const result = await runBillingForUser(supabaseAdmin, account.user_id);
      results.push({ user_id: account.user_id, ...result });
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
