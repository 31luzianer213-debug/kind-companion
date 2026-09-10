/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║            MOTOR NATIVO WHATSAPP — BAILEYS V7               ║
 * ║  Conexão direta, QR Code, Código de Pareamento (Pairing)    ║
 * ║  Botões Interativos (Quick Reply, PIX cta_copy, cta_url)    ║
 * ║  Listas Interativas (single_select sections)                ║
 * ║  Atendimento 24h sem dependência de Evolution API           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  proto,
  generateWAMessageFromContent,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import fs from "fs";
import path from "path";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processBotMessage, type BotProcessResult } from "./bot.server";

// Diretório de autenticação persistente do Baileys
const AUTH_DIR = path.resolve(process.cwd(), "auth_baileys");

export type BaileysState = {
  status: "open" | "connecting" | "close";
  qrCodeBase64: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  userName: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  mode: "qr" | "pairing";
  reconnectAttempts: number;
};

// Singleton mantido no globalThis para suportar HMR e persistência entre requisições
declare global {
  // eslint-disable-next-line no-var
  var __baileysSocket: any | undefined;
  // eslint-disable-next-line no-var
  var __baileysState: BaileysState | undefined;
  // eslint-disable-next-line no-var
  var __baileysReconnecting: boolean | undefined;
  // eslint-disable-next-line no-var
  var __baileysHandledIds: Set<string> | undefined;
  // eslint-disable-next-line no-var
  var __baileysPhoneDebounce: Map<string, number> | undefined;
}

if (!globalThis.__baileysState) {
  // Verifica se já existem credenciais salvas
  const hasExistingAuth = fs.existsSync(AUTH_DIR) && fs.existsSync(path.join(AUTH_DIR, "creds.json"));
  globalThis.__baileysState = {
    status: hasExistingAuth ? "connecting" : "close",
    qrCodeBase64: null,
    pairingCode: null,
    phoneNumber: null,
    userName: null,
    lastConnectedAt: null,
    lastError: null,
    mode: "qr",
    reconnectAttempts: 0,
  };
}

if (!globalThis.__baileysHandledIds) {
  globalThis.__baileysHandledIds = new Set<string>();
}
if (!globalThis.__baileysPhoneDebounce) {
  globalThis.__baileysPhoneDebounce = new Map<string, number>();
}

export function getBaileysState(): BaileysState {
  return (
    globalThis.__baileysState ?? {
      status: "close",
      qrCodeBase64: null,
      pairingCode: null,
      phoneNumber: null,
      userName: null,
      lastConnectedAt: null,
      lastError: null,
      mode: "qr",
      reconnectAttempts: 0,
    }
  );
}

export function getBaileysSocket(): any | null {
  return globalThis.__baileysSocket ?? null;
}

/**
 * Resolve o user_id principal do sistema para processamento do bot.
 */
async function resolveMainUserId(): Promise<string> {
  try {
    const { data: firstWs } = await supabaseAdmin
      .from("whatsapp_settings")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    if (firstWs?.user_id) return firstWs.user_id;
  } catch {}

  try {
    const { data: firstProf } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (firstProf?.id) return firstProf.id;
  } catch {}

  return "00000000-0000-0000-0000-000000000000";
}

/**
 * Normaliza número para JID no formato @s.whatsapp.net
 */
export function formatToWhatsappJid(to: string): string {
  const clean = to.trim();
  if (clean.endsWith("@s.whatsapp.net") || clean.endsWith("@lid") || clean.endsWith("@g.us")) {
    return clean;
  }
  let digits = clean.replace(/\D/g, "");
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return `${digits}@s.whatsapp.net`;
}

/**
 * Envia uma mensagem com botões interativos nativos via Baileys NativeFlowMessage.
 * Suporta Quick Reply, CTA Copiar Código (ex: PIX), CTA Abrir Link e Fallback de texto.
 */
export async function sendBaileysInteractiveButtons(
  sock: any,
  jid: string,
  options: {
    bodyText: string;
    title?: string;
    footer?: string;
    buttons: Array<{
      id?: string;
      displayText: string;
      type?: "quick_reply" | "cta_copy" | "cta_url";
      copyCode?: string;
      url?: string;
    }>;
  },
): Promise<boolean> {
  try {
    const formattedButtons = options.buttons.map((btn, index) => {
      const btnId = btn.id || `btn_${index + 1}`;
      if (btn.type === "cta_copy" && btn.copyCode) {
        return {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: btn.displayText,
            copy_code: btn.copyCode,
          }),
        };
      }
      if (btn.type === "cta_url" && btn.url) {
        return {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: btn.displayText,
            url: btn.url,
          }),
        };
      }
      // Padrão: quick_reply
      return {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: btn.displayText,
          id: btnId,
        }),
      };
    });

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: proto.Message.InteractiveMessage.Body.create({
                text: options.bodyText,
              }),
              footer: proto.Message.InteractiveMessage.Footer.create({
                text: options.footer || "IPTV Manager • Auto-Atendimento",
              }),
              header: proto.Message.InteractiveMessage.Header.create({
                title: options.title || "",
                hasMediaAttachment: false,
              }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: formattedButtons,
              }),
            }),
          },
        },
      },
      { userJid: sock.user?.id },
    );

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return true;
  } catch (err: any) {
    console.warn("[Baileys] ⚠️ Falha no envio interativo, aplicando fallback texto:", err.message);
    // Fallback: envia mensagem de texto padrão com os botões descritos
    let fallbackText = options.bodyText;
    if (options.buttons && options.buttons.length > 0) {
      fallbackText += "\n\n🔘 *Opções:*\n" + options.buttons.map((b) => `👉 *${b.id || "•"}* - ${b.displayText}`).join("\n");
    }
    await sock.sendMessage(jid, { text: fallbackText });
    return false;
  }
}

/**
 * Envia uma mensagem de lista interativa nativa via Baileys.
 */
export async function sendBaileysInteractiveList(
  sock: any,
  jid: string,
  options: {
    bodyText: string;
    title?: string;
    footer?: string;
    buttonText?: string;
    sections: Array<{
      title: string;
      rows: Array<{
        rowId: string;
        title: string;
        description?: string;
      }>;
    }>;
  },
): Promise<boolean> {
  try {
    const listSections = options.sections.map((sec) => ({
      title: sec.title,
      rows: sec.rows.map((r) => ({
        id: r.rowId,
        title: r.title,
        description: r.description || "",
      })),
    }));

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: proto.Message.InteractiveMessage.Body.create({
                text: options.bodyText,
              }),
              footer: proto.Message.InteractiveMessage.Footer.create({
                text: options.footer || "IPTV Manager • Auto-Atendimento",
              }),
              header: proto.Message.InteractiveMessage.Header.create({
                title: options.title || "Opções Disponíveis",
                hasMediaAttachment: false,
              }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: [
                  {
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                      title: options.buttonText || "📋 Abrir Lista de Opções",
                      sections: listSections,
                    }),
                  },
                ],
              }),
            }),
          },
        },
      },
      { userJid: sock.user?.id },
    );

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return true;
  } catch (err: any) {
    console.warn("[Baileys] ⚠️ Falha na lista interativa, usando fallback texto:", err.message);
    let fallback = options.bodyText;
    for (const sec of options.sections) {
      fallback += `\n\n📌 *${sec.title}*\n`;
      fallback += sec.rows.map((r) => `👉 *${r.rowId}* - ${r.title}${r.description ? ` (${r.description})` : ""}`).join("\n");
    }
    await sock.sendMessage(jid, { text: fallback });
    return false;
  }
}

/**
 * Envia o resultado completo do bot (texto, botões, listas, QR Code do PIX e mensagens extras).
 */
export async function sendBaileysBotResult(
  sock: any,
  jid: string,
  result: BotProcessResult,
) {
  // 1. Envio Interativo (Botões ou Lista)
  if (result.interactive) {
    if (result.interactive.type === "buttons") {
      const btns = result.interactive.buttons.map((b) => ({
        id: b.id,
        displayText: b.displayText,
        type: (b.type === "url" ? "cta_url" : "quick_reply") as "quick_reply" | "cta_url",
        url: b.url,
      }));

      await sendBaileysInteractiveButtons(sock, jid, {
        bodyText: result.reply,
        title: result.interactive.title,
        footer: result.interactive.footer,
        buttons: btns,
      });
    } else if (result.interactive.type === "list") {
      await sendBaileysInteractiveList(sock, jid, {
        bodyText: result.reply,
        title: result.interactive.title,
        footer: result.interactive.footerText,
        buttonText: result.interactive.buttonText,
        sections: result.interactive.sections,
      });
    }
  } else if (result.reply) {
    // Mensagem simples de texto
    await sock.sendMessage(jid, { text: result.reply });
  }

  // 2. Envio de Mídia / Imagem (ex: QR Code PIX gerado pelo Mercado Pago)
  if (result.media?.base64) {
    try {
      const cleanB64 = result.media.base64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanB64, "base64");
      await sock.sendMessage(jid, {
        image: buffer,
        caption: result.media.caption || "Escaneie o QR Code acima no aplicativo do seu banco para pagar via PIX!",
      });
    } catch (err: any) {
      console.warn("[Baileys] Erro ao enviar imagem do QR Code PIX:", err.message);
    }
  }

  // 3. Envio de Mensagens Extras (ex: código PIX Copia e Cola com botão de cópia nativo)
  if (Array.isArray(result.extraMessages)) {
    for (const extra of result.extraMessages) {
      if (!extra || !extra.trim()) continue;

      const isPixCode = extra.length > 30 && (extra.startsWith("000201") || !extra.includes(" "));
      if (isPixCode) {
        // Envia com botão cta_copy nativo de copiar código PIX!
        try {
          await sendBaileysInteractiveButtons(sock, jid, {
            bodyText: `📋 *Código PIX Copia e Cola:*\n\n\`${extra.trim()}\``,
            footer: "Toque no botão abaixo para copiar",
            buttons: [
              {
                displayText: "📋 Copiar Código PIX",
                type: "cta_copy",
                copyCode: extra.trim(),
              },
            ],
          });
        } catch {
          await sock.sendMessage(jid, { text: extra });
        }
      } else {
        await sock.sendMessage(jid, { text: extra });
      }
    }
  }
}

/**
 * Extrai o texto limpo ou ação (botão / lista) de uma mensagem recebida.
 */
function extractIncomingText(msg: any): { text: string; actionId: string } {
  const m = msg.message || {};

  // 1. Resposta de botão interativo moderno (NativeFlowMessage)
  const nativeParams = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (nativeParams) {
    try {
      const parsed = JSON.parse(nativeParams);
      const actionId = String(parsed.id || parsed.selected_id || parsed.row_id || "").trim();
      if (actionId) return { text: actionId, actionId };
    } catch {}
  }

  // 2. Resposta de botão clássico (quick-reply)
  if (m.buttonsResponseMessage?.selectedButtonId) {
    const act = String(m.buttonsResponseMessage.selectedButtonId).trim();
    return { text: act, actionId: act };
  }

  // 3. Resposta de item selecionado em lista (list message)
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    const act = String(m.listResponseMessage.singleSelectReply.selectedRowId).trim();
    return { text: act, actionId: act };
  }

  // 4. Resposta de botão de template
  if (m.templateButtonReplyMessage?.selectedId) {
    const act = String(m.templateButtonReplyMessage.selectedId).trim();
    return { text: act, actionId: act };
  }

  // 5. Mensagem comum de texto
  const rawText = String(m.conversation || m.extendedTextMessage?.text || "").trim();
  return { text: rawText, actionId: rawText };
}

/**
 * Handler de mensagens recebidas no WhatsApp via Baileys.
 */
async function handleIncomingMessage(sock: any, msg: any) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us")) return;

  const { text: incomingText, actionId } = extractIncomingText(msg);
  if (!incomingText) return;

  const messageId = msg.key.id || "";
  if (messageId && globalThis.__baileysHandledIds?.has(messageId)) {
    return;
  }
  if (messageId) {
    globalThis.__baileysHandledIds?.add(messageId);
    if ((globalThis.__baileysHandledIds?.size ?? 0) > 3000) {
      const arr = Array.from(globalThis.__baileysHandledIds!);
      globalThis.__baileysHandledIds!.clear();
      arr.slice(-1500).forEach((id) => globalThis.__baileysHandledIds!.add(id));
    }
  }

  // Debounce por telefone de 1.2s para evitar múltiplos envios simultâneos
  const phoneDigits = jid.replace(/@.*$/, "").replace(/\D/g, "");
  const now = Date.now();
  const lastTime = globalThis.__baileysPhoneDebounce?.get(phoneDigits) ?? 0;
  if (now - lastTime < 1200) {
    return;
  }
  globalThis.__baileysPhoneDebounce?.set(phoneDigits, now);

  const pushName = msg.pushName || "Cliente";
  console.log(`[Baileys Bot] 📩 Mensagem de ${phoneDigits} (${pushName}): "${incomingText}" (ação: ${actionId || "-"})`);

  try {
    const mainUserId = await resolveMainUserId();
    const botResult = await processBotMessage(supabaseAdmin, mainUserId, {
      phone: phoneDigits,
      text: incomingText,
      pushName,
    });

    if (!botResult.reply && !botResult.interactive) {
      return;
    }

    // Envia resposta interativa diretamente pelo Baileys
    await sendBaileysBotResult(sock, jid, botResult);
    console.log(`[Baileys Bot] ✅ Resposta enviada com sucesso para ${phoneDigits}! (Ação: ${botResult.action})`);

    // Registra log no banco de dados para o painel do revendedor
    try {
      await supabaseAdmin.from("message_logs").insert({
        user_id: mainUserId,
        phone: phoneDigits,
        body: botResult.reply,
        status: "sent",
      });
    } catch {}
  } catch (err: any) {
    console.error("[Baileys Bot] ❌ Erro ao processar mensagem do bot:", err.message);
  }
}

/**
 * Inicializa ou conecta o socket Baileys.
 */
export async function initBaileys(options: {
  mode?: "qr" | "pairing";
  phone?: string;
  forceRestart?: boolean;
} = {}): Promise<BaileysState> {
  const state = getBaileysState();
  const targetMode = options.mode || state.mode || "qr";
  state.mode = targetMode;

  if (globalThis.__baileysSocket && state.status === "open" && !options.forceRestart && !options.phone) {
    return state;
  }

  if (options.forceRestart && globalThis.__baileysSocket) {
    try {
      globalThis.__baileysSocket.end();
    } catch {}
    globalThis.__baileysSocket = undefined;
  }

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  state.status = "connecting";
  state.lastError = null;

  try {
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307] as [number, number, number],
    }));

    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const browserConfig: [string, string, string] =
      targetMode === "pairing"
        ? ["Ubuntu", "Edge", "110.0.1587.56"]
        : ["Ubuntu", "Chrome", "131.0.0.0"];

    const sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: browserConfig,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
    });

    globalThis.__baileysSocket = sock;

    // Se solicitado pareamento por código e o bot não está registrado
    if (targetMode === "pairing" && !sock.authState.creds.registered && options.phone) {
      const cleanPhone = options.phone.replace(/\D/g, "");
      if (cleanPhone.length >= 10) {
        setTimeout(async () => {
          try {
            console.log(`[Baileys] 📱 Solicitando código de pareamento para ${cleanPhone}...`);
            const code = await sock.requestPairingCode(cleanPhone);
            state.pairingCode = code;
            console.log(`[Baileys] 🔑 Código de pareamento gerado: ${code}`);
          } catch (err: any) {
            console.error("[Baileys] ❌ Erro ao gerar código de pareamento:", err.message);
            state.lastError = `Erro ao gerar código: ${err.message}`;
          }
        }, 3000);
      }
    }

    // ── EVENTOS DE CONEXÃO ──
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && state.mode === "qr") {
        try {
          const b64 = await QRCode.toDataURL(qr);
          state.qrCodeBase64 = b64;
          state.status = "connecting";
          console.log("[Baileys] 📷 Novo QR Code gerado pronto para leitura!");
        } catch (qrErr: any) {
          console.error("[Baileys] Erro ao converter QR para base64:", qrErr.message);
        }
      }

      if (connection === "open") {
        state.status = "open";
        state.qrCodeBase64 = null;
        state.pairingCode = null;
        state.lastError = null;
        state.lastConnectedAt = new Date().toISOString();
        state.reconnectAttempts = 0;

        const userJid = sock.user?.id || "";
        state.phoneNumber = userJid.split(":")[0]?.replace(/\D/g, "") || null;
        state.userName = sock.user?.name || "WhatsApp Bot";

        console.log(`[Baileys] 🟢 WHATSAPP CONECTADO COM SUCESSO! Número: ${state.phoneNumber}`);
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(`[Baileys] ⚠️ Conexão encerrada. Código: ${statusCode}, Deslogado: ${loggedOut}`);

        state.status = "close";
        state.qrCodeBase64 = null;
        state.pairingCode = null;

        if (loggedOut) {
          console.log("[Baileys] 🗑️ Sessão deslogada pelo WhatsApp. Limpando credenciais locais...");
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch {}
          globalThis.__baileysSocket = undefined;
        } else {
          // Reconexão automática resiliente
          if (state.reconnectAttempts < 8) {
            state.reconnectAttempts++;
            const delay = Math.min(state.reconnectAttempts * 3000, 15000);
            console.log(`[Baileys] 🔄 Reconectando automaticamente em ${delay / 1000}s (tentativa ${state.reconnectAttempts})...`);
            setTimeout(() => {
              initBaileys({ mode: state.mode }).catch(() => {});
            }, delay);
          }
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        try {
          await handleIncomingMessage(sock, msg);
        } catch (e: any) {
          console.error("[Baileys] Erro no handler de mensagem:", e.message);
        }
      }
    });

    return state;
  } catch (error: any) {
    console.error("[Baileys] ❌ Erro ao inicializar socket:", error.message);
    state.status = "close";
    state.lastError = error.message;
    return state;
  }
}

/**
 * Envia uma mensagem simples de texto para qualquer número via Baileys.
 */
export async function sendBaileysText(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const sock = getBaileysSocket();
  const state = getBaileysState();

  if (!sock || state.status !== "open") {
    return { ok: false, error: "WhatsApp não está conectado via Baileys no momento." };
  }

  try {
    const jid = formatToWhatsappJid(to);
    await sock.sendMessage(jid, { text });
    return { ok: true };
  } catch (err: any) {
    console.error("[Baileys] Erro ao enviar mensagem de texto:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Desconecta e apaga a sessão do Baileys.
 */
export async function logoutBaileys(): Promise<boolean> {
  const sock = getBaileysSocket();
  if (sock) {
    try {
      await sock.logout();
    } catch {
      try {
        sock.end();
      } catch {}
    }
  }
  globalThis.__baileysSocket = undefined;

  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch {}

  const state = getBaileysState();
  state.status = "close";
  state.qrCodeBase64 = null;
  state.pairingCode = null;
  state.phoneNumber = null;
  state.userName = null;
  state.lastError = null;

  return true;
}
