import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tenantSendText } from "./evolution-tenant.server";

function normalizeIds(ids: unknown) {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.map(String).filter(Boolean))).slice(0, 100);
}

export const listOperationalClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const [{ data: clients, error: clientsError }, { data: servers, error: serversError }] = await Promise.all([
      supabase
        .from("clients")
        .select("id,name,phone,email,status,next_due_date,monthly_fee,iptv_username,sigma_customer_id,panel_id,screens")
        .eq("user_id", context.userId)
        .order("name", { ascending: true }),
      supabase
        .from("sigma_panels")
        .select("id,name,enabled")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: true }),
    ]);

    if (clientsError) return { ok: false as const, clients: [], servers: [], error: "Não foi possível carregar os clientes." };
    if (serversError) console.warn("Falha ao carregar servidores na operação de clientes:", serversError.message);
    return {
      ok: true as const,
      clients: Array.isArray(clients) ? clients : [],
      servers: Array.isArray(servers) ? servers : [],
      error: null,
    };
  });

export const bulkSetClientBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientIds: string[]; blocked: boolean }) => input)
  .handler(async ({ data, context }) => {
    const ids = normalizeIds(data.clientIds);
    if (!ids.length) return { ok: false as const, updated: 0, error: "Selecione ao menos um cliente." };

    const supabase = context.supabase as any;
    const { data: owned, error: ownershipError } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", context.userId)
      .in("id", ids);
    if (ownershipError) return { ok: false as const, updated: 0, error: "Não foi possível validar os clientes." };

    const ownedIds = (Array.isArray(owned) ? owned : []).map((row: any) => row.id);
    if (!ownedIds.length) return { ok: false as const, updated: 0, error: "Nenhum cliente válido selecionado." };

    const { error } = await supabase
      .from("clients")
      .update({ status: data.blocked ? "blocked" : "active" })
      .eq("user_id", context.userId)
      .in("id", ownedIds);

    if (error) return { ok: false as const, updated: 0, error: "Não foi possível alterar os clientes selecionados." };
    return { ok: true as const, updated: ownedIds.length, error: null };
  });

export const bulkSendClientReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const ids = normalizeIds(data.clientIds);
    if (!ids.length) return { ok: false as const, sent: 0, failed: 0, skipped: 0, error: "Selecione ao menos um cliente." };

    const supabase = context.supabase as any;
    const { data: rows, error } = await supabase
      .from("clients")
      .select("id,name,phone,monthly_fee,next_due_date")
      .eq("user_id", context.userId)
      .in("id", ids);
    if (error) return { ok: false as const, sent: 0, failed: 0, skipped: 0, error: "Não foi possível carregar os clientes selecionados." };

    const clients = Array.isArray(rows) ? rows : [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const client of clients) {
      if (!String(client.phone || "").replace(/\D/g, "")) {
        skipped++;
        continue;
      }
      const amount = Number(client.monthly_fee || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const due = client.next_due_date
        ? new Date(`${String(client.next_due_date).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")
        : "em aberto";
      const body = `Olá ${client.name || "Cliente"}! Sua mensalidade de ${amount} tem vencimento ${due}. Se já realizou o pagamento, desconsidere esta mensagem.`;
      const result = await tenantSendText(context.userId, client.phone, body);
      if (result.ok) {
        sent++;
        await supabase.from("message_logs").insert({ user_id: context.userId, client_id: client.id, phone: client.phone, body, status: "sent" });
      } else {
        failed++;
        await supabase.from("message_logs").insert({ user_id: context.userId, client_id: client.id, phone: client.phone, body, status: "failed", error: result.error || "Falha no envio" });
      }
    }

    return { ok: failed === 0, sent, failed, skipped, error: failed ? "Algumas mensagens não puderam ser enviadas." : null };
  });
