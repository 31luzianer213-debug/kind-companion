import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/asaas")({
  server: {
    handlers: {
      GET: async () => new Response("Asaas Webhook Active", { status: 200 }),
      POST: async ({ request }) => {
        try {
          let body: any = {};
          try { body = await request.json(); } catch {
            return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
          }

          const event = body?.event;
          const payment = body?.payment;
          if (!payment?.id) return Response.json({ ok: true, message: "Evento sem dados de pagamento ignorado." });
          if (event !== "PAYMENT_RECEIVED" && event !== "PAYMENT_CONFIRMED") {
            return Response.json({ ok: true, message: `Evento ${event} ignorado.` });
          }

          const externalRef = String(payment.externalReference || "").trim();
          if (!externalRef) {
            return Response.json({
              ok: true,
              needsReview: true,
              message: "Pagamento recebido sem referência da fatura. Renovação automática não executada para evitar cliente incorreto.",
            });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: invoice } = await supabaseAdmin
            .from("invoices")
            .select("*")
            .eq("id", externalRef)
            .maybeSingle();

          if (!invoice) {
            return Response.json({ ok: true, needsReview: true, message: "Pagamento recebido, mas a fatura informada não foi encontrada." });
          }

          // O webhook carrega o identificador do revendedor (?uid=) e a fatura precisa pertencer a ele.
          const uidParam = new URL(request.url).searchParams.get("uid");
          if (!uidParam || uidParam !== invoice.user_id) {
            return Response.json({ ok: false, error: "Webhook sem identificador do revendedor ou fatura de outra conta." }, { status: 401 });
          }

          // Valida o token de autenticação do webhook quando o revendedor configurou um.
          const { data: settings } = await supabaseAdmin
            .from("whatsapp_settings")
            .select("asaas_webhook_token")
            .eq("user_id", invoice.user_id)
            .maybeSingle();
          const expectedToken = String((settings as any)?.asaas_webhook_token ?? "").trim();
          if (expectedToken && request.headers.get("asaas-access-token") !== expectedToken) {
            return Response.json({ ok: false, error: "Token do webhook Asaas inválido." }, { status: 401 });
          }

          if (invoice.status === "paid") {
            return Response.json({ ok: true, message: "Fatura já estava paga. Evento ignorado." });
          }

          const { processPaidInvoiceAutomation } = await import("@/lib/payment-automation.server");
          const result = await processPaidInvoiceAutomation({
            supabase: supabaseAdmin,
            userId: invoice.user_id,
            invoice,
            provider: "asaas",
            providerPaymentId: String(payment.id),
            amount: Number(payment.value ?? invoice.amount ?? 0),
            months: 1,
          });

          return Response.json({ ...result, ok: true, message: "Pagamento processado automaticamente." });
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
