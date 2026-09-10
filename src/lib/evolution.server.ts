/** Acesso à Evolution API usando as credenciais do servidor e padrão BOMSABORR. */
import { evolutionBaseUrl } from "./evolution-url";
import { DEFAULT_EVOLUTION_INSTANCE, getInstanceToken, evolutionFetch } from "./evolution.functions";

export function instanceNameFor(userId?: string) {
  const envInst = process.env["EVOLUTION_INSTANCE"]?.trim();
  if (envInst && envInst.length > 3 && !envInst.includes("COLE_A")) {
    return envInst;
  }
  return DEFAULT_EVOLUTION_INSTANCE;
}

export function evolutionConfig(userId?: string, customBase?: string, customKey?: string, customInstance?: string) {
  const envBase = customBase?.trim() || process.env["EVOLUTION_API_URL"]?.trim();
  const base = evolutionBaseUrl(envBase && envBase.length > 0 ? envBase : "https://cobrancas-whatsapp.shop");
  const key =
    customKey?.trim() ||
    process.env["EVOLUTION_API_KEY"]?.trim() ||
    "evolutionApiGlobalTokenSecure2026";
  const instance = customInstance?.trim() || instanceNameFor(userId);
  return { base, key, instance };
}

async function call(
  path: string,
  init: RequestInit & { base: string; key: string },
): Promise<{ status: number; json: any; raw: string }> {
  const { base, key, ...rest } = init;
  const res = await fetch(`${evolutionBaseUrl(base)}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", apikey: key, ...(rest.headers ?? {}) },
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  return { status: res.status, json, raw };
}

/** open | connecting | close | none */
export async function fetchState(userId?: string) {
  const { base, key, instance } = evolutionConfig(userId);
  let token: string | null = null;
  try {
    token = await getInstanceToken(instance);
  } catch {}

  const reqKey = token || key;
  const { status, json } = await call(`/instance/connectionState/${encodeURIComponent(instance)}`, {
    method: "GET",
    base,
    key: reqKey,
  });

  if (status === 404) return "none" as const;
  const state = json?.instance?.state ?? json?.state ?? json?.status ?? "close";
  return (String(state).toLowerCase() === "open" ? "open" : state) as "open" | "connecting" | "close" | "none";
}

function extractQr(json: any) {
  const base64 = json?.qrcode?.base64 ?? json?.base64 ?? null;
  const code = json?.qrcode?.code ?? json?.code ?? json?.pairingCode ?? null;
  return { base64, code };
}

/** Cache de controle para evitar chamadas redundantes de webhook na VPS */
const lastWebhookSync = new Map<string, number>();

/** Garante que o Webhook do Bot está configurado na Evolution API sem sobrecarregar a VPS */
export async function ensureInstanceWebhook(userId: string, publicAppUrl: string) {
  if (!publicAppUrl) return;
  if (
    publicAppUrl.includes("localhost") ||
    publicAppUrl.includes("preview--") ||
    publicAppUrl.includes("127.0.0.1")
  ) {
    return;
  }
  const last = lastWebhookSync.get(userId) ?? 0;
  const now = Date.now();
  // Se configurou há menos de 10 minutos, não precisa reenviar
  if (now - last < 10 * 60 * 1000) return;

  const webhookUrl = `${publicAppUrl.replace(/\/+$/, "")}/api/public/hooks/whatsapp-bot?userId=${userId}`;
  try {
    await setInstanceWebhook(userId, webhookUrl);
    lastWebhookSync.set(userId, now);
  } catch (err) {
    console.warn(`[Evolution Webhook Auto] Falha silenciosa ao sincronizar para ${userId}:`, err);
  }
}

/** Conecta de forma não destrutiva, garantindo que a instância exista e gerando QR Code quando necessário. */
export async function connectInstance(userId?: string, publicAppUrl?: string, forceNew = false) {
  const { base, key, instance } = evolutionConfig(userId);

  let token: string | null = null;
  try {
    token = await getInstanceToken(instance);
  } catch {}

  // Se a instância já estiver aberta e conectada, retorna imediatamente
  const currentState = await fetchState(userId);
  if (currentState === "open" && !forceNew) {
    return { state: "open" as const, qr: null };
  }

  // Busca lista de instâncias para saber se existe
  const list = await evolutionFetch("/instance/fetchInstances", { method: "GET" }).catch(() => null);
  const arr = Array.isArray(list)
    ? list
    : list && typeof list === "object"
      ? ((list as Record<string, unknown>)["instances"] ?? (list as Record<string, unknown>)["data"])
      : null;
  const found = Array.isArray(arr)
    ? (arr.find(
        (item) => item && typeof item === "object" && (item as Record<string, unknown>)["name"] === instance,
      ) as Record<string, unknown> | undefined)
    : undefined;

  if (found) {
    const status = String(found["connectionStatus"] ?? "").toLowerCase();
    if (status === "open" && !forceNew) {
      return { state: "open" as const, qr: null };
    }
    const instToken = (typeof found["token"] === "string" && (found["token"] as string).trim()) ? (found["token"] as string).trim() : token;
    const connected = await call(`/instance/connect/${encodeURIComponent(instance)}`, {
      method: "GET",
      base,
      key: instToken || key,
    });
    const qr = extractQr(connected.json);
    return { state: "connecting" as const, qr };
  }

  // Cria apenas se a instância ainda não existir
  const created = await call(`/instance/create`, {
    method: "POST",
    base,
    key,
    body: JSON.stringify({
      instanceName: instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });

  const qr = extractQr(created.json);
  if (qr.base64) {
    return { state: "connecting" as const, qr };
  }

  // Fallback para connect se qrcode não veio direto no create
  const connected = await call(`/instance/connect/${encodeURIComponent(instance)}`, {
    method: "GET",
    base,
    key,
  });
  return { state: "connecting" as const, qr: extractQr(connected.json) };
}

/** Desconecta e limpa a sessão usando o token correto. */
export async function deleteInstance(userId?: string) {
  const { base, key, instance } = evolutionConfig(userId);
  let token: string | null = null;
  try {
    token = await getInstanceToken(instance);
  } catch {}

  const reqKey = token || key;
  try {
    await call(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE", base, key: reqKey }).catch(() => {});
  } catch {}
  try {
    await call(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE", base, key }).catch(() => {});
  } catch {}
  if (userId) lastWebhookSync.delete(userId);
  return true;
}

export async function logoutInstance(userId?: string) {
  return deleteInstance(userId);
}

/** Configura o webhook da instância diretamente na Evolution API na VPS */
export async function setInstanceWebhook(userId: string, webhookUrl: string) {
  const { base, key, instance } = evolutionConfig(userId);
  let token: string | null = null;
  try {
    token = await getInstanceToken(instance);
  } catch {}

  const payload = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT"],
    },
  };

  const res = await call(`/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    base,
    key: token || key,
    body: JSON.stringify(payload),
  });

  if (res.status === 200 || res.status === 201) {
    return { ok: true, instance, message: "Webhook configurado com sucesso na VPS!" };
  }

  throw new Error(`Evolution API retornou status ${res.status}: ${res.raw.slice(0, 150)}`);
}

/** Consulta o webhook configurado atualmente para a instância na Evolution API */
export async function findInstanceWebhook(userId?: string) {
  const { base, key, instance } = evolutionConfig(userId);
  let token: string | null = null;
  try {
    token = await getInstanceToken(instance);
  } catch {}

  const res = await call(`/webhook/find/${encodeURIComponent(instance)}`, {
    method: "GET",
    base,
    key: token || key,
  });

  if (res.status === 200 && res.json) {
    const wh = res.json?.webhook || res.json;
    return {
      enabled: Boolean(wh?.enabled),
      url: typeof wh?.url === "string" ? wh.url : null,
      events: Array.isArray(wh?.events) ? wh.events : [],
    };
  }

  return { enabled: false, url: null, events: [] };
}

