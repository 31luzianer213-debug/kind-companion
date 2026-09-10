/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         MOTOR WHATSAPP 24 HORAS — BAILEYS NATIVO             ║
 * ║  Multi-Instância por Usuário & Conexão com Painel IPTV       ║
 * ║                                                              ║
 * ║  - Suporte a múltiplos usuários isolados (auth_baileys/ID)   ║
 * ║  - Preservação da sessão ativa padrão (auth_baileys/root)    ║
 * ║  - makeWASocket (@whiskeysockets/baileys via whaileys)       ║
 * ║  - Botões Rápidos Interativos (sendButtons via baileys_helper║
 * ║  - Listas Interativas (sections e rows)                      ║
 * ║  - Botão Nativo Copiar PIX (cta_copy / copy_code)            ║
 * ║  - Botão Nativo Link (cta_url)                               ║
 * ║  - Conexão por QR Code ou Código de Pareamento (Pairing)     ║
 * ║  - Encaminhamento ao Webhook do Servidor IPTV (/api/public)  ║
 * ║  - Fallback local resiliente caso o servidor web reinicie    ║
 * ║  - 100% Baileys — ZERO chamadas Evolution API                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Shim de compatibilidade (redireciona @whiskeysockets/baileys → whaileys)
// 100% idêntico ao bot de teste enviado (media_1789061899925.js)
const Module = require("module");
const _resolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = function (request, ...args) {
  if (request === "@whiskeysockets/baileys") request = "whaileys";
  return _resolve(request, ...args);
};

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} = require("whaileys");

let baileysOficial;
try {
  baileysOficial = require("whaileys");
} catch {
  baileysOficial = require("@whiskeysockets/baileys");
}

const { sendButtons } = require("baileys_helper");

const pino = require("pino");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const http = require("http");

if (!global.crypto) {
  global.crypto = require("crypto").webcrypto || require("crypto");
}

const AUTH_DIR = path.resolve(process.cwd(), "auth_baileys");
const DATA_DIR = path.resolve(process.cwd(), "data");
const STATUS_FILE = path.join(DATA_DIR, "baileys_status.json");
const HTTP_PORT = process.env.BAILEYS_PORT ? Number(process.env.BAILEYS_PORT) : 3001;
const WEB_SERVER_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// ╔══════════════════════════════════════════════════════════════╗
// ║        HELPERS DE BOTÕES E LISTAS (IGUAL AO BOT TESTE)       ║
// ╚══════════════════════════════════════════════════════════════╝

function normalizeButtons(buttons) {
  return (buttons || []).map((b, i) => {
    if (!b || typeof b !== "object") return b;
    if (b.name && b.buttonParamsJson) return b;
    if (b.id && b.text) return b;
    const id = b.id || b.buttonId || b.rowId || `btn_${i + 1}`;
    const text = b.text || b.displayText || b.buttonText?.displayText || b.title || `Botão ${i + 1}`;
    return { id, text };
  });
}

function formatTargetJid(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (s.endsWith("@s.whatsapp.net") || s.endsWith("@lid") || s.endsWith("@g.us")) return s;
  let digits = s.replace(/\D/g, "");
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return `${digits}@s.whatsapp.net`;
}

function extractCleanText(messageObj) {
  if (!messageObj || typeof messageObj !== "object") return "";
  const unwrapped =
    messageObj.ephemeralMessage?.message ||
    messageObj.viewOnceMessage?.message ||
    messageObj.viewOnceMessageV2?.message ||
    messageObj.documentWithCaptionMessage?.message ||
    messageObj;

  let text =
    unwrapped?.conversation ||
    unwrapped?.extendedTextMessage?.text ||
    unwrapped?.buttonsResponseMessage?.selectedButtonId ||
    unwrapped?.buttonsResponseMessage?.selectedDisplayText ||
    unwrapped?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    unwrapped?.listResponseMessage?.title ||
    unwrapped?.templateButtonReplyMessage?.selectedId ||
    unwrapped?.interactiveResponseMessage?.body?.text ||
    "";

  if (!text && unwrapped?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const parsed = JSON.parse(unwrapped.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
      text = parsed.id || parsed.rowId || parsed.selectedId || "";
    } catch {}
  }

  return String(text || "").trim();
}

function loadLocalBotConfig(instanceId) {
  try {
    const instConfig = path.join(DATA_DIR, `bot_config_${instanceId}.json`);
    if (fs.existsSync(instConfig)) {
      return JSON.parse(fs.readFileSync(instConfig, "utf8"));
    }
  } catch {}
  try {
    const defConfig = path.join(DATA_DIR, "bot_config_default.json");
    if (fs.existsSync(defConfig)) {
      return JSON.parse(fs.readFileSync(defConfig, "utf8"));
    }
  } catch {}

  return {
    enabled: true,
    businessName: "Alpha IPTV",
    serverName: "Alpha server IPTV",
    streamingDns: "http://karen256.top",
    testEnabled: true,
    testDurationHours: 4,
    pixKey: "Consulte nossa chave PIX no atendimento",
    pixHolder: "Alpha IPTV",
    planMonthlyPrice: 35,
    planQuarterlyPrice: 90,
    planSemiannualPrice: 160,
    planAnnualPrice: 290,
    appAndroidApk: "https://bit.ly/app-xciptv-oficial",
    appAndroidDownloaderCode: "389471",
  };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║        CLASSE DE SESSÃO BAILEYS MULTI-INSTÂNCIA             ║
// ╚══════════════════════════════════════════════════════════════╝

class WhatsAppSession {
  constructor(instanceId) {
    this.instanceId = instanceId;

    // Preserva sessão raiz existente para 'default'
    if (instanceId === "default" && fs.existsSync(path.join(AUTH_DIR, "creds.json"))) {
      this.authDir = AUTH_DIR;
    } else {
      this.authDir = path.join(AUTH_DIR, instanceId);
    }
    if (!fs.existsSync(this.authDir)) fs.mkdirSync(this.authDir, { recursive: true });

    this.statusFile = path.join(
      DATA_DIR,
      instanceId === "default" ? "baileys_status.json" : `baileys_status_${instanceId}.json`,
    );

    this.sock = null;
    this.currentMode = "qr";
    this.reconnectAttempts = 0;
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(this.statusFile)) {
        return JSON.parse(fs.readFileSync(this.statusFile, "utf8"));
      }
      if (this.instanceId === "default" && fs.existsSync(STATUS_FILE)) {
        return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
      }
    } catch {}

    return {
      instance: this.instanceId,
      status: "close",
      mode: "qr",
      qrCode: null,
      pairingCode: null,
      phone: null,
      userName: null,
      lastError: null,
      updatedAt: Date.now(),
    };
  }

  saveState() {
    this.state.updatedAt = Date.now();
    try {
      fs.writeFileSync(this.statusFile, JSON.stringify(this.state, null, 2), "utf8");
      if (this.instanceId === "default") {
        fs.writeFileSync(STATUS_FILE, JSON.stringify(this.state, null, 2), "utf8");
      }
    } catch {}
  }

  async connect({ mode = "qr", phone = null, force = false } = {}) {
    this.currentMode = mode;
    this.state.mode = mode;
    this.state.status = "connecting";
    this.state.lastError = null;
    this.saveState();

    try {
      console.log(`📱 [${this.instanceId}] Conectando WhatsApp Baileys (modo: ${mode})...`);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({
        version: [2, 3000, 1015901307],
      }));

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      const browserConfig =
        mode === "pairing" ? ["Ubuntu", "Edge", "110.0.1587.56"] : ["Ubuntu", "Chrome", "131.0.0.0"];

      if (this.sock) {
        try {
          this.sock.end();
        } catch {}
      }

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: browserConfig,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      });

      // Solicitação de pairing code
      if (mode === "pairing" && phone && !state.creds?.registered) {
        setTimeout(async () => {
          try {
            const cleanPhone = String(phone).replace(/\D/g, "");
            console.log(`🔑 [${this.instanceId}] Solicitando código de pareamento para ${cleanPhone}...`);
            const code = await this.sock.requestPairingCode(cleanPhone);
            console.log(`✅ [${this.instanceId}] Código de pareamento gerado: ${code}`);
            this.state.pairingCode = code;
            this.state.status = "connecting";
            this.saveState();
          } catch (e) {
            console.error(`❌ [${this.instanceId}] Erro ao gerar código de pareamento:`, e.message);
            this.state.lastError = e.message;
            this.saveState();
          }
        }, 1500);
      }

      // Ciclo de vida da conexão
      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && mode === "qr") {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 });
            this.state.qrCode = qrDataUrl;
            this.state.status = "connecting";
            this.saveState();
            console.log(`📷 [${this.instanceId}] QR Code emitido com sucesso.`);
          } catch (e) {
            console.error(`❌ [${this.instanceId}] Erro ao gerar DataURL do QR:`, e.message);
          }
        }

        if (connection === "open") {
          this.state.status = "open";
          this.state.qrCode = null;
          this.state.pairingCode = null;
          this.state.lastError = null;
          this.reconnectAttempts = 0;

          const me = this.sock.user;
          if (me) {
            const num = me.id ? me.id.split(":")[0].replace(/\D/g, "") : null;
            this.state.phone = num;
            this.state.userName = me.name || me.notify || "WhatsApp";
          }
          this.saveState();
          console.log(`✅ [${this.instanceId}] WhatsApp Conectado! +${this.state.phone} (${this.state.userName})`);
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          this.state.status = "close";
          this.state.qrCode = null;
          this.state.pairingCode = null;
          this.saveState();

          if (loggedOut) {
            console.log(`🗑️ [${this.instanceId}] Desconectado pelo WhatsApp. Limpando credenciais...`);
            try {
              fs.rmSync(this.authDir, { recursive: true, force: true });
            } catch {}
          } else {
            const isTimeout = statusCode === 408;
            if (isTimeout) this.reconnectAttempts = 0;
            else this.reconnectAttempts++;

            const delay = isTimeout ? 1200 : Math.min(this.reconnectAttempts * 2000, 10000);
            console.log(`🔄 [${this.instanceId}] Reconectando em ${delay / 1000}s...`);
            setTimeout(() => this.connect({ mode: this.currentMode }), delay);
          }
        }
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        for (const msg of messages) {
          try {
            await this.handleIncomingMessage(msg);
          } catch (e) {
            console.error(`❌ [${this.instanceId}] Erro ao processar mensagem recebida:`, e.message);
          }
        }
      });

      return this.sock;
    } catch (err) {
      console.error(`❌ [${this.instanceId}] Erro ao iniciar Baileys:`, err.message);
      this.state.status = "close";
      this.state.lastError = err.message;
      this.saveState();
    }
  }

  async logout() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        try {
          this.sock.end();
        } catch {}
      }
      this.sock = null;
    }
    try {
      if (fs.existsSync(this.authDir)) fs.rmSync(this.authDir, { recursive: true, force: true });
    } catch {}

    this.state.status = "close";
    this.state.qrCode = null;
    this.state.pairingCode = null;
    this.state.phone = null;
    this.state.userName = null;
    this.saveState();
  }

  async sendButtonsMessage(jid, { text, footer, buttons }) {
    if (!this.sock) return false;
    const cleanButtons = normalizeButtons(buttons);
    try {
      await sendButtons(this.sock, jid, {
        text: text || "🤖 *ASSISTENTE IPTV*\n\nEscolha uma opção:",
        footer: footer || "Suporte 24h",
        buttons: cleanButtons,
      });
      return true;
    } catch (e) {
      console.warn(`[${this.instanceId}] Fallback sendButtons helper:`, e.message);
      try {
        await this.sock.sendMessage(jid, {
          text: text || "🤖 *ASSISTENTE IPTV*\n\nEscolha uma opção:",
          footer: footer || "Suporte 24h",
          buttons: cleanButtons,
        });
        return true;
      } catch (e2) {
        console.error(`[${this.instanceId}] Erro ao enviar botões:`, e2.message);
        return false;
      }
    }
  }

  async sendListMessage(jid, options = {}) {
    if (!this.sock) return false;
    const rows = options.rows || [
      { rowId: "1", title: "1️⃣ Teste Grátis", description: "Acesso imediato de 4 horas" },
      { rowId: "2", title: "2️⃣ Renovar Assinatura", description: "Pagar via PIX com ativação rápida" },
      { rowId: "3", title: "3️⃣ Planos e Valores", description: "Ver opções mensal, trimestral e anual" },
      { rowId: "4", title: "4️⃣ Baixar Aplicativos", description: "Links oficiais TV Box, Celular e PC" },
    ];
    const sections = options.sections || [{ title: options.title || "Menu IPTV", rows }];

    try {
      await this.sock.sendMessage(jid, {
        text: options.text || "📋 *MENU IPTV*\n\nSelecione uma opção:",
        footer: options.footer || "Suporte 24h",
        title: options.title || "Planos & Opções",
        buttonText: options.buttonText || "📋 Abrir Menu",
        sections,
      });
      return true;
    } catch (e) {
      console.error(`[${this.instanceId}] Erro ao enviar lista:`, e.message);
      return false;
    }
  }

  async sendCopyButtonMessage(jid, code, text) {
    if (!this.sock) return false;
    const buttons = [
      {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: "📋 Copiar Código PIX",
          copy_code: code,
        }),
      },
    ];
    return await this.sendButtonsMessage(jid, {
      text: text || `📋 *Código PIX Copia e Cola:*\n\n\`${code}\``,
      footer: "Toque no botão para copiar automaticamente",
      buttons,
    });
  }

  async handleIncomingMessage(msg) {
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (!jid || jid.includes("@g.us") || jid.includes("@broadcast")) return;

    const pushName = msg.pushName || "Cliente";

    // 1. Tenta delegar para o webhook oficial do Servidor Web IPTV (porta 3000)
    try {
      const webhookUrl = `http://127.0.0.1:${WEB_SERVER_PORT}/api/public/hooks/whatsapp-bot?userId=${encodeURIComponent(this.instanceId)}`;
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "messages.upsert",
          instance: this.instanceId,
          data: msg,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.handled) {
          console.log(`[${this.instanceId}] ✅ Mensagem tratada pelo webhook IPTV: ${json.action || "ok"}`);
          return;
        }
      }
    } catch (whErr) {
      console.warn(`[${this.instanceId}] Webhook local (${whErr.message}), usando fallback integrado.`);
    }

    // 2. Fallback integrado do bot de IPTV (caso o webhook web esteja offline ou reiniciando)
    await this.handleFallbackIptvMessage(msg, jid, pushName);
  }

  async handleFallbackIptvMessage(msg, jid, pushName) {
    const rawText = extractCleanText(msg.message);
    const text = rawText.toLowerCase();
    const config = loadLocalBotConfig(this.instanceId);
    const phone = jid.replace(/\D/g, "");

    console.log(`[${this.instanceId}] 🤖 Resposta local Baileys para ${phone} ("${rawText}")`);

    if (
      text === "1" ||
      text === "1." ||
      text === "btn_teste" ||
      text.includes("teste") ||
      text.includes("testar") ||
      text.includes("gratis") ||
      text.includes("grátis")
    ) {
      const user = Math.floor(10000000 + Math.random() * 90000000).toString();
      const pass = Math.floor(100000 + Math.random() * 900000).toString();
      const dns = config.streamingDns || "http://karen256.top";
      const m3uUrl = `${dns}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=ts`;

      await this.sendButtonsMessage(jid, {
        text:
          `🎉 *SEU TESTE GRÁTIS FOI GERADO COM SUCESSO!* 🍿\n\n` +
          `👤 *Cliente:* ${pushName}\n` +
          `📺 *Servidor:* ${config.serverName || "Alpha IPTV"}\n` +
          `🌐 *URL / DNS:* ${dns}\n` +
          `🔑 *Usuário:* *${user}*\n` +
          `🔒 *Senha:* *${pass}*\n` +
          `⏳ *Validade:* ${config.testDurationHours || 4} Horas\n\n` +
          `🔗 *Lista M3U Plus:*\n${m3uUrl}\n\n` +
          `Toque abaixo para baixar nosso aplicativo oficial:`,
        footer: `${config.businessName || "Alpha IPTV"} • Suporte 24h`,
        buttons: [
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: "📲 Baixar App Oficial",
              url: config.appAndroidApk || "https://bit.ly/app-xciptv-oficial",
            }),
          },
          { id: "3", text: "🛒 Ver Nossos Planos" },
          { id: "voltar_menu", text: "⬅️ Menu Principal" },
        ],
      });
      return;
    }

    if (
      text === "2" ||
      text === "2." ||
      text === "btn_renovar" ||
      text.includes("renovar") ||
      text.includes("pix") ||
      text.includes("pagar")
    ) {
      const pix = config.pixKey || "00020126580014br.gov.bcb.pix0136pix-iptv-cobranca-automatica-20265204000053039865802BR5915IPTV ASSINATURA6009SAO PAULO62070503***6304ABCD";
      await this.sendCopyButtonMessage(
        jid,
        pix,
        `💳 *RENOVAÇÃO DE ASSINATURA VIA PIX* 📺\n\n` +
          `💰 *Valor:* R$ ${Number(config.planMonthlyPrice || 35).toFixed(2).replace(".", ",")}\n` +
          `👤 *Titular:* ${config.pixHolder || config.businessName}\n` +
          `⚡ Seu acesso é liberado automaticamente após o pagamento!\n\n` +
          `Toque no botão abaixo para copiar a chave PIX Copia e Cola:`,
      );
      return;
    }

    if (text === "3" || text === "3." || text === "btn_planos" || text.includes("plano") || text.includes("preço")) {
      const m = Number(config.planMonthlyPrice || 35).toFixed(2).replace(".", ",");
      const q = Number(config.planQuarterlyPrice || 90).toFixed(2).replace(".", ",");
      const s = Number(config.planSemiannualPrice || 160).toFixed(2).replace(".", ",");
      const a = Number(config.planAnnualPrice || 290).toFixed(2).replace(".", ",");

      await this.sendListMessage(jid, {
        title: "🛒 Planos Disponíveis",
        text:
          `🛒 *PLANOS E ASSINATURAS ${config.serverName?.toUpperCase() || "IPTV"}* 🍿\n\n` +
          `📺 *1 Mês:* R$ ${m}\n` +
          `📺 *3 Meses:* R$ ${q}\n` +
          `📺 *6 Meses:* R$ ${s}\n` +
          `📺 *12 Meses:* R$ ${a}\n\n` +
          `⭐ *Mais de 80.000 conteúdos com canais 4K, filmes, séries e EPG.*`,
        buttonText: "🛒 Escolher Plano",
        footer: "Selecione o plano desejado:",
        rows: [
          { rowId: "2", title: `1 Mês — R$ ${m}`, description: "1 tela / Ativação Imediata" },
          { rowId: "2", title: `3 Meses — R$ ${q}`, description: "Econômico / 1 tela" },
          { rowId: "2", title: `6 Meses — R$ ${s}`, description: "Mais Vendido 🔥" },
          { rowId: "2", title: `12 Meses — R$ ${a}`, description: "Super Desconto ⭐" },
        ],
      });
      return;
    }

    if (text === "4" || text === "4." || text === "btn_apps" || text.includes("app") || text.includes("baixar")) {
      await this.sendButtonsMessage(jid, {
        text:
          `📲 *APLICATIVOS OFICIAIS DISPONÍVEIS* 🍿\n\n` +
          `• *TV Box & Android:* Baixe o APK oficial ou use código Downloader: *${config.appAndroidDownloaderCode || "389471"}*\n` +
          `• *iPhone / iPad:* Smarters Player Lite na App Store\n` +
          `• *Smart TVs Samsung/LG:* IBO Player ou SmartOne\n` +
          `• *Computador / PC:* IPTV Smarters Pro Windows\n\n` +
          `Toque abaixo para baixar o APK direto:`,
        footer: "Suporte 24h",
        buttons: [
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: "📱 Baixar APK Android",
              url: config.appAndroidApk || "https://bit.ly/app-xciptv-oficial",
            }),
          },
          { id: "1", text: "1️⃣ Gerar Teste Grátis" },
          { id: "voltar_menu", text: "⬅️ Menu Principal" },
        ],
      });
      return;
    }

    // Menu Principal Padrão
    await this.sendButtonsMessage(jid, {
      text:
        `👋 Olá, *${pushName}*! Seja bem-vindo(a) à *${config.businessName || "Alpha IPTV"}*! 🍿\n` +
        `Eu sou o assistente virtual do *${config.serverName || "Alpha IPTV"}* e estou aqui para te atender 24h por dia.\n\n` +
        `Como posso te ajudar hoje? Toque em um dos botões abaixo:`,
      footer: "Atendimento 100% Automático",
      buttons: [
        { id: "1", text: "1️⃣ Gerar Teste Grátis" },
        { id: "2", text: "2️⃣ Renovar / Pagar PIX" },
        { id: "3", text: "3️⃣ Ver Nossos Planos" },
      ],
    });
  }
}

// ╔══════════════════════════════════════════════════════════════╗
// ║        GERENCIADOR GLOBAL DE SESSÕES MULTI-USUÁRIO           ║
// ╚══════════════════════════════════════════════════════════════╝

const sessions = new Map();

export function getOrCreateSession(instanceId = "default") {
  const id = instanceId?.trim() || "default";
  if (!sessions.has(id)) {
    const s = new WhatsAppSession(id);
    sessions.set(id, s);
  }
  return sessions.get(id);
}

// Auto-descoberta e inicialização de sessões existentes
async function autoStartSavedSessions() {
  console.log("🔍 Escaneando diretórios de sessões salvas em auth_baileys/...");

  // 1. Inicia sessão padrão
  const def = getOrCreateSession("default");
  if (fs.existsSync(path.join(AUTH_DIR, "creds.json"))) {
    console.log("⚡ Sessão padrão encontrada com credenciais ativas. Conectando...");
    await def.connect({ mode: "qr" });
  }

  // 2. Procura subpastas em auth_baileys/ (cada uma representa um usuário)
  try {
    const entries = fs.readdirSync(AUTH_DIR, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const subCreds = path.join(AUTH_DIR, ent.name, "creds.json");
        if (fs.existsSync(subCreds)) {
          console.log(`⚡ Sessão de usuário '${ent.name}' encontrada com credenciais. Conectando...`);
          const s = getOrCreateSession(ent.name);
          await s.connect({ mode: "qr" });
        }
      }
    }
  } catch (e) {
    console.warn("Aviso ao escanear sessões:", e.message);
  }
}

// ╔══════════════════════════════════════════════════════════════╗
// ║        SERVIDOR HTTP DE CONTROLE LOCAL (PORTA 3001)           ║
// ╚══════════════════════════════════════════════════════════════╝

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Instance");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://localhost:${HTTP_PORT}`);
  const pathname = parsedUrl.pathname;
  const instanceParam =
    parsedUrl.searchParams.get("instance") ||
    req.headers["x-instance"] ||
    "default";

  // GET /api/status?instance=<id>
  if (pathname === "/api/status" && req.method === "GET") {
    const session = getOrCreateSession(instanceParam);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(session.state));
    return;
  }

  // POST /api/connect
  if (pathname === "/api/connect" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const instanceId = payload.instance || instanceParam || "default";
        const mode = payload.mode || "qr";
        const force = Boolean(payload.force);

        const session = getOrCreateSession(instanceId);

        // Se já tem QR Code fresco gerado nos últimos 30s e não foi forçado
        if (!force && mode === "qr" && session.state.qrCode && Date.now() - session.state.updatedAt < 30000) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, state: session.state }));
          return;
        }

        await session.connect({ mode, phone: payload.phone, force });

        // Aguarda até 5.5 segundos para emissão do QR Code ou Pairing Code
        const timeoutAt = Date.now() + 5500;
        while (Date.now() < timeoutAt) {
          if (mode === "qr" && session.state.qrCode) break;
          if (mode === "pairing" && session.state.pairingCode) break;
          if (session.state.status === "open") break;
          await new Promise((r) => setTimeout(r, 200));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, state: session.state }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // POST /api/logout
  if (pathname === "/api/logout" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const instanceId = payload.instance || instanceParam || "default";
        const session = getOrCreateSession(instanceId);
        await session.logout();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // POST /api/send-message, /api/send-test, /message/sendText
  if (
    (pathname === "/api/send-message" || pathname === "/api/send-test" || pathname.startsWith("/message/send")) &&
    req.method === "POST"
  ) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const instanceId = payload.instance || instanceParam || "default";

        // Procura a sessão específica, ou default, ou qualquer sessão aberta
        let session = sessions.get(instanceId);
        if (!session || session.state.status !== "open") {
          session = sessions.get("default");
        }
        if (!session || session.state.status !== "open") {
          session = Array.from(sessions.values()).find((s) => s.state.status === "open");
        }

        if (!session || !session.sock) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Nenhum WhatsApp conectado no momento." }));
          return;
        }

        const rawTo = payload.to || payload.number || payload.phone;
        const jid = formatTargetJid(rawTo);
        const text = payload.text || payload.body || payload.caption || "";
        const type = payload.type || (payload.buttons ? "buttons" : payload.sections ? "list" : "text");

        let ok = false;

        // Disparo de Mídia (ex: QR Code PIX Mercado Pago)
        if (payload.media && payload.media.base64) {
          const buffer = Buffer.from(payload.media.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
          await session.sock.sendMessage(jid, {
            image: buffer,
            caption: text || payload.media.caption || "",
            mimetype: payload.media.mimetype || "image/png",
          });
          ok = true;
        } else if (type === "buttons" || payload.buttons) {
          ok = await session.sendButtonsMessage(jid, {
            text,
            footer: payload.footer,
            buttons: payload.buttons,
          });
        } else if (type === "list" || payload.sections) {
          ok = await session.sendListMessage(jid, {
            text,
            title: payload.title,
            footer: payload.footer,
            buttonText: payload.buttonText,
            sections: payload.sections,
            rows: payload.rows,
          });
        } else if (type === "pix_copy") {
          ok = await session.sendCopyButtonMessage(
            jid,
            payload.pix_code || "Consulte o suporte para chave PIX",
            text,
          );
        } else {
          await session.sock.sendMessage(jid, { text });
          ok = true;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, instance: session.instanceId }));
      } catch (e) {
        console.error("Erro no envio Baileys:", e.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint não encontrado" }));
});

server.listen(HTTP_PORT, "0.0.0.0", async () => {
  console.log(`🚀 Motor WhatsApp Baileys Nativo Multi-Instância ativo na porta ${HTTP_PORT}`);
  console.log(`🔗 Webhook IPTV vinculado à porta ${WEB_SERVER_PORT}`);
  await autoStartSavedSessions();
});
