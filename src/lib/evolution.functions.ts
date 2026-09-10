import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evolutionBaseUrl } from "./evolution-url";

export const DEFAULT_EVOLUTION_INSTANCE = "iptv_ccd7362726074f97";

function isPlaceholder(v: string | undefined) {
  if (!v) return true;
  const t = v.trim();
  if (!t) return true;
  if (t.includes("COLE_A")) return true;
  if (t === "COLE_A_AUTHENTICATION_API_KEY_AQUI") return true;
  if (t.length < 5) return true;
  return false;
}

export function getEvolutionConfig() {
  const envBase = process.env["EVOLUTION_API_URL"];
  const envKey = process.env["EVOLUTION_API_KEY"];
  const envInst = process.env["EVOLUTION_INSTANCE"];
  const base = isPlaceholder(envBase) ? "https://cobrancas-whatsapp.shop" : envBase?.trim() ?? "https://cobrancas-whatsapp.shop";
  const apiKey = isPlaceholder(envKey) ? "evolutionApiGlobalTokenSecure2026" : envKey?.trim() ?? "evolutionApiGlobalTokenSecure2026";
  const defaultInstance = isPlaceholder(envInst) ? DEFAULT_EVOLUTION_INSTANCE : envInst?.trim() ?? DEFAULT_EVOLUTION_INSTANCE;
  return { base, apiKey, defaultInstance };
}

export async function evolutionFetch(path: string, init: RequestInit = {}, apiKeyOverride?: string) {
  const { base, apiKey } = getEvolutionConfig();
  const requestKey = apiKeyOverride ?? apiKey;
  if (!base || !requestKey) {
    throw new Error(
      "Evolution API não configurada no servidor. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY.",
    );
  }
  const url = `${evolutionBaseUrl(base)}${path}`;
  const headers: Record<string, string> = { apikey: requestKey };
  if (init.body) headers["Content-Type"] = "application/json";
  const custom = (init.headers as Record<string, string> | undefined) ?? {};
  Object.assign(headers, custom);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();

  // Em produção (site publicado) o servidor não consegue chamar um IP direto:
  // a rede de borda devolve "error code: 1003 / Direct IP access not allowed".
  if (
    res.status === 403 &&
    (/error code:\s*1003/i.test(text) || /direct ip access not allowed/i.test(text))
  ) {
    throw new Error(
      "O site publicado não consegue falar com o servidor do WhatsApp porque ele está sendo acessado por número de IP. " +
        "Aponte um domínio (ex: api.seusite.com) para o servidor, com https, e atualize o endereço nas configurações. " +
        "No preview funciona, no site publicado não.",
    );
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    // Evolution retorna erros em formatos variados: {message, error, response:{message}, status, exception:{message}}
    let msg: string | null = null;
    if (typeof data === "string") msg = data;
    else if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const resp = d["response"] as Record<string, unknown> | undefined;
      const exc = d["exception"] as Record<string, unknown> | undefined;
      msg =
        (typeof resp?.["message"] === "string" ? resp["message"] : null) ||
        (typeof d["message"] === "string" ? d["message"] : null) ||
        (typeof d["error"] === "string" ? d["error"] : null) ||
        (typeof exc?.["message"] === "string" ? exc["message"] : null) ||
        (typeof d["status"] === "string" ? d["status"] : null) ||
        null;
      if (!msg && d["status"] !== undefined) msg = `Erro ${String(d["status"])}`;
      if (!msg) {
        try {
          const s = JSON.stringify(d);
          msg = s.length > 500 ? s.slice(0, 500) + "..." : s;
        } catch {
          msg = null;
        }
      }
    }
    msg = msg || `Evolution API falhou [${res.status}]`;
    throw new Error(`${msg} (HTTP ${res.status})`);
  }
  return data;
}

export async function getInstanceToken(instanceName: string) {
  const data = await evolutionFetch("/instance/fetchInstances", { method: "GET" });
  const instances = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((data as Record<string, unknown>)["instances"] ?? (data as Record<string, unknown>)["data"])
      : null;
  if (!Array.isArray(instances)) {
    throw new Error("A Evolution não retornou a lista de instâncias.");
  }
  const instance = instances.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>)["name"] === instanceName;
  }) as Record<string, unknown> | undefined;
  const token = instance?.["token"];
  if (typeof token !== "string" || !token.trim()) {
    return null;
  }
  return token.trim();
}

export type EvolutionInstance = {
  id: string;
  name: string;
  connectionStatus: string;
  ownerJid: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  integration: string;
  token: string | null;
  disconnectionReasonCode: number | null;
  disconnectionAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { Message: number; Contact: number; Chat: number };
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const getEvolutionConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { base, apiKey, defaultInstance } = getEvolutionConfig();
    return { configured: Boolean(base && apiKey), base: base ?? null, defaultInstance, hasApiKey: Boolean(apiKey) };
  });

export const listEvolutionInstances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const data = await evolutionFetch("/instance/fetchInstances", { method: "GET" });
    if (Array.isArray(data)) {
      return (data as EvolutionInstance[]).map((instance) => ({ ...instance, token: null }));
    }
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (Array.isArray(d["instances"])) {
        return (d["instances"] as EvolutionInstance[]).map((instance) => ({ ...instance, token: null }));
      }
      if (Array.isArray(d["data"])) {
        return (d["data"] as EvolutionInstance[]).map((instance) => ({ ...instance, token: null }));
      }
    }
    return [];
  });

export const getEvolutionConnectionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { fetchConnectionState } = await import("./whatsapp-connection.server");
    const res = await fetchConnectionState(data.instance);
    return {
      state: res.state,
      status: res.state,
      ...(res.raw && typeof res.raw === "object" ? res.raw : {}),
    } as Record<string, JsonValue>;
  });

export const connectEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { ensureAndConnectInstance } = await import("./whatsapp-connection.server");
    const res = await ensureAndConnectInstance(data.instance);
    return { base64: res.base64, code: res.code, raw: res as unknown as Record<string, JsonValue> };
  });

export const logoutEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { logoutInstance } = await import("./whatsapp-connection.server");
    await logoutInstance(data.instance);
    return { ok: true, deleted: false } as unknown as JsonValue;
  });

export const restartEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { restartInstance } = await import("./whatsapp-connection.server");
    return (await restartInstance(data.instance)) as JsonValue;
  });

export const deleteEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instance: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { deleteInstanceFromVps } = await import("./whatsapp-connection.server");
    return (await deleteInstanceFromVps(data.instance)) as JsonValue;
  });


export const createEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        instance: z
          .string()
          .min(3)
          .max(40)
          .regex(/^[a-z0-9_-]+$/, "Use apenas letras minúsculas, números, _ e -"),
        qrcode: z.boolean().optional().default(true),
        integration: z.string().optional().default("WHATSAPP-BAILEYS"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const payload: Record<string, unknown> = {
      instanceName: data.instance,
      qrcode: data.qrcode ?? true,
      integration: data.integration ?? "WHATSAPP-BAILEYS",
    };
    try {
      return (await evolutionFetch("/instance/create", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as Record<string, JsonValue>;
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (/1003/i.test(raw) || /400/i.test(raw)) {
        try {
          const retryPayload = { ...payload, token: `${data.instance}_${Date.now().toString(36)}` };
          return (await evolutionFetch("/instance/create", {
            method: "POST",
            body: JSON.stringify(retryPayload),
          })) as Record<string, JsonValue>;
        } catch (e2) {
          const raw2 = e2 instanceof Error ? e2.message : String(e2);
          const detail = raw2 !== raw ? `${raw} | retry: ${raw2}` : raw;
          if (/1003|already exists|exists/i.test(detail)) {
            throw new Error(
              `Não deu para criar "${data.instance}": limite atingido ou nome já existe. Use a padrão "${DEFAULT_EVOLUTION_INSTANCE}" e clique em Gerar QR Code. Detalhe: ${detail}`,
            );
          }
          if (/403|Forbidden/i.test(detail)) {
            throw new Error(
              `Evolution bloqueou a criação (403). Use a instância padrão "${DEFAULT_EVOLUTION_INSTANCE}" já conectada. Detalhe: ${detail}`,
            );
          }
          throw new Error(detail);
        }
      }
      if (/1003/i.test(raw) || /already exists/i.test(raw) || /exists/i.test(raw)) {
        throw new Error(
          `Nome "${data.instance}" já existe ou criação bloqueada. Use a instância padrão "${DEFAULT_EVOLUTION_INSTANCE}". Detalhe: ${raw}`,
        );
      }
      if (/403|Forbidden/i.test(raw)) {
        throw new Error(
          `Evolution bloqueou a criação (403). Use a instância padrão "${DEFAULT_EVOLUTION_INSTANCE}" já conectada. Detalhe: ${raw}`,
        );
      }
      throw new Error(raw);
    }
  });

export const sendEvolutionTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        instance: z.string().min(1),
        number: z.string().min(10).max(25),
        text: z.string().min(1).max(2000).default("Teste WhatsApp — conectado com sucesso!"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { sendWhatsAppText, normalizePhone } = await import("./whatsapp-connection.server");
    const res = await sendWhatsAppText(data.number, data.text, data.instance);
    if (!res.ok) {
      throw new Error(res.error);
    }
    const normalized = normalizePhone(data.number);
    try {
      if (context.userId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("message_logs").insert({
          user_id: context.userId,
          phone: normalized,
          body: data.text,
          status: "sent",
        });
      }
    } catch {}

    return (res.data ?? { ok: true }) as Record<string, JsonValue>;
  });

export const ensureAndConnectEvolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { ensureAndConnectInstance, getEvolutionConfig } = await import("./whatsapp-connection.server");
    const { defaultInstance } = getEvolutionConfig();
    return await ensureAndConnectInstance(defaultInstance);
  });

