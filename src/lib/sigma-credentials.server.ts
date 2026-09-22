/**
 * Resolve as credenciais do painel Sigma de um revendedor.
 * Prioriza os servidores cadastrados na tela "Sigma" (tabela sigma_panels)
 * e só depois cai para os campos legados em whatsapp_settings.
 */
export type ResolvedSigmaPanel = {
  url: string;
  token: string | null;
  username: string;
  password: string;
  serverName: string;
  streamingDns: string;
  source: "panel" | "legacy" | "none";
};

export async function resolveSigmaPanel(supabase: any, userId: string): Promise<ResolvedSigmaPanel> {
  let panel: any = null;
  try {
    const { data } = await supabase
      .from("sigma_panels")
      .select("*")
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(1);
    panel = Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {}

  let wsRow: any = null;
  try {
    const { data } = await supabase.from("whatsapp_settings").select("*").eq("user_id", userId).maybeSingle();
    wsRow = data;
  } catch {}

  const url = String(panel?.url || wsRow?.sigma_url || "").trim();
  const token = panel?.token || wsRow?.sigma_token || null;
  const username = String(panel?.username || wsRow?.sigma_username || "").trim();
  const password = String(panel?.password || wsRow?.sigma_password || "").trim();
  const serverName =
    String(panel?.name || wsRow?.sigma_server_name || wsRow?.business_name || "").trim() || "Meu Servidor";
  const streamingDns = String(panel?.streaming_dns || wsRow?.sigma_streaming_dns || "").trim();

  const hasCredentials = Boolean(url && (token || (username && password)));

  return {
    url,
    token,
    username,
    password,
    serverName,
    streamingDns,
    source: hasCredentials ? (panel ? "panel" : "legacy") : "none",
  };
}
