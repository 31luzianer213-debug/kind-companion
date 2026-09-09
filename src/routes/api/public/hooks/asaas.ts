import { createFileRoute } from "@tanstack/react-router";
import { addMonths } from "date-fns";

export const Route = createFileRoute("/api/public/hooks/asaas")({
  server: {
    handlers: {
      GET: async () => {
        return new Response("Asaas Webhook Active", { status: 200 });
      },
      POST: async ({ request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
          }

          const event = body?.event;
          const payment = body?.payment;

          if (!payment || !payment.id) {
            return Response.json({ ok: true, message: "Evento sem dados de pagamento ignorado." }, { status: 200 });
          }

          // Apenas processa pagamentos confirmados ou recebidos
          if (event !== "PAYMENT_RECEIVED" && event !== "PAYMENT_CONFIRMED") {
            return Response.json({ ok: true, message: `Evento ${event} ignorado.` }, { status: 200 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Tenta localizar a fatura correspondente
          // 1. Pelo externalReference (se configurado como o ID da fatura)
          let invoice: any = null;
          if (payment.externalReference) {
            const { data } = await supabaseAdmin
              .from("invoices")
              .select("*, clients(*)")
              .eq("id", payment.externalReference)
              .maybeSingle();
            if (data) invoice = data;
          }

          // 2. Se não achou pelo externalReference, tenta pelo valor e cliente associado
          if (!invoice && payment.customer) {
            // Busca clientes ou faturas pendentes com mesmo valor
            const { data: pendingInvoices } = await supabaseAdmin
              .from("invoices")
              .select("*, clients(*)")
              .in("status", ["pending", "overdue"])
              .order("due_date", { ascending: true })
              .limit(10);

            if (pendingInvoices && pendingInvoices.length > 0) {
              const matched = pendingInvoices.find(
                (inv: any) => Math.abs(Number(inv.amount) - Number(payment.value)) < 0.05
              );
              if (matched) invoice = matched;
            }
          }

          if (!invoice) {
            return Response.json({ ok: true, message: "Pagamento recebido, mas nenhuma fatura correspondente encontrada." }, { status: 200 });
          }

          if (invoice.status === "paid") {
            return Response.json({ ok: true, message: "Fatura já estava liquidada." }, { status: 200 });
          }

          // Marca como paga
          await supabaseAdmin
            .from("invoices")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
            })
            .eq("id", invoice.id);

          // Avança a data de vencimento do cliente (+1 mês)
          const next = addMonths(new Date(`${invoice.due_date}T12:00:00`), 1);
          const nextIso = next.toISOString().slice(0, 10);
          await supabaseAdmin
            .from("clients")
            .update({ next_due_date: nextIso, status: "active" })
            .eq("id", invoice.client_id);

          // Renovação automática no Painel Sigma se configurado
          let sigmaRenewed = false;
          let sigmaError: string | null = null;
          const client = invoice.clients;

          const { data: matchedSettings } = await supabaseAdmin
            .from("whatsapp_settings")
            .select("*")
            .eq("user_id", invoice.user_id)
            .maybeSingle();

          if (client?.sigma_customer_id && matchedSettings?.sigma_url) {
            try {
              const { renewSigmaCustomer, ensureSigmaToken } = await import("@/lib/sigma.server");
              const token = await ensureSigmaToken({
                url: matchedSettings.sigma_url,
                username: matchedSettings.sigma_username || "",
                password: matchedSettings.sigma_password || "",
                token: matchedSettings.sigma_token || "",
              });

              await renewSigmaCustomer(
                {
                  url: matchedSettings.sigma_url,
                  token,
                  username: matchedSettings.sigma_username || "",
                  password: matchedSettings.sigma_password || "",
                },
                {
                  id: client.sigma_customer_id,
                  username: client.sigma_username || client.iptv_username || "",
                },
                1
              );
              sigmaRenewed = true;
            } catch (err) {
              sigmaError = err instanceof Error ? err.message : "Erro desconhecido";
            }
          }

          // Envia comprovante e confirmação no WhatsApp
          let whatsappSent = false;
          if (client?.phone && matchedSettings?.api_url) {
            try {
              const { sendViaEvolution } = await import("@/lib/billing.server");
              const msg = `✅ *Pagamento Confirmado!*\n\nOlá, *${client.name}*!\nSeu pagamento via Pix de *R$ ${Number(payment.value).toFixed(2)}* foi identificado com sucesso pelo Asaas.\n\n📅 *Novo Vencimento:* ${nextIso.split("-").reverse().join("/")}${
                sigmaRenewed ? "\n📺 *Linha IPTV renovada com sucesso!*" : ""
              }\n\nObrigado pela preferência!`;

              const resWs = await sendViaEvolution(matchedSettings, client.phone, msg);
              whatsappSent = resWs.ok;
            } catch {}
          }

          return Response.json({
            ok: true,
            invoiceId: invoice.id,
            clientId: invoice.client_id,
            sigmaRenewed,
            sigmaError,
            whatsappSent,
          });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Erro interno no processamento do Asaas." },
            { status: 500 }
          );
        }
      },
    },
  },
});
