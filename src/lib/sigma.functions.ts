import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function loadConfig(supabase: any, userId: string) {
  const { data } = await supabase
    .from("whatsapp_settings")
    .select("sigma_url, sigma_token, sigma_enabled, sigma_auto_renew")
    .eq("user_id", userId)
    .maybeSingle();
  return data as
    | { sigma_url: string | null; sigma_token: string | null; sigma_enabled: boolean; sigma_auto_renew: boolean }
    | null;
}

/** Testa a conexão com o painel Sigma. */
export const testSigmaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listSigmaCustomers } = await import("./sigma.server");
    const config = await loadConfig(context.supabase, context.userId);
    if (!config?.sigma_url || !config.sigma_token) {
      return { ok: false as const, total: 0, error: "Informe o endereço e o token do painel." };
    }
    try {
      const customers = await listSigmaCustomers({ url: config.sigma_url, token: config.sigma_token });
      return { ok: true as const, total: customers.length, error: null };
    } catch (error) {
      return {
        ok: false as const,
        total: 0,
        error: error instanceof Error ? error.message : "Não foi possível conectar ao painel.",
      };
    }
  });

/** Importa/atualiza os clientes vindos do painel Sigma. */
export const syncSigmaClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listSigmaCustomers } = await import("./sigma.server");
    const { supabase, userId } = context;

    const config = await loadConfig(supabase, userId);
    if (!config?.sigma_url || !config.sigma_token) {
      return { ok: false as const, created: 0, updated: 0, error: "Painel Sigma não configurado." };
    }

    let customers;
    try {
      customers = await listSigmaCustomers({ url: config.sigma_url, token: config.sigma_token });
    } catch (error) {
      return {
        ok: false as const,
        created: 0,
        updated: 0,
        error: error instanceof Error ? error.message : "Falha ao consultar o painel.",
      };
    }

    const { data: existing } = await supabase
      .from("clients")
      .select("id, sigma_customer_id, monthly_fee, due_day")
      .eq("user_id", userId);

    const bySigmaId = new Map<string, any>();
    for (const row of existing ?? []) {
      if (row.sigma_customer_id) bySigmaId.set(String(row.sigma_customer_id), row);
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    for (const customer of customers) {
      const match = bySigmaId.get(customer.id);
      const dueDay = customer.dueDate ? Number(customer.dueDate.slice(8, 10)) : null;
      const base = {
        sigma_customer_id: customer.id,
        sigma_username: customer.username,
        sigma_synced_at: now,
        iptv_username: customer.username,
        iptv_password: customer.password,
        ...(customer.screens ? { screens: customer.screens } : {}),
        ...(customer.dueDate ? { next_due_date: customer.dueDate } : {}),
        ...(dueDay ? { due_day: dueDay } : {}),
      };

      if (match) {
        await supabase.from("clients").update(base).eq("id", match.id).eq("user_id", userId);
        updated++;
      } else {
        const { error } = await supabase.from("clients").insert({
          user_id: userId,
          name: customer.name,
          phone: (customer.phone ?? "").replace(/\D/g, ""),
          status: customer.status === "inactive" || customer.status === "disabled" ? "inactive" : "active",
          monthly_fee: 0,
          ...base,
        });
        if (!error) created++;
      }
    }

    await supabase
      .from("whatsapp_settings")
      .update({ sigma_last_sync_at: now })
      .eq("user_id", userId);

    return { ok: true as const, created, updated, error: null };
  });

/** Renova manualmente um cliente no painel Sigma. */
export const renewSigmaClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; months?: number }) => input)
  .handler(async ({ data, context }) => {
    const { renewSigmaCustomer } = await import("./sigma.server");
    const { supabase, userId } = context;

    const config = await loadConfig(supabase, userId);
    const { data: client } = await supabase
      .from("clients")
      .select("sigma_customer_id")
      .eq("id", data.clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!config?.sigma_url || !config.sigma_token) {
      return { ok: false as const, error: "Painel Sigma não configurado." };
    }
    if (!client?.sigma_customer_id) {
      return { ok: false as const, error: "Este cliente não está ligado ao painel Sigma." };
    }

    try {
      await renewSigmaCustomer(
        { url: config.sigma_url, token: config.sigma_token },
        String(client.sigma_customer_id),
        data.months ?? 1,
      );
      return { ok: true as const, error: null };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível renovar no painel.",
      };
    }
  });
