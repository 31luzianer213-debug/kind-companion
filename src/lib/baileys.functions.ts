import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BAILEYS_API = process.env["BAILEYS_API_URL"] || "http://localhost:3001";

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

    // 0. Evolution API (VPS do usuário) tem prioridade quando configurada
    const evo = await import("./evolution-api.server");
    if (evo.isEvolutionEnabled()) {
      const st = await evo.evoState();
      // Enquanto conecta, busca sempre o QR atual. A Evolution troca o código
      // periodicamente e manter o primeiro QR na tela faz o WhatsApp rejeitá-lo.
      const connectionCode =
        st.state === "connecting" ? await evo.evoCurrentConnectionCode() : null;
      return {
        ok: true as const,
        state: {
          instance: evo.evolutionEnv()?.instance || instance,
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

    // Sem Evolution e sem URL externa, localhost só funciona em desenvolvimento.
    if (!process.env["BAILEYS_API_URL"]) {
      return { ok: false as const, state: { instance, provider: "unconfigured", status: "none", mode: "qr", qrCode: null, pairingCode: null, phone: null, userName: null, lastError: "WhatsApp não configurado: defina EVOLUTION_API_URL + EVOLUTION_API_KEY (VPS) ou BAILEYS_API_URL." } };
    }

    // 1. Tenta buscar via API HTTP local do daemon
    try {
      const q = `?instance=${encodeURIComponent(instance)}`;
      const res = await fetch(`${BAILEYS_API}/api/status${q}`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const state = await res.json();
        if (state?.status === "open") return { ok: true as const, state };

        // Se essa instância não está conectada, procura outra sessão ativa
        try {
          const listRes = await fetch(`${BAILEYS_API}/api/sessions`, { signal: AbortSignal.timeout(3000) });
          if (listRes.ok) {
            const list = await listRes.json();
            const open = (list?.sessions ?? []).find((s: any) => s?.status === "open");
            if (open) return { ok: true as const, state: open };
          }
        } catch {}

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
      origin?: string;
      userId?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const instance = data?.instance || "default";

    const evo = await import("./evolution-api.server");
    if (evo.isEvolutionEnabled()) {
      const configuredOrigin =
        process.env["PUBLIC_APP_URL"]?.trim() || "https://embrace-essence-app.lovable.app";
      if (data?.origin) {
        try {
          const requestedUrl = new URL(data.origin);
          const allowedUrl = new URL(configuredOrigin);
          const requested = requestedUrl.origin;
          const allowed = allowedUrl.origin;
          const lovablePreview = requestedUrl.hostname.endsWith(".lovable.app") && allowedUrl.hostname.endsWith(".lovable.app");
          if (requested !== allowed && !lovablePreview) {
            return {
              ok: false as const,
              state: {
                instance,
                provider: "evolution",
                status: "none",
                mode: data?.mode || "qr",
                qrCode: null,
                pairingCode: null,
                phone: null,
                userName: null,
                lastError: "Conexão bloqueada: use o site oficial configurado em PUBLIC_APP_URL.",
              },
            };
          }
        } catch {
          return {
            ok: false as const,
            state: {
              instance,
              provider: "evolution",
              status: "none",
              mode: data?.mode || "qr",
              qrCode: null,
              pairingCode: null,
              phone: null,
              userName: null,
              lastError: "Origem inválida para conexão do WhatsApp.",
            },
          };
        }
      }
      const { botWebhookUrl } = await import("./whatsapp-connection.server");
      const res = await evo.evoConnect(botWebhookUrl(data?.origin, data?.userId));
      return {
        ok: true as const,
        state: {
          instance: evo.evolutionEnv()?.instance || instance,
          provider: "evolution",
          status: res.state,
          mode: data?.mode || "qr",
          qrCode: res.base64,
          pairingCode: res.code,
          phone: null,
          userName: null,
          lastError: null,
        },
      };
    }

    if (!process.env["BAILEYS_API_URL"]) {
      return { ok: false as const, state: { instance, provider: "unconfigured", status: "none", mode: data?.mode || "qr", qrCode: null, pairingCode: null, phone: null, userName: null, lastError: "WhatsApp não configurado: defina EVOLUTION_API_URL + EVOLUTION_API_KEY (VPS) ou BAILEYS_API_URL." } };
    }

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

    const evo = await import("./evolution-api.server");
    if (evo.isEvolutionEnabled()) {
      await evo.evoLogout();
      return { ok: true as const };
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

/**
 * Envia uma mensagem de teste pelo Baileys (Texto, Botões Rápidos, Lista ou PIX).
 */
/**
 * Limpa uma sessão Evolution corrompida (Bad MAC / No matching sessions)
 * e devolve um novo QR Code para pareamento.
 */
export const resetBaileysSession = createServerFn({ method: "POST" })
  .inputValidator((input?: { origin?: string; userId?: string }) => input)
  .handler(async ({ data }) => {
    const evo = await import("./evolution-api.server");
    if (!evo.isEvolutionEnabled()) {
      throw new Error("Evolution API não está configurada na VPS.");
    }
    await evo.evoDeleteInstance();
    const { botWebhookUrl } = await import("./whatsapp-connection.server");
    const res = await evo.evoConnect(botWebhookUrl(data?.origin, data?.userId));
    return {
      ok: true as const,
      state: { provider: "evolution", status: res.state, mode: "qr", qrCode: res.base64, pairingCode: res.code, phone: null, userName: null, lastError: null },
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
  .handler(async ({ data }) => {
    const instance = data.instance || "default";

    const evo = await import("./evolution-api.server");
    if (evo.isEvolutionEnabled()) {
      const sent = await evo.evoSendText(data.to, data.text || "Mensagem de teste ✅");
      if (!sent.ok) throw new Error(sent.error || "Falha ao enviar pela Evolution API");
      return { ok: true as const };
    }

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
