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

    try {
      await sendViaEvolution({}, data.phone, data.body, userId);
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

/** Estado atual da sessão de WhatsApp da conta. */
export const getWhatsAppStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchState } = await import("./evolution.server");
    try {
      const state = await fetchState(context.userId);
      return { ok: true as const, state, error: null };
    } catch (error) {
      return {
        ok: false as const,
        state: "none" as const,
        error: error instanceof Error ? error.message : "Não foi possível consultar.",
      };
    }
  });

/** Cria/abre a sessão e devolve o QR Code. */
export const connectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { connectInstance } = await import("./evolution.server");
    try {
      const result = await connectInstance(context.userId);
      return {
        ok: true as const,
        state: result.state,
        qr: result.qr?.base64 ?? null,
        error: null,
      };
    } catch (error) {
      return {
        ok: false as const,
        state: "close" as const,
        qr: null,
        error: error instanceof Error ? error.message : "Não foi possível gerar o QR Code.",
      };
    }
  });

/** Desconecta o número conectado. */
export const disconnectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { logoutInstance } = await import("./evolution.server");
    try {
      await logoutInstance(context.userId);
      return { ok: true as const, error: null };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível desconectar.",
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

    // Renovação automática no painel Sigma, quando ligada nas configurações.
    let sigmaRenewed = false;
    let sigmaError: string | null = null;
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const hasSigmaAccess =
      settings?.sigma_enabled &&
      settings.sigma_auto_renew &&
      settings.sigma_url?.trim() &&
      (settings.sigma_token?.trim() || (settings.sigma_username?.trim() && settings.sigma_password?.trim()));
    if (hasSigmaAccess) {
      const { data: client } = await supabase
        .from("clients")
        .select("sigma_customer_id")
        .eq("id", invoice.client_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (client?.sigma_customer_id) {
        try {
          const { renewSigmaCustomer } = await import("./sigma.server");
          await renewSigmaCustomer(
            {
              url: settings.sigma_url ?? "",
              token: settings.sigma_token,
              username: settings.sigma_username,
              password: settings.sigma_password,
            },
            { id: String(client.sigma_customer_id) },
            1,
          );
          sigmaRenewed = true;
        } catch (error) {
          sigmaError = error instanceof Error ? error.message : "Falha ao renovar no painel.";
        }
      }
    }

    return { ok: true as const, nextDueDate: nextIso, sigmaRenewed, sigmaError };
  });

/** Envia a mensagem de boas-vindas com os dados de acesso do cliente. */
export const sendAccessDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string }) => input)
  .handler(async ({ data, context }) => {
    const { sendViaEvolution } = await import("./billing.server");
    const { buildTemplateVars, renderTemplate } = await import("./format");
    const { supabase, userId } = context;

    const [{ data: client }, { data: settings }] = await Promise.all([
      supabase
        .from("clients")
        .select("*, iptv_lists(name, server_url, username, password)")
        .eq("id", data.clientId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("whatsapp_settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    if (!client) return { ok: false as const, error: "Cliente não encontrado." };

    let template =
      settings?.welcome_template?.trim() ||
      "📡 *DADOS DE ACESSO IPTV* 📡\n\n👤 *Cliente:* {nome}\n📺 *Servidor:* {servidor}\n🌐 *URL / DNS:* {dns}\n🔑 *Usuário:* {usuario}\n🔒 *Senha:* {senha}\n🖥️ *Telas:* {telas}\n📅 *Vencimento:* {vencimento}\n\n🔗 *Lista M3U Plus:*\n{m3u}\n\n📺 *Guia de Canais (EPG):*\n{epg}\n\n📱 *Como Conectar:*\n• No IPTV Smarters Pro, XCIPTV ou TiviMate: use a opção *Xtream Codes API* com o Servidor (ou URL), Usuário e Senha acima.\n• Em Smart TVs ou SS IPTV: adicione a *Lista M3U Plus* completa acima.\n\nBom divertimento! 🍿 Qualquer dúvida, estamos à disposição.";

    if (!template.includes("{m3u}")) {
      template += "\n\n🔗 *Lista M3U Plus (HLS/TS):*\n{m3u}\n\n📺 *Guia de Canais (EPG):*\n{epg}";
    }

    const body = renderTemplate(
      template,
      buildTemplateVars({
        client,
        list: (client as any).iptv_lists ?? null,
        settings,
        amount: client.monthly_fee,
        dueDate: client.next_due_date,
      }),
    );

    try {
      await sendViaEvolution({}, client.phone, body, userId);
      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: client.id,
        phone: client.phone,
        body,
        status: "sent",
      });
      return { ok: true as const, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: client.id,
        phone: client.phone,
        body,
        status: "failed",
        error: message,
      });
      return { ok: false as const, error: message };
    }
  });
