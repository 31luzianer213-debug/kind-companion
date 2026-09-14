/**
 * Integração com a Evolution API hospedada na VPS do usuário.
 * Ativa automaticamente quando EVOLUTION_API_URL e EVOLUTION_API_KEY estão configurados.
 * Caso contrário, o sistema continua usando o motor Baileys local.
 */
import { evolutionBaseUrl } from "./evolution-url";
import { phoneVariants } from "./phone";

export function evolutionEnv() {
  const rawUrl = process.env["EVOLUTION_API_URL"] || "";
  const key = process.env["EVOLUTION_API_KEY"] || "";
  const instance = (process.env["EVOLUTION_INSTANCE"] || "iptv_cobrancas").trim();
  if (!rawUrl.trim() || !key.trim()) return null;
  return { base: evolutionBaseUrl(rawUrl), key: key.trim(), instance };
}

export function isEvolutionEnabled() {
  return evolutionEnv() !== null;
}

async function evoRequest<T = any>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<{ ok: boolean; status: number; data: T | any }> {
  const env = evolutionEnv();
  if (!env) return { ok: false, status: 0, data: { error: "Evolution API não configurada" } };
  try {
    const res = await fetch(`${env.base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: env.key,
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (error: any) {
    return { ok: false, status: 0, data: { error: error?.message || "Falha de rede na Evolution API" } };
  }
}

let cachedInstance: string | null = null;
let cachedAt = 0;

async function listInstances(): Promise<any[]> {
  const res = await evoRequest<any[]>(`/instance/fetchInstances`, { method: "GET" }, 10000);
  const items = Array.isArray(res.data) ? res.data : res.data?.instances || [];
  return Array.isArray(items) ? items : [];
}

function instanceNameOf(item: any) {
  return item?.name || item?.instanceName || item?.instance?.instanceName || "";
}

/**
 * Usa exclusivamente a instância definida em EVOLUTION_INSTANCE.
 * Nunca seleciona automaticamente uma sessão antiga: isso evita que preview,
 * produção ou instalações anteriores disputem chaves Signal e webhooks.
 */
export async function resolveInstance(force = false): Promise<string> {
  const env = evolutionEnv();
  if (!env) return "";
  if (!force && cachedInstance && Date.now() - cachedAt < 60000) return cachedInstance;

  cachedInstance = env.instance;
  cachedAt = Date.now();
  return env.instance;
}

/** Garante que a instância exista no servidor Evolution. */
export async function evoEnsureInstance(webhookUrl?: string) {
  const env = evolutionEnv();
  if (!env) return { ok: false, created: false };

  const instance = await resolveInstance(true);
  const items = await listInstances();
  const exists = items.some((i: any) => instanceNameOf(i) === instance);

  if (exists) return { ok: true, created: false };

  const body: Record<string, unknown> = {
    instanceName: instance,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };
  if (webhookUrl) {
    body["webhook"] = {
      url: webhookUrl,
      enabled: true,
      byEvents: false,
      base64: true,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
    };
  }
  const created = await evoRequest(`/instance/create`, { method: "POST", body: JSON.stringify(body) });
  return { ok: created.ok, created: created.ok };
}

export async function evoSetWebhook(webhookUrl: string) {
  const env = evolutionEnv();
  if (!env) return { ok: false };
  const instance = await resolveInstance();
  const payload = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
    },
  };
  const res = await evoRequest(`/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ok: res.ok };
}

export type EvoState = "open" | "connecting" | "close" | "none";

export async function evoState(): Promise<{ state: EvoState; number: string | null; raw: any }> {
  const env = evolutionEnv();
  if (!env) return { state: "none", number: null, raw: null };
  const instance = await resolveInstance();
  const res = await evoRequest(`/instance/connectionState/${encodeURIComponent(instance)}`, { method: "GET" }, 8000);
  const state = (res.data?.instance?.state || res.data?.state || "close") as EvoState;

  let number: string | null = null;
  if (state === "open") {
    const items = await listInstances();
    const found = items.find((i: any) => instanceNameOf(i) === instance);
    const raw = found?.ownerJid || found?.owner || found?.number || found?.instance?.owner || "";
    number = raw ? String(raw).split("@")[0] || null : null;
  }
  return { state, number, raw: res.data };
}

/** Retorna o QR/código atualmente válido sem alterar webhook ou instância. */
export async function evoCurrentConnectionCode() {
  const env = evolutionEnv();
  if (!env) return { base64: null as string | null, code: null as string | null, count: null as number | null };
  const instance = await resolveInstance();
  const res = await evoRequest<any>(`/instance/connect/${encodeURIComponent(instance)}`, { method: "GET" }, 10000);
  return {
    base64: (res.data?.base64 || res.data?.qrcode?.base64 || null) as string | null,
    code: (res.data?.pairingCode || res.data?.code || null) as string | null,
    count: typeof res.data?.count === "number" ? res.data.count : null,
  };
}

export async function evoConnect(webhookUrl?: string) {
  const env = evolutionEnv();
  if (!env) return { state: "close" as EvoState, base64: null, code: null };

  await evoEnsureInstance(webhookUrl);
  if (webhookUrl) await evoSetWebhook(webhookUrl);

  const current = await evoState();
  if (current.state === "open") {
    return { state: "open" as EvoState, base64: null, code: null };
  }

  const instance = await resolveInstance();
  const res = await evoRequest(`/instance/connect/${encodeURIComponent(instance)}`, { method: "GET" }, 20000);
  const base64: string | null = res.data?.base64 || res.data?.qrcode?.base64 || null;
  const code: string | null = res.data?.pairingCode || res.data?.code || null;
  return { state: (base64 || code ? "connecting" : current.state) as EvoState, base64, code };
}

export async function evoLogout() {
  const env = evolutionEnv();
  if (!env) return { ok: false };
  const instance = await resolveInstance();
  const res = await evoRequest(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" }, 10000);
  return { ok: res.ok };
}

export async function evoDeleteInstance() {
  const env = evolutionEnv();
  if (!env) return { ok: false };
  await evoLogout();
  const instance = await resolveInstance(true);
  const res = await evoRequest(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" }, 10000);
  return { ok: res.ok };
}

function toNumber(jidOrPhone: string) {
  const value = String(jidOrPhone || "").trim();
  if (value.includes("@")) return value;
  return value.replace(/\D/g, "");
}

const resolvedNumberCache = new Map<string, { number: string; expiresAt: number }>();

function lookupRows(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.numbers)) return data.numbers;
  return [];
}

function lookupDestination(row: any): string {
  const value = String(row?.jid ?? row?.number ?? row?.phone ?? "").trim();
  if (value.endsWith("@lid")) return value;
  return value.replace(/@.*$/, "").replace(/\D/g, "");
}

/**
 * Confirma no próprio WhatsApp qual JID existe antes do envio. No Brasil, a
 * mesma conta pode chegar no webhook com o nono dígito e estar registrada sem
 * ele (ou vice-versa). Enviar ao número recebido sem esta consulta pode gerar
 * HTTP 200 na Evolution sem a mensagem aparecer no celular.
 */
async function resolveWhatsAppNumber(raw: string): Promise<string> {
  const destination = toNumber(raw);

  // Ao responder um webhook, o JID já foi resolvido pelo próprio WhatsApp.
  // Revalidá-lo em whatsappNumbers pode retornar verify=[] e perder a resposta,
  // especialmente em números brasileiros com/sem o nono dígito.
  if (destination.endsWith("@lid")) {
    return "";
  }
  if (destination.endsWith("@s.whatsapp.net")) {
    const digits = destination.replace(/@.*$/, "").replace(/\D/g, "");
    return digits || "";
  }

  const isLid = destination.endsWith("@lid");
  const original = isLid ? destination : destination.replace(/@.*$/, "");
  if (!original) return "";

  const cached = resolvedNumberCache.get(original);
  if (cached && cached.expiresAt > Date.now()) return cached.number;

  const candidates = isLid
    ? [original]
    : phoneVariants(original).filter(
        (number) => number.startsWith("55") && number.length >= 12 && number.length <= 13,
      );
  const numbers = Array.from(new Set(candidates.length ? candidates : [original]));
  const instance = await resolveInstance();

  // A Evolution pode responder 400 para o lote inteiro quando apenas uma
  // variação brasileira não existe. Consulte uma por vez para que um número
  // com o nono dígito incorreto nunca esconda a variação realmente registrada.
  let resolved = "";
  for (const candidate of numbers) {
    const lookup = await evoRequest<any>(
      `/chat/whatsappNumbers/${encodeURIComponent(instance)}`,
      { method: "POST", body: JSON.stringify({ numbers: [candidate] }) },
      8000,
    );
    if (!lookup.ok) continue;

    const match = lookupRows(lookup.data).find((row: any) => row?.exists === true);
    const found = lookupDestination(match);
    if (found) {
      resolved = found;
      break;
    }
  }

  if (!resolved) return "";

  for (const candidate of numbers) {
    resolvedNumberCache.set(candidate, { number: resolved, expiresAt: Date.now() + 10 * 60_000 });
  }
  return resolved;
}

export async function evoSendText(to: string, text: string) {
  const env = evolutionEnv();
  if (!env) return { ok: false as const, error: "Evolution API não configurada" };
  const number = await resolveWhatsAppNumber(to);
  if (!number) return { ok: false as const, error: "Número do WhatsApp inválido" };
  const res = await evoRequest(
    `/message/sendText/${encodeURIComponent(await resolveInstance())}`,
    { method: "POST", body: JSON.stringify({ number, text }) },
    20000,
  );
  if (!res.ok) {
    const detail = res.data?.response?.message || res.data?.message || res.data?.error || `HTTP ${res.status}`;
    return { ok: false as const, error: `Evolution: ${JSON.stringify(detail)}` };
  }
  const messageId =
    res.data?.key?.id ??
    res.data?.message?.key?.id ??
    res.data?.data?.key?.id ??
    res.data?.id;
  if (!messageId) {
    return { ok: false as const, error: "Evolution aceitou a chamada, mas não confirmou a criação da mensagem" };
  }
  return { ok: true as const, data: res.data };
}

export async function evoSendMedia(
  to: string,
  media: { base64: string; caption?: string; mimetype?: string; fileName?: string },
) {
  const env = evolutionEnv();
  if (!env) return { ok: false as const, error: "Evolution API não configurada" };
  const number = await resolveWhatsAppNumber(to);
  if (!number) return { ok: false as const, error: "Número do WhatsApp inválido" };
  const clean = String(media.base64 || "").replace(/^data:[^;]+;base64,/, "");
  const res = await evoRequest(
    `/message/sendMedia/${encodeURIComponent(await resolveInstance())}`,
    {
      method: "POST",
      body: JSON.stringify({
        number,
        mediatype: "image",
        mimetype: media.mimetype || "image/png",
        media: clean,
        caption: media.caption || "",
        fileName: media.fileName || "imagem.png",
      }),
    },
    30000,
  );
  if (!res.ok) {
    const detail = res.data?.response?.message || res.data?.message || res.data?.error || `HTTP ${res.status}`;
    return { ok: false as const, error: `Evolution: ${JSON.stringify(detail)}` };
  }
  return { ok: true as const, data: res.data };
}

export async function evoSendButtons(
  to: string,
  options: {
    title?: string;
    description: string;
    footer?: string;
    buttons: Array<{ id: string; displayText: string; type?: string; copyCode?: string; url?: string }>;
  },
) {
  const env = evolutionEnv();
  if (!env) return { ok: false as const, error: "Evolution API não configurada" };
  const number = await resolveWhatsAppNumber(to);
  if (!number) return { ok: false as const, error: "Número do WhatsApp inválido" };

  const buttons = options.buttons.slice(0, 3).map((b) => {
    if (b.copyCode || b.type === "copy") {
      return { type: "copy", displayText: b.displayText, copyCode: b.copyCode || "" };
    }
    if (b.url || b.type === "url") {
      return { type: "url", displayText: b.displayText, url: b.url || "" };
    }
    return { type: "reply", displayText: b.displayText, id: String(b.id) };
  });

  const res = await evoRequest(
    `/message/sendButtons/${encodeURIComponent(await resolveInstance())}`,
    {
      method: "POST",
      body: JSON.stringify({
        number,
        title: options.title || "",
        description: options.description,
        footer: options.footer || "",
        buttons,
      }),
    },
    20000,
  );
  if (!res.ok) return await evoSendText(to, options.description);
  return { ok: true as const, data: res.data };
}

export async function evoSendList(
  to: string,
  options: {
    title: string;
    description: string;
    buttonText: string;
    footerText?: string;
    sections: Array<{ title: string; rows: Array<{ title: string; description?: string; rowId: string }> }>;
  },
) {
  const env = evolutionEnv();
  if (!env) return { ok: false as const, error: "Evolution API não configurada" };
  const number = await resolveWhatsAppNumber(to);
  if (!number) return { ok: false as const, error: "Número do WhatsApp inválido" };
  const res = await evoRequest(
    `/message/sendList/${encodeURIComponent(await resolveInstance())}`,
    {
      method: "POST",
      body: JSON.stringify({
        number,
        title: options.title,
        description: options.description,
        buttonText: options.buttonText,
        footerText: options.footerText || "",
        sections: options.sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            title: r.title,
            description: r.description || "",
            rowId: r.rowId,
          })),
        })),
      }),
    },
    20000,
  );
  if (!res.ok) return await evoSendText(to, options.description);
  return { ok: true as const, data: res.data };
}

/**
 * Busca as mensagens mais recentes diretamente do banco da Evolution.
 * Usado pelo polling, que garante resposta mesmo se o webhook não chegar.
 */
export async function evoFetchRecentMessages(limit = 30): Promise<any[]> {
  const env = evolutionEnv();
  if (!env) return [];
  const instance = await resolveInstance();
  const res = await evoRequest(
    `/chat/findMessages/${encodeURIComponent(instance)}`,
    { method: "POST", body: JSON.stringify({ where: {}, limit }) },
    20000,
  );
  if (!res.ok) return [];
  const records =
    res.data?.messages?.records ??
    res.data?.records ??
    (Array.isArray(res.data) ? res.data : []);
  return Array.isArray(records) ? records : [];
}
