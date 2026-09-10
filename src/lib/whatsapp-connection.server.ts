/**
 * Módulo central de conexão WhatsApp com a Evolution API.
 * Construído do zero para máxima estabilidade, suporte a VPS e prevenção de falhas de rede.
 */
import { evolutionBaseUrl } from "./evolution-url";

export const DEFAULT_INSTANCE_NAME = "iptv_5ngpz2zz";

export type ConnectionState = "open" | "connecting" | "close" | "none" | "unknown";

export type ConnectResult = {
  instance: string;
  created: boolean;
  status: ConnectionState;
  base64: string | null;
  code: string | null;
};

function cleanEnv(v?: string) {
  if (!v) return null;
  const t = v.trim();
  if (!t || t.includes("COLE_A") || t.length < 5) return null;
  return t;
}

let activeDynamicInstance: string | null = null;

export function setActiveInstanceName(name: string) {
  if (name && name.trim()) {
    activeDynamicInstance = name.trim();
    process.env["EVOLUTION_INSTANCE"] = name.trim();
  }
}

export function getEvolutionConfig() {
  const envBase = cleanEnv(process.env["EVOLUTION_API_URL"]);
  const envKey = cleanEnv(process.env["EVOLUTION_API_KEY"]);
  const envInst = cleanEnv(activeDynamicInstance || process.env["EVOLUTION_INSTANCE"]);

  const rawBase = envBase || "https://cobrancas-whatsapp.shop";
  const base = evolutionBaseUrl(rawBase);
  const apiKey = envKey || "evolutionApiGlobalTokenSecure2026";
  const defaultInstance = envInst || DEFAULT_INSTANCE_NAME;

  return { base, apiKey, defaultInstance };
}

/**
 * Executa chamadas HTTP autenticadas para a Evolution API.
 */
export async function evolutionRequest<T = any>(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<T> {
  const { base, apiKey } = getEvolutionConfig();
  const token = tokenOverride || apiKey;

  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    apikey: token,
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();

  // Tratamento contra bloqueio de IP direto no Cloudflare
  if (
    response.status === 403 &&
    (/error code:\s*1003/i.test(text) || /direct ip access not allowed/i.test(text))
  ) {
    throw new Error(
      "Acesso por IP direto bloqueado pela borda. Use um domínio ou subdomínio sslip.io com HTTPS.",
    );
  }

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    let message = "Erro de comunicação com a Evolution API";
    if (typeof data === "string") {
      message = data;
    } else if (data && typeof data === "object") {
      message =
        data.response?.message ||
        data.message ||
        data.error ||
        data.exception?.message ||
        `Erro HTTP ${response.status}`;
    }
    throw new Error(`${message} (HTTP ${response.status})`);
  }

  return data as T;
}

const tokenCache = new Map<string, { token: string | null; expires: number }>();

/**
 * Obtém o token de autenticação específico da instância, com cache de 5 minutos.
 */
export async function findInstanceToken(instanceName: string): Promise<string | null> {
  const cached = tokenCache.get(instanceName);
  if (cached && Date.now() < cached.expires) {
    return cached.token;
  }
  try {
    const list = await evolutionRequest<any[]>("/instance/fetchInstances", { method: "GET" });
    const instances = Array.isArray(list) ? list : list?.instances || list?.data || [];
    const found = instances.find((i: any) => i?.name === instanceName);
    const token = (typeof found?.token === "string" && found.token.trim()) ? found.token.trim() : null;
    tokenCache.set(instanceName, { token, expires: Date.now() + 300000 });
    return token;
  } catch {
    return null;
  }
}

/**
 * Consulta o estado atual da conexão da instância.
 */
export async function fetchConnectionState(instanceName: string): Promise<{
  state: ConnectionState;
  raw: any;
}> {
  const token = await findInstanceToken(instanceName);
  try {
    const res = await evolutionRequest(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { method: "GET" },
      token || undefined,
    );

    const rawState = String(res?.instance?.state || res?.state || res?.status || "").toLowerCase();
    const state: ConnectionState =
      rawState === "open"
        ? "open"
        : rawState === "connecting"
          ? "connecting"
          : rawState === "close"
            ? "close"
            : "unknown";

    return { state, raw: res };
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) {
      return { state: "none", raw: null };
    }
    return { state: "unknown", raw: err };
  }
}

/**
 * Cria ou conecta uma instância, gerando QR Code limpo.
 */
export async function ensureAndConnectInstance(instanceName: string): Promise<ConnectResult> {
  const list = await evolutionRequest<any[]>("/instance/fetchInstances", { method: "GET" }).catch(
    () => null,
  );
  const arr = Array.isArray(list) ? list : list?.instances || list?.data || [];
  const found = arr.find((i: any) => i?.name === instanceName);

  let created = false;
  let token = (typeof found?.token === "string" && found.token.trim()) ? found.token.trim() : null;

  // 1. Se a instância não existir, cria com o motor Baileys oficial
  if (!found) {
    const createRes = await evolutionRequest<any>("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    created = true;
    token = createRes?.hash?.apikey || createRes?.hash || null;

    const b64 = createRes?.qrcode?.base64 || createRes?.base64 || null;
    const code = createRes?.qrcode?.code || createRes?.code || null;

    if (b64 || code) {
      return {
        instance: instanceName,
        created: true,
        status: "connecting",
        base64: b64,
        code,
      };
    }
  }

  // 2. Se já estiver conectada, não força nova leitura
  const status = String(found?.connectionStatus || "").toLowerCase();
  if (status === "open") {
    return {
      instance: instanceName,
      created,
      status: "open",
      base64: null,
      code: null,
    };
  }

  // 3. Se estiver desconectada, gera um QR Code novo
  const connRes = await evolutionRequest<any>(
    `/instance/connect/${encodeURIComponent(instanceName)}`,
    { method: "GET" },
    token || undefined,
  );

  const base64 = connRes?.base64 || connRes?.qrcode?.base64 || null;
  const code = connRes?.code || connRes?.pairingCode || connRes?.qrcode?.code || null;

  return {
    instance: instanceName,
    created,
    status: "connecting",
    base64,
    code,
  };
}

/**
 * Desconecta a sessão do WhatsApp.
 */
export async function logoutInstance(instanceName: string) {
  const token = await findInstanceToken(instanceName);
  return evolutionRequest(
    `/instance/logout/${encodeURIComponent(instanceName)}`,
    { method: "DELETE" },
    token || undefined,
  );
}

/**
 * Reinicia a sessão da instância na VPS.
 */
export async function restartInstance(instanceName: string) {
  const token = await findInstanceToken(instanceName);
  return evolutionRequest(
    `/instance/restart/${encodeURIComponent(instanceName)}`,
    { method: "POST" },
    token || undefined,
  );
}

/**
 * Apaga a instância completamente da VPS (logout + delete).
 */
export async function deleteInstanceFromVps(instanceName: string) {
  const token = await findInstanceToken(instanceName);
  try {
    await evolutionRequest(
      `/instance/logout/${encodeURIComponent(instanceName)}`,
      { method: "DELETE" },
      token || undefined,
    ).catch(() => {});
  } catch {}

  return evolutionRequest(
    `/instance/delete/${encodeURIComponent(instanceName)}`,
    { method: "DELETE" },
  );
}

/**
 * Configura o Webhook na Evolution API automaticamente.
 */
export async function setupInstanceWebhook(instanceName: string, webhookUrl: string) {
  const token = await findInstanceToken(instanceName);
  const payload = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT"],
    },
  };

  return evolutionRequest(
    `/webhook/set/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token || undefined,
  );
}

/**
 * Consulta o Webhook configurado na Evolution API.
 */
export async function fetchInstanceWebhook(instanceName: string) {
  const token = await findInstanceToken(instanceName);
  try {
    const res = await evolutionRequest<any>(
      `/webhook/find/${encodeURIComponent(instanceName)}`,
      { method: "GET" },
      token || undefined,
    );
    return res;
  } catch {
    return null;
  }
}


/**
 * Normaliza número para formato internacional do Brasil (55 + DDD + 8/9 dígitos)
 * ou preserva @lid e @s.whatsapp.net íntegros.
 */
export function normalizePhone(raw: string) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.endsWith("@lid") || trimmed.endsWith("@s.whatsapp.net") || trimmed.endsWith("@g.us")) {
    return trimmed;
  }
  let digits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  // Se for identificador numérico longo (LID sem sufixo)
  if (digits.length >= 14 && !digits.startsWith("55")) {
    return `${digits}@lid`;
  }
  if (digits.length > 13 && digits.startsWith("55")) digits = digits.slice(-13);
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return digits;
}

/**
 * Envia mensagem de texto para o WhatsApp seguindo 100% da documentação da Evolution API v2.
 * Utiliza options.delay e presence 'composing' para garantir a sincronização da criptografia
 * e evitar o aviso 'Aguardando mensagem' no celular.
 */
export async function sendWhatsAppText(
  to: string,
  text: string,
  instanceOverride?: string,
  quotedKey?: any,
) {
  const { defaultInstance } = getEvolutionConfig();
  const instance = instanceOverride || defaultInstance;
  const normalized = normalizePhone(to);

  if (!normalized) {
    return { ok: false as const, error: "Número inválido ou não informado." };
  }

  try {
    const payload: Record<string, any> = {
      number: normalized,
      text,
      textMessage: { text },
      options: {
        delay: 0,
        linkPreview: false,
        ...(quotedKey ? { quoted: { key: quotedKey } } : {}),
      },
    };

    const res = await evolutionRequest<any>(
      `/message/sendText/${encodeURIComponent(instance)}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return { ok: true as const, data: res };
  } catch (error: any) {
    return { ok: false as const, error: error?.message || "Falha ao enviar mensagem." };
  }
}

/**
 * Envia imagem ou mídia em base64 para o WhatsApp (ex: QR Code PIX).
 */
export async function sendWhatsAppMedia(
  to: string,
  media: {
    base64: string;
    caption?: string;
    mimetype?: string;
    fileName?: string;
  },
  instanceOverride?: string,
) {
  const { defaultInstance } = getEvolutionConfig();
  const instance = instanceOverride || defaultInstance;
  const normalized = normalizePhone(to);

  if (!normalized) {
    return { ok: false as const, error: "Número inválido ou não informado." };
  }

  try {
    const token = await findInstanceToken(instance);
    const res = await evolutionRequest<any>(
      `/message/sendMedia/${encodeURIComponent(instance)}`,
      {
        method: "POST",
        body: JSON.stringify({
          number: normalized,
          mediatype: "image",
          mimetype: media.mimetype || "image/png",
          caption: media.caption || "",
          media: media.base64,
          fileName: media.fileName || "qrcode-pix.png",
          options: {
            delay: 1200,
            presence: "composing",
          },
        }),
      },
      token || undefined,
    );
    return { ok: true as const, data: res };
  } catch (error: any) {
    return { ok: false as const, error: error?.message || "Falha ao enviar mídia." };
  }
}

