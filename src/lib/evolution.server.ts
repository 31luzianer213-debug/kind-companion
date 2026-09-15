/**
 * Adaptador de compatibilidade do WhatsApp.
 * Quando a Evolution está configurada, cada usuário opera sua própria instância.
 */

const BAILEYS_PORT = process.env.BAILEYS_PORT ? Number(process.env.BAILEYS_PORT) : 3001;
const BAILEYS_URL = process.env.BAILEYS_API_URL || `http://127.0.0.1:${BAILEYS_PORT}`;

import {
  isTenantEvolutionEnabled,
  tenantConnect,
  tenantInstanceName,
  tenantLogout,
  tenantSetWebhook,
  tenantState,
} from "./evolution-tenant.server";

export const DEFAULT_EVOLUTION_INSTANCE = "baileys_default";

export function instanceNameFor(userId?: string) {
  return userId ? tenantInstanceName(userId) : DEFAULT_EVOLUTION_INSTANCE;
}

export function evolutionConfig(userId?: string) {
  return {
    base: BAILEYS_URL,
    key: "baileys_local_token",
    instance: instanceNameFor(userId),
  };
}

/** open | connecting | close | none */
export async function fetchState(userId?: string): Promise<"open" | "connecting" | "close" | "none"> {
  if (isTenantEvolutionEnabled() && userId) {
    return (await tenantState(userId)).state;
  }
  try {
    const instance = instanceNameFor(userId);
    const res = await fetch(`${BAILEYS_URL}/api/status?instance=${encodeURIComponent(instance)}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = await res.json();
      const status = data.status || "close";
      return status === "open" ? "open" : status === "connecting" ? "connecting" : "close";
    }
  } catch {}
  return "close";
}

export async function ensureInstanceWebhook(userId?: string, publicAppUrl?: string) {
  if (isTenantEvolutionEnabled() && userId) {
    const { botWebhookUrl } = await import("./whatsapp-connection.server");
    return await tenantSetWebhook(userId, botWebhookUrl(publicAppUrl, userId));
  }
  return { ok: true };
}

export async function setInstanceWebhook(userId?: string, webhookUrl?: string) {
  if (isTenantEvolutionEnabled() && userId && webhookUrl) {
    return await tenantSetWebhook(userId, webhookUrl);
  }
  return { ok: true };
}

export async function connectInstance(userId?: string, publicAppUrl?: string, _forceNew = false) {
  if (isTenantEvolutionEnabled() && userId) {
    const { botWebhookUrl } = await import("./whatsapp-connection.server");
    const res = await tenantConnect(userId, botWebhookUrl(publicAppUrl, userId));
    return { state: res.state, base64: res.base64, code: res.code };
  }

  const instance = instanceNameFor(userId);
  try {
    const res = await fetch(`${BAILEYS_URL}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance, mode: "qr" }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const st = data.state || {};
      return {
        state: st.status || "connecting",
        base64: st.qrCode || null,
        code: st.pairingCode || null,
      };
    }
  } catch {}
  return { state: "close", base64: null, code: null };
}

export async function deleteInstance(userId?: string) {
  if (isTenantEvolutionEnabled() && userId) {
    await tenantLogout(userId);
    return { ok: true };
  }

  const instance = instanceNameFor(userId);
  try {
    await fetch(`${BAILEYS_URL}/api/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
  return { ok: true };
}

export async function restartInstance(userId?: string) {
  return await connectInstance(userId);
}

export async function logoutInstance(userId?: string) {
  return await deleteInstance(userId);
}

export async function sendTextMessage(userId: string, to: string, text: string) {
  const { sendWhatsapp } = await import("./whatsapp.server");
  return await sendWhatsapp(to, text, instanceNameFor(userId));
}
