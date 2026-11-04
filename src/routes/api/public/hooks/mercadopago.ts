import { createFileRoute } from "@tanstack/react-router";
import { isMercadoPagoAmountSufficient, validateMercadoPagoPayment } from "@/lib/mercadopago-webhook.server";
import { consumeWebhookRateLimit, webhookRateLimitKey } from "@/lib/webhook-security.server";

export const Route = createFileRoute("/api/public/hooks/mercadopago")({
  server: {
    handlers: {
      GET: async () => new Response("Mercado Pago Webhook Active", { status: 200 }),
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
          const uidParam = url.searchParams.get("uid");

          let body: any = {};
          try { body = await request.json(); } catch {}
          if (!paymentId && body?.data?.id) paymentId = String(body.data.id);
          if (!paymentId) return Response.json({ ok: true, message: "Evento sem ID de pagamento ignorado." });

          if (!consumeWebhookRateLimit(webhookRateLimitKey(request, "reseller-mercadopago"), 60, 60_000)) {
            return Response.json({ ok: false, error: "Muitas notificações do Mercado Pago. Tente novamente." }, { status: 429 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // O webhook precisa carregar o identificador do revendedor (?uid=). Assim o pagamento
          // é consultado apenas com o token daquela conta, sem cruzar dados entre revendedores.
          if (!uidParam || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(uidParam)) {
            return Response.json({ ok: false, error: "Webhook sem identificador do revendedor (uid)." }, { status: 401 });
          }

          const { data: matchedSettings } = await supabaseAdmin
            .from("whatsapp_settings")
            .select("*")
            .eq("user_id", uidParam)
            .maybeSingle();
          const token = String((matchedSettings as any)?.mercadopago_token ?? "").trim();
          if (!matchedSettings || !token) {
            return Response.json({ ok: false, error: "Credencial do Mercado Pago não configurada para esta conta." });
          }

          let paymentData: any = null;
          try {
            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) paymentData = await response.json();
          } catch {}

          if (!paymentData) {
            return Response.json({ ok: true, message: "Pagamento não encontrado na conta do Mercado Pago informada." });
          }
          const paymentIdText = String(paymentId);
          const externalRef = String(paymentData.external_reference || "").trim();
          const baseValidation = validateMercadoPagoPayment(paymentData, paymentIdText);
          if (baseValidation === "not_approved") {
            return Response.json({ ok: true, message: `Status do pagamento: ${paymentData.status}. Aguardando aprovação.` });
          }
          if (baseValidation) {
            return Response.json({ ok: false, needsReview: true, error: `Pagamento Mercado Pago inválido (${baseValidation}).` }, { status: 409 });
          }

          if (externalRef.startsWith("ord_")) {
            const { data: order, error: orderError } = await supabaseAdmin
              .from("orders")
              .select("id,user_id,order_number,amount,status")
              .eq("id", externalRef)
              .eq("user_id", matchedSettings.user_id)
              .maybeSingle();

            if (orderError) {
              console.error("Falha ao localizar pedido do Mercado Pago:", orderError);
              return Response.json({ ok: false, error: "Não foi possível localizar o pedido." }, { status: 500 });
            }
            if (!order) {
              return Response.json({ ok: true, needsReview: true, message: "Pagamento aprovado, mas o pedido correspondente não foi encontrado." });
            }
            if (validateMercadoPagoPayment(paymentData, paymentIdText, order.id) ||
                !isMercadoPagoAmountSufficient(paymentData.transaction_amount, order.amount)) {
              return Response.json({ ok: false, needsReview: true, error: "O pagamento não corresponde ao pedido ou foi recebido com valor insuficiente." }, { status: 409 });
            }
            if (order.status === "approved") {
              return Response.json({ ok: true, alreadyProcessed: true, message: `Pedido #${order.order_number} já estava aprovado. Evento duplicado ignorado.` });
            }
            if (order.status !== "pending") {
              return Response.json({ ok: false, needsReview: true, error: "O pedido não está pendente e não pode ser liberado automaticamente." }, { status: 409 });
            }

            const { approveAndReleaseOrderServer } = await import("@/lib/orders.server");
            const orderResult = await approveAndReleaseOrderServer(matchedSettings.user_id, externalRef);
            if (orderResult.ok) {
              return Response.json({
                ok: true,
                message: `Pedido #${orderResult.order?.order_number} aprovado com sucesso via Mercado Pago! Acesso entregue.`,
                order: orderResult.order,
              });
            }
            return Response.json({ ok: false, needsReview: true, error: orderResult.message }, { status: 409 });
          }

          let invoice: any = null;
          if (externalRef) {
            const { data, error: invoiceLookupError } = await supabaseAdmin
              .from("invoices")
              .select("*")
              .eq("id", externalRef)
              .eq("user_id", matchedSettings.user_id)
              .maybeSingle();
            if (invoiceLookupError) {
              console.error("Falha ao localizar fatura do Mercado Pago:", invoiceLookupError);
              return Response.json({ ok: false, error: "Não foi possível localizar a fatura." }, { status: 500 });
            }
            invoice = data;
          } else {
            // Compatibilidade com cobranças antigas sem external_reference:
            // só processa automaticamente quando existe UMA ÚNICA fatura do mesmo valor.
            const { data: candidates, error: candidateError } = await supabaseAdmin
              .from("invoices")
              .select("*")
              .eq("user_id", matchedSettings.user_id)
              .in("status", ["pending", "overdue"])
              .order("due_date", { ascending: true })
              .limit(50);
            if (candidateError) {
              console.error("Falha ao localizar cobranças pendentes:", candidateError);
              return Response.json({ ok: false, error: "Não foi possível localizar cobranças pendentes." }, { status: 500 });
            }
            const amount = Number(paymentData.transaction_amount ?? 0);
            const sameAmount = (candidates ?? []).filter((item: any) => Math.abs(Number(item.amount) - amount) < 0.01);
            if (sameAmount.length === 1) invoice = sameAmount[0];
            else if (sameAmount.length > 1) {
              return Response.json({
                ok: true,
                needsReview: true,
                message: "Pagamento aprovado, mas há mais de uma fatura com o mesmo valor. Renovação automática não executada para evitar cliente incorreto.",
              });
            }
          }

          if (!invoice) {
            return Response.json({ ok: true, needsReview: true, message: "Pagamento aprovado, mas nenhuma fatura correspondente foi encontrada." });
          }
          if (validateMercadoPagoPayment(paymentData, paymentIdText, externalRef || undefined) ||
              !isMercadoPagoAmountSufficient(paymentData.transaction_amount, invoice.amount)) {
            return Response.json({ ok: false, needsReview: true, error: "O pagamento não corresponde à fatura ou foi recebido com valor insuficiente." }, { status: 409 });
          }
          if (invoice.status === "paid") {
            return Response.json({ ok: true, alreadyProcessed: true, message: "Fatura já estava paga. Evento duplicado ignorado." });
          }
          if (invoice.status !== "pending" && invoice.status !== "overdue") {
            return Response.json({ ok: false, needsReview: true, error: "A fatura não está pendente e não pode ser liquidada automaticamente." }, { status: 409 });
          }

          const { processPaidInvoiceAutomation } = await import("@/lib/payment-automation.server");
          const result = await processPaidInvoiceAutomation({
            supabase: supabaseAdmin,
            userId: matchedSettings.user_id,
            invoice,
            provider: "mercadopago",
            providerPaymentId: String(paymentId),
            amount: Number(paymentData.transaction_amount ?? invoice.amount ?? 0),
            months: 1,
          });

          return Response.json({ ...result, ok: true, message: "Pagamento processado automaticamente." });
        } catch (error) {
          console.error("Erro inesperado no webhook Mercado Pago:", error);
          return Response.json({ ok: false, error: error instanceof Error ? error.message : "Erro interno no processamento." }, { status: 500 });
        }
      },
    },
  },
});
