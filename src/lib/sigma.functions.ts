import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SigmaConfig } from "./sigma.panel";
import { generateM3uUrl } from "./format";

type SigmaSettingsPayload = { sigma_url: string; sigma_server_name?: string; sigma_streaming_dns?: string; sigma_username: string; sigma_password?: string; sigma_token?: string | null; sigma_enabled: boolean; sigma_auto_renew: boolean };
type SigmaInput = { url?: string; username?: string; password?: string; token?: string };
type LoadedConfig = SigmaConfig & { server_name: string; server_display_name: string; streaming_dns: string; enabled: boolean; auto_renew: boolean; last_sync_at: string | null };

async function loadConfig(supabase: any, userId: string): Promise<LoadedConfig> {
  const dbResult = await supabase.from("whatsapp_settings").select("*").eq("user_id", userId).maybeSingle();
  if (dbResult.error) throw new Error(`Não foi possível carregar as configurações do Sigma: ${dbResult.error.message}`);
  const db = dbResult.data ?? {};
  const authResult = await supabase.auth.getUser();
  const meta = authResult.data?.user?.user_metadata?.sigma_settings ?? {};
  const serverName = String(db.sigma_server_name ?? meta.server_name ?? "").trim();
  return { url: String(db.sigma_url ?? meta.url ?? "").trim(), server_name: serverName, server_display_name: serverName || "Servidor Sigma", streaming_dns: String(db.sigma_streaming_dns ?? meta.streaming_dns ?? "").trim(), username: String(db.sigma_username ?? meta.username ?? "").trim(), password: String(db.sigma_password ?? meta.password ?? ""), token: db.sigma_token ?? meta.token ?? null, enabled: Boolean(db.sigma_enabled ?? meta.enabled ?? false), auto_renew: Boolean(db.sigma_auto_renew ?? meta.auto_renew ?? false), last_sync_at: db.sigma_last_sync_at ?? meta.last_sync_at ?? null };
}

function hasSigmaAccess(config: SigmaConfig) { return Boolean(config.url?.trim() && (config.token?.trim() || (config.username?.trim() && config.password?.trim()))); }
function mergeInput(saved: LoadedConfig, input?: SigmaInput): SigmaConfig { return { url: input?.url?.trim() || saved.url, username: input?.username?.trim() || saved.username, password: input?.password ?? saved.password, token: input?.token?.trim() || saved.token }; }

export const saveSigmaSettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: SigmaSettingsPayload) => input).handler(async ({ data, context }) => {
  const result = await context.supabase.from("whatsapp_settings").upsert({ user_id: context.userId, sigma_url: data.sigma_url.trim(), sigma_server_name: (data.sigma_server_name ?? "").trim(), sigma_streaming_dns: (data.sigma_streaming_dns ?? "").trim(), sigma_username: data.sigma_username.trim(), sigma_password: data.sigma_password ?? "", sigma_token: data.sigma_token?.trim() || null, sigma_enabled: Boolean(data.sigma_enabled), sigma_auto_renew: Boolean(data.sigma_auto_renew) }, { onConflict: "user_id" });
  return result.error ? { ok: false as const, error: result.error.message } : { ok: true as const };
});

export const getSigmaSettings = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const config = await loadConfig(context.supabase, context.userId);
  return { ok: true as const, settings: { sigma_url: config.url, sigma_server_name: config.server_name, sigma_server_display_name: config.server_display_name, sigma_streaming_dns: config.streaming_dns, sigma_username: config.username ?? "", sigma_password: config.password ?? "", sigma_token: config.token ?? "", sigma_enabled: config.enabled, sigma_auto_renew: config.auto_renew, sigma_last_sync_at: config.last_sync_at, isConfigured: hasSigmaAccess(config) } };
});

export const testSigmaConnection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: SigmaInput) => input ?? {}).handler(async ({ data, context }) => {
  const { fetchSigmaPanelDetails, listSigmaCustomers, sigmaLogin } = await import("./sigma.panel");
  try {
    const config = mergeInput(await loadConfig(context.supabase, context.userId), data);
    if (!config.url) return { ok: false as const, error: "Informe o endereço do painel Sigma." };
    const token = config.token?.trim() || await sigmaLogin(config.url, config.username ?? "", config.password ?? "");
    const customers = await listSigmaCustomers(config, token);
    const details = await fetchSigmaPanelDetails(config, token);
    const result = await context.supabase.from("whatsapp_settings").upsert({ user_id: context.userId, sigma_url: config.url, sigma_username: config.username ?? "", sigma_password: config.password ?? "", sigma_token: token, sigma_enabled: true, ...(details.serverName ? { sigma_server_name: details.serverName } : {}), ...(details.dns ? { sigma_streaming_dns: details.dns } : {}) }, { onConflict: "user_id" });
    if (result.error) return { ok: false as const, error: result.error.message };
    return { ok: true as const, error: null, customersCount: customers.length, detectedDns: details.dns, detectedServerName: details.serverName, packagesCount: details.packages.length, credits: details.credits };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível conectar ao painel." }; }
});

export async function runSigmaSyncForUser(supabase: any, userId: string, data?: SigmaInput) {
  const { ensureSigmaToken, fetchSigmaPanelDetails, isActiveStatus, listSigmaCustomers } = await import("./sigma.panel");
  try {
    const saved = await loadConfig(supabase, userId);
    const config = mergeInput(saved, data);
    if (!hasSigmaAccess(config)) return { ok: false as const, created: 0, updated: 0, createdNames: [] as string[], error: "Painel Sigma não configurado. Teste a conexão ou preencha as credenciais." };
    const token = await ensureSigmaToken(config);
    const customers = await listSigmaCustomers(config, token);
    const details = await fetchSigmaPanelDetails(config, token);
    const existingResult = await supabase.from("clients").select("id, sigma_customer_id, iptv_username").eq("user_id", userId);
    if (existingResult.error) throw new Error(existingResult.error.message);
    const existing = existingResult.data ?? [];
    const byId = new Map(existing.filter((row: any) => row.sigma_customer_id).map((row: any) => [String(row.sigma_customer_id), row]));
    const byUser = new Map(existing.filter((row: any) => row.iptv_username).map((row: any) => [String(row.iptv_username).toLowerCase(), row]));
    let created = 0; let updated = 0; const createdNames: string[] = []; const now = new Date().toISOString();
    for (const customer of customers) {
      const match = byId.get(String(customer.id)) ?? (customer.username ? byUser.get(customer.username.toLowerCase()) : undefined);
      const dueDate = customer.dueDate?.slice(0, 10) || null; const dueDay = dueDate ? Number(dueDate.slice(8, 10)) : null;
      const dns = details.dns || saved.streaming_dns; const m3u = customer.m3uUrl || (dns && customer.username && customer.password ? generateM3uUrl(dns, customer.username, customer.password, "ts") : null);
      const base = { sigma_customer_id: customer.id, sigma_username: customer.username ?? null, sigma_synced_at: now, iptv_username: customer.username ?? null, iptv_password: customer.password ?? null, ...(customer.screens != null ? { screens: customer.screens } : {}), ...(dueDate ? { next_due_date: dueDate } : {}), ...(dueDay ? { due_day: dueDay } : {}), ...(m3u ? { notes: `M3U: ${m3u}${customer.notes ? `\n${customer.notes}` : ""}` } : customer.notes ? { notes: customer.notes } : {}) };
      if (match) { const result = await supabase.from("clients").update({ ...base, status: isActiveStatus(customer.status) ? "active" : "inactive" }).eq("id", match.id).eq("user_id", userId); if (result.error) throw new Error(result.error.message); updated++; }
      else { const name = customer.name?.trim() || customer.username || "Cliente Sigma"; const result = await supabase.from("clients").insert({ user_id: userId, name, phone: (customer.phone ?? "").replace(/\D/g, ""), status: isActiveStatus(customer.status) ? "active" : "inactive", monthly_fee: 35, ...base }); if (result.error) throw new Error(result.error.message); created++; createdNames.push(name); }
    }
    const settingsUpdate = await supabase.from("whatsapp_settings").update({ sigma_last_sync_at: now, ...(details.serverName ? { sigma_server_name: details.serverName } : {}), ...(details.dns ? { sigma_streaming_dns: details.dns } : {}) }).eq("user_id", userId);
    if (settingsUpdate.error) throw new Error(settingsUpdate.error.message);
    return { ok: true as const, created, updated, createdNames, detectedServerName: details.serverName, detectedDns: details.dns, error: null };
  } catch (error) { return { ok: false as const, created: 0, updated: 0, createdNames: [] as string[], error: error instanceof Error ? error.message : "Falha ao sincronizar clientes." }; }
}

export const syncSigmaClients = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: SigmaInput) => input ?? {}).handler(async ({ data, context }) => runSigmaSyncForUser(context.supabase, context.userId, data));
