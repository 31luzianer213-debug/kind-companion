/**
 * Compatibilidade — Redirecionado para Baileys Nativo.
 * Mantém as assinaturas para evitar quebras, mas executa 100% via Baileys.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DEFAULT_EVOLUTION_INSTANCE = "baileys_default";

export function getEvolutionConfig() {
  return {
    base: "http://127.0.0.1:3001",
    apiKey: "baileys_token",
    defaultInstance: DEFAULT_EVOLUTION_INSTANCE,
  };
}

export async function evolutionFetch(_path: string) {
  return { ok: true };
}

export const getEvolutionConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { configured: true, defaultInstance: DEFAULT_EVOLUTION_INSTANCE };
  });

export const listEvolutionInstances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return [{ name: DEFAULT_EVOLUTION_INSTANCE, connectionStatus: "open", token: null }];
  });

export const getEvolutionConnectionState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => input)
  .handler(async () => {
    const { getBaileysStatus } = await import("./baileys.functions");
    const st = await getBaileysStatus();
    return { state: st?.state?.status ?? "close" };
  });

export const connectEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => input)
  .handler(async () => {
    const { connectBaileys } = await import("./baileys.functions");
    const res = await connectBaileys({ data: { mode: "qr" } });
    return { base64: res?.state?.qrCode, code: res?.state?.pairingCode };
  });

export const logoutEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => input)
  .handler(async () => {
    const { disconnectBaileys } = await import("./baileys.functions");
    await disconnectBaileys();
    return { ok: true };
  });

export const restartEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => input)
  .handler(async () => {
    const { connectBaileys } = await import("./baileys.functions");
    await connectBaileys({ data: { mode: "qr" } });
    return { ok: true };
  });

export const deleteEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => input)
  .handler(async () => {
    const { disconnectBaileys } = await import("./baileys.functions");
    await disconnectBaileys();
    return { ok: true };
  });

export const updateEvolutionInstanceName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { oldName: string; newName: string }) => input)
  .handler(async () => {
    return { ok: true };
  });

export const createEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => input)
  .handler(async () => {
    return { ok: true };
  });

export const sendEvolutionTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string; number: string; text?: string }) => input)
  .handler(async ({ data }) => {
    const { sendWhatsapp } = await import("./whatsapp.server");
    return await sendWhatsapp(data.number, data.text || "Teste Baileys");
  });

export const ensureAndConnectEvolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { connectBaileys } = await import("./baileys.functions");
    const res = await connectBaileys({ data: { mode: "qr" } });
    return {
      instance: DEFAULT_EVOLUTION_INSTANCE,
      created: true,
      status: res?.state?.status || "connecting",
      base64: res?.state?.qrCode || null,
      code: res?.state?.pairingCode || null,
    };
  });

export const getEvolutionWebhookState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => input)
  .handler(async () => {
    return { enabled: true };
  });

export const setEvolutionWebhookUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string; webhookUrl: string }) => input)
  .handler(async () => {
    return { ok: true };
  });

export const sendEvolutionTestButtons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string; number: string }) => input)
  .handler(async ({ data }) => {
    const { sendBaileysTest } = await import("./baileys.functions");
    return await sendBaileysTest({ data: { to: data.number, type: "buttons" } });
  });

export const sendEvolutionTestList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string; number: string }) => input)
  .handler(async ({ data }) => {
    const { sendBaileysTest } = await import("./baileys.functions");
    return await sendBaileysTest({ data: { to: data.number, type: "list" } });
  });
