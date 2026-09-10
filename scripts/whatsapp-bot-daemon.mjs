/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         DAEMON WHATSAPP 24 HORAS — BAILEYS NATIVO            ║
 * ║  Atendimento autônomo ininterrupto direto via Baileys.       ║
 * ║  Suporta QR Code no terminal, botões, listas e reconexão.    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  proto,
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const AUTH_DIR = path.resolve(process.cwd(), "auth_baileys");
const LOCAL_API_URL = process.env.LOCAL_API_URL || "http://localhost:3000/api/public/hooks/whatsapp-bot";

let sock = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 15;
const handledMessageIds = new Set();
const phoneCooldownMap = new Map();

function pruneSet() {
  if (handledMessageIds.size > 2000) {
    const arr = Array.from(handledMessageIds);
    handledMessageIds.clear();
    arr.slice(-1000).forEach((id) => handledMessageIds.add(id));
  }
}

function extractTextAndAction(msg) {
  const m = msg.message || {};
  const nativeParams = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (nativeParams) {
    try {
      const parsed = JSON.parse(nativeParams);
      const actionId = String(parsed.id || parsed.selected_id || parsed.row_id || "").trim();
      if (actionId) return { text: actionId, actionId };
    } catch {}
  }
  if (m.buttonsResponseMessage?.selectedButtonId) {
    const act = String(m.buttonsResponseMessage.selectedButtonId).trim();
    return { text: act, actionId: act };
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    const act = String(m.listResponseMessage.singleSelectReply.selectedRowId).trim();
    return { text: act, actionId: act };
  }
  if (m.templateButtonReplyMessage?.selectedId) {
    const act = String(m.templateButtonReplyMessage.selectedId).trim();
    return { text: act, actionId: act };
  }
  const rawText = String(m.conversation || m.extendedTextMessage?.text || "").trim();
  return { text: rawText, actionId: rawText };
}

async function handleIncomingMessage(msg) {
  if (!msg.message || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us")) return;

  const msgId = msg.key.id;
  if (msgId && handledMessageIds.has(msgId)) return;
  if (msgId) {
    handledMessageIds.add(msgId);
    pruneSet();
  }

  const phone = jid.replace(/@.*$/, "").replace(/\D/g, "");
  const now = Date.now();
  const lastTime = phoneCooldownMap.get(phone) ?? 0;
  if (now - lastTime < 1200) return;
  phoneCooldownMap.set(phone, now);

  const { text, actionId } = extractTextAndAction(msg);
  if (!text) return;

  const pushName = msg.pushName || "Cliente";
  console.log(`[Baileys Daemon] 📩 Mensagem de ${phone} (${pushName}): "${text}" (ação: ${actionId})`);

  // Encaminha para o motor local do servidor HTTP para processar com regras completas
  try {
    const response = await fetch(LOCAL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "baileys_native",
        data: {
          key: msg.key,
          pushName,
          sender: phone,
          message: msg.message,
          body: text,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[Baileys Daemon] ✅ Resposta processada pelo servidor: ${data.action || "ok"}`);
    }
  } catch (err) {
    console.error("[Baileys Daemon] Erro ao comunicar com o servidor local:", err.message);
  }
}

export async function startDaemon() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  console.log("🚀 Iniciando WhatsApp Daemon com Baileys nativo...");
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1015901307],
  }));

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "131.0.0.0"],
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📷 QR Code gerado! Escaneie pelo WhatsApp:");
      try {
        const qrTerminal = await QRCode.toString(qr, { type: "terminal", small: true });
        console.log(qrTerminal);
      } catch {}
    }

    if (connection === "open") {
      console.log("\n🟢 WHATSAPP CONECTADO (Baileys Daemon)!");
      console.log("🤖 Robô de auto-atendimento pronto e respondendo 24 horas!\n");
      reconnectAttempts = 0;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`⚠️ Conexão encerrada (status ${statusCode}). Deslogado: ${loggedOut}`);

      if (loggedOut) {
        console.log("🗑️ Sessão encerrada. Limpando auth...");
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
      } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(reconnectAttempts * 3000, 15000);
        console.log(`🔄 Reconectando daemon em ${delay / 1000}s...`);
        setTimeout(startDaemon, delay);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      await handleIncomingMessage(msg).catch((e) => console.error(e));
    }
  });

  return sock;
}

// Inicia se executado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  startDaemon();
}
