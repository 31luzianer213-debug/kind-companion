import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractCleanIptvDns, generateM3uUrl } from "./format";
import { createSigmaCustomer, type SigmaConfig } from "./sigma.panel";

export interface SigmaServerInput {
  id?: string;
  name: string;
  panel_url: string;
  streaming_dns?: string;
  username?: string;
  password?: string;
  token?: string;
  enabled?: boolean;
  auto_renew?: boolean;
  is_default?: boolean;
}

function toConfig(server: any): SigmaConfig & { streaming_dns: string; server_name: string } {
  return {
    url: server.url,
    username: server.username ?? "",
    password: server.password ?? "",
    token: server.token ?? null,
    streaming_dns: server.streaming_dns ?? "",
    server_name: server.name || "Servidor Sigma",
  };
}

async function getOwnedServer(supabase: any, userId: string, serverId: string) {
  const { data, error } = await supabase
    .from("sigma_panels")
    .select("*")
    .eq("id", serverId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Servidor Sigma não encontrado.");
  return data;
}

export const listSigmaServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await cleanupOrphanRows(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("sigma_panels")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) return { ok: false as const, servers: [], error: error.message };
    return { ok: true as const, servers: (data ?? []).map((server, index) => ({ ...server, panel_url: server.url, is_default: index === 0, last_sync_status: null, last_sync_error: null })), error: null };
  });

export const saveSigmaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SigmaServerInput) => input)
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      name: data.name.trim() || "Servidor Sigma",
      url: data.panel_url.trim().replace(/\/$/, ""),
      streaming_dns: data.streaming_dns?.trim() || null,
      username: data.username?.trim() || null,
      password: data.password || null,
      token: data.token?.trim() || null,
      enabled: data.enabled ?? true,
      auto_renew: data.auto_renew ?? true,
    };
    if (!payload.url) return { ok: false as const, server: null, error: "Informe a URL do painel." };
    if (!payload.token && (!payload.username || !payload.password)) {
      return { ok: false as const, server: null, error: "Informe usuário e senha ou um token." };
    }

    if (data.id) {
      const { data: server, error } = await context.supabase
        .from("sigma_panels")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("*")
        .single();
      return error
        ? { ok: false as const, server: null, error: error.message }
        : { ok: true as const, server: { ...server, panel_url: server.url, is_default: false }, error: null };
    }

    const { data: server, error } = await context.supabase
      .from("sigma_panels")
      .insert(payload)
      .select("*")
      .single();
    return error
      ? { ok: false as const, server: null, error: error.message }
      : { ok: true as const, server, error: null };
  });

export const deleteSigmaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serverId: string; clientAction?: "keep" | "move" | "delete"; targetPanelId?: string | null; recreateOnTarget?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await cleanupOrphanRows(context.supabase, context.userId);
    const server = await getOwnedServer(context.supabase, context.userId, data.serverId);
    const action = data.clientAction ?? "keep";
    const { data: linkedClients, error: clientsError } = await context.supabase
      .from("clients")
      .select("*")
      .eq("user_id", context.userId)
      .eq("panel_id", data.serverId);
    if (clientsError) return { ok: false as const, error: clientsError.message };

    const clients = (linkedClients ?? []) as any[];
    const clientIds = clients.map((client) => client.id);
    let movedClients = 0;
    let deletedClients = 0;
    let keptClients = 0;
    let recreatedClients = 0;
    const failures: string[] = [];

    if (clientIds.length > 0) {
      if (action === "delete") {
        const deleteError = await deleteLocalClients(context.supabase, context.userId, clientIds);
        if (deleteError) return { ok: false as const, error: deleteError };
        deletedClients = clientIds.length;
      } else if (action === "move") {
        if (!data.targetPanelId) return { ok: false as const, error: "Escolha o painel de destino dos clientes." };
        const targetPanel = await getOwnedServer(context.supabase, context.userId, data.targetPanelId);

        if (data.recreateOnTarget) {
          const targetConfig = toConfig(targetPanel);
          for (const client of clients) {
            const username = client.sigma_username || client.iptv_username || null;
            try {
              const created = await createSigmaCustomer(targetConfig, {
                name: client.name,
                username: username || `cli${String(client.id).replace(/\D/g, "").slice(0, 8)}`,
                password: client.iptv_password || null,
                phone: client.phone || null,
                email: client.email || null,
                screens: client.screens || 1,
                // mantém o mesmo vencimento/dias que o cliente já tinha
                dueDate: client.next_due_date || null,
                notes: `Servidor: ${targetPanel.name}`,
              });
              const update = {
                panel_id: data.targetPanelId,
                sigma_customer_id: created.id,
                sigma_username: created.username,
                sigma_synced_at: new Date().toISOString(),
                iptv_username: created.username,
                iptv_password: created.password,
              };
              const { error: updateError } = await context.supabase
                .from("clients")
                .update(update)
                .eq("id", client.id)
                .eq("user_id", context.userId);
              if (updateError) throw new Error(updateError.message);
              recreatedClients++;
              movedClients++;
            } catch (error) {
              failures.push(`${client.name}: ${error instanceof Error ? error.message : "falha ao criar no painel de destino"}`);
              await context.supabase
                .from("clients")
                .update({ panel_id: data.targetPanelId })
                .eq("id", client.id)
                .eq("user_id", context.userId);
              movedClients++;
            }
          }
        } else {
          const { error: moveError } = await context.supabase
            .from("clients")
            .update({ panel_id: data.targetPanelId })
            .eq("user_id", context.userId)
            .eq("panel_id", data.serverId);
          if (moveError) return { ok: false as const, error: `Falha ao mover clientes: ${moveError.message}` };
          movedClients = clientIds.length;
        }
      } else {
        const { error: unlinkError } = await context.supabase
          .from("clients")
          .update({ panel_id: null })
          .eq("user_id", context.userId)
          .eq("panel_id", data.serverId);
        if (unlinkError) return { ok: false as const, error: `Falha ao desvincular clientes: ${unlinkError.message}` };
        keptClients = clientIds.length;
      }
    }

    const { error } = await context.supabase
      .from("sigma_panels")
      .delete()
      .eq("id", server.id)
      .eq("user_id", context.userId);
    return error
      ? { ok: false as const, error: error.message }
      : {
          ok: true as const,
          deletedClients,
          movedClients,
          keptClients,
          recreatedClients,
          failures: failures.slice(0, 5),
          failedCount: failures.length,
          error: null,
        };

  });


async function deleteLocalClients(supabase: any, userId: string, clientIds: string[]) {
  if (clientIds.length === 0) return null;
  const { error: logsError } = await supabase.from("message_logs").delete().eq("user_id", userId).in("client_id", clientIds);
  if (logsError) return `Falha ao remover históricos: ${logsError.message}`;
  const { error: invoicesError } = await supabase.from("invoices").delete().eq("user_id", userId).in("client_id", clientIds);
  if (invoicesError) return `Falha ao remover cobranças: ${invoicesError.message}`;
  const { error: clientsError } = await supabase.from("clients").delete().eq("user_id", userId).in("id", clientIds);
  return clientsError ? `Falha ao remover clientes: ${clientsError.message}` : null;
}

/**
 * Apenas repara vínculos antigos entre clientes e painéis Sigma.
 * NUNCA apaga clientes: a exclusão automática causava perda de dados
 * quando o painel ainda não tinha carregado ou mudava de nome.
 */
async function cleanupOrphanRows(supabase: any, userId: string) {
  const [{ data: panels, error: panelsError }, { data: orphans, error: clientsError }] = await Promise.all([
    supabase.from("sigma_panels").select("id, name").eq("user_id", userId),
    supabase
      .from("clients")
      .select("id, notes")
      .eq("user_id", userId)
      .not("sigma_customer_id", "is", null)
      .is("panel_id", null),
  ]);
  if (panelsError || clientsError) return { removed: 0, repaired: 0 };

  const activePanels = panels ?? [];
  let repaired = 0;

  for (const client of orphans ?? []) {
    const recordedName = String(client.notes || "").match(/(?:^|\n)Servidor:\s*([^\n]+)/i)?.[1]?.trim();
    const matchingPanel = recordedName
      ? activePanels.find((panel: { id: string; name: string }) => panel.name.trim().toLowerCase() === recordedName.toLowerCase())
      : activePanels.length === 1 ? activePanels[0] : null;

    if (matchingPanel) {
      const { error } = await supabase
        .from("clients")
        .update({ panel_id: matchingPanel.id })
        .eq("id", client.id)
        .eq("user_id", userId);
      if (!error) repaired++;
    }
  }

  return { removed: 0, repaired };
}

export const testSigmaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SigmaServerInput) => input)
  .handler(async ({ data }) => {
    const { ensureSigmaToken, listSigmaCustomers, fetchSigmaPanelDetails } = await import("./sigma.server");
    const config: SigmaConfig = {
      url: data.panel_url.trim(),
      username: data.username?.trim() || "",
      password: data.password || "",
      token: data.token?.trim() || null,
    };
    try {
      const token = await ensureSigmaToken(config);
      const [customers, details] = await Promise.all([
        listSigmaCustomers({ ...config, token }),
        fetchSigmaPanelDetails({ ...config, token }).catch(() => ({ serverName: null, dns: null, credits: null, packages: [] })),
      ]);
      return {
        ok: true as const,
        token,
        customersCount: customers.length,
        serverName: details.serverName,
        streamingDns: details.dns,
        credits: details.credits,
        packagesCount: details.packages.length,
        error: null,
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao conectar." };
    }
  });

async function syncOneServer(supabase: any, userId: string, server: any) {
  const { ensureSigmaToken, listSigmaCustomers, fetchSigmaPanelDetails } = await import("./sigma.server");
  const config = toConfig(server);
  const token = await ensureSigmaToken(config);
  const customers = await listSigmaCustomers({ ...config, token });
  const details = await fetchSigmaPanelDetails({ ...config, token }).catch(() => ({ serverName: null, dns: null }));
  const detectedDns = details.dns?.trim() || server.streaming_dns || "";
  const detectedName = details.serverName?.trim() || server.name;

  const { data: existing } = await supabase
    .from("clients")
    .select("id, sigma_customer_id, iptv_username")
    .eq("user_id", userId)
    .eq("panel_id", server.id);

  const byId = new Map<string, any>((existing ?? []).filter((row: any) => row.sigma_customer_id).map((row: any) => [String(row.sigma_customer_id), row]));
  const byUsername = new Map<string, any>((existing ?? []).filter((row: any) => row.iptv_username).map((row: any) => [String(row.iptv_username).toLowerCase(), row]));
  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const customer of customers) {
    const match = byId.get(String(customer.id)) || (customer.username ? byUsername.get(customer.username.toLowerCase()) : null);
    const dueDay = customer.dueDate ? Number(customer.dueDate.slice(8, 10)) : null;
    const status = customer.status === "active" ? "active" : customer.status ? "inactive" : "active";
    const m3u = customer.m3uUrl || (detectedDns && customer.username && customer.password
      ? generateM3uUrl(detectedDns, customer.username, customer.password, "ts")
      : null);
    const notes = [
      customer.notes?.trim(),
      customer.packageName ? `Pacote: ${customer.packageName}` : null,
      `Servidor: ${detectedName}`,
      m3u ? `M3U: ${m3u}` : null,
    ].filter(Boolean).join("\n");

    const values: Record<string, unknown> = {
      panel_id: server.id,
      sigma_customer_id: customer.id,
      sigma_username: customer.username,
      sigma_synced_at: now,
      iptv_username: customer.username,
      iptv_password: customer.password,
      status,
      ...(notes ? { notes } : {}),
      ...(customer.screens != null ? { screens: customer.screens } : {}),
      ...(customer.dueDate ? { next_due_date: customer.dueDate } : {}),
      ...(dueDay ? { due_day: dueDay } : {}),
    };

    if (match) {
      const { error } = await supabase.from("clients").update(values).eq("id", match.id).eq("user_id", userId);
      if (!error) updated++;
    } else {
      const { error } = await supabase.from("clients").insert({
        user_id: userId,
        name: customer.name?.trim() || customer.username?.trim() || "Cliente Sigma",
        phone: (customer.phone ?? "").replace(/\D/g, ""),
        monthly_fee: 35,
        ...values,
      });
      if (!error) created++;
    }
  }

  await supabase.from("sigma_panels").update({
    token,
    name: detectedName,
    streaming_dns: detectedDns || null,
    last_sync_at: now,
  }).eq("id", server.id).eq("user_id", userId);

  return { serverId: server.id, serverName: detectedName, created, updated, total: customers.length };
}

export const syncSigmaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serverId: string }) => input)
  .handler(async ({ data, context }) => {
    const server = await getOwnedServer(context.supabase, context.userId, data.serverId);
    try {
      const result = await syncOneServer(context.supabase, context.userId, server);
      return { ok: true as const, ...result, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar.";
      return { ok: false as const, error: message };
    }
  });

export const syncAllSigmaServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: servers, error } = await context.supabase
      .from("sigma_panels")
      .select("*")
      .eq("user_id", context.userId)
      .eq("enabled", true)
      .order("created_at", { ascending: true });
    if (error) return { ok: false as const, results: [], error: error.message };

    const results = [];
    for (const server of servers ?? []) {
      try {
        results.push({ ok: true, ...(await syncOneServer(context.supabase, context.userId, server)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao sincronizar.";
        results.push({ ok: false, serverId: server.id, serverName: server.name, created: 0, updated: 0, total: 0, error: message });
        await context.supabase.from("sigma_panels").update({
          last_sync_at: new Date().toISOString(),
        }).eq("id", server.id).eq("user_id", context.userId);
      }
    }
    return {
      ok: results.every((item) => item.ok),
      results,
      created: results.reduce((sum, item) => sum + item.created, 0),
      updated: results.reduce((sum, item) => sum + item.updated, 0),
      error: results.some((item) => !item.ok) ? "Alguns servidores não sincronizaram." : null,
    };
  });

export async function loadSigmaServerForClient(supabase: any, userId: string, clientId: string) {
  const { data: client } = await supabase
    .from("clients")
    .select("panel_id")
    .eq("id", clientId)
    .eq("user_id", userId)
    .maybeSingle();

  let query = supabase.from("sigma_panels").select("*").eq("user_id", userId).eq("enabled", true);
  query = client?.panel_id ? query.eq("id", client.panel_id) : query.order("created_at", { ascending: true }).limit(1);
  const { data: server } = await query.maybeSingle();
  if (!server) throw new Error("Nenhum servidor Sigma válido foi encontrado para este cliente.");
  return toConfig(server);
}

export async function loadDefaultSigmaServer(supabase: any, userId: string, serverId?: string) {
  let query = supabase.from("sigma_panels").select("*").eq("user_id", userId).eq("enabled", true);
  query = serverId ? query.eq("id", serverId) : query.order("created_at", { ascending: true }).limit(1);
  const { data: server } = await query.maybeSingle();
  if (!server) throw new Error("Configure ao menos um servidor Sigma.");
  return { ...toConfig(server), id: server.id };
}
