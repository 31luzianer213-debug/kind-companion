import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractCleanIptvDns, generateM3uUrl } from "./format";
import type { SigmaConfig } from "./sigma.panel";

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
    url: server.panel_url,
    username: server.username ?? "",
    password: server.password ?? "",
    token: server.token ?? null,
    streaming_dns: server.streaming_dns ?? "",
    server_name: server.name || "Servidor Sigma",
  };
}

async function getOwnedServer(supabase: any, userId: string, serverId: string) {
  const { data, error } = await supabase
    .from("sigma_servers")
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
    const { data, error } = await context.supabase
      .from("sigma_servers")
      .select("*")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) return { ok: false as const, servers: [], error: error.message };
    return { ok: true as const, servers: data ?? [], error: null };
  });

export const saveSigmaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SigmaServerInput) => input)
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      name: data.name.trim() || "Servidor Sigma",
      panel_url: data.panel_url.trim().replace(/\/$/, ""),
      streaming_dns: data.streaming_dns?.trim() || null,
      username: data.username?.trim() || null,
      password: data.password || null,
      token: data.token?.trim() || null,
      enabled: data.enabled ?? true,
      auto_renew: data.auto_renew ?? true,
      is_default: data.is_default ?? false,
    };
    if (!payload.panel_url) return { ok: false as const, server: null, error: "Informe a URL do painel." };
    if (!payload.token && (!payload.username || !payload.password)) {
      return { ok: false as const, server: null, error: "Informe usuário e senha ou um token." };
    }

    if (data.id) {
      const { data: server, error } = await context.supabase
        .from("sigma_servers")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("*")
        .single();
      return error
        ? { ok: false as const, server: null, error: error.message }
        : { ok: true as const, server, error: null };
    }

    const { count } = await context.supabase
      .from("sigma_servers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    const { data: server, error } = await context.supabase
      .from("sigma_servers")
      .insert({ ...payload, is_default: (count ?? 0) === 0 ? true : payload.is_default })
      .select("*")
      .single();
    return error
      ? { ok: false as const, server: null, error: error.message }
      : { ok: true as const, server, error: null };
  });

export const deleteSigmaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serverId: string }) => input)
  .handler(async ({ data, context }) => {
    const server = await getOwnedServer(context.supabase, context.userId, data.serverId);
    const { count } = await context.supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("sigma_server_id", data.serverId);
    if ((count ?? 0) > 0) {
      return { ok: false as const, error: `Este servidor possui ${count} cliente(s) vinculado(s). Desative-o em vez de excluir.` };
    }
    const { error } = await context.supabase
      .from("sigma_servers")
      .delete()
      .eq("id", server.id)
      .eq("user_id", context.userId);
    return error ? { ok: false as const, error: error.message } : { ok: true as const, error: null };
  });

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
    .eq("sigma_server_id", server.id);

  const byId = new Map((existing ?? []).filter((row: any) => row.sigma_customer_id).map((row: any) => [String(row.sigma_customer_id), row]));
  const byUsername = new Map((existing ?? []).filter((row: any) => row.iptv_username).map((row: any) => [String(row.iptv_username).toLowerCase(), row]));
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
      sigma_server_id: server.id,
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

  await supabase.from("sigma_servers").update({
    token,
    name: detectedName,
    streaming_dns: detectedDns || null,
    last_sync_at: now,
    last_sync_status: "success",
    last_sync_error: null,
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
      await context.supabase.from("sigma_servers").update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: message,
      }).eq("id", server.id).eq("user_id", context.userId);
      return { ok: false as const, error: message };
    }
  });

export const syncAllSigmaServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: servers, error } = await context.supabase
      .from("sigma_servers")
      .select("*")
      .eq("user_id", context.userId)
      .eq("enabled", true)
      .order("is_default", { ascending: false });
    if (error) return { ok: false as const, results: [], error: error.message };

    const results = [];
    for (const server of servers ?? []) {
      try {
        results.push({ ok: true, ...(await syncOneServer(context.supabase, context.userId, server)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao sincronizar.";
        results.push({ ok: false, serverId: server.id, serverName: server.name, created: 0, updated: 0, total: 0, error: message });
        await context.supabase.from("sigma_servers").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_error: message,
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
    .select("sigma_server_id")
    .eq("id", clientId)
    .eq("user_id", userId)
    .maybeSingle();

  let query = supabase.from("sigma_servers").select("*").eq("user_id", userId).eq("enabled", true);
  query = client?.sigma_server_id ? query.eq("id", client.sigma_server_id) : query.eq("is_default", true);
  const { data: server } = await query.maybeSingle();
  if (!server) throw new Error("Nenhum servidor Sigma válido foi encontrado para este cliente.");
  return toConfig(server);
}

export async function loadDefaultSigmaServer(supabase: any, userId: string, serverId?: string) {
  let query = supabase.from("sigma_servers").select("*").eq("user_id", userId).eq("enabled", true);
  query = serverId ? query.eq("id", serverId) : query.eq("is_default", true);
  const { data: server } = await query.maybeSingle();
  if (!server) throw new Error("Configure ao menos um servidor Sigma.");
  return { ...toConfig(server), id: server.id };
}
