import { createFileRoute } from "@tanstack/react-router";

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
          if (paymentData.status !== "approved") {
            return Response.json({ ok: true, message: `Status do pagamento: ${paymentData.status}. Aguardando aprovação.` });
          }

          const externalRef = String(paymentData.external_reference || "").trim();

          if (externalRef.startsWith("ord_")) {
            try {
              const { approveAndReleaseOrderServer } = await import("@/lib/orders.server");
              const orderResult = await approveAndReleaseOrderServer(matchedSettings.user_id, externalRef);
              if (orderResult.ok) {
                return Response.json({
                  ok: true,
                  message: `Pedido #${orderResult.order?.order_number} aprovado com sucesso via Mercado Pago! Acesso entregue.`,
                  order: orderResult.order,
                });
              }
            } catch (error) {
              console.warn("Falha ao processar pedido pago no Mercado Pago:", error);
            }
          }

          let invoice: any = null;
          if (externalRef) {
            const { data } = await supabaseAdmin
              .from("invoices")
              .select("*")
              .eq("id", externalRef)
              .eq("user_id", matchedSettings.user_id)
              .maybeSingle();
            invoice = data;
          }

          // Compatibilidade com cobranças antigas sem external_reference:
          // só processa automaticamente quando existe UMA ÚNICA fatura do mesmo valor.
          if (!invoice) {
            const { data: candidates } = await supabaseAdmin
              .from("invoices")
              .select("*")
              .eq("user_id", matchedSettings.user_id)
              .in("status", ["pending", "overdue"])
              .order("due_date", { ascending: true })
              .limit(50);
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
          if (invoice.status === "paid") {
            return Response.json({ ok: true, message: "Fatura já estava paga. Evento ignorado." });
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
