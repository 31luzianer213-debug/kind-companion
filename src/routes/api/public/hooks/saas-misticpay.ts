import { createFileRoute } from "@tanstack/react-router";

/** Tipos de evento que NÃO representam dinheiro entrando na conta. */
const OUTGOING_EVENTS = ["SAQUE", "SAQUE_PIX", "TRANSFERENCIA", "TRANSFER", "ESTORNO", "DEVOLUCAO"];

function extractTransactionId(body: any, url: URL): string {
  const candidates = [
    body?.transactionId,
    body?.transaction_id,
    body?.id,
    body?.data?.transactionId,
    body?.data?.transaction_id,
    body?.data?.id,
    body?.transaction?.transactionId,
    body?.transaction?.id,
    url.searchParams.get("transactionId"),
    url.searchParams.get("id"),
  ];
  for (const value of candidates) {
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

/**
 * Webhook da MisticPay para a assinatura do sistema.
 * O corpo NÃO é confiado: a transação é sempre reconsultada na API da MisticPay
 * antes de liberar o acesso, e por isso uma notificação forjada nunca libera errado.
 */
export const Route = createFileRoute("/api/public/hooks/saas-misticpay")({
  server: {
    handlers: {
      GET: async () => new Response("SaaS MisticPay Webhook Active", { status: 200 }),
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          let body: any = {};
          try { body = await request.json(); } catch {}

          const type = String(body?.transactionType ?? body?.type ?? "").trim().toUpperCase();
          if (type && OUTGOING_EVENTS.includes(type)) {
            return Response.json({ ok: true, message: "Evento de saída ignorado." });
          }

          const txId = extractTransactionId(body, url);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { reconcileSaasPayment } = await import("@/lib/subscription.server");

          // 1) Caminho normal: o id recebido é o mesmo que guardamos na cobrança.
          if (txId) {
            const { data: payment } = await supabaseAdmin
              .from("saas_payments")
              .select("id")
              .eq("provider", "misticpay")
              .eq("provider_payment_id", txId)
              .maybeSingle();
            if (payment) {
              const result = await reconcileSaasPayment(payment.id);
              return Response.json(result, { status: result.ok ? 200 : 500 });
            }
          }

          // 2) Fallback: a MisticPay às vezes notifica com um identificador
          // diferente do que guardamos. Nesse caso, reconfere as cobranças
          // pendentes recentes — só libera o que a própria MisticPay confirmar
          // como pago, então isso também serve de rede de segurança para um
          // webhook que nunca chegou.
          const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
          const { data: pending } = await supabaseAdmin
            .from("saas_payments")
            .select("id")
            .eq("provider", "misticpay")
            .eq("status", "pending")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(25);

          if (!pending?.length) {
            return Response.json({ ok: true, message: "Nenhuma cobrança pendente para conferir." });
          }

          let approved = 0;
          let checkFailed = false;
          for (const row of pending) {
            const result = await reconcileSaasPayment(row.id);
            if (result.ok && result.status === "approved") approved += 1;
            if (!result.ok) checkFailed = true;
          }

          if (checkFailed && !approved) {
            return Response.json({ ok: false, error: "Não foi possível confirmar os pagamentos na MisticPay." }, { status: 500 });
          }
          return Response.json({ ok: true, checked: pending.length, approved });
        } catch (error) {
          console.error("Erro no webhook MisticPay:", error);
          return Response.json({ ok: false, error: "Erro interno." }, { status: 500 });
        }
      },
    },
  },
});
