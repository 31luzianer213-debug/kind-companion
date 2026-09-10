/**
 * Módulo de Conexão WhatsApp — Baileys Nativo.
 * Conecta diretamente ao daemon local Baileys (porta 3001) para envio instantâneo e zero delays.
 * 100% Baileys — ZERO chamadas para Evolution API.
 */

const BAILEYS_PORT = process.env.BAILEYS_PORT ? Number(process.env.BAILEYS_PORT) : 3001;
const BAILEYS_URL = process.env.BAILEYS_API_URL || `http://127.0.0.1:${BAILEYS_PORT}`;

export const DEFAULT_INSTANCE_NAME = "baileys_default";
export type ConnectionState = "open" | "connecting" | "close" | "none" | "unknown";

export type ConnectResult = {
  instance: string;
  created: boolean;
  status: ConnectionState;
  base64: string | null;
  code: string | null;
};

export function setActiveInstanceName(_name: string) {
  // Baileys gerencia uma sessão única e contínua
}

export function getEvolutionConfig() {
  return {
    base: BAILEYS_URL,
    apiKey: "baileys_local_token",
    defaultInstance: DEFAULT_INSTANCE_NAME,
  };
}

export async function evolutionRequest<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${BAILEYS_URL}${path}`;
  const res = await fetch(url, init);
  return (await res.json()) as T;
}

export async function findInstanceToken(_instanceName?: string) {
  return "baileys_token";
}

export async function fetchConnectionState(instanceName?: string): Promise<{
  state: ConnectionState;
  raw: any;
}> {
  try {
    const q = instanceName ? `?instance=${encodeURIComponent(instanceName)}` : "";
    const res = await fetch(`${BAILEYS_URL}/api/status${q}`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const state: ConnectionState = data.status || "close";
      return { state, raw: data };
    }
  } catch {}
  return { state: "close", raw: null };
}

export async function ensureAndConnectInstance(
  instanceName: string,
  mode: "qr" | "pairing" = "qr",
  phone?: string,
): Promise<ConnectResult> {
  try {
    const res = await fetch(`${BAILEYS_URL}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance: instanceName, mode, phone }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const state = data.state || {};
      return {
        instance: instanceName || DEFAULT_INSTANCE_NAME,
        created: true,
        status: state.status || "connecting",
        base64: state.qrCode || null,
        code: state.pairingCode || null,
      };
    }
  } catch {}

  return {
    instance: instanceName || DEFAULT_INSTANCE_NAME,
    created: false,
    status: "close",
    base64: null,
    code: null,
  };
}

export async function ensureWebhookConfigured(_instanceName: string, _webhookUrl: string) {
  return { ok: true };
}

export async function fetchInstanceWebhook(_instanceName: string) {
  return { enabled: true, mode: "baileys_socket" };
}

export function normalizePhone(raw: string) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.endsWith("@lid") || trimmed.endsWith("@s.whatsapp.net") || trimmed.endsWith("@g.us")) {
    return trimmed;
  }
  let digits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length >= 14 && !digits.startsWith("55")) {
    return `${digits}@lid`;
  }
  if (digits.length > 13 && digits.startsWith("55")) digits = digits.slice(-13);
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return digits;
}

export async function sendWhatsAppText(to: string, text: string, instance?: string, _quotedKey?: any) {
  const normalized = normalizePhone(to);
  if (!normalized) {
    return { ok: false as const, error: "Número inválido ou não informado." };
  }

  try {
    const res = await fetch(`${BAILEYS_URL}/api/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: normalized, text, instance }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false as const, error: data.error || "Falha no envio Baileys." };
    }
    return { ok: true as const, data };
  } catch (error: any) {
    return { ok: false as const, error: error?.message || "Falha ao enviar mensagem." };
  }
}

export async function sendWhatsAppButtons(
  to: string,
  options: {
    title?: string;
    description: string;
    buttons: Array<{
      id: string;
      displayText: string;
      type?: "reply" | "copy" | "url" | "call" | "pix";
      copyCode?: string;
      url?: string;
      phoneNumber?: string;
    }>;
    footer?: string;
  },
  instance?: string,
) {
  const normalized = normalizePhone(to);
  if (!normalized) return { ok: false as const, error: "Número inválido." };

  const formattedButtons = options.buttons.map((b) => {
    if (b.type === "copy" || b.copyCode) {
      return {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: b.displayText,
          copy_code: b.copyCode || "",
        }),
      };
    }
    if (b.type === "url" || b.url) {
      return {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: b.displayText,
          url: b.url || "",
        }),
      };
    }
    return {
      buttonId: String(b.id),
      buttonText: { displayText: b.displayText },
      type: 1,
    };
  });

  try {
    const res = await fetch(`${BAILEYS_URL}/api/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalized,
        text: options.description,
        footer: options.footer || "IPTV Bot",
        type: "buttons",
        buttons: formattedButtons,
        instance,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return await sendWhatsAppText(normalized, options.description, instance);
    }
    return { ok: true as const, data };
  } catch {
    return await sendWhatsAppText(normalized, options.description, instance);
  }
}

export async function sendWhatsAppList(
  to: string,
  options: {
    title: string;
    description: string;
    buttonText: string;
    footerText?: string;
    sections: Array<{
      title: string;
      rows: Array<{
        title: string;
        description?: string;
        rowId: string;
      }>;
    }>;
  },
  instance?: string,
) {
  const normalized = normalizePhone(to);
  if (!normalized) return { ok: false as const, error: "Número inválido." };

  try {
    const res = await fetch(`${BAILEYS_URL}/api/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalized,
        title: options.title,
        text: options.description,
        buttonText: options.buttonText,
        footer: options.footerText || "Selecione uma opção",
        type: "list",
        sections: options.sections,
        instance,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return await sendWhatsAppText(normalized, options.description, instance);
    }
    return { ok: true as const, data };
  } catch {
    return await sendWhatsAppText(normalized, options.description, instance);
  }
}

export async function sendWhatsAppMedia(
  to: string,
  mediaOptions: {
    base64: string;
    caption?: string;
    mimetype?: string;
    fileName?: string;
  },
  instance?: string,
) {
  const normalized = normalizePhone(to);
  if (!normalized) return { ok: false as const, error: "Número inválido." };

  try {
    const res = await fetch(`${BAILEYS_URL}/api/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalized,
        text: mediaOptions.caption || "",
        media: {
          base64: mediaOptions.base64,
          mimetype: mediaOptions.mimetype || "image/png",
          caption: mediaOptions.caption || "",
          fileName: mediaOptions.fileName || "qrcode-pix.png",
        },
        instance,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false as const, error: data.error || "Falha no envio de mídia." };
    }
    return { ok: true as const, data };
  } catch (err: any) {
    return { ok: false as const, error: err?.message || "Falha ao enviar mídia." };
  }
}
