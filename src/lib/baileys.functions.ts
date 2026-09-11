import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BAILEYS_API = process.env.BAILEYS_API_URL || "http://localhost:3001";

async function readLocalStatus(instance = "default") {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), "data");
    const instFile = path.join(dir, `baileys_status_${instance}.json`);

    let current: any = null;
    if (fs.existsSync(instFile)) {
      current = JSON.parse(fs.readFileSync(instFile, "utf8"));
    } else {
      const defaultFile = path.join(dir, "baileys_status.json");
      if (fs.existsSync(defaultFile)) {
        current = JSON.parse(fs.readFileSync(defaultFile, "utf8"));
      }
    }

    if (current?.status === "open") return current;

    // Procura qualquer sessão conectada para exibir o número no painel
    try {
      for (const file of fs.readdirSync(dir)) {
        if (!file.startsWith("baileys_status")) continue;
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        if (parsed?.status === "open") return parsed;
      }
    } catch {}

    if (current) return current;
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

/**
 * Consulta o status em tempo real da conexão Baileys de um usuário/instância.
 */
export const getBaileysStatus = createServerFn({ method: "POST" })
  .inputValidator((input?: { instance?: string }) => input)
  .handler(async ({ data }) => {
    const instance = data?.instance || "default";

    // 1. Tenta buscar via API HTTP local do daemon
    try {
      const q = `?instance=${encodeURIComponent(instance)}`;
      const res = await fetch(`${BAILEYS_API}/api/status${q}`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const state = await res.json();
        return { ok: true as const, state };
      }
    } catch {}

    // 2. Fallback: lê arquivo de status compartilhado
    const state = await readLocalStatus(instance);
    return { ok: true as const, state };
  });

/**
 * Inicia a conexão Baileys via QR Code ou Código de Pareamento para a instância do usuário.
 */
export const connectBaileys = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      instance?: string;
      mode?: "qr" | "pairing";
      phone?: string;
      force?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    const instance = data?.instance || "default";
    try {
      const res = await fetch(`${BAILEYS_API}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance,
          mode: data?.mode || "qr",
          phone: data?.phone,
          force: data?.force,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const result = await res.json();
        return { ok: true as const, state: result.state };
      }
    } catch {}

    // Aguarda breve intervalo e lê arquivo de status
    await new Promise((r) => setTimeout(r, 600));
    const local = await readLocalStatus(instance);
    return { ok: true as const, state: local };
  });

/**
 * Desconecta e limpa a sessão Baileys da instância do usuário.
 */
export const disconnectBaileys = createServerFn({ method: "POST" })
  .inputValidator((input?: { instance?: string }) => input)
  .handler(async ({ data }) => {
    const instance = data?.instance || "default";
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

/**
 * Envia uma mensagem de teste pelo Baileys (Texto, Botões Rápidos, Lista ou PIX).
 */
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
  .handler(async ({ data }) => {
    const instance = data.instance || "default";
    try {
      const res = await fetch(`${BAILEYS_API}/api/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance,
          to: data.to,
          text: data.text,
          type: data.type || "text",
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao enviar pelo Baileys");
      }

      return { ok: true as const };
    } catch (e: any) {
      throw new Error(e.message || "Serviço Baileys não respondeu.");
    }
  });
