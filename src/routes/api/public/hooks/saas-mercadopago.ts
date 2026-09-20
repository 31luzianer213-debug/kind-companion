import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook do Mercado Pago para a assinatura do SISTEMA (conta do dono do Sigma Control).
 * O pagamento é sempre reconsultado na API do Mercado Pago com o token do servidor,
 * então nenhum dado do corpo da notificação é confiado diretamente.
 */
export const Route = createFileRoute("/api/public/hooks/saas-mercadopago")({
  server: {
    handlers: {
      GET: async () => new Response("SaaS Mercado Pago Webhook Active", { status: 200 }),
      POST: async ({ request }) => {
        try {
          const { getMercadoPagoToken } = await import("@/lib/system-settings.server");
          const token = await getMercadoPagoToken();
          if (!token) return Response.json({ ok: false, error: "Token do Mercado Pago não configurado no painel Admin." }, { status: 500 });

          const url = new URL(request.url);
          let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
          let body: any = {};
          try { body = await request.json(); } catch {}
          if (!paymentId && body?.data?.id) paymentId = String(body.data.id);
          if (!paymentId) return Response.json({ ok: true, message: "Evento sem ID de pagamento ignorado." });

          const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) return Response.json({ ok: true, message: "Pagamento não encontrado." });
          const payment: any = await response.json();

          const externalRef = String(payment.external_reference || "");
          if (!externalRef.startsWith("saas_")) {
            return Response.json({ ok: true, message: "Pagamento não pertence à assinatura do sistema." });
          }
          const saasPaymentId = externalRef.slice(5);

          const { activateSubscriptionFromPayment } = await import("@/lib/subscription.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          if (payment.status === "approved") {
            const result = await activateSubscriptionFromPayment(saasPaymentId);
            return Response.json(result, { status: result.ok ? 200 : 500 });
          }
          if (["cancelled", "rejected", "expired"].includes(String(payment.status))) {
            await supabaseAdmin.from("saas_payments").update({ status: "cancelled" }).eq("id", saasPaymentId).neq("status", "approved");
          }
          return Response.json({ ok: true, message: `Status ${payment.status} registrado.` });
        } catch (error) {
          console.error("Erro no webhook da assinatura:", error);
          return Response.json({ ok: false, error: error instanceof Error ? error.message : "Erro interno." }, { status: 500 });
        }
      },
    },
  },
});
