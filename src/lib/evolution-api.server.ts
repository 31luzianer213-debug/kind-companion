/**
 * Integração com a Evolution API hospedada na VPS do usuário.
 * Ativa automaticamente quando EVOLUTION_API_URL e EVOLUTION_API_KEY estão configurados.
 * Caso contrário, o sistema continua usando o motor Baileys local.
 */
import { evolutionBaseUrl } from "./evolution-url";

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

/** Garante que a instância exista no servidor Evolution. */
export async function evoEnsureInstance(webhookUrl?: string) {
  const env = evolutionEnv();
  if (!env) return { ok: false, created: false };

  const list = await evoRequest<any[]>(`/instance/fetchInstances`, { method: "GET" }, 10000);
  const items = Array.isArray(list.data) ? list.data : list.data?.instances || [];
  const exists = items.some((i: any) => {
    const name = i?.name || i?.instanceName || i?.instance?.instanceName;
    return name === env.instance;
  });

  if (exists) return { ok: true, created: false };

  const body: Record<string, unknown> = {
    instanceName: env.instance,
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
  const payload = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
    },
  };
  const res = await evoRequest(`/webhook/set/${encodeURIComponent(env.instance)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ok: res.ok };
}

export type EvoState = "open" | "connecting" | "close" | "none";

export async function evoState(): Promise<{ state: EvoState; number: string | null; raw: any }> {
  const env = evolutionEnv();
  if (!env) return { state: "none", number: null, raw: null };
  const res = await evoRequest(`/instance/connectionState/${encodeURIComponent(env.instance)}`, { method: "GET" }, 8000);
  const state = (res.data?.instance?.state || res.data?.state || "close") as EvoState;

  let number: string | null = null;
  if (state === "open") {
    const list = await evoRequest<any[]>(`/instance/fetchInstances`, { method: "GET" }, 8000);
    const items = Array.isArray(list.data) ? list.data : list.data?.instances || [];
    const found = items.find((i: any) => (i?.name || i?.instanceName || i?.instance?.instanceName) === env.instance);
    const raw = found?.ownerJid || found?.owner || found?.number || found?.instance?.owner || "";
    number = raw ? String(raw).split("@")[0] || null : null;
  }
  return { state, number, raw: res.data };
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

  const res = await evoRequest(`/instance/connect/${encodeURIComponent(env.instance)}`, { method: "GET" }, 20000);
  const base64: string | null = res.data?.base64 || res.data?.qrcode?.base64 || null;
  const code: string | null = res.data?.pairingCode || res.data?.code || null;
  return { state: (base64 || code ? "connecting" : current.state) as EvoState, base64, code };
}

export async function evoLogout() {
  const env = evolutionEnv();
  if (!env) return { ok: false };
  const res = await evoRequest(`/instance/logout/${encodeURIComponent(env.instance)}`, { method: "DELETE" }, 10000);
  return { ok: res.ok };
}

export async function evoDeleteInstance() {
  const env = evolutionEnv();
  if (!env) return { ok: false };
  await evoLogout();
  const res = await evoRequest(`/instance/delete/${encodeURIComponent(env.instance)}`, { method: "DELETE" }, 10000);
  return { ok: res.ok };
}

function toNumber(jidOrPhone: string) {
  const value = String(jidOrPhone || "").trim();
  if (value.includes("@")) return value;
  return value.replace(/\D/g, "");
}

export async function evoSendText(to: string, text: string) {
  const env = evolutionEnv();
  if (!env) return { ok: false as const, error: "Evolution API não configurada" };
  const res = await evoRequest(
    `/message/sendText/${encodeURIComponent(env.instance)}`,
    { method: "POST", body: JSON.stringify({ number: toNumber(to), text }) },
    20000,
  );
  if (!res.ok) {
    const detail = res.data?.response?.message || res.data?.message || res.data?.error || `HTTP ${res.status}`;
    return { ok: false as const, error: `Evolution: ${JSON.stringify(detail)}` };
  }
  return { ok: true as const, data: res.data };
}

export async function evoSendMedia(
  to: string,
  media: { base64: string; caption?: string; mimetype?: string; fileName?: string },
) {
  const env = evolutionEnv();
  if (!env) return { ok: false as const, error: "Evolution API não configurada" };
  const clean = String(media.base64 || "").replace(/^data:[^;]+;base64,/, "");
  const res = await evoRequest(
    `/message/sendMedia/${encodeURIComponent(env.instance)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: toNumber(to),
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
    `/message/sendButtons/${encodeURIComponent(env.instance)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: toNumber(to),
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
  const res = await evoRequest(
    `/message/sendList/${encodeURIComponent(env.instance)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: toNumber(to),
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
