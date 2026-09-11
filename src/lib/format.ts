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
    notes?: string | null;
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

/**
 * Extrai o nome do servidor gravado nas observações do cliente (ex: Servidor: Alpha server IPTV).
 */
export function extractServerFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const match = /(?:servidor|server)\s*:\s*([^\r\n]+)/i.exec(notes);
  if (match) {
    const s = match[1].trim();
    if (s && !s.startsWith("http") && !/\.(click|com|net|org|xyz|st|top|io|tv|online|site|app|live)\b/i.test(s)) {
      return s;
    }
  }
  return null;
}

/**
 * Extrai a URL completa da lista M3U gravada nas observações do cliente (sincronizada do painel Sigma).
 */
export function extractM3uFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const match = /(?:m3u|lista|link|playlist)\s*:\s*(https?:\/\/[^\s]+)/i.exec(notes);
  if (match) return match[1].trim();
  const directMatch = /(https?:\/\/[^\s"'<>]+\.(?:m3u|m3u8)\b[^\s"'<>]*)/i.exec(notes);
  if (directMatch) return directMatch[1].trim();
  const getMatch = /(https?:\/\/[^\s"'<>]+\/get\.php\?[^\s"'<>]+)/i.exec(notes);
  if (getMatch) return getMatch[1].trim();
  return null;
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

export type AppLinksData = {
  appAndroidApk?: string | null;
  appAndroidDownloaderCode?: string | null;
  appIosLink?: string | null;
  appWindowsLink?: string | null;
  appWebPlayerLink?: string | null;
  appSmartTvText?: string | null;
  appsCustomText?: string | null;
};

export function formatAppsLinksBlock(config?: AppLinksData | null, serverName = "IPTV"): string {
  if (config?.appsCustomText && config.appsCustomText.trim().length > 10) {
    return config.appsCustomText.trim();
  }

  const apk = config?.appAndroidApk?.trim() || "https://bit.ly/app-xciptv-oficial";
  const code = config?.appAndroidDownloaderCode?.trim() || "389471";
  const ios = config?.appIosLink?.trim() || "https://apps.apple.com/app/smarters-player-lite/id1628995509";
  const win = config?.appWindowsLink?.trim() || "https://www.iptvsmarters.com/download?download=windows";
  const web = config?.appWebPlayerLink?.trim() || "http://webtv.iptvsmarters.com";
  const smartTv = config?.appSmartTvText?.trim() || "• Smart TV Samsung / LG: Baixe o app IBO Player, SmartOne IPTV ou Bob Player na loja da sua TV e nos envie o Mac / Device ID.";

  const srv = serverName && !serverName.startsWith("http") ? serverName.toUpperCase() : "IPTV";

  return (
    `📲 *APLICATIVOS OFICIAIS — ${srv}* 🍿\n\n` +
    `🤖 *TV Box / Android TV / FireStick:*\n` +
    `• Abra o app *Downloader* na TV e digite o código: *${code}*\n` +
    `• Ou baixe o APK direto: ${apk}\n\n` +
    `📱 *Celular & Tablet Android:*\n` +
    `• Baixar APK Direto: ${apk}\n\n` +
    `🍏 *iPhone / iPad / Apple TV (iOS):*\n` +
    `• Baixar na App Store (Smarters Player Lite):\n${ios}\n\n` +
    `💻 *Computador & Notebook (Windows):*\n` +
    `• Baixar IPTV Smarters Pro (.exe):\n${win}\n\n` +
    `🌐 *Assistir no Navegador (Web Player):*\n` +
    `• Acesso direto sem instalar nada: ${web}\n\n` +
    `📺 *Smart TV (Samsung, LG e Roku):*\n` +
    `${smartTv}`
  );
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
  m3uUrl?: string | null;
  notes?: string | null;
  appsConfig?: AppLinksData | null;
  includeApps?: boolean;
}): string {
  return formatCredentialsMessage({
    name: params.name,
    serverName: params.serverName,
    serverDns: params.serverUrl,
    username: params.username,
    password: params.password,
    screens: params.screens,
    dueDate: params.dueDate,
    notes: params.notes || (params.m3uUrl ? `M3U: ${params.m3uUrl}` : null),
    businessName: params.businessName,
    appsConfig: params.appsConfig,
    includeApps: params.includeApps,
  });
}

/**
 * Gera a mensagem completa de entrega de credenciais e lista IPTV para WhatsApp.
 */
export function formatCredentialsMessage(params: {
  name?: string | null;
  serverName?: string | null;
  serverDns?: string | null;
  username?: string | null;
  password?: string | null;
  screens?: number | null;
  dueDate?: string | null;
  notes?: string | null;
  businessName?: string | null;
  appLinksText?: string | null;
  appsConfig?: AppLinksData | null;
  includeApps?: boolean;
}): string {
  const directM3u = extractM3uFromNotes(params.notes);
  const cleanDns =
    extractCleanIptvDns(params.serverDns) ||
    (directM3u ? extractCleanIptvDns(directM3u) : "");

  const isRawDomain = (name?: string | null) =>
    !name ||
    name.trim().startsWith("http") ||
    /\.(click|com|net|org|xyz|st|top|io|tv|online|site|app|live)\b/i.test(name);

  const notesServer = extractServerFromNotes(params.notes);
  const candidateServerName =
    (params.serverName?.trim() && !isRawDomain(params.serverName) ? params.serverName.trim() : null) ||
    notesServer ||
    (params.businessName?.trim() && !isRawDomain(params.businessName) ? params.businessName.trim() : null);

  const serverLabel =
    candidateServerName && !isRawDomain(candidateServerName)
      ? candidateServerName
      : "Alpha server IPTV";

  const u = (params.username ?? "").trim();
  const p = (params.password ?? "").trim();
  const m3uUrl = directM3u || generateM3uUrl(cleanDns, u, p, "ts");
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
    `• No IPTV Smarters Pro, XCIPTV ou TiviMate: use a opção *Xtream Codes API* com o Servidor (ou URL), Usuário e Senha.\n` +
    `• Em Smart TVs ou SS IPTV: adicione a *Lista M3U Plus* completa acima.\n\n` +
    `Bom divertimento! 🍿 Qualquer dúvida, estamos à disposição.`;

  if (params.appLinksText) {
    msg += `\n\n━━━━━━━━━━━━━━━━━━━\n${params.appLinksText}`;
  } else if (params.includeApps) {
    const appsBlock = formatAppsLinksBlock(params.appsConfig, serverLabel);
    if (appsBlock) {
      msg += `\n\n━━━━━━━━━━━━━━━━━━━\n${appsBlock}`;
    }
  }

  return msg;
}

/** Variáveis disponíveis nos modelos de mensagem. */
export function buildTemplateVars(input: TemplateVarInput): Record<string, string> {
  const { client, list, settings } = input;
  const directM3u = extractM3uFromNotes(client?.notes);

  // Streaming DNS: direct M3U host é a autoridade máxima de transmissão
  const rawServerUrl =
    (directM3u ? extractCleanIptvDns(directM3u) : "") ||
    settings?.sigma_streaming_dns?.trim() ||
    list?.server_url ||
    "";
  const cleanDns = extractCleanIptvDns(rawServerUrl);

  const isRawDomain = (name?: string | null) =>
    !name ||
    name.trim().startsWith("http") ||
    /\.(click|com|net|org|xyz|st|top|io|tv|online|site|app|live)\b/i.test(name);

  // Nome oficial do servidor (nunca domínio ou URL crua)
  const notesServer = extractServerFromNotes(client?.notes);
  const candidateServerName =
    settings?.sigma_server_name?.trim() ||
    notesServer ||
    list?.name?.trim() ||
    settings?.sigma_server_display_name?.trim();

  const realServerName =
    candidateServerName && !isRawDomain(candidateServerName)
      ? candidateServerName
      : settings?.business_name?.trim() || "Alpha server IPTV";

  const username = client?.iptv_username || list?.username || "";
  const password = client?.iptv_password || list?.password || "";
  const effectiveDns = cleanDns || (directM3u ? extractCleanIptvDns(directM3u) : "");

  const m3u = directM3u || generateM3uUrl(effectiveDns, username, password, "ts");
  const m3uHls = directM3u || generateM3uUrl(effectiveDns, username, password, "m3u8");
  const epg = generateEpgUrl(effectiveDns, username, password);

  const appsBlock = formatAppsLinksBlock(
    (settings as any)?.bot_settings || null,
    realServerName,
  );

  return {
    nome: client?.name ?? "",
    telefone: client?.phone ?? "",
    valor: formatBRL(input.amount ?? 0),
    vencimento: formatDate(input.dueDate ?? null),
    dias: String(Math.abs(input.days ?? 0)),
    lista: list?.name ?? realServerName,
    servidor: realServerName,
    dns: effectiveDns,
    usuario: username,
    senha: password,
    m3u: m3u,
    m3u_hls: m3uHls,
    epg: epg,
    apps: appsBlock,
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
  { key: "servidor", label: "nome oficial do servidor IPTV" },
  { key: "dns", label: "endereço/URL de conexão (Xtream Codes)" },
  { key: "usuario", label: "usuário de acesso" },
  { key: "senha", label: "senha de acesso" },
  { key: "m3u", label: "link completo da lista M3U Plus" },
  { key: "epg", label: "link do guia de programação (EPG)" },
  { key: "apps", label: "links dos aplicativos oficiais (Android, iOS, PC, Downloader, Smart TV)" },
  { key: "telas", label: "quantidade de telas" },
  { key: "empresa", label: "nome do seu negócio" },
  { key: "pix", label: "sua chave PIX" },
  { key: "titular", label: "titular do PIX" },
  { key: "link", label: "link de pagamento" },
];

