import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function loadConfig(supabase: any, userId: string) {
  const { data } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data as
    | {
        sigma_url: string | null;
        sigma_token: string | null;
        sigma_username: string | null;
        sigma_password: string | null;
        sigma_enabled: boolean;
        sigma_auto_renew: boolean;
      }
    | null;
}

function toSigmaConfig(config: NonNullable<Awaited<ReturnType<typeof loadConfig>>>) {
  return {
    url: config.sigma_url ?? "",
    token: config.sigma_token ?? undefined,
    username: config.sigma_username ?? undefined,
    password: config.sigma_password ?? undefined,
  };
}

function hasSigmaAccess(config: NonNullable<Awaited<ReturnType<typeof loadConfig>>>) {
  return Boolean(config?.sigma_url?.trim() && (config.sigma_token?.trim() || (config.sigma_username?.trim() && config.sigma_password?.trim())));
}

/** Guarda o token obtido via login para não precisar logar toda vez. */
async function persistSigmaToken(supabase: any, userId: string, config: { sigma_token: string | null }, token: string) {
  if (token && token !== config.sigma_token) {
    await supabase.from("whatsapp_settings").update({ sigma_token: token }).eq("user_id", userId);
  }
}

/** Testa a conexão com o painel Sigma (faz login sozinho com usuário + senha). */
export const testSigmaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listSigmaCustomers, ensureSigmaToken } = await import("./sigma.server");
    const config = await loadConfig(context.supabase, context.userId);
    if (!hasSigmaAccess(config!)) {
      return { ok: false as const, total: 0, error: "Informe o endereço, o usuário e a senha do painel." };
    }
    try {
      const sigmaConfig = toSigmaConfig(config!);
      const customers = await listSigmaCustomers(sigmaConfig);
      try {
        await persistSigmaToken(context.supabase, context.userId, config!, await ensureSigmaToken(sigmaConfig));
      } catch {
        // token segue sendo resolvido via login a cada uso; não bloqueia o teste
      }
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
    const { listSigmaCustomers, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;

    const config = await loadConfig(supabase, userId);
    if (!hasSigmaAccess(config!)) {
      return { ok: false as const, created: 0, updated: 0, error: "Painel Sigma não configurado." };
    }

    let customers;
    try {
      const sigmaConfig = toSigmaConfig(config!);
      customers = await listSigmaCustomers(sigmaConfig);
      try {
        await persistSigmaToken(supabase, userId, config!, await ensureSigmaToken(sigmaConfig));
      } catch {
        // segue sem persistir; o login é refeito na próxima chamada
      }
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
    const { renewSigmaCustomer, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;

    const config = await loadConfig(supabase, userId);
    const { data: client } = await supabase
      .from("clients")
      .select("sigma_customer_id")
      .eq("id", data.clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!hasSigmaAccess(config!)) {
      return { ok: false as const, error: "Painel Sigma não configurado." };
    }
    if (!client?.sigma_customer_id) {
      return { ok: false as const, error: "Este cliente não está ligado ao painel Sigma." };
    }

    try {
      const sigmaConfig = toSigmaConfig(config!);
      await renewSigmaCustomer(
        sigmaConfig,
        String(client.sigma_customer_id),
        data.months ?? 1,
      );
      try {
        await persistSigmaToken(supabase, userId, config!, await ensureSigmaToken(sigmaConfig));
      } catch {
        // segue sem persistir; o login é refeito na próxima chamada
      }
      return { ok: true as const, error: null };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível renovar no painel.",
      };
    }
  });
