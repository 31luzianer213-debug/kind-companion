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

function hasSigmaAccess(
  config:
    | { url?: string | null; token?: string | null; username?: string | null; password?: string | null }
    | null
    | undefined,
) {
  return Boolean(
    config &&
      config.url?.trim() &&
      (config.token?.trim() ||
        (config.username?.trim() && config.password?.trim())),
  );
}

/** Resolve as credenciais: prioriza o que veio da tela (input) e cai para o salvo. */
function resolvePanelConfig(
  saved: NonNullable<Awaited<ReturnType<typeof loadConfig>>> | null,
  input?: { url?: string; username?: string; password?: string },
) {
  const url = (input?.url ?? "").trim() || (saved?.sigma_url ?? "").trim();
  const username = (input?.username ?? "").trim() || (saved?.sigma_username ?? "").trim();
  const password = input?.password ?? saved?.sigma_password ?? "";
  return {
    url,
    username,
    password,
    token: saved?.sigma_token ?? null,
  };
}

/** Guarda o token obtido via login para não precisar logar toda vez. */
async function persistSigmaToken(
  supabase: any,
  userId: string,
  config: { sigma_token: string | null } | null,
  token: string,
) {
  if (token && token !== config?.sigma_token) {
    await supabase.from("whatsapp_settings").update({ sigma_token: token }).eq("user_id", userId);
  }
}

/** Testa a conexão com o painel Sigma usando os dados da tela (ou os salvos). */
export const testSigmaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url?: string; username?: string; password?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;
    const input = (data ?? {}) as { url?: string; username?: string; password?: string };
    const saved = await loadConfig(supabase, userId);
    const config = resolvePanelConfig(saved, input);

    if (!hasSigmaAccess(config)) {
      return {
        ok: false as const,
        error: "Preencha o endereço, o usuário e a senha do painel antes de testar.",
      };
    }

    try {
      const token = await ensureSigmaToken(config);
      await persistSigmaToken(supabase, userId, saved, token);
      // Se o teste veio com um endereço digitado na tela, atualiza o salvo.
      if ((config.url || saved?.sigma_url) && config.url !== saved?.sigma_url) {
        await supabase.from("whatsapp_settings").update({ sigma_url: config.url }).eq("user_id", userId);
      }
      return { ok: true as const, error: null };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível conectar ao painel.",
      };
    }
  });

/** Importa/atualiza os clientes vindos do painel Sigma. */
export const syncSigmaClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url?: string; username?: string; password?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { listSigmaCustomers, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;
    const input = (data ?? {}) as { url?: string; username?: string; password?: string };
    const saved = await loadConfig(supabase, userId);
    const panel = resolvePanelConfig(saved, input);

    if (!hasSigmaAccess(panel)) {
      return {
        ok: false as const,
        created: 0,
        updated: 0,
        error: "Painel IPTV não configurado. Em Configurações, informe o endereço, o usuário e a senha.",
      };
    }

    let customers;
    let token: string | null = null;
    try {
      token = await ensureSigmaToken(panel);
      customers = await listSigmaCustomers({ ...panel, token });
      await persistSigmaToken(supabase, userId, saved, token);
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
      .select("id, sigma_customer_id, iptv_username")
      .eq("user_id", userId);

    const bySigmaId = new Map<string, any>();
    const byUsername = new Map<string, any>();
    for (const row of existing ?? []) {
      if (row.sigma_customer_id) bySigmaId.set(String(row.sigma_customer_id), row);
      if (row.iptv_username) byUsername.set(String(row.iptv_username).toLowerCase(), row);
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    const failedNames: string[] = [];

    for (const customer of customers) {
      const match =
        bySigmaId.get(customer.id) ??
        (customer.username ? byUsername.get(customer.username.toLowerCase()) : undefined);
      const dueDay = customer.dueDate ? Number(customer.dueDate.slice(8, 10)) : null;
      const localStatus =
        customer.status === "active" ? "active" : customer.status ? "inactive" : null;
      const base = {
        sigma_customer_id: customer.id,
        sigma_username: customer.username,
        sigma_synced_at: now,
        iptv_username: customer.username,
        iptv_password: customer.password,
        ...(customer.screens != null ? { screens: customer.screens } : {}),
        ...(customer.dueDate ? { next_due_date: customer.dueDate } : {}),
        ...(dueDay ? { due_day: dueDay } : {}),
      };

      if (match) {
        const { error } = await supabase
          .from("clients")
          .update({ ...base, ...(localStatus ? { status: localStatus } : {}) })
          .eq("id", match.id)
          .eq("user_id", userId);
        if (!error) updated++;
        else failedNames.push(customer.name);
      } else {
        const { error } = await supabase.from("clients").insert({
          user_id: userId,
          name: customer.name,
          phone: (customer.phone ?? "").replace(/\D/g, ""),
          status: localStatus ?? "active",
          monthly_fee: 0,
          ...base,
        });
        if (!error) created++;
        else failedNames.push(customer.name);
      }
    }

    await supabase
      .from("whatsapp_settings")
      .update({ sigma_last_sync_at: now })
      .eq("user_id", userId);

    return {
      ok: true as const,
      created,
      updated,
      error: failedNames.length
        ? `Falha ao salvar ${failedNames.length} cliente(s): ${failedNames.slice(0, 3).join(", ")}`
        : null,
    };
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
