import { createFileRoute } from "@tanstack/react-router";
import { addMonths } from "date-fns";

export const Route = createFileRoute("/api/public/hooks/mercadopago")({
  server: {
    handlers: {
      GET: async () => {
        // Mercado Pago faz testes de conectividade via GET
        return new Response("Mercado Pago Webhook Active", { status: 200 });
      },
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
          const uidParam = url.searchParams.get("uid");

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            // body pode ser vazio em notificações simples
          }

          if (!paymentId && body?.data?.id) {
            paymentId = String(body.data.id);
          }

          if (!paymentId) {
            return Response.json({ ok: true, message: "Evento sem ID de pagamento ignorado." }, { status: 200 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Busca as configurações de pagamento do usuário dono
          let settingsList: any[] = [];
          if (uidParam) {
            const { data } = await supabaseAdmin
              .from("whatsapp_settings")
              .select("*")
              .eq("user_id", uidParam)
              .maybeSingle();
            if (data) settingsList = [data];
          }

          if (settingsList.length === 0) {
            const { data } = await supabaseAdmin
              .from("whatsapp_settings")
              .select("*")
              .not("mercadopago_token", "is", null);
            settingsList = (data ?? []).filter((s: any) => Boolean(s.mercadopago_token?.trim()));
          }

          if (settingsList.length === 0) {
            return Response.json({ ok: false, error: "Nenhuma credencial do Mercado Pago configurada." }, { status: 200 });
          }

          let paymentData: any = null;
          let matchedSettings: any = null;

          // Testa o token para buscar os dados do pagamento
          for (const s of settingsList) {
            const token = s.mercadopago_token?.trim();
            if (!token) continue;
            try {
              const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                paymentData = await res.json();
                matchedSettings = s;
                break;
              }
            } catch {
              // segue para o próximo se houver
            }
          }

          if (!paymentData || !matchedSettings) {
            return Response.json({ ok: true, message: "Pagamento não encontrado nas credenciais ativas." }, { status: 200 });
          }

          // Só processa pagamentos aprovados
          if (paymentData.status !== "approved") {
            return Response.json(
              { ok: true, message: `Status do pagamento: ${paymentData.status}. Aguardando aprovação.` },
              { status: 200 },
            );
          }

          const externalRef = paymentData.external_reference;

          // Se external_reference for um Pedido do WhatsApp/Loja, aprova e entrega o acesso imediatamente
          if (externalRef && (externalRef.startsWith("ord_") || String(externalRef).length > 10)) {
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
            } catch (ordErr) {
              console.warn("Aviso ao tentar aprovar pedido pelo external_reference:", ordErr);
            }
          }

          let invoice: any = null;

          // 1. Tenta localizar a fatura pelo external_reference (ID da fatura)
          if (externalRef) {
            const { data: inv } = await supabaseAdmin
              .from("invoices")
              .select("*, clients(*)")
              .eq("id", externalRef)
              .maybeSingle();
            invoice = inv;
          }

          // 2. Se não encontrou por ID, busca fatura pendente do cliente associado ao valor
          if (!invoice && matchedSettings.user_id) {
            const { data: inv } = await supabaseAdmin
              .from("invoices")
              .select("*, clients(*)")
              .eq("user_id", matchedSettings.user_id)
              .in("status", ["pending", "overdue"])
              .order("due_date", { ascending: true })
              .limit(1)
              .maybeSingle();
            invoice = inv;
          }

          if (!invoice) {
            return Response.json({ ok: true, message: "Pagamento aprovado, porém nenhuma fatura em aberto foi encontrada." });
          }

          // Se já foi marcada como paga, evita duplicidade
          if (invoice.status === "paid") {
            return Response.json({ ok: true, message: "Fatura já estava liquidada." });
          }

          // Marca a fatura como paga
          await supabaseAdmin
            .from("invoices")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              pix_code: paymentData.id ? `MP-${paymentData.id}` : invoice.pix_code,
            })
            .eq("id", invoice.id);

          // Avança a data de vencimento do cliente (+1 mês)
          const next = addMonths(new Date(`${invoice.due_date}T12:00:00`), 1);
          const nextIso = next.toISOString().slice(0, 10);
          await supabaseAdmin
            .from("clients")
            .update({ next_due_date: nextIso })
            .eq("id", invoice.client_id);

          // Renovação automática no Painel Sigma
          let sigmaRenewed = false;
          let sigmaError: string | null = null;
          const client = invoice.clients;

          if (client?.sigma_customer_id && matchedSettings.sigma_url) {
            try {
              const { renewSigmaCustomer } = await import("@/lib/sigma.server");
              await renewSigmaCustomer(
                {
                  url: matchedSettings.sigma_url,
                  token: matchedSettings.sigma_token,
                  username: matchedSettings.sigma_username,
                  password: matchedSettings.sigma_password,
                },
                { id: String(client.sigma_customer_id) },
                1,
              );
              sigmaRenewed = true;
            } catch (err) {
              sigmaError = err instanceof Error ? err.message : "Erro ao renovar no Sigma.";
              console.error("Erro na renovação Sigma via webhook MP:", sigmaError);
            }
          }

          // Notificação de agradecimento e confirmação via WhatsApp
          if (client?.phone) {
            try {
              const { sendViaEvolution } = await import("@/lib/billing.server");
              const text = `🎉 *Pagamento Confirmado!*\n\nOlá *${client.name}*, seu pagamento de *R$ ${Number(invoice.amount).toFixed(2)}* via Mercado Pago foi aprovado com sucesso!\n\n✅ Sua assinatura foi renovada por mais 30 dias (novo vencimento: *${nextIso.split("-").reverse().join("/")}*).\n\nObrigado pela preferência! Tenha um ótimo entretenimento.`;
              await sendViaEvolution(matchedSettings, client.phone, text, matchedSettings.user_id);
              await supabaseAdmin.from("message_logs").insert({
                user_id: matchedSettings.user_id,
                client_id: client.id,
                invoice_id: invoice.id,
                phone: client.phone,
                body: text,
                status: "sent",
              });
            } catch (wppErr) {
              console.error("Erro ao enviar confirmação WhatsApp:", wppErr);
            }
          }

          return Response.json({
            ok: true,
            message: "Pagamento processado com sucesso!",
            invoiceId: invoice.id,
            sigmaRenewed,
            sigmaError,
          });
        } catch (error) {
          console.error("Erro inesperado no webhook Mercado Pago:", error);
          return Response.json({ ok: false, error: "Erro interno no processamento." }, { status: 500 });
        }
      },
    },
  },
});
