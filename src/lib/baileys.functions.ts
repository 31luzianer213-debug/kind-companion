import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BAILEYS_API = process.env.BAILEYS_API_URL || "http://localhost:3001";

async function readLocalStatus() {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const statusFile = path.resolve(process.cwd(), "data", "baileys_status.json");
    if (fs.existsSync(statusFile)) {
      const data = fs.readFileSync(statusFile, "utf8");
      return JSON.parse(data);
    }
  } catch {}
  return {
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
 * Consulta o status em tempo real da conexão Baileys nativa.
 */
export const getBaileysStatus = createServerFn({ method: "POST" })
  .handler(async () => {
    // 1. Tenta buscar via API HTTP local do daemon
    try {
      const res = await fetch(`${BAILEYS_API}/api/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const state = await res.json();
        return { ok: true as const, state };
      }
    } catch {}

    // 2. Fallback: lê arquivo de status compartilhado
    const state = await readLocalStatus();
    return { ok: true as const, state };
  });

/**
 * Inicia a conexão Baileys via QR Code ou Código de Pareamento.
 */
export const connectBaileys = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      mode?: "qr" | "pairing";
      phone?: string;
      force?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${BAILEYS_API}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    const local = await readLocalStatus();
    return { ok: true as const, state: local };
  });

/**
 * Desconecta e limpa a sessão Baileys.
 */
export const disconnectBaileys = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      await fetch(`${BAILEYS_API}/api/logout`, {
        method: "POST",
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
      to: string;
      text?: string;
      type?: "text" | "buttons" | "list" | "pix_copy";
    }) => input,
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${BAILEYS_API}/api/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
