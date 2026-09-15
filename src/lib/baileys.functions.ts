import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isTenantEvolutionEnabled,
  tenantConnect,
  tenantCurrentConnectionCode,
  tenantDeleteInstance,
  tenantInstanceName,
  tenantLogout,
  tenantSendText,
  tenantSetWebhook,
  tenantState,
} from "./evolution-tenant.server";

const BAILEYS_API = process.env["BAILEYS_API_URL"] || "http://localhost:3001";
const webhookEnsuredAt = new Map<string, number>();

async function ensureBotWebhook(userId: string) {
  const now = Date.now();
  const last = webhookEnsuredAt.get(userId) || 0;
  if (now - last < 5 * 60_000) return;

  const { botWebhookUrl } = await import("./whatsapp-connection.server");
  await tenantSetWebhook(userId, botWebhookUrl(undefined, userId));
  webhookEnsuredAt.set(userId, now);
}

async function readLocalStatus(instance: string) {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), "data");
    const instFile = path.join(dir, `baileys_status_${instance}.json`);

    if (fs.existsSync(instFile)) {
      return JSON.parse(fs.readFileSync(instFile, "utf8"));
    }
  } catch {}

  return {
    instance,
    status: "close",
    mode: "qr",
    qrCode: null,
    pairingCode: null,
    phone: null,
    userName: null,
    lastError: null,
  };
}

function unavailableState(instance: string, mode: "qr" | "pairing" = "qr") {
  return {
    instance,
    provider: "unconfigured",
    status: "none",
    mode,
    qrCode: null,
    pairingCode: null,
    phone: null,
    userName: null,
    lastError:
      "WhatsApp não configurado: defina EVOLUTION_API_URL + EVOLUTION_API_KEY (VPS) ou BAILEYS_API_URL.",
  };
}

/** Consulta somente a sessão pertencente ao usuário autenticado. */
export const getBaileysStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { instance?: string }) => input)
  .handler(async ({ context }) => {
    const instance = tenantInstanceName(context.userId);

    if (isTenantEvolutionEnabled()) {
      const st = await tenantState(context.userId);
      if (st.state === "open") {
        await ensureBotWebhook(context.userId).catch((error) => {
          console.warn("[WhatsApp] Falha ao garantir webhook do robô:", error);
        });
      }
      const connectionCode = st.state === "connecting" ? await tenantCurrentConnectionCode(context.userId) : null;
      return {
        ok: true as const,
        state: {
          instance,
          provider: "evolution",
          status: st.state,
          mode: "qr",
          qrCode: connectionCode?.base64 ?? null,
          pairingCode: connectionCode?.code ?? null,
          phone: st.number,
          userName: null,
          lastError: null,
        },
      };
    }

    if (!process.env["BAILEYS_API_URL"]) {
      return { ok: false as const, state: unavailableState(instance) };
    }

    try {
      const q = `?instance=${encodeURIComponent(instance)}`;
      const res = await fetch(`${BAILEYS_API}/api/status${q}`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const state = await res.json();
        return { ok: true as const, state: { ...state, instance } };
      }
    } catch {}

    const state = await readLocalStatus(instance);
    return { ok: true as const, state };
  });

/** Cria/conecta exclusivamente a instância do usuário autenticado. */
export const connectBaileys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      instance?: string;
      mode?: "qr" | "pairing";
      phone?: string;
      force?: boolean;
      origin?: string;
      userId?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const instance = tenantInstanceName(context.userId);
    const mode = data?.mode || "qr";

    if (isTenantEvolutionEnabled()) {
      const configuredOrigin = process.env["PUBLIC_APP_URL"]?.trim() || "https://embrace-essence-app.lovable.app";
      if (data?.origin) {
        try {
          const requestedUrl = new URL(data.origin);
          const allowedUrl = new URL(configuredOrigin);
          const requested = requestedUrl.origin;
          const allowed = allowedUrl.origin;
          const lovablePreview =
            requestedUrl.hostname.endsWith(".lovable.app") && allowedUrl.hostname.endsWith(".lovable.app");
          if (requested !== allowed && !lovablePreview) {
            return {
              ok: false as const,
              state: {
                ...unavailableState(instance, mode),
                provider: "evolution",
                lastError: "Conexão bloqueada: use o site oficial configurado em PUBLIC_APP_URL.",
              },
            };
          }
        } catch {
          return {
            ok: false as const,
            state: {
              ...unavailableState(instance, mode),
              provider: "evolution",
              lastError: "Origem inválida para conexão do WhatsApp.",
            },
          };
        }
      }

      const { botWebhookUrl } = await import("./whatsapp-connection.server");
      const res = await tenantConnect(context.userId, botWebhookUrl(data?.origin, context.userId));
      webhookEnsuredAt.set(context.userId, Date.now());
      return {
        ok: true as const,
        state: {
          instance,
          provider: "evolution",
          status: res.state,
          mode,
          qrCode: res.base64,
          pairingCode: res.code,
          phone: null,
          userName: null,
          lastError: null,
        },
      };
    }

    if (!process.env["BAILEYS_API_URL"]) {
      return { ok: false as const, state: unavailableState(instance, mode) };
    }

    try {
      const res = await fetch(`${BAILEYS_API}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance, mode, phone: data?.phone, force: data?.force }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const result = await res.json();
        return { ok: true as const, state: { ...result.state, instance } };
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 600));
    const local = await readLocalStatus(instance);
    return { ok: true as const, state: local };
  });

/** Desconecta apenas a sessão do usuário autenticado. */
export const disconnectBaileys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { instance?: string }) => input)
  .handler(async ({ context }) => {
    const instance = tenantInstanceName(context.userId);

    if (isTenantEvolutionEnabled()) {
      webhookEnsuredAt.delete(context.userId);
      return await tenantLogout(context.userId);
    }

    try {
      await fetch(`${BAILEYS_API}/api/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {}

    return { ok: true as const };
  });

/** Apaga a instância do usuário e gera uma sessão limpa para novo QR. */
export const resetBaileysSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { origin?: string; userId?: string }) => input)
  .handler(async ({ data, context }) => {
    if (!isTenantEvolutionEnabled()) {
      throw new Error("Evolution API não está configurada na VPS.");
    }

    webhookEnsuredAt.delete(context.userId);
    await tenantDeleteInstance(context.userId);
    const { botWebhookUrl } = await import("./whatsapp-connection.server");
    const res = await tenantConnect(context.userId, botWebhookUrl(data?.origin, context.userId));
    webhookEnsuredAt.set(context.userId, Date.now());
    return {
      ok: true as const,
      state: {
        instance: tenantInstanceName(context.userId),
        provider: "evolution",
        status: res.state,
        mode: "qr",
        qrCode: res.base64,
        pairingCode: res.code,
        phone: null,
        userName: null,
        lastError: null,
      },
    };
  });

export const sendBaileysTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      instance?: string;
      to: string;
      text?: string;
      type?: "text" | "buttons" | "list" | "pix_copy";
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const instance = tenantInstanceName(context.userId);

    if (isTenantEvolutionEnabled()) {
      const sent = await tenantSendText(context.userId, data.to, data.text || "Mensagem de teste ✅");
      if (!sent.ok) throw new Error(sent.error || "Falha ao enviar pela Evolution API");
      return { ok: true as const };
    }

    try {
      const res = await fetch(`${BAILEYS_API}/api/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance, to: data.to, text: data.text, type: data.type || "text" }),
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao enviar pelo Baileys");
      }

      return { ok: true as const };
    } catch (error: any) {
      throw new Error(error.message || "Serviço Baileys não respondeu.");
    }
  });