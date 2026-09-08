export function formatBRL(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function onlyDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

export type TemplateVarInput = {
  client?: {
    name?: string | null;
    phone?: string | null;
    iptv_username?: string | null;
    iptv_password?: string | null;
    screens?: number | null;
  } | null;
  list?: {
    name?: string | null;
    server_url?: string | null;
    username?: string | null;
    password?: string | null;
  } | null;
  settings?: {
    business_name?: string | null;
    pix_key?: string | null;
    pix_holder?: string | null;
    payment_link?: string | null;
    sigma_url?: string | null;
    sigma_streaming_dns?: string | null;
    sigma_server_name?: string | null;
    sigma_server_display_name?: string | null;
  } | null;
  amount?: number | string | null;
  dueDate?: string | null;
  days?: number | null;
};

/**
 * Extrai o DNS/URL limpo para conexão IPTV e streaming (sem caminhos de login, dashboard ou hashes).
 * Exemplo: "https://aplicativoz342.click/#/sign-in?redirect=/dashboard" -> "https://aplicativoz342.click"
 */
export function extractCleanIptvDns(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  let trimmed = rawUrl.trim();
  // Remove hashes (#/sign-in...) e queries (?redirect=...)
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx >= 0) trimmed = trimmed.slice(0, hashIdx);
  const qIdx = trimmed.indexOf("?");
  if (qIdx >= 0) trimmed = trimmed.slice(0, qIdx);

  // Mantém ou detecta protocolo
  const hasHttps = /^https:\/\//i.test(trimmed);
  const proto = hasHttps ? "https://" : "http://";
  trimmed = trimmed.replace(/^https?:\/\//i, "");

  // Extrai o host (com porta opcional, sem rotas de painel)
  const hostPart = trimmed.split("/")[0]?.trim() ?? "";
  if (!hostPart) return "";
  return `${proto}${hostPart}`;
}

/** Extrai apenas o host limpo (ex: "aplicativoz342.click") */
export function extractHostOnly(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  const cleaned = extractCleanIptvDns(rawUrl);
  return cleaned.replace(/^https?:\/\//i, "").split(":")[0] ?? "";
}

/** Gera a URL completa da lista M3U Plus (TS ou HLS) */
export function generateM3uUrl(
  serverDns?: string | null,
  username?: string | null,
  password?: string | null,
  output: "ts" | "m3u8" = "ts",
): string {
  const dns = extractCleanIptvDns(serverDns);
  const u = (username ?? "").trim();
  const p = (password ?? "").trim();
  if (!dns || !u) return "";
  return `${dns}/get.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&type=m3u_plus&output=${output}`;
}

/** Gera a URL completa do Guia de Programação (EPG / XMLTV) */
export function generateEpgUrl(
  serverDns?: string | null,
  username?: string | null,
  password?: string | null,
): string {
  const dns = extractCleanIptvDns(serverDns);
  const u = (username ?? "").trim();
  const p = (password ?? "").trim();
  if (!dns || !u) return "";
  return `${dns}/xmltv.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`;
}

/**
 * Formata os dados de acesso IPTV completos para envio ou cópia.
 * Garante servidor limpo, usuário, senha, lista M3U Plus, EPG e dicas de aplicativos,
 * SEM NUNCA incluir o link de renovação do painel Sigma (pois a plataforma cuida da cobrança e renovação).
 */
export function formatIptvAccessMessage(params: {
  name?: string | null;
  serverName?: string | null;
  serverUrl?: string | null;
  username?: string | null;
  password?: string | null;
  screens?: number | null;
  dueDate?: string | null;
  businessName?: string | null;
}): string {
  const cleanDns = extractCleanIptvDns(params.serverUrl);
  const serverLabel =
    params.serverName?.trim() ||
    extractHostOnly(params.serverUrl) ||
    "Servidor IPTV";
  const u = (params.username ?? "").trim();
  const p = (params.password ?? "").trim();
  const m3uUrl = generateM3uUrl(cleanDns, u, p, "ts");
  const epgUrl = generateEpgUrl(cleanDns, u, p);
  const screens = params.screens ?? 1;
  const dueStr = params.dueDate ? formatDate(params.dueDate) : "A combinar";

  let msg = `📡 *DADOS DE ACESSO IPTV* 📡\n\n` +
    `👤 *Cliente:* ${params.name || "Cliente"}\n` +
    `📺 *Servidor:* ${serverLabel}\n`;

  if (cleanDns) {
    msg += `🌐 *URL / DNS:* ${cleanDns}\n`;
  }
  if (u) {
    msg += `🔑 *Usuário:* ${u}\n`;
  }
  if (p) {
    msg += `🔒 *Senha:* ${p}\n`;
  }
  msg += `🖥️ *Telas:* ${screens}\n` +
    `📅 *Vencimento:* ${dueStr}\n\n`;

  if (m3uUrl) {
    msg += `🔗 *Lista M3U Plus (HLS/TS):*\n${m3uUrl}\n\n`;
  }
  if (epgUrl) {
    msg += `📺 *Guia de Canais (EPG):*\n${epgUrl}\n\n`;
  }

  msg += `📱 *Como Conectar:*\n` +
    `• No IPTV Smarters Pro, XCIPTV ou TiviMate: use a opção *Xtream Codes API* com o Servidor, Usuário e Senha.\n` +
    `• Em Smart TVs ou SS IPTV: adicione a *Lista M3U Plus* completa acima.\n\n` +
    `Bom divertimento! 🍿 Qualquer dúvida, estamos à disposição.`;

  return msg;
}

/** Variáveis disponíveis nos modelos de mensagem. */
export function buildTemplateVars(input: TemplateVarInput): Record<string, string> {
  const { client, list, settings } = input;
  const rawServerUrl =
    settings?.sigma_streaming_dns?.trim() ||
    list?.server_url ||
    settings?.sigma_url ||
    "";
  const cleanDns = extractCleanIptvDns(rawServerUrl);
  const sigmaServerName =
    settings?.sigma_server_name?.trim() ||
    settings?.sigma_server_display_name?.trim() ||
    extractHostOnly(rawServerUrl) ||
    "Servidor Sigma";

  const username = client?.iptv_username || list?.username || "";
  const password = client?.iptv_password || list?.password || "";
  const m3u = generateM3uUrl(cleanDns, username, password, "ts");
  const m3uHls = generateM3uUrl(cleanDns, username, password, "m3u8");
  const epg = generateEpgUrl(cleanDns, username, password);

  return {
    nome: client?.name ?? "",
    telefone: client?.phone ?? "",
    valor: formatBRL(input.amount ?? 0),
    vencimento: formatDate(input.dueDate ?? null),
    dias: String(Math.abs(input.days ?? 0)),
    lista: list?.name ?? sigmaServerName,
    servidor: cleanDns || sigmaServerName,
    dns: cleanDns,
    usuario: username,
    senha: password,
    m3u: m3u,
    m3u_hls: m3uHls,
    epg: epg,
    telas: String(client?.screens ?? 1),
    empresa: settings?.business_name ?? "",
    pix: settings?.pix_key ?? "",
    titular: settings?.pix_holder ?? "",
    link: settings?.payment_link ?? "",
  };
}

export const TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: "nome", label: "nome do cliente" },
  { key: "valor", label: "valor da mensalidade" },
  { key: "vencimento", label: "data de vencimento" },
  { key: "dias", label: "dias de antecedência/atraso" },
  { key: "lista", label: "nome da lista / servidor" },
  { key: "servidor", label: "endereço limpo do servidor (DNS)" },
  { key: "dns", label: "URL/DNS de conexão (Xtream Codes)" },
  { key: "usuario", label: "usuário de acesso" },
  { key: "senha", label: "senha de acesso" },
  { key: "m3u", label: "link completo da lista M3U Plus" },
  { key: "epg", label: "link do guia de programação (EPG)" },
  { key: "telas", label: "quantidade de telas" },
  { key: "empresa", label: "nome do seu negócio" },
  { key: "pix", label: "sua chave PIX" },
  { key: "titular", label: "titular do PIX" },
  { key: "link", label: "link de pagamento" },
];

