import { evolutionBaseUrl } from "./evolution-url";
import { phoneVariants } from "./phone";

export type TenantEvoState = "open" | "connecting" | "close" | "none";

function config() {
  const rawUrl = process.env["EVOLUTION_API_URL"] || "";
  const key = process.env["EVOLUTION_API_KEY"] || "";
  if (!rawUrl.trim() || !key.trim()) return null;
  return { base: evolutionBaseUrl(rawUrl), key: key.trim() };
}

export function isTenantEvolutionEnabled() {
  return config() !== null;
}

export function tenantInstanceName(userId: string) {
  const clean = String(userId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!clean) throw new Error("Usuário inválido para a instância do WhatsApp.");
  return `sigma_${clean}`;
}

async function request<T = any>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<{ ok: boolean; status: number; data: T | any }> {
  const env = config();
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

async function listInstances(): Promise<any[]> {
  const res = await request<any[]>("/instance/fetchInstances", { method: "GET" }, 10000);
  const items = Array.isArray(res.data) ? res.data : res.data?.instances || [];
  return Array.isArray(items) ? items : [];
}

function instanceNameOf(item: any) {
  return item?.name || item?.instanceName || item?.instance?.instanceName || "";
}

export async function tenantEnsureInstance(userId: string, webhookUrl?: string) {
  const instance = tenantInstanceName(userId);
  const items = await listInstances();
  const exists = items.some((item) => instanceNameOf(item) === instance);
  if (exists) return { ok: true as const, created: false, instance };

  const body: Record<string, unknown> = {
    instanceName: instance,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };
  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      enabled: true,
      byEvents: false,
      base64: true,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
    };
  }

  const created = await request("/instance/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!created.ok && created.status !== 409) {
    throw new Error(created.data?.message || created.data?.error || "Falha ao criar instância do WhatsApp.");
  }
  return { ok: true as const, created: created.ok, instance };
}

export async function tenantSetWebhook(userId: string, webhookUrl: string) {
  const instance = tenantInstanceName(userId);
  const res = await request(`/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
    }),
  });
  return { ok: res.ok };
}

export async function tenantState(userId: string): Promise<{ state: TenantEvoState; number: string | null; raw: any }> {
  const instance = tenantInstanceName(userId);
  const res = await request(`/instance/connectionState/${encodeURIComponent(instance)}`, { method: "GET" }, 8000);
  if (res.status === 404) return { state: "close", number: null, raw: res.data };
  const state = (res.data?.instance?.state || res.data?.state || "close") as TenantEvoState;

  let number: string | null = null;
  if (state === "open") {
    const items = await listInstances();
    const found = items.find((item) => instanceNameOf(item) === instance);
    const raw = found?.ownerJid || found?.owner || found?.number || found?.instance?.owner || "";
    number = raw ? String(raw).split("@")[0] || null : null;
  }
  return { state, number, raw: res.data };
}

export async function tenantCurrentConnectionCode(userId: string) {
  const instance = tenantInstanceName(userId);
  const res = await request<any>(`/instance/connect/${encodeURIComponent(instance)}`, { method: "GET" }, 10000);
  return {
    base64: (res.data?.base64 || res.data?.qrcode?.base64 || null) as string | null,
    code: (res.data?.pairingCode || res.data?.code || null) as string | null,
  };
}

export async function tenantConnect(userId: string, webhookUrl?: string) {
  const { instance } = await tenantEnsureInstance(userId, webhookUrl);
  if (webhookUrl) await tenantSetWebhook(userId, webhookUrl);

  const current = await tenantState(userId);
  if (current.state === "open") {
    return { instance, state: "open" as TenantEvoState, base64: null, code: null };
  }

  const res = await request(`/instance/connect/${encodeURIComponent(instance)}`, { method: "GET" }, 20000);
  const base64: string | null = res.data?.base64 || res.data?.qrcode?.base64 || null;
  const code: string | null = res.data?.pairingCode || res.data?.code || null;
  return {
    instance,
    state: (base64 || code ? "connecting" : current.state) as TenantEvoState,
    base64,
    code,
  };
}

export async function tenantLogout(userId: string) {
  const instance = tenantInstanceName(userId);
  const res = await request(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" }, 10000);
  return { ok: res.ok || res.status === 404 };
}

export async function tenantDeleteInstance(userId: string) {
  const instance = tenantInstanceName(userId);
  await tenantLogout(userId);
  const res = await request(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" }, 10000);
  return { ok: res.ok || res.status === 404 };
}

function normalizeDestination(raw: string) {
  const value = String(raw || "").trim();
  if (value.endsWith("@s.whatsapp.net")) return value.replace(/@.*$/, "").replace(/\D/g, "");
  if (value.endsWith("@lid")) return "";
  return value.replace(/@.*$/, "").replace(/\D/g, "");
}

async function resolveNumber(instance: string, raw: string) {
  const direct = normalizeDestination(raw);
  if (!direct) return "";
  const candidates = phoneVariants(direct).filter(
    (number) => number.startsWith("55") && number.length >= 12 && number.length <= 13,
  );
  const numbers = Array.from(new Set(candidates.length ? candidates : [direct]));

  for (const candidate of numbers) {
    const lookup = await request<any>(
      `/chat/whatsappNumbers/${encodeURIComponent(instance)}`,
      { method: "POST", body: JSON.stringify({ numbers: [candidate] }) },
      8000,
    );
    if (!lookup.ok) continue;
    const rows = Array.isArray(lookup.data)
      ? lookup.data
      : Array.isArray(lookup.data?.data)
        ? lookup.data.data
        : Array.isArray(lookup.data?.numbers)
          ? lookup.data.numbers
          : [];
    const match = rows.find((row: any) => row?.exists === true);
    const found = String(match?.jid ?? match?.number ?? match?.phone ?? "")
      .replace(/@.*$/, "")
      .replace(/\D/g, "");
    if (found) return found;
  }
  return direct;
}

export async function tenantSendText(instanceOrUserId: string, to: string, text: string, isInstanceName = false) {
  const instance = isInstanceName ? instanceOrUserId : tenantInstanceName(instanceOrUserId);
  const number = await resolveNumber(instance, to);
  if (!number) return { ok: false as const, error: "Número do WhatsApp inválido" };
  const res = await request(`/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  }, 20000);
  if (!res.ok) {
    const detail = res.data?.response?.message || res.data?.message || res.data?.error || `HTTP ${res.status}`;
    return { ok: false as const, error: `Evolution: ${JSON.stringify(detail)}` };
  }
  return { ok: true as const, data: res.data };
}

export async function tenantSendMedia(
  instanceOrUserId: string,
  to: string,
  media: { base64: string; caption?: string; mimetype?: string; fileName?: string },
  isInstanceName = false,
) {
  const instance = isInstanceName ? instanceOrUserId : tenantInstanceName(instanceOrUserId);
  const number = await resolveNumber(instance, to);
  if (!number) return { ok: false as const, error: "Número do WhatsApp inválido" };
  const clean = String(media.base64 || "").replace(/^data:[^;]+;base64,/, "");
  const res = await request(`/message/sendMedia/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      number,
      mediatype: "image",
      mimetype: media.mimetype || "image/png",
      media: clean,
      caption: media.caption || "",
      fileName: media.fileName || "imagem.png",
    }),
  }, 30000);
  if (!res.ok) {
    const detail = res.data?.response?.message || res.data?.message || res.data?.error || `HTTP ${res.status}`;
    return { ok: false as const, error: `Evolution: ${JSON.stringify(detail)}` };
  }
  return { ok: true as const, data: res.data };
}
