import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da MisticPay para a assinatura do sistema.
 * O corpo não é confiado: a transação é sempre reconsultada na API da MisticPay.
 */
export const Route = createFileRoute("/api/public/hooks/saas-misticpay")({
  server: {
    handlers: {
      GET: async () => new Response("SaaS MisticPay Webhook Active", { status: 200 }),
      POST: async ({ request }) => {
        try {
          let body: any = {};
          try { body = await request.json(); } catch {}
          const txId = body?.transactionId != null ? String(body.transactionId) : "";
          if (!txId || (body?.transactionType && body.transactionType !== "DEPOSITO")) {
            return Response.json({ ok: true, message: "Evento ignorado." });
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: payment } = await supabaseAdmin
            .from("saas_payments")
            .select("id")
            .eq("provider", "misticpay")
            .eq("provider_payment_id", txId)
            .maybeSingle();
          if (!payment) return Response.json({ ok: true, message: "Transação não pertence à assinatura." });
          const { reconcileSaasPayment } = await import("@/lib/subscription.server");
          const result = await reconcileSaasPayment(payment.id);
          return Response.json(result, { status: result.ok ? 200 : 500 });
        } catch (error) {
          console.error("Erro no webhook MisticPay:", error);
          return Response.json({ ok: false, error: "Erro interno." }, { status: 500 });
        }
      },
    },
  },
});
