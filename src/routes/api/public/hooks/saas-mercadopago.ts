import { createFileRoute } from "@tanstack/react-router";
import {
  isMercadoPagoAmountSufficient,
  validateMercadoPagoPayment,
  verifyMercadoPagoWebhookSignature,
} from "@/lib/mercadopago-webhook.server";
import {
  consumeWebhookRateLimit,
  isValidWebhookSecret,
  webhookRateLimitKey,
} from "@/lib/webhook-security.server";

/** Webhook SaaS: assinatura HMAC + confirmação na API + referência e valor conferidos. */
export const Route = createFileRoute("/api/public/hooks/saas-mercadopago")({
  server: {
    handlers: {
      GET: async () => new Response("SaaS Mercado Pago Webhook Active", { status: 200 }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const dataId = url.searchParams.get("data.id");
        const requestId = request.headers.get("x-request-id");
        const signature = request.headers.get("x-signature");
        const webhookSecret = process.env.SAAS_MERCADOPAGO_WEBHOOK_SECRET?.trim() || "";

        if (!isValidWebhookSecret(webhookSecret)) {
          return Response.json({
            ok: false,
            error: "Webhook Mercado Pago desativado: configure SAAS_MERCADOPAGO_WEBHOOK_SECRET com pelo menos 32 caracteres.",
          }, { status: 503 });
        }
        if (!verifyMercadoPagoWebhookSignature({
          dataId,
          requestId,
          signatureHeader: signature,
          secret: webhookSecret,
        })) {
          return Response.json({ ok: false, error: "Assinatura do webhook Mercado Pago inválida ou expirada." }, { status: 401 });
        }
        if (!consumeWebhookRateLimit(webhookRateLimitKey(request, "saas-mercadopago"), 60, 60_000)) {
          return Response.json({ ok: false, error: "Muitas notificações. Tente novamente." }, { status: 429 });
        }

        if (!dataId) return Response.json({ ok: false, error: "ID da notificação ausente." }, { status: 400 });
        if (!/^\d{1,32}$/.test(dataId)) {
          return Response.json({ ok: false, error: "ID do pagamento inválido." }, { status: 400 });
        }

        try {
          const { getMercadoPagoToken } = await import("@/lib/system-settings.server");
          const token = await getMercadoPagoToken();
          if (!token) {
            return Response.json({ ok: false, error: "Token do Mercado Pago não configurado no painel Admin." }, { status: 503 });
          }

          const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              "User-Agent": "SigmaControl/1.0 (MercadoPago SaaS Webhook)",
            },
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) {
            console.error("Mercado Pago não confirmou o pagamento SaaS:", response.status);
            return Response.json({ ok: false, error: "Não foi possível confirmar o pagamento na API do Mercado Pago." }, { status: 502 });
          }

          const payment: any = await response.json();
          const baseValidation = validateMercadoPagoPayment(payment, dataId);
          if (baseValidation === "not_approved") {
            return Response.json({ ok: true, message: `Status ${payment.status}; aguardando aprovação.` });
          }
          if (baseValidation) {
            return Response.json({ ok: false, error: `Pagamento Mercado Pago inválido (${baseValidation}).` }, { status: 409 });
          }

          const externalRef = String(payment.external_reference || "");
          if (!externalRef.startsWith("saas_")) {
            return Response.json({ ok: true, ignored: true, message: "Pagamento não pertence à assinatura do sistema." });
          }
          const saasPaymentId = externalRef.slice(5);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: saasPayment, error: lookupError } = await supabaseAdmin
            .from("saas_payments")
            .select("id, provider, provider_payment_id, amount, status")
            .eq("id", saasPaymentId)
            .eq("provider", "mercadopago")
            .maybeSingle();

          if (lookupError) {
            console.error("Falha ao localizar pagamento da assinatura:", lookupError);
            return Response.json({ ok: false, error: "Não foi possível localizar a cobrança SaaS." }, { status: 500 });
          }
          if (!saasPayment) {
            return Response.json({ ok: true, ignored: true, message: "Cobrança SaaS não encontrada." });
          }
          if (String(saasPayment.provider_payment_id || "") !== dataId) {
            return Response.json({ ok: false, error: "ID do pagamento não corresponde à cobrança registrada." }, { status: 409 });
          }
          if (!isMercadoPagoAmountSufficient(payment.transaction_amount, saasPayment.amount)) {
            return Response.json({ ok: false, error: "O valor recebido é inferior ao valor da assinatura." }, { status: 409 });
          }

          if (["cancelled", "rejected", "expired"].includes(String(payment.status))) {
            await supabaseAdmin
              .from("saas_payments")
              .update({ status: "cancelled" })
              .eq("id", saasPaymentId)
              .eq("status", "pending");
            return Response.json({ ok: true, message: `Status ${payment.status} registrado.` });
          }

          const { activateSubscriptionFromPayment } = await import("@/lib/subscription.server");
          const result = await activateSubscriptionFromPayment(saasPaymentId);
          return Response.json(result, { status: result.ok ? 200 : 503 });
        } catch (error) {
          console.error("Erro no webhook da assinatura Mercado Pago:", error);
          return Response.json({ ok: false, error: error instanceof Error ? error.message : "Erro interno." }, { status: 500 });
        }
      },
    },
  },
});
