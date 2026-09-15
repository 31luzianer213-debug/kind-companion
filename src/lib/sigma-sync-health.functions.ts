import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateM3uUrl } from "./format";
import { recordActivity } from "./activity.server";

async function ownedServer(supabase: any, userId: string, serverId: string) {
  const { data, error } = await supabase.from("sigma_panels").select("*").eq("id", serverId).eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("Servidor Sigma não encontrado.");
  return data;
}

async function markStatus(supabase: any, userId: string, serverId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("sigma_panels").update(values).eq("id", serverId).eq("user_id", userId);
  if (error) console.warn("Falha ao salvar status de sincronização Sigma:", error.message);
}

async function syncServer(supabase: any, userId: string, server: any) {
  const startedAt = new Date().toISOString();
  await markStatus(supabase, userId, server.id, {
    last_sync_started_at: startedAt,
    last_sync_status: "running",
    last_sync_error: null,
    last_sync_imported: 0,
    last_sync_updated: 0,
    last_sync_skipped: 0,
    last_sync_errors: 0,
  });

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const { ensureSigmaToken, listSigmaCustomers, fetchSigmaPanelDetails } = await import("./sigma.server");
    const config = {
      url: server.url,
      username: server.username ?? "",
      password: server.password ?? "",
      token: server.token ?? null,
    };
    const token = await ensureSigmaToken(config);
    const customersRaw = await listSigmaCustomers({ ...config, token });
    const customers = Array.isArray(customersRaw) ? customersRaw : [];
    const details = await fetchSigmaPanelDetails({ ...config, token }).catch(() => ({ serverName: null, dns: null }));
    const detectedName = details?.serverName?.trim() || server.name || "Servidor Sigma";
    const detectedDns = details?.dns?.trim() || server.streaming_dns || "";

    const { data: existingData, error: existingError } = await supabase
      .from("clients")
      .select("id,sigma_customer_id,iptv_username")
      .eq("user_id", userId)
      .eq("panel_id", server.id);
    if (existingError) throw new Error(existingError.message);
    const existing = Array.isArray(existingData) ? existingData : [];
    const byId = new Map(existing.filter((row: any) => row.sigma_customer_id).map((row: any) => [String(row.sigma_customer_id), row]));
    const byUsername = new Map(existing.filter((row: any) => row.iptv_username).map((row: any) => [String(row.iptv_username).toLowerCase(), row]));
    const syncedAt = new Date().toISOString();

    for (const customer of customers) {
      try {
        const username = String(customer?.username || "").trim();
        const match: any = byId.get(String(customer?.id)) || (username ? byUsername.get(username.toLowerCase()) : null);
        const dueDate = customer?.dueDate ? String(customer.dueDate).slice(0, 10) : null;
        const dueDay = dueDate ? Number(dueDate.slice(8, 10)) : null;
        const status = customer?.status === "active" ? "active" : customer?.status ? "inactive" : "active";
        const m3u = customer?.m3uUrl || (detectedDns && username && customer?.password ? generateM3uUrl(detectedDns, username, customer.password, "ts") : null);
        const notes = [customer?.notes?.trim(), customer?.packageName ? `Pacote: ${customer.packageName}` : null, `Servidor: ${detectedName}`, m3u ? `M3U: ${m3u}` : null].filter(Boolean).join("\n");
        const values: Record<string, unknown> = {
          panel_id: server.id,
          sigma_customer_id: customer?.id,
          sigma_username: username || null,
          sigma_synced_at: syncedAt,
          iptv_username: username || null,
          iptv_password: customer?.password || null,
          status,
          ...(notes ? { notes } : {}),
          ...(customer?.screens != null ? { screens: customer.screens } : {}),
          ...(dueDate ? { next_due_date: dueDate } : {}),
          ...(dueDay ? { due_day: dueDay } : {}),
        };

        if (match) {
          const { error } = await supabase.from("clients").update(values).eq("id", match.id).eq("user_id", userId);
          if (error) errors++;
          else updated++;
        } else {
          const { error } = await supabase.from("clients").insert({
            user_id: userId,
            name: customer?.name?.trim() || username || "Cliente Sigma",
            phone: String(customer?.phone || "").replace(/\D/g, ""),
            monthly_fee: 35,
            ...values,
          });
          if (error) errors++;
          else imported++;
        }
      } catch {
        errors++;
      }
    }

    skipped = Math.max(0, customers.length - imported - updated - errors);
    const finishedAt = new Date().toISOString();
    const status = errors > 0 ? "partial" : "success";
    await markStatus(supabase, userId, server.id, {
      token,
      name: detectedName,
      streaming_dns: detectedDns || null,
      last_sync_at: finishedAt,
      last_sync_success_at: errors === customers.length && customers.length > 0 ? server.last_sync_success_at : finishedAt,
      last_sync_status: status,
      last_sync_error: errors ? `${errors} cliente(s) apresentaram erro durante a sincronização.` : null,
      last_sync_imported: imported,
      last_sync_updated: updated,
      last_sync_skipped: skipped,
      last_sync_errors: errors,
    });
    await recordActivity(supabase, userId, {
      eventType: "sigma.sync",
      entityType: "sigma_panels",
      entityId: server.id,
      title: "Sincronização Sigma concluída",
      description: `${detectedName}: ${imported} importado(s), ${updated} atualizado(s), ${skipped} ignorado(s), ${errors} erro(s).`,
      metadata: { imported, updated, skipped, errors },
    });
    return { ok: errors === 0, serverId: server.id, serverName: detectedName, imported, updated, skipped, errors, message: errors ? "Sincronização concluída com avisos." : "Sincronização concluída.", error: errors ? `${errors} item(ns) com erro.` : null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar o servidor.";
    await markStatus(supabase, userId, server.id, {
      last_sync_at: new Date().toISOString(),
      last_sync_status: "error",
      last_sync_error: message,
      last_sync_imported: imported,
      last_sync_updated: updated,
      last_sync_skipped: skipped,
      last_sync_errors: Math.max(1, errors),
    });
    return { ok: false, serverId: server.id, serverName: server.name || "Servidor Sigma", imported, updated, skipped, errors: Math.max(1, errors), message: "Falha na sincronização.", error: message };
  }
}

export const listSigmaSyncHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase.from("sigma_panels").select("id,name,enabled,last_sync_at,last_sync_started_at,last_sync_success_at,last_sync_status,last_sync_error,last_sync_imported,last_sync_updated,last_sync_skipped,last_sync_errors").eq("user_id", context.userId).order("created_at", { ascending: true });
    return error ? { ok: false as const, servers: [], error: "Não foi possível carregar o histórico de sincronização." } : { ok: true as const, servers: Array.isArray(data) ? data : [], error: null };
  });

export const syncSigmaServerDetailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serverId: string }) => input)
  .handler(async ({ data, context }) => syncServer(context.supabase as any, context.userId, await ownedServer(context.supabase as any, context.userId, data.serverId)));

export const syncAllSigmaServersDetailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data, error } = await supabase.from("sigma_panels").select("*").eq("user_id", context.userId).eq("enabled", true).order("created_at", { ascending: true });
    if (error) return { ok: false as const, results: [], imported: 0, updated: 0, skipped: 0, errors: 1, error: error.message };
    const servers = Array.isArray(data) ? data : [];
    const results = [];
    for (const server of servers) results.push(await syncServer(supabase, context.userId, server));
    return {
      ok: results.every((result) => result.ok),
      results,
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      updated: results.reduce((sum, result) => sum + result.updated, 0),
      skipped: results.reduce((sum, result) => sum + result.skipped, 0),
      errors: results.reduce((sum, result) => sum + result.errors, 0),
      error: results.some((result) => !result.ok) ? "Alguns servidores terminaram com erro ou aviso." : null,
    };
  });
