import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CreateSigmaCustomerInput, SigmaConfig } from "./sigma.panel";
import { extractCleanIptvDns, generateM3uUrl } from "./format";

export type SigmaSettingsPayload = {
  sigma_url: string;
  sigma_server_name?: string;
  sigma_streaming_dns?: string;
  sigma_username: string;
  sigma_password?: string;
  sigma_token?: string | null;
  sigma_enabled: boolean;
  sigma_auto_renew: boolean;
};

export function extractServerHost(url?: string | null): string {
  if (!url) return "";
  try {
    const cleaned = url.trim().replace(/^https?:\/\//i, "").split("/")[0]?.split("?")[0] ?? "";
    return cleaned;
  } catch {
    return url ?? "";
  }
}

/**
 * Carrega a configuração do Sigma com persistência blindada:
 * 1) Tenta ler de whatsapp_settings
 * 2) Se as colunas sigma_username/sigma_password não existirem no banco,
 *    recupera do user_metadata do Supabase Auth.
 */
async function loadConfig(supabase: any, userId: string): Promise<
  SigmaConfig & {
    server_name: string;
    server_display_name: string;
    streaming_dns: string;
    enabled: boolean;
    auto_renew: boolean;
    last_sync_at: string | null;
  }
> {
  let dbData: any = null;
  try {
    const { data } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    dbData = data;
  } catch {
    dbData = null;
  }

  // Tenta ler o fallback gravado no metadata do usuário
  let userMetaSigma: any = null;
  try {
    const { data: authUser } = await supabase.auth.getUser();
    userMetaSigma = authUser?.user?.user_metadata?.sigma_settings ?? null;
  } catch {
    userMetaSigma = null;
  }

  const url = (dbData?.sigma_url ?? userMetaSigma?.url ?? "").trim();
  const server_name = (dbData?.sigma_server_name ?? userMetaSigma?.server_name ?? "").trim();
  const streaming_dns = (dbData?.sigma_streaming_dns ?? userMetaSigma?.streaming_dns ?? "").trim();
  const server_display_name = server_name || "Servidor Sigma";
  const username = (dbData?.sigma_username ?? userMetaSigma?.username ?? "").trim();
  const password = dbData?.sigma_password ?? userMetaSigma?.password ?? "";
  const token = dbData?.sigma_token ?? userMetaSigma?.token ?? null;
  const enabled = Boolean(dbData?.sigma_enabled ?? userMetaSigma?.enabled ?? false);
  const auto_renew = Boolean(dbData?.sigma_auto_renew ?? userMetaSigma?.auto_renew ?? false);
  const last_sync_at = dbData?.sigma_last_sync_at ?? userMetaSigma?.last_sync_at ?? null;

  return {
    url,
    server_name,
    server_display_name,
    streaming_dns,
    username,
    password,
    token,
    enabled,
    auto_renew,
    last_sync_at,
  };
}

function hasSigmaAccess(config: { url?: string | null; token?: string | null; username?: string | null; password?: string | null }) {
  return Boolean(
    config &&
      config.url?.trim() &&
      (config.token?.trim() ||
        (config.username?.trim() && config.password?.trim())),
  );
}

/**
 * Salva as configurações do Sigma de forma resiliente:
 * Atualiza `whatsapp_settings` E o `user_metadata` do Supabase.
 */
export const saveSigmaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SigmaSettingsPayload) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const url = (data.sigma_url ?? "").trim();
    const serverName = (data.sigma_server_name ?? "").trim();
    const streamingDns = (data.sigma_streaming_dns ?? "").trim();
    const username = (data.sigma_username ?? "").trim();
    const password = data.sigma_password ?? "";
    const token = data.sigma_token?.trim() || null;
    const enabled = Boolean(data.sigma_enabled);
    const auto_renew = Boolean(data.sigma_auto_renew);

    let finalStreamingDns = streamingDns;
    let finalServerName = serverName;

    // Se o usuário não preencheu o DNS de streaming ou o nome do servidor, descobre automaticamente
    if ((!finalStreamingDns || !finalServerName) && url && (username || token)) {
      try {
        const { fetchSigmaPanelDetails } = await import("./sigma.server");
        const details = await fetchSigmaPanelDetails({ url, token, username, password });
        if (!finalStreamingDns && details.dns) finalStreamingDns = details.dns;
        if (!finalServerName && details.serverName) finalServerName = details.serverName;
      } catch {}
    }

    let dbSaved = false;

    // 1. Tenta salvar na tabela whatsapp_settings com todas as colunas
    const fullPayload: Record<string, any> = {
      user_id: userId,
      sigma_url: url,
      sigma_server_name: finalServerName,
      sigma_streaming_dns: finalStreamingDns,
      sigma_username: username,
      sigma_password: password,
      sigma_token: token,
      sigma_enabled: enabled,
      sigma_auto_renew: auto_renew,
    };

    try {
      const { error } = await supabase.from("whatsapp_settings").upsert(fullPayload, { onConflict: "user_id" });
      if (!error) dbSaved = true;
    } catch {
      dbSaved = false;
    }

    // Se falhou por ausência de colunas específicas, tenta salvar as colunas básicas
    if (!dbSaved) {
      try {
        const basicPayload: Record<string, any> = {
          user_id: userId,
          sigma_url: url,
          sigma_enabled: enabled,
          sigma_auto_renew: auto_renew,
        };
        if (token) basicPayload.sigma_token = token;
        await supabase.from("whatsapp_settings").upsert(basicPayload, { onConflict: "user_id" });
      } catch {
        // Prossegue para salvar no user_metadata
      }
    }

    // 2. Salva SEMPRE no user_metadata como garantia infalível
    try {
      await supabase.auth.updateUser({
        data: {
          sigma_settings: {
            url,
            server_name: finalServerName,
            streaming_dns: finalStreamingDns,
            username,
            password,
            token,
            enabled,
            auto_renew,
            updated_at: new Date().toISOString(),
          },
        },
      });
    } catch (metaErr) {
      console.error("Falha ao salvar no metadata:", metaErr);
    }

    return { ok: true as const };
  });

/**
 * Carrega a configuração completa do Sigma para exibição na tela.
 */
export const getSigmaSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const config = await loadConfig(supabase, userId);
    return {
      ok: true as const,
      settings: {
        sigma_url: config.url,
        sigma_server_name: config.server_name,
        sigma_server_display_name: config.server_display_name,
        sigma_streaming_dns: config.streaming_dns ?? "",
        sigma_username: config.username ?? "",
        sigma_password: config.password ?? "",
        sigma_token: config.token ?? "",
        sigma_enabled: config.enabled,
        sigma_auto_renew: config.auto_renew,
        sigma_last_sync_at: config.last_sync_at,
        isConfigured: hasSigmaAccess(config),
      },
    };
  });

/**
 * Testa a conexão com o painel Sigma.
 * Aceita as credenciais digitadas na tela em tempo real, ou usa as salvas.
 */
export const testSigmaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url?: string; username?: string; password?: string; token?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { sigmaLogin, listSigmaCustomers } = await import("./sigma.server");
    const { supabase, userId } = context;
    const saved = await loadConfig(supabase, userId);

    const url = (data?.url ?? "").trim() || saved.url;
    const username = (data?.username ?? "").trim() || (saved.username ?? "");
    const password = data?.password !== undefined && data.password !== "" ? data.password : (saved.password ?? "");
    const directToken = (data?.token ?? "").trim() || (saved.token ?? "");

    if (!url) {
      return {
        ok: false as const,
        error: "Informe o endereço do painel Sigma para testar.",
      };
    }

    // 1. Se forneceu token direto (no formulário ou já salvo), prioriza testá-lo
    if (directToken) {
      try {
        await listSigmaCustomers({ url, token: directToken });
        return { ok: true as const, error: null };
      } catch (tokenError) {
        // Se NÃO informou usuário e senha, devolve o erro do token
        if (!username || !password) {
          return {
            ok: false as const,
            error: tokenError instanceof Error ? tokenError.message : "Token inválido ou painel inacessível.",
          };
        }
        // Se informou usuário e senha, tenta autenticação por login abaixo
      }
    }

    if (!username || !password) {
      return {
        ok: false as const,
        error: "Informe o usuário e a senha (ou o token da API) do painel Sigma para testar.",
      };
    }

    try {
      const token = directToken || (await sigmaLogin(url, username, password));
      const { fetchSigmaPanelDetails } = await import("./sigma.server");
      const details = await fetchSigmaPanelDetails({ url, token, username, password });

      const detectedServerName = details.serverName?.trim() || null;
      const detectedDns = details.dns?.trim() || null;

      // Persiste os dados testados e validados no banco e no user_metadata
      const updatePayload: Record<string, any> = {
        sigma_url: url,
        sigma_token: token,
      };
      if (username) updatePayload.sigma_username = username;
      if (password) updatePayload.sigma_password = password;
      if (detectedDns) updatePayload.sigma_streaming_dns = detectedDns;
      if (detectedServerName) updatePayload.sigma_server_name = detectedServerName;

      try {
        const { data: wsRow } = await supabase
          .from("whatsapp_settings")
          .select("welcome_template")
          .eq("user_id", userId)
          .maybeSingle();

        if (wsRow?.welcome_template && !wsRow.welcome_template.includes("{m3u}")) {
          updatePayload.welcome_template = `${wsRow.welcome_template.trim()}\n\n🔗 *Lista M3U Plus:*\n{m3u}\n\n📺 *Guia de Canais (EPG):*\n{epg}`;
        }
      } catch {}

      try {
        const { error } = await supabase.from("whatsapp_settings").upsert({
          user_id: userId,
          ...updatePayload,
          sigma_enabled: true,
        }, { onConflict: "user_id" });
        if (error) {
          await supabase.from("whatsapp_settings").update(updatePayload).eq("user_id", userId);
        }
      } catch {
        try {
          await supabase.from("whatsapp_settings").update(updatePayload).eq("user_id", userId);
        } catch {}
      }

      try {
        await supabase.auth.updateUser({
          data: {
            sigma_settings: {
              ...saved,
              url,
              username: username || saved.username,
              password: password || saved.password,
              token,
              streaming_dns: detectedDns || saved.streaming_dns,
              server_name: detectedServerName || saved.server_name,
              enabled: true,
              updated_at: new Date().toISOString(),
            },
          },
        });
      } catch {
        // ignora erro de metadata
      }

      return {
        ok: true as const,
        error: null,
        detectedDns,
        detectedServerName,
        packagesCount: details.packages.length,
        credits: details.credits,
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível conectar ao painel.",
      };
    }
  });

/**
 * Executa a sincronização de clientes do Painel Sigma para um determinado usuário.
 */
export async function runSigmaSyncForUser(
  supabase: any,
  userId: string,
  data?: { url?: string; username?: string; password?: string; token?: string },
) {
  const { listSigmaCustomers, ensureSigmaToken } = await import("./sigma.server");
  const saved = await loadConfig(supabase, userId);

  const panelConfig: SigmaConfig = {
    url: (data?.url ?? "").trim() || saved.url,
    username: (data?.username ?? "").trim() || saved.username,
    password: data?.password ?? saved.password,
    token: (data?.token ?? "").trim() || saved.token,
  };

  if (!hasSigmaAccess(panelConfig)) {
    return {
      ok: false as const,
      created: 0,
      updated: 0,
      createdNames: [] as string[],
      error: "Painel Sigma não configurado. Em Configurações, preencha o endereço, usuário e senha.",
    };
  }

  let customers: any[] = [];
  let detectedServerName: string | null = null;
  let detectedDns: string | null = null;

  try {
    const token = await ensureSigmaToken(panelConfig);
    const { fetchSigmaPanelDetails } = await import("./sigma.server");
    const panelDetails = await fetchSigmaPanelDetails({ ...panelConfig, token });

    customers = await listSigmaCustomers({ ...panelConfig, token });

    // 1. Detecta o nome oficial do servidor:
    // Prioriza os detalhes retornados pelos endpoints do painel
    detectedServerName = panelDetails.serverName?.trim() || null;

    // Se o painel não retornou o nome via profile/server-info, extrai das linhas de clientes
    if (!detectedServerName) {
      for (const c of customers) {
        if (c.serverName && !c.serverName.startsWith("http") && !/\.(click|com|net|org|xyz|st|top|io)\b/i.test(c.serverName)) {
          detectedServerName = c.serverName.trim();
          break;
        }
      }
    }

    // Se ainda não encontrou, checa se há pacotes disponíveis no painel
    if (!detectedServerName && panelDetails.packages.length > 0) {
      detectedServerName = panelDetails.packages[0].trim();
    }

    // 2. Detecta o DNS oficial de transmissão:
    detectedDns = panelDetails.dns?.trim() || null;
    if (!detectedDns) {
      for (const c of customers) {
        if (c.m3uUrl) {
          const fromM3u = extractCleanIptvDns(c.m3uUrl);
          if (fromM3u) {
            detectedDns = fromM3u;
            break;
          }
        }
        if (c.dns) {
          detectedDns = c.dns.trim();
          break;
        }
      }
    }

    // 3. Atualiza automaticamente no banco e no user_metadata
    const currentSavedDns = saved.streaming_dns?.trim();
    const isBadDns =
      !currentSavedDns ||
      currentSavedDns.includes("/sign-in") ||
      currentSavedDns.includes("#/") ||
      extractServerHost(currentSavedDns) === extractServerHost(panelConfig.url);

    const updateSettings: Record<string, any> = {};
    if (detectedDns && (isBadDns || !currentSavedDns)) {
      updateSettings.sigma_streaming_dns = detectedDns;
    }
    const isBadServerName =
      !saved.server_name ||
      saved.server_name.startsWith("http") ||
      saved.server_name.includes(".click") ||
      saved.server_name.includes(".com") ||
      extractServerHost(saved.server_name) === extractServerHost(panelConfig.url);

    if (detectedServerName && (isBadServerName || !saved.server_name)) {
      updateSettings.sigma_server_name = detectedServerName;
    }

    // Garante que o welcome_template da revenda possui as tags {m3u} e {epg}
    try {
      const { data: wsRow } = await supabase
        .from("whatsapp_settings")
        .select("welcome_template")
        .eq("user_id", userId)
        .maybeSingle();

      if (wsRow?.welcome_template && !wsRow.welcome_template.includes("{m3u}")) {
        updateSettings.welcome_template = `${wsRow.welcome_template.trim()}\n\n🔗 *Lista M3U Plus:*\n{m3u}\n\n📺 *Guia de Canais (EPG):*\n{epg}`;
      }
    } catch {}

    if (Object.keys(updateSettings).length > 0) {
      try {
        await supabase
          .from("whatsapp_settings")
          .update(updateSettings)
          .eq("user_id", userId);
      } catch {}

      try {
        await supabase.auth.updateUser({
          data: {
            sigma_settings: {
              ...saved,
              ...(updateSettings.sigma_streaming_dns ? { streaming_dns: updateSettings.sigma_streaming_dns } : {}),
              ...(updateSettings.sigma_server_name ? { server_name: updateSettings.sigma_server_name } : {}),
            },
          },
        });
      } catch {}
    }
  } catch (error) {
    return {
      ok: false as const,
      created: 0,
      updated: 0,
      createdNames: [] as string[],
      error: error instanceof Error ? error.message : "Falha ao consultar o painel Sigma.",
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
  const createdNames: string[] = [];
  const failedNames: string[] = [];

  for (const customer of customers) {
    const match =
      bySigmaId.get(customer.id) ??
      (customer.username ? byUsername.get(customer.username.toLowerCase()) : undefined);

    const dueDay = customer.dueDate ? Number(customer.dueDate.slice(8, 10)) : null;
    const localStatus = customer.status === "active" ? "active" : customer.status ? "inactive" : "active";

    const effectiveDns = detectedDns || saved.streaming_dns;
    const directOrGeneratedM3u =
      customer.m3uUrl ||
      (effectiveDns && customer.username && customer.password
        ? generateM3uUrl(effectiveDns, customer.username, customer.password, "ts")
        : null);

    const noteParts = [
      customer.notes?.trim(),
      customer.packageName ? `Pacote: ${customer.packageName}` : null,
      customer.serverName ? `Servidor: ${customer.serverName}` : null,
      directOrGeneratedM3u ? `M3U: ${directOrGeneratedM3u}` : null,
    ].filter(Boolean);
    const clientNotes = noteParts.length > 0 ? noteParts.join("\n") : null;

    const base: Record<string, any> = {
      sigma_customer_id: customer.id,
      sigma_username: customer.username,
      sigma_synced_at: now,
      iptv_username: customer.username,
      iptv_password: customer.password,
      ...(clientNotes ? { notes: clientNotes } : {}),
      ...(customer.screens != null ? { screens: customer.screens } : {}),
      ...(customer.dueDate ? { next_due_date: customer.dueDate } : {}),
      ...(dueDay ? { due_day: dueDay } : {}),
    };

    if (match) {
      const { error } = await supabase
        .from("clients")
        .update({ ...base, status: localStatus })
        .eq("id", match.id)
        .eq("user_id", userId);

      if (!error) updated++;
      else failedNames.push(customer.name || customer.username || "Cliente");
    } else {
      const clientName = (customer.name?.trim()) || (customer.username?.trim()) || "Cliente Sigma";
      const clientPhone = (customer.phone ?? "").replace(/\D/g, "");
      const { error } = await supabase.from("clients").insert({
        user_id: userId,
        name: clientName,
        phone: clientPhone,
        status: localStatus,
        monthly_fee: 35.0,
        ...base,
      });

      if (!error) {
        created++;
        createdNames.push(clientName);
      } else {
        failedNames.push(clientName);
      }
    }
  }

  // Registra a data da última sincronização
  try {
    await supabase
      .from("whatsapp_settings")
      .update({ sigma_last_sync_at: now })
      .eq("user_id", userId);
  } catch {
    // continua mesmo se update falhar
  }

  return {
    ok: true as const,
    created,
    updated,
    createdNames,
    detectedServerName,
    detectedDns,
    error: failedNames.length
      ? `Falha ao importar ${failedNames.length} cliente(s): ${failedNames.slice(0, 3).join(", ")}`
      : null,
  };
}

/**
 * Importa e sincroniza todos os clientes do painel Sigma no Supabase.
 */
export const syncSigmaClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url?: string; username?: string; password?: string; token?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    return runSigmaSyncForUser(context.supabase, context.userId, data);
  });

/**
 * Cria uma nova linha/cliente diretamente no painel Sigma.
 */
export const createSigmaClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      clientId?: string;
      name: string;
      username: string;
      password?: string;
      phone?: string;
      email?: string;
      screens?: number;
      dueDate?: string;
      packageId?: string | number;
      notes?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { createSigmaCustomer, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;
    const config = await loadConfig(supabase, userId);

    if (!hasSigmaAccess(config)) {
      return { ok: false as const, error: "Painel Sigma não configurado. Verifique as Configurações." };
    }

    try {
      const token = await ensureSigmaToken(config);
      const created = await createSigmaCustomer(
        { ...config, token },
        {
          name: data.name,
          username: data.username,
          password: data.password,
          phone: data.phone,
          email: data.email,
          screens: data.screens,
          dueDate: data.dueDate,
          packageId: data.packageId,
          notes: data.notes,
        },
      );

      const now = new Date().toISOString();

      // Se passou o clientId do banco local, atualiza o vínculo
      if (data.clientId) {
        await supabase
          .from("clients")
          .update({
            sigma_customer_id: created.id,
            sigma_username: created.username,
            sigma_synced_at: now,
            iptv_username: created.username,
            iptv_password: created.password,
          })
          .eq("id", data.clientId)
          .eq("user_id", userId);
      }

      return {
        ok: true as const,
        customer: created,
        error: null,
      };
    } catch (error) {
      return {
        ok: false as const,
        customer: null,
        error: error instanceof Error ? error.message : "Falha ao criar cliente no painel Sigma.",
      };
    }
  });

/**
 * Atualiza os dados de uma linha/cliente diretamente no painel Sigma.
 */
export const updateSigmaClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      clientId: string;
      name?: string;
      username?: string;
      password?: string;
      phone?: string;
      email?: string;
      screens?: number;
      dueDate?: string;
      status?: string;
      notes?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { updateSigmaCustomer, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;
    const config = await loadConfig(supabase, userId);

    const { data: client } = await supabase
      .from("clients")
      .select("id, sigma_customer_id, sigma_username, iptv_username")
      .eq("id", data.clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!client) {
      return { ok: false as const, error: "Cliente não encontrado." };
    }

    if (!hasSigmaAccess(config)) {
      return { ok: true as const, error: null, warning: "Painel Sigma não configurado." };
    }

    const ref = {
      id: client.sigma_customer_id,
      username: client.sigma_username || client.iptv_username || data.username,
    };

    if (!ref.id && !ref.username) {
      return { ok: true as const, error: null, warning: "Cliente sem vínculo com o Sigma." };
    }

    try {
      const token = await ensureSigmaToken(config);
      await updateSigmaCustomer(
        { ...config, token },
        ref,
        {
          name: data.name,
          username: data.username,
          password: data.password,
          phone: data.phone,
          email: data.email,
          screens: data.screens,
          dueDate: data.dueDate,
          status: data.status,
          notes: data.notes,
        },
      );

      const now = new Date().toISOString();
      await supabase
        .from("clients")
        .update({
          sigma_synced_at: now,
          ...(data.username ? { sigma_username: data.username, iptv_username: data.username } : {}),
          ...(data.password ? { iptv_password: data.password } : {}),
        })
        .eq("id", data.clientId)
        .eq("user_id", userId);

      return { ok: true as const, error: null };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Falha ao atualizar no painel Sigma.",
      };
    }
  });

/**
 * Remove o cliente do Supabase e opcionalmente remove a linha do painel Sigma.
 */
export const deleteSigmaClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; deleteFromSigma?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { deleteSigmaCustomer, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;

    const { data: client } = await supabase
      .from("clients")
      .select("id, sigma_customer_id, sigma_username, iptv_username")
      .eq("id", data.clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!client) {
      return { ok: false as const, error: "Cliente não encontrado." };
    }

    let sigmaError: string | null = null;

    if (data.deleteFromSigma && (client.sigma_customer_id || client.sigma_username || client.iptv_username)) {
      const config = await loadConfig(supabase, userId);
      if (hasSigmaAccess(config)) {
        try {
          const token = await ensureSigmaToken(config);
          await deleteSigmaCustomer(
            { ...config, token },
            {
              id: client.sigma_customer_id,
              username: client.sigma_username || client.iptv_username,
            },
          );
        } catch (err) {
          sigmaError = err instanceof Error ? err.message : "Falha ao excluir no painel Sigma.";
        }
      }
    }

    // Exclui do banco de dados local
    const { error: dbError } = await supabase
      .from("clients")
      .delete()
      .eq("id", data.clientId)
      .eq("user_id", userId);

    if (dbError) {
      return { ok: false as const, error: `Erro ao excluir no banco: ${dbError.message}` };
    }

    return {
      ok: true as const,
      sigmaRemoved: data.deleteFromSigma && !sigmaError,
      sigmaWarning: sigmaError,
    };
  });

/**
 * Renova manualmente um cliente no painel Sigma (+30 dias ou X meses).
 */
export const renewSigmaClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; months?: number }) => input)
  .handler(async ({ data, context }) => {
    const { renewSigmaCustomer, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;

    const config = await loadConfig(supabase, userId);
    const { data: client } = await supabase
      .from("clients")
      .select("id, next_due_date, sigma_customer_id, sigma_username, iptv_username")
      .eq("id", data.clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!client) return { ok: false as const, error: "Cliente não encontrado." };

    if (!hasSigmaAccess(config)) {
      return { ok: false as const, error: "Painel Sigma não configurado." };
    }

    const ref = {
      id: client.sigma_customer_id,
      username: client.sigma_username || client.iptv_username,
    };

    if (!ref.id && !ref.username) {
      return { ok: false as const, error: "Este cliente não possui vínculo com o painel Sigma." };
    }

    try {
      const token = await ensureSigmaToken(config);
      await renewSigmaCustomer({ ...config, token }, ref, data.months ?? 1);

      // Estende o vencimento local em 30 dias
      const currentDue = client.next_due_date ? new Date(client.next_due_date) : new Date();
      const newDue = new Date(currentDue);
      newDue.setDate(newDue.getDate() + (data.months ?? 1) * 30);
      const newDueStr = newDue.toISOString().slice(0, 10);

      await supabase
        .from("clients")
        .update({ next_due_date: newDueStr, status: "active" })
        .eq("id", client.id)
        .eq("user_id", userId);

      return { ok: true as const, nextDueDate: newDueStr };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Falha ao renovar no painel Sigma.",
      };
    }
  });

/**
 * Bloqueia ou desbloqueia o cliente no painel Sigma e atualiza localmente.
 */
export const toggleSigmaClientBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; block: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { toggleSigmaCustomerStatus, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;

    const config = await loadConfig(supabase, userId);
    const { data: client } = await supabase
      .from("clients")
      .select("id, sigma_customer_id, sigma_username, iptv_username, status")
      .eq("id", data.clientId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!client) return { ok: false as const, error: "Cliente não encontrado." };

    const newStatus = data.block ? "blocked" : "active";

    if (hasSigmaAccess(config) && (client.sigma_customer_id || client.sigma_username || client.iptv_username)) {
      try {
        const token = await ensureSigmaToken(config);
        await toggleSigmaCustomerStatus(
          { ...config, token },
          {
            id: client.sigma_customer_id,
            username: client.sigma_username || client.iptv_username,
          },
          data.block ? "blocked" : "active",
        );
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Falha ao alterar status no painel.",
        };
      }
    }

    await supabase
      .from("clients")
      .update({ status: newStatus })
      .eq("id", client.id)
      .eq("user_id", userId);

    return { ok: true as const, status: newStatus };
  });

/**
 * Cria uma linha de teste rápido no painel Sigma (duração de X horas).
 */
export const createSigmaQuickTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { hours?: number; name?: string; phone?: string; packageId?: string | number }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { createSigmaCustomer, ensureSigmaToken } = await import("./sigma.server");
    const { supabase, userId } = context;

    const config = await loadConfig(supabase, userId);
    if (!hasSigmaAccess(config)) {
      return { ok: false as const, error: "Painel Sigma não configurado. Acesse Configurações -> Servidor Sigma." };
    }

    const hours = data?.hours ?? 4;
    const rand = Math.floor(1000 + Math.random() * 9000);
    const testUsername = `teste_${rand}`;
    const testPassword = String(Math.floor(100000 + Math.random() * 900000));
    const testName = (data?.name ?? "").trim() || `Teste Grátis (${hours}h)`;

    const expiresDate = new Date();
    expiresDate.setHours(expiresDate.getHours() + hours);
    const dueDateStr = expiresDate.toISOString();

    try {
      const token = await ensureSigmaToken(config);
      const created = await createSigmaCustomer(
        { ...config, token },
        {
          name: testName,
          username: testUsername,
          password: testPassword,
          ...(data?.phone ? { phone: data.phone.replace(/\D/g, "") } : {}),
          screens: 1,
          dueDate: dueDateStr,
          notes: `Teste Grátis de ${hours}h gerado em ${new Date().toLocaleString("pt-BR")}`,
          ...(data?.packageId ? { packageId: data.packageId } : {}),
        }
      );

      const effectiveDns = config.streaming_dns || config.url || "";
      const m3uUrl = generateM3uUrl(effectiveDns, testUsername, testPassword, "ts");
      const epgUrl = generateEpgUrl(effectiveDns, testUsername, testPassword);

      return {
        ok: true as const,
        credentials: {
          name: testName,
          username: created.username || testUsername,
          password: created.password || testPassword,
          serverUrl: effectiveDns,
          serverName: config.server_name || "Servidor Principal",
          hours,
          expiresAt: dueDateStr,
          m3uUrl,
          epgUrl,
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Erro ao gerar teste no Sigma.",
      };
    }
  });
