import { createFileRoute } from "@tanstack/react-router";
import {
  asaasApiBaseUrl,
  isValidAsaasWebhookToken,
  validateAsaasPayment,
  verifyAsaasWebhookToken,
} from "@/lib/asaas-webhook.server";

export const Route = createFileRoute("/api/public/hooks/asaas")({
  server: {
    handlers: {
      GET: async () => new Response("Asaas Webhook Active", { status: 200 }),
      POST: async ({ request }) => {
        try {
          let body: any;
          try {
            body = await request.json();
          } catch {
            return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
          }

          const event = body?.event;
          const paymentNotice = body?.payment;
          if (!paymentNotice?.id) {
            return Response.json({ ok: true, message: "Evento sem dados de pagamento ignorado." });
          }
          if (event !== "PAYMENT_RECEIVED" && event !== "PAYMENT_CONFIRMED") {
            return Response.json({ ok: true, message: `Evento ${event} ignorado.` });
          }

          const externalRef = String(paymentNotice.externalReference || "").trim();
          if (!externalRef) {
            return Response.json({
              ok: true,
              needsReview: true,
              message: "Pagamento recebido sem referência da fatura. Renovação automática não executada para evitar cliente incorreto.",
            });
          }

          const uidParam = new URL(request.url).searchParams.get("uid") || "";
          if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(uidParam)) {
            return Response.json({ ok: false, error: "Identificador do revendedor inválido." }, { status: 401 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: settings, error: settingsError } = await supabaseAdmin
            .from("whatsapp_settings")
            .select("asaas_token, asaas_env, asaas_webhook_token")
            .eq("user_id", uidParam)
            .maybeSingle();

          if (settingsError) {
            console.error("Falha ao carregar credenciais Asaas:", settingsError);
            return Response.json({ ok: false, error: "Não foi possível validar a configuração do Asaas." }, { status: 500 });
          }

          const expectedWebhookToken = String(settings?.asaas_webhook_token || "").trim();
          if (!isValidAsaasWebhookToken(expectedWebhookToken)) {
            return Response.json({
              ok: false,
              error: "Webhook Asaas bloqueado: configure um Auth Token de 32 a 255 caracteres na tela de pagamentos.",
            }, { status: 503 });
          }

          if (!verifyAsaasWebhookToken(request.headers.get("asaas-access-token"), expectedWebhookToken)) {
            return Response.json({ ok: false, error: "Token do webhook Asaas inválido." }, { status: 401 });
          }

          const asaasApiToken = String(settings?.asaas_token || "").trim();
          if (!asaasApiToken) {
            return Response.json({ ok: false, error: "Chave de API do Asaas não configurada para esta conta." }, { status: 503 });
          }

          const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from("invoices")
            .select("*")
            .eq("id", externalRef)
            .eq("user_id", uidParam)
            .maybeSingle();

          if (invoiceError) {
            console.error("Falha ao localizar fatura Asaas:", invoiceError);
            return Response.json({ ok: false, error: "Não foi possível localizar a fatura." }, { status: 500 });
          }
          if (!invoice) {
            return Response.json({ ok: true, needsReview: true, message: "Pagamento recebido, mas a fatura da conta não foi encontrada." });
          }
          if (invoice.status === "paid") {
            return Response.json({ ok: true, message: "Fatura já estava paga. Evento ignorado." });
          }

          // O payload de webhook não é prova de pagamento: consulta a cobrança
          // novamente na API Asaas com a chave privada do próprio revendedor.
          const paymentId = String(paymentNotice.id);
          const apiUrl = `${asaasApiBaseUrl(settings?.asaas_env)}/payments/${encodeURIComponent(paymentId)}`;
          const verificationResponse = await fetch(apiUrl, {
            method: "GET",
            headers: {
              accept: "application/json",
              access_token: asaasApiToken,
              "User-Agent": "KindCompanion/2.0 (Asaas integration)",
            },
            signal: AbortSignal.timeout(8000),
          });

          if (!verificationResponse.ok) {
            console.error("Asaas recusou a consulta do pagamento:", verificationResponse.status);
            return Response.json({ ok: false, error: "Não foi possível confirmar o pagamento diretamente no Asaas." }, { status: 502 });
          }

          const verifiedPayment = await verificationResponse.json();
          const mismatch = validateAsaasPayment(
            verifiedPayment,
            paymentId,
            externalRef,
            Number(invoice.amount),
          );

          if (mismatch === "not_received") {
            return Response.json({ ok: true, message: `Asaas ainda não confirmou o pagamento (status ${verifiedPayment.status}).` });
          }
          if (mismatch) {
            return Response.json({
              ok: false,
              needsReview: true,
              error: `Pagamento Asaas não corresponde à fatura (${mismatch}).`,
            }, { status: 409 });
          }

          const { processPaidInvoiceAutomation } = await import("@/lib/payment-automation.server");
          const result = await processPaidInvoiceAutomation({
            supabase: supabaseAdmin,
            userId: invoice.user_id,
            invoice,
            provider: "asaas",
            providerPaymentId: paymentId,
            amount: Number(verifiedPayment.value),
            months: 1,
          });

          return Response.json({ ...result, ok: true, message: "Pagamento confirmado diretamente no Asaas e processado." });
        } catch (error) {
          console.error("Erro inesperado no webhook Asaas:", error);
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Erro interno no processamento do Asaas." },
            { status: 500 },
          );
        }
      },
    },
  },
});
