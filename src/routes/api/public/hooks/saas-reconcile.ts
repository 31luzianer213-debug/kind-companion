import { createFileRoute } from "@tanstack/react-router";

/**
 * Rede de segurança das assinaturas (SaaS): reconfere na operadora os Pix que
 * ficaram pendentes e libera o acesso de quem pagou.
 *
 * Existe porque a confirmação por webhook pode não chegar (URL não cadastrada na
 * operadora, instabilidade ou identificador diferente). Rodando de tempos em
 * tempos, nenhum pagamento fica "pago mas bloqueado" esperando liberação manual.
 *
 * Protegido pelo mesmo segredo das rotinas: BILLING_CRON_SECRET.
 */
async function runReconcile(request: Request) {
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret") || url.searchParams.get("key") || url.searchParams.get("token");
  const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.get("authorization") ?? "");
  const provided = querySecret || match?.[1];
  const configured = process.env["BILLING_CRON_SECRET"];
  if (!configured || !provided || provided !== configured) {
    return Response.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { reconcilePendingSaasPayments } = await import("@/lib/subscription.server");
    const { getSaasProvider } = await import("@/lib/system-settings.server");
    const provider = (await getSaasProvider()) ?? "misticpay";
    const result = await reconcilePendingSaasPayments({ provider, hours: 72, limit: 50 });
    return Response.json({ ok: true, provider, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Erro ao reconciliar assinaturas:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/hooks/saas-reconcile")({
  server: {
    handlers: {
      GET: async ({ request }) => runReconcile(request),
      POST: async ({ request }) => runReconcile(request),
    },
  },
});
