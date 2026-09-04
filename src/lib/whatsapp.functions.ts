import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SendInput = {
  phone: string;
  body: string;
  clientId?: string | null;
  invoiceId?: string | null;
};

export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendInput) => input)
  .handler(async ({ data, context }) => {
    const { sendViaEvolution } = await import("./billing.server");
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("api_url, api_key, instance_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings) {
      return { ok: false as const, error: "Configure o WhatsApp antes de enviar mensagens." };
    }

    try {
      await sendViaEvolution(settings, data.phone, data.body);
      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: data.clientId ?? null,
        invoice_id: data.invoiceId ?? null,
        phone: data.phone,
        body: data.body,
        status: "sent",
      });
      return { ok: true as const, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: data.clientId ?? null,
        invoice_id: data.invoiceId ?? null,
        phone: data.phone,
        body: data.body,
        status: "failed",
        error: message,
      });
      return { ok: false as const, error: message };
    }
  });

export const testWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("api_url, api_key, instance_name")
      .eq("user_id", userId)
      .maybeSingle();

    const base = (settings?.api_url ?? "").replace(/\/+$/, "");
    if (!base || !settings?.api_key || !settings?.instance_name) {
      return { ok: false as const, error: "Preencha endereço, chave e instância." };
    }
    try {
      const res = await fetch(`${base}/instance/connectionState/${settings.instance_name}`, {
        headers: { apikey: settings.api_key },
      });
      const raw = await res.text();
      if (!res.ok) return { ok: false as const, error: `Erro ${res.status}: ${raw.slice(0, 200)}` };
      return { ok: true as const, error: null };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível conectar.",
      };
    }
  });

/** Gera as cobranças do mês para clientes ativos e envia os lembretes pendentes. */
export const runAutoBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runBillingForUser } = await import("./billing.server");
    return runBillingForUser(context.supabase, context.userId);
  });

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/** Marca uma cobrança como paga e agenda o próximo vencimento do cliente. */
export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: invoice, error } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", data.invoiceId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const next = addMonths(new Date(`${invoice.due_date}T12:00:00`), 1);
    const nextIso = next.toISOString().slice(0, 10);
    await supabase
      .from("clients")
      .update({ next_due_date: nextIso })
      .eq("id", invoice.client_id)
      .eq("user_id", userId);

    return { ok: true as const, nextDueDate: nextIso };
  });
