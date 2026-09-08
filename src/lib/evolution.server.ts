/** Acesso à Evolution API usando as credenciais globais do servidor. */

export function instanceNameFor(userId: string) {
  return `iptv_${userId.replace(/-/g, "").slice(0, 16)}`;
}

export function evolutionConfig(userId: string) {
  const envBase = process.env["EVOLUTION_API_URL"]?.trim();
  const base = (envBase && envBase.length > 0 ? envBase : "https://cobrancas-whatsapp.shop").replace(/\/+$/, "");
  const key = process.env["EVOLUTION_API_KEY"] ?? "";
  if (!base || !key) {
    throw new Error("Servidor do WhatsApp não configurado.");
  }
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

/** Cria a instância se necessário, já registra o Webhook do Bot automaticamente e devolve o QR Code para leitura. */
export async function connectInstance(userId: string, publicAppUrl?: string) {
  const { base, key, instance } = evolutionConfig(userId);
  const state = await fetchState(userId);

  const webhookUrl = publicAppUrl
    ? `${publicAppUrl.replace(/\/+$/, "")}/api/public/hooks/whatsapp-bot?userId=${userId}`
    : undefined;

  if (state === "open") {
    if (publicAppUrl) {
      ensureInstanceWebhook(userId, publicAppUrl).catch(() => {});
    }
    return { state: "open" as const, qr: null };
  }

  if (state === "none") {
    const createPayload: any = {
      instanceName: instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    };
    if (webhookUrl) {
      createPayload.webhook = webhookUrl;
      createPayload.webhook_by_events = false;
      createPayload.events = ["MESSAGES_UPSERT", "messages.upsert"];
    }

    const created = await call(`/instance/create`, {
      method: "POST",
      base,
      key,
      body: JSON.stringify(createPayload),
    });
    const qr = extractQr(created.json);

    // Registra webhook explicitamente também caso a versão da Evolution exija POST /webhook/set
    if (webhookUrl) {
      setInstanceWebhook(userId, webhookUrl).catch(() => {});
      lastWebhookSync.set(userId, Date.now());
    }

    if (qr.base64) return { state: "connecting" as const, qr };
  }

  const connected = await call(`/instance/connect/${instance}`, { method: "GET", base, key });
  if (connected.status >= 400) {
    throw new Error(`Erro ${connected.status}: ${connected.raw.slice(0, 200)}`);
  }

  if (webhookUrl) {
    setInstanceWebhook(userId, webhookUrl).catch(() => {});
    lastWebhookSync.set(userId, Date.now());
  }

  return { state: "connecting" as const, qr: extractQr(connected.json) };
}

/** Desconecta o número do WhatsApp mantendo a instância criada. */
export async function logoutInstance(userId: string) {
  const { base, key, instance } = evolutionConfig(userId);
  await call(`/instance/logout/${instance}`, { method: "DELETE", base, key });
  lastWebhookSync.delete(userId);
  return true;
}

/** Configura o webhook da instância diretamente na Evolution API na VPS */
export async function setInstanceWebhook(userId: string, webhookUrl: string) {
  const { base, key, instance } = evolutionConfig(userId);

  const bodies = [
    {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "messages.upsert"],
      },
    },
    {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT", "messages.upsert"],
    },
  ];

  let lastStatus = 0;
  let lastRaw = "";

  for (const body of bodies) {
    const res = await call(`/webhook/set/${instance}`, {
      method: "POST",
      base,
      key,
      body: JSON.stringify(body),
    });
    lastStatus = res.status;
    lastRaw = res.raw;
    if (res.status === 200 || res.status === 201) {
      return { ok: true, instance, message: "Webhook configurado com sucesso na VPS!" };
    }
  }

  if (lastStatus >= 400) {
    throw new Error(`Evolution API retornou status ${lastStatus}: ${lastRaw.slice(0, 150)}`);
  }

  return { ok: true, instance };
}

