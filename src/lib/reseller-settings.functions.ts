import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getResellerTrialServerSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const [{ data: servers, error: serversError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase
        .from("sigma_panels")
        .select("id, name, url, streaming_dns, enabled, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("whatsapp_settings")
        .select("test_server_id")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    if (serversError) {
      return { ok: false as const, servers: [], selectedServerId: null, error: serversError.message };
    }

    if (settingsError && settingsError.code !== "PGRST116") {
      return { ok: false as const, servers: [], selectedServerId: null, error: settingsError.message };
    }

    const enabledServers = (servers ?? []).filter((server: any) => server.enabled !== false);
    const selectedStillExists = enabledServers.some((server: any) => server.id === settings?.test_server_id);
    const selectedServerId = selectedStillExists
      ? settings?.test_server_id ?? null
      : enabledServers[0]?.id ?? null;

    return {
      ok: true as const,
      servers: enabledServers,
      selectedServerId,
      error: null,
    };
  });

export const setResellerTrialServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serverId: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: server, error: serverError } = await supabase
      .from("sigma_panels")
      .select("id, name, url, streaming_dns, username, password, token, enabled")
      .eq("id", data.serverId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (serverError || !server) {
      return { ok: false as const, error: "Servidor Sigma não encontrado para esta conta." };
    }

    if (server.enabled === false) {
      return { ok: false as const, error: "Ative este servidor Sigma antes de usá-lo para testes." };
    }

    // whatsapp_settings não possui sigma_server_name nem sigma_streaming_dns.
    // Mantemos apenas os campos que existem no schema e o vínculo test_server_id.
    // O card do Robô lê nome/DNS diretamente de sigma_panels.
    const payload = {
      user_id: context.userId,
      test_server_id: server.id,
      sigma_enabled: true,
      sigma_url: server.url,
      sigma_username: server.username ?? null,
      sigma_password: server.password ?? null,
      sigma_token: server.token ?? null,
    };

    const { error: saveError } = await supabase
      .from("whatsapp_settings")
      .upsert(payload, { onConflict: "user_id" });

    if (saveError) {
      return { ok: false as const, error: saveError.message };
    }

    return {
      ok: true as const,
      selectedServerId: server.id,
      serverName: server.name,
      streamingDns: server.streaming_dns ?? null,
      error: null,
    };
  });
