import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sigma-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => handleSync(request),
      POST: async ({ request }) => handleSync(request),
    },
  },
});

async function handleSync(request: Request) {
  const secret = process.env["BILLING_CRON_SECRET"] || process.env["SIGMA_CRON_SECRET"];
  const authHeader = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s,]+)$/.exec(authHeader);
  const url = new URL(request.url);
  const passedSecret = match?.[1] || url.searchParams.get("secret");

  // Sem segredo configurado a rotina permanece fechada.
  if (!secret || !passedSecret || passedSecret !== secret) {
    return Response.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runSigmaSyncForUser } = await import("@/lib/sigma.functions");

  // Busca todas as contas com painel Sigma preenchido
  const { data: accounts, error } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("user_id, sigma_url, sigma_username")
    .not("sigma_url", "is", null);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: Record<string, unknown>[] = [];
  let totalCreated = 0;
  let totalUpdated = 0;

  for (const account of accounts ?? []) {
    if (!account.sigma_url) continue;
    try {
      const result = await runSigmaSyncForUser(supabaseAdmin, account.user_id);
      totalCreated += result.created || 0;
      totalUpdated += result.updated || 0;
      results.push({
        user_id: account.user_id,
        ok: result.ok,
        created: result.created,
        updated: result.updated,
        createdNames: result.createdNames,
        error: result.error,
      });
    } catch (err) {
      results.push({
        user_id: account.user_id,
        ok: false,
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return Response.json({
    ok: true,
    accountsCount: results.length,
    totalCreated,
    totalUpdated,
    results,
    timestamp: new Date().toISOString(),
  });
}
