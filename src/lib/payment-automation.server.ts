import { addMonths } from "date-fns";
import { recordActivity } from "./activity.server";
import { tenantSendText } from "./evolution-tenant.server";
import { loadSigmaServerForClient } from "./sigma-servers.functions";

export type PaidInvoiceAutomationInput = {
  supabase: any;
  userId: string;
  invoice: any;
  provider: "mercadopago" | "asaas";
  providerPaymentId?: string | null;
  amount?: number | null;
  months?: number;
};

function formatDate(value: string) {
  return value.split("-").reverse().join("/");
}

function safeBaseDate(invoice: any, client: any) {
  const raw = client?.next_due_date || invoice?.due_date;
  if (raw) {
    const parsed = new Date(`${String(raw).slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function processPaidInvoiceAutomation(input: PaidInvoiceAutomationInput) {
  const { supabase, userId, invoice, provider } = input;
  const months = Math.max(1, Math.min(12, Number(input.months || 1)));

  if (!invoice?.id || invoice.user_id !== userId) {
    throw new Error("Fatura inválida para este usuário.");
  }

  if (invoice.status === "paid") {
    return { ok: true as const, alreadyProcessed: true, invoiceId: invoice.id };
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, user_id, panel_id, name, phone, next_due_date, sigma_customer_id, sigma_username, iptv_username")
    .eq("id", invoice.client_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (clientError || !client) throw new Error("Cliente da fatura não foi encontrado.");

  // Faz o claim atômico da fatura. Webhooks duplicados não passam daqui duas vezes.
  const paidAt = new Date().toISOString();
  const { data: claimedInvoice, error: invoiceError } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoice.id)
    .eq("user_id", userId)
    .in("status", ["pending", "overdue"])
    .select("id")
    .maybeSingle();
  if (invoiceError) throw new Error(`Falha ao liquidar a fatura: ${invoiceError.message}`);
  if (!claimedInvoice) {
    return { ok: true as const, alreadyProcessed: true, invoiceId: invoice.id };
  }

  const hasSigmaLink = Boolean(client.sigma_customer_id || client.sigma_username || client.iptv_username);
  let sigmaRenewed = false;
  let sigmaError: string | null = null;

  if (hasSigmaLink) {
    try {
      const config = await loadSigmaServerForClient(supabase, userId, client.id);
      const { ensureSigmaToken, renewSigmaCustomer } = await import("./sigma.server");
      const token = await ensureSigmaToken(config);
      await renewSigmaCustomer(
        { ...config, token },
        {
          id: client.sigma_customer_id,
          username: client.sigma_username || client.iptv_username || "",
        },
        months,
      );
      sigmaRenewed = true;
    } catch (error) {
      sigmaError = error instanceof Error ? error.message : "Falha ao renovar no Sigma.";
    }
  }

  const canAdvanceLocal = !hasSigmaLink || sigmaRenewed;
  const nextDue = addMonths(safeBaseDate(invoice, client), months).toISOString().slice(0, 10);

  if (canAdvanceLocal) {
    const { error } = await supabase
      .from("clients")
      .update({ next_due_date: nextDue, status: "active" })
      .eq("id", client.id)
      .eq("user_id", userId);
    if (error) throw new Error(`Pagamento confirmado, mas falhou ao atualizar o cliente: ${error.message}`);
  }

  let whatsappSent = false;
  let whatsappError: string | null = null;
  if (client.phone) {
    const providerLabel = provider === "asaas" ? "Asaas" : "Mercado Pago";
    const amount = Number(input.amount ?? invoice.amount ?? 0);
    const renewalText = canAdvanceLocal
      ? `\n\n✅ Sua assinatura foi renovada por ${months === 1 ? "mais 1 mês" : `mais ${months} meses`}.\n📅 Novo vencimento: *${formatDate(nextDue)}*.`
      : "\n\n⏳ Seu pagamento foi confirmado e a renovação está em processamento. Se necessário, o revendedor será avisado automaticamente.";
    const text = `✅ *Pagamento confirmado!*\n\nOlá, *${client.name || "cliente"}*! Recebemos seu pagamento${amount > 0 ? ` de *R$ ${amount.toFixed(2)}*` : ""} via ${providerLabel}.${renewalText}\n\nObrigado pela preferência!`;

    try {
      const sent = await tenantSendText(userId, client.phone, text);
      whatsappSent = sent.ok;
      whatsappError = sent.ok ? null : sent.error;
      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: client.id,
        invoice_id: invoice.id,
        phone: client.phone,
        body: text,
        status: sent.ok ? "sent" : "failed",
      });
    } catch (error) {
      whatsappError = error instanceof Error ? error.message : "Falha ao enviar confirmação no WhatsApp.";
    }
  }

  await recordActivity(supabase, userId, {
    eventType: sigmaError ? "payment_renewal_warning" : "payment_auto_renewed",
    entityType: "invoice",
    entityId: invoice.id,
    title: sigmaError ? "Pagamento recebido com renovação pendente" : "Pagamento renovou cliente automaticamente",
    description: sigmaError
      ? `${client.name}: pagamento confirmado, mas o Sigma não renovou (${sigmaError}).`
      : `${client.name}: pagamento confirmado e assinatura renovada automaticamente.`,
    metadata: {
      provider,
      providerPaymentId: input.providerPaymentId || null,
      clientId: client.id,
      panelId: client.panel_id || null,
      months,
      nextDue: canAdvanceLocal ? nextDue : client.next_due_date || null,
      sigmaRenewed,
      sigmaError,
      whatsappSent,
      whatsappError,
    },
  });

  return {
    ok: true as const,
    alreadyProcessed: false,
    invoiceId: invoice.id,
    clientId: client.id,
    nextDueDate: canAdvanceLocal ? nextDue : client.next_due_date || null,
    sigmaRenewed,
    sigmaError,
    whatsappSent,
    whatsappError,
  };
}
