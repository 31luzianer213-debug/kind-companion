/**
 * Adaptador de Compatibilidade — Baileys Nativo.
 * Redireciona todas as chamadas legadas de WhatsApp para o motor Baileys local (porta 3001).
 * Elimina 100% de chamadas para servidores externos da Evolution API.
 */

const BAILEYS_PORT = process.env.BAILEYS_PORT ? Number(process.env.BAILEYS_PORT) : 3001;
const BAILEYS_URL = process.env.BAILEYS_API_URL || `http://127.0.0.1:${BAILEYS_PORT}`;

export const DEFAULT_EVOLUTION_INSTANCE = "baileys_default";

export function instanceNameFor(_userId?: string) {
  return DEFAULT_EVOLUTION_INSTANCE;
}

export function evolutionConfig(_userId?: string) {
  return {
    base: BAILEYS_URL,
    key: "baileys_local_token",
    instance: DEFAULT_EVOLUTION_INSTANCE,
  };
}

/** open | connecting | close | none */
export async function fetchState(_userId?: string): Promise<"open" | "connecting" | "close" | "none"> {
  try {
    const res = await fetch(`${BAILEYS_URL}/api/status`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json();
      const status = data.status || "close";
      return status === "open" ? "open" : status === "connecting" ? "connecting" : "close";
    }
  } catch {}
  return "close";
}

export async function ensureInstanceWebhook(_userId?: string, _publicAppUrl?: string) {
  // Baileys processa mensagens em tempo real via WebSocket
  return { ok: true };
}

export async function setInstanceWebhook(_userId?: string, _webhookUrl?: string) {
  return { ok: true };
}

export async function connectInstance(_userId?: string, _publicAppUrl?: string, _forceNew = false) {
  try {
    const res = await fetch(`${BAILEYS_URL}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "qr" }),
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

export async function deleteInstance(_userId?: string) {
  try {
    await fetch(`${BAILEYS_URL}/api/logout`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
  return { ok: true };
}

export async function restartInstance(_userId?: string) {
  return await connectInstance();
}

export async function logoutInstance(_userId?: string) {
  return await deleteInstance();
}

export async function sendTextMessage(_userId: string, to: string, text: string) {
  const { sendWhatsapp } = await import("./whatsapp.server");
  return await sendWhatsapp(to, text);
}
