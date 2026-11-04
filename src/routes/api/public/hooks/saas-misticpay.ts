import { createFileRoute } from "@tanstack/react-router";
import {
  consumeWebhookRateLimit,
  isValidWebhookSecret,
  timingSafeStringEquals,
  webhookRateLimitKey,
} from "@/lib/webhook-security.server";

const OUTGOING_EVENTS = ["SAQUE", "SAQUE_PIX", "RETIRADA", "TRANSFERENCIA", "TRANSFER", "ESTORNO", "DEVOLUCAO"];

function extractTransactionId(body: any, url: URL): string {
  const candidates = [
    body?.transactionId, body?.transaction_id, body?.id,
    body?.data?.transactionId, body?.data?.transaction_id, body?.data?.id,
    body?.transaction?.transactionId, body?.transaction?.id,
    url.searchParams.get("transactionId"), url.searchParams.get("id"),
  ];
  for (const value of candidates) {
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

export const Route = createFileRoute("/api/public/hooks/saas-misticpay")({
  server: {
    handlers: {
      GET: async () => new Response("SaaS MisticPay Webhook Active", { status: 200 }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const expectedSecret = process.env.MISTICPAY_WEBHOOK_SECRET?.trim() || "";
        if (!isValidWebhookSecret(expectedSecret)) {
          return Response.json({
            ok: false,
            error: "Webhook MisticPay desativado: configure MISTICPAY_WEBHOOK_SECRET com pelo menos 32 caracteres.",
          }, { status: 503 });
        }

        const suppliedSecret = url.searchParams.get("secret") || request.headers.get("x-webhook-token");
        if (!timingSafeStringEquals(suppliedSecret, expectedSecret)) {
          return Response.json({ ok: false, error: "Webhook MisticPay não autorizado." }, { status: 401 });
        }
        if (!consumeWebhookRateLimit(webhookRateLimitKey(request, "saas-misticpay"), 30, 60_000)) {
          return Response.json({ ok: false, error: "Muitas notificações. Tente novamente." }, { status: 429 });
        }

        try {
          let body: any;
          try {
            body = await request.json();
          } catch {
            return Response.json({ ok: false, error: "JSON inválido." }, { status: 400 });
          }

          const type = String(body?.transactionType ?? body?.type ?? "").trim().toUpperCase();
          if (type && OUTGOING_EVENTS.includes(type)) {
            return Response.json({ ok: true, message: "Evento de saída ignorado." });
          }
          if (type && type !== "DEPOSITO") {
            return Response.json({ ok: true, message: "Evento que não é depósito ignorado." });
          }
          if (body?.refund || ["DEVOLVIDO", "DEVOLVIDO_PARCIAL"].includes(String(body?.status || "").toUpperCase())) {
            return Response.json({ ok: true, message: "Evento de reembolso ignorado." });
          }

          const txId = extractTransactionId(body, url);
          if (!txId) {
            return Response.json({ ok: false, error: "Identificador da transação não informado." }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: payment, error: lookupError } = await supabaseAdmin
            .from("saas_payments")
            .select("id")
            .eq("provider", "misticpay")
            .eq("provider_payment_id", txId)
            .maybeSingle();

          if (lookupError) {
            console.error("Falha ao localizar pagamento MisticPay:", lookupError);
            return Response.json({ ok: false, error: "Não foi possível localizar a cobrança." }, { status: 500 });
          }
          if (!payment) {
            // Não faz varredura de cobranças em cada POST. O endpoint /saas-reconcile
            // executa reconciliação em lote e exige BILLING_CRON_SECRET.
            return Response.json({ ok: true, ignored: true, message: "Transação não corresponde a uma cobrança SaaS." });
          }

          const { reconcileSaasPayment } = await import("@/lib/subscription.server");
          const result = await reconcileSaasPayment(payment.id);
          return Response.json(result, { status: result.ok ? 200 : 503 });
        } catch (error) {
          console.error("Erro no webhook MisticPay:", error);
          return Response.json({ ok: false, error: "Erro interno." }, { status: 500 });
        }
      },
    },
  },
});
