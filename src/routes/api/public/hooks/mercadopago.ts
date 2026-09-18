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

          let settingsList: any[] = [];
          if (uidParam) {
            const { data } = await supabaseAdmin.from("whatsapp_settings").select("*").eq("user_id", uidParam).maybeSingle();
            if (data) settingsList = [data];
          }
          if (settingsList.length === 0) {
            const { data } = await supabaseAdmin.from("whatsapp_settings").select("*").not("mercadopago_token", "is", null);
            settingsList = (data ?? []).filter((item: any) => Boolean(item.mercadopago_token?.trim()));
          }
          if (settingsList.length === 0) {
            return Response.json({ ok: false, error: "Nenhuma credencial do Mercado Pago configurada." });
          }

          let paymentData: any = null;
          let matchedSettings: any = null;
          for (const settings of settingsList) {
            const token = settings.mercadopago_token?.trim();
            if (!token) continue;
            try {
              const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (response.ok) {
                paymentData = await response.json();
                matchedSettings = settings;
                break;
              }
            } catch {}
          }

          if (!paymentData || !matchedSettings) {
            return Response.json({ ok: true, message: "Pagamento não encontrado nas credenciais ativas." });
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
