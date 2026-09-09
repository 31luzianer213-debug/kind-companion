/** Acesso à Evolution API usando as credenciais globais do servidor. */

export function instanceNameFor(userId: string) {
  return `iptv_${userId.replace(/-/g, "").slice(0, 16)}`;
}

export function evolutionConfig(userId: string, customBase?: string, customKey?: string) {
  const envBase = customBase?.trim() || process.env["EVOLUTION_API_URL"]?.trim();
  const base = (envBase && envBase.length > 0 ? envBase : "https://cobrancas-whatsapp.shop").replace(/\/+$/, "");
  const key =
    customKey?.trim() ||
    process.env["EVOLUTION_API_KEY"]?.trim() ||
    "evolutionApiGlobalTokenSecure2026";
  return { base, key, instance: instanceNameFor(userId) };
}

async function call(
  path: string,
  init: RequestInit & { base: string; key: string },
): Promise<{ status: number; json: any; raw: string }> {
  const { base, key, ...rest } = init;
  const res = await fetch(`${base}${path}`, {
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
export async function fetchState(userId: string) {
  const { base, key, instance } = evolutionConfig(userId);
  const { status, json } = await call(`/instance/connectionState/${instance}`, {
    method: "GET",
    base,
    key,
  });
  if (status === 404) return "none" as const;
  const state = json?.instance?.state ?? json?.state ?? "close";
  return state as "open" | "connecting" | "close";
}

function extractQr(json: any) {
  const base64 = json?.qrcode?.base64 ?? json?.base64 ?? null;
  const code = json?.qrcode?.code ?? json?.code ?? null;
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

/** Cria uma instância 100% nova do zero e devolve o QR Code limpo para leitura. */
export async function connectInstance(userId: string, publicAppUrl?: string, forceNew = true) {
  const { base, key, instance } = evolutionConfig(userId);

  // Se forceNew for true (padrão ao clicar para gerar QR Code), remove qualquer resquício ou instância anterior
  if (forceNew) {
    try {
      await call(`/instance/logout/${instance}`, { method: "DELETE", base, key }).catch(() => {});
    } catch {}
    try {
      await call(`/instance/delete/${instance}`, { method: "DELETE", base, key }).catch(() => {});
    } catch {}
  } else {
    const state = await fetchState(userId);
    if (state === "open") {
      return { state: "open" as const, qr: null };
    }
  }

  // Cria a instância 100% nova do zero
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

  // Configura opções recomendadas na instância nova
  try {
    await call(`/settings/set/${instance}`, {
      method: "POST",
      base,
      key,
      body: JSON.stringify({
        rejectCall: false,
        msgCall: "",
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: true,
        readStatus: false,
        syncFullHistory: false,
      }),
    });
  } catch {}

  const qr = extractQr(created.json);
  if (qr.base64) {
    return { state: "connecting" as const, qr };
  }

  // Fallback para connect se qrcode não veio direto no create
  const connected = await call(`/instance/connect/${instance}`, { method: "GET", base, key });
  return { state: "connecting" as const, qr: extractQr(connected.json) };
}

/** Remove completamente a instância da VPS (desconecta e deleta sessões, caches e histórico). */
export async function deleteInstance(userId: string) {
  const { base, key, instance } = evolutionConfig(userId);
  try {
    await call(`/instance/logout/${instance}`, { method: "DELETE", base, key }).catch(() => {});
  } catch {}
  try {
    await call(`/instance/delete/${instance}`, { method: "DELETE", base, key }).catch(() => {});
  } catch {}
  lastWebhookSync.delete(userId);
  return true;
}

export async function logoutInstance(userId: string) {
  return deleteInstance(userId);
}

/** Configura o webhook da instância diretamente na Evolution API na VPS */
export async function setInstanceWebhook(userId: string, webhookUrl: string) {
  const { base, key, instance } = evolutionConfig(userId);

  const payload = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT"],
    },
  };

  const res = await call(`/webhook/set/${instance}`, {
    method: "POST",
    base,
    key,
    body: JSON.stringify(payload),
  });

  if (res.status === 200 || res.status === 201) {
    return { ok: true, instance, message: "Webhook configurado com sucesso na VPS!" };
  }

  throw new Error(`Evolution API retornou status ${res.status}: ${res.raw.slice(0, 150)}`);
}

