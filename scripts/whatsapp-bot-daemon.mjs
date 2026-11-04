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
import { isAuthorizedRequest, isSafeInstanceId, normalizePrivateRecipient, readJsonBody } from "./whatsapp-bot-security.mjs";
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

try { process.loadEnvFile(path.resolve(process.cwd(), ".env")); } catch {}

if (!global.crypto) {
  global.crypto = require("crypto").webcrypto || require("crypto");
}

const AUTH_DIR = path.resolve(process.cwd(), "auth_baileys");
const DATA_DIR = path.resolve(process.cwd(), "data");
const STATUS_FILE = path.join(DATA_DIR, "baileys_status.json");
const HTTP_PORT = process.env.BAILEYS_PORT ? Number(process.env.BAILEYS_PORT) : 3001;
const HTTP_HOST = process.env.BAILEYS_API_HOST?.trim() || "127.0.0.1";
const API_TOKEN = process.env.BAILEYS_API_TOKEN?.trim() || "";
const LOOPBACK_ONLY = ["127.0.0.1", "::1", "localhost"].includes(HTTP_HOST);
const WEB_SERVER_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
if (!LOOPBACK_ONLY && !API_TOKEN) throw new Error("BAILEYS_API_TOKEN é obrigatório quando BAILEYS_API_HOST não é localhost.");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// ╔══════════════════════════════════════════════════════════════╗
// ║        HELPERS DE BOTÕES E LISTAS (IGUAL AO BOT TESTE)       ║
// ╚══════════════════════════════════════════════════════════════╝

function normalizeButtons(buttons) {
  return (buttons || []).map((b, i) => {
    if (!b || typeof b !== "object") return b;
    if (b.name && b.buttonParamsJson) return b;
    if (b.type === "copy" || b.copyCode) {
      return {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: b.displayText || b.text || "📋 Copiar Chave PIX",
          copy_code: b.copyCode || b.code || "",
        }),
      };
    }
    if (b.type === "url" || b.url) {
      return {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: b.displayText || b.text || "Abrir Link",
          url: b.url || "",
        }),
      };
    }
    if (b.id && b.text) return { id: String(b.id), text: String(b.text) };
    const id = String(b.id || b.buttonId || b.rowId || `btn_${i + 1}`);
    const text = String(b.text || b.displayText || b.buttonText?.displayText || b.title || `Opção ${i + 1}`);
    return { id, text };
  });
}

function formatTargetJid(raw) { return normalizePrivateRecipient(raw); }

/**
 * Gera variações BR (com/sem o nono dígito) para um número.
 */
function brVariants(digits) {
  const out = new Set([digits]);
  if (digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9 && rest.startsWith("9")) out.add(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8) out.add(`55${ddd}9${rest}`);
  }
  return Array.from(out);
}

/**
 * Descobre o JID real registrado no WhatsApp.
 * Enviar para um JID inexistente/errado é a causa principal
 * do aviso "mensagem indisponível" no celular do cliente.
 */
async function resolveJid(sock, jid) {
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@lid")) return jid;
  const digits = jid.split("@")[0].replace(/\D/g, "");
  try {
    for (const variant of brVariants(digits)) {
      const found = await sock.onWhatsApp(variant);
      const hit = Array.isArray(found) ? found.find((f) => f?.exists && f?.jid) : null;
      if (hit) return hit.jid;
    }
  } catch {}
  return jid;
}

/** Converte botões em um menu de texto simples (100% compatível). */
function buttonsToText(text, buttons, footer) {
  const lines = [];
  if (text) lines.push(text);
  const items = (buttons || []).map((b, i) => {
    if (b?.name === "cta_copy" || b?.name === "cta_url") {
      try {
        const p = JSON.parse(b.buttonParamsJson || "{}");
        if (p.copy_code) return `${p.display_text || "Código"}:\n${p.copy_code}`;
        if (p.url) return `${p.display_text || "Link"}: ${p.url}`;
      } catch {}
      return null;
    }
    const label = b?.text || b?.displayText || b?.title || `Opção ${i + 1}`;
    return `*${i + 1}* - ${label}`;
  });
  const valid = items.filter(Boolean);
  if (valid.length) lines.push("", valid.join("\n"));
  if (footer) lines.push("", `_${footer}_`);
  return lines.join("\n").trim();
}

/** Converte listas em um menu de texto simples. */
function listToText(text, sections, footer) {
  const lines = [];
  if (text) lines.push(text);
  let n = 0;
  for (const sec of sections || []) {
    if (sec?.title) lines.push("", `*${sec.title}*`);
    for (const row of sec?.rows || []) {
      n += 1;
      const id = row?.rowId || String(n);
      lines.push(`*${id}* - ${row?.title || ""}${row?.description ? `\n   ${row.description}` : ""}`);
    }
  }
  if (footer) lines.push("", `_${footer}_`);
  return lines.join("\n").trim();
}

// Mensagens interativas só quando explicitamente habilitadas —
// por padrão o bot usa texto puro, que nunca aparece como indisponível.
const INTERACTIVE_ENABLED = process.env.BAILEYS_INTERACTIVE === "1";

// Fallback local removido: ações comerciais só podem ser executadas pelo backend.

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

  /** Envio de texto seguro: resolve o JID real e trata erros. */
  async sendTextSafe(jid, text) {
    if (!this.sock) return false;
    const target = await resolveJid(this.sock, jid);
    try {
      await this.sock.presenceSubscribe(target).catch(() => {});
      await this.sock.sendMessage(target, { text: String(text || "").trim() || "..." });
      return true;
    } catch (e) {
      console.error(`[${this.instanceId}] Erro ao enviar texto:`, e.message);
      return false;
    }
  }

  async sendButtonsMessage(jid, { text, footer, buttons }) {
    if (!this.sock) return false;
    const cleanButtons = normalizeButtons(buttons);
    const baseText = text || "🤖 *ASSISTENTE IPTV*\n\nEscolha uma opção:";
    const fallbackText = buttonsToText(baseText, cleanButtons, footer || "Suporte 24h");

    if (!INTERACTIVE_ENABLED) {
      return await this.sendTextSafe(jid, fallbackText);
    }

    const target = await resolveJid(this.sock, jid);
    try {
      await sendButtons(this.sock, target, {
        text: baseText,
        footer: footer || "Suporte 24h",
        buttons: cleanButtons,
      });
      return true;
    } catch (e) {
      console.warn(`[${this.instanceId}] Botões indisponíveis, enviando texto:`, e.message);
      return await this.sendTextSafe(target, fallbackText);
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
    const baseText = options.text || "📋 *MENU IPTV*\n\nSelecione uma opção:";
    const fallbackText = listToText(baseText, sections, options.footer || "Responda com o número da opção");

    if (!INTERACTIVE_ENABLED) {
      return await this.sendTextSafe(jid, fallbackText);
    }

    const target = await resolveJid(this.sock, jid);
    try {
      await this.sock.sendMessage(target, {
        text: baseText,
        footer: options.footer || "Suporte 24h",
        title: options.title || "Planos & Opções",
        buttonText: options.buttonText || "📋 Abrir Menu",
        sections,
      });
      return true;
    } catch (e) {
      console.warn(`[${this.instanceId}] Lista indisponível, enviando texto:`, e.message);
      return await this.sendTextSafe(target, fallbackText);
    }
  }

  async sendCopyButtonMessage(jid, code, text) {
    if (!this.sock) return false;
    const body = text || "📋 *Código PIX Copia e Cola:*";
    // Código PIX sempre em mensagem de texto pura, para o cliente
    // conseguir copiar mesmo em aparelhos sem suporte a botões.
    if (!INTERACTIVE_ENABLED) {
      return await this.sendTextSafe(jid, `${body}\n\n${code}`);
    }
    const buttons = [
      {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: "📋 Copiar Código PIX",
          copy_code: code,
        }),
      },
    ];
    const ok = await this.sendButtonsMessage(jid, {
      text: `${body}\n\n${code}`,
      footer: "Toque no botão para copiar automaticamente",
      buttons,
    });
    return ok;
  }

  async handleIncomingMessage(msg) {
    if (!msg.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    if (!jid || jid.includes("@g.us") || jid.includes("@broadcast")) return;

    const webhookUrl = `http://127.0.0.1:${WEB_SERVER_PORT}/api/public/hooks/whatsapp-bot?userId=${encodeURIComponent(this.instanceId)}`;
    const headers = { "Content-Type": "application/json" };
    const webhookToken = process.env.WHATSAPP_WEBHOOK_TOKEN?.trim();
    if (webhookToken) headers["x-webhook-token"] = webhookToken;

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ event: "messages.upsert", instance: this.instanceId, data: msg }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        console.error(`[${this.instanceId}] Webhook recusou a mensagem (HTTP ${response.status}); sem fallback local.`);
        return;
      }
      const result = await response.json().catch(() => null);
      console.log(`[${this.instanceId}] Webhook: ${result?.action || result?.ignored || "sem ação"}`);
    } catch (error) {
      console.error(`[${this.instanceId}] Backend indisponível; mensagem não processada: ${error?.message || error}`);
    }
  }
}

// ╔══════════════════════════════════════════════════════════════╗
// ║        GERENCIADOR GLOBAL DE SESSÕES MULTI-USUÁRIO           ║
// ╚══════════════════════════════════════════════════════════════╝

const sessions = new Map();

export function getOrCreateSession(instanceId = "default") {
  const id = instanceId?.trim() || "default";
  if (!isSafeInstanceId(id)) throw new Error("Identificador de instância inválido.");
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
      if (ent.isDirectory() && isSafeInstanceId(ent.name)) {
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

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (!isAuthorizedRequest(req, API_TOKEN, LOOPBACK_ONLY)) {
    sendJson(res, 401, { ok: false, error: "Não autorizado." }); return;
  }

  const parsedUrl = new URL(req.url || "/", `http://localhost:${HTTP_PORT}`);
  const pathname = parsedUrl.pathname;
  const instanceParam = String(parsedUrl.searchParams.get("instance") || req.headers["x-instance"] || "default");
  if (pathname !== "/api/sessions" && !isSafeInstanceId(instanceParam)) {
    sendJson(res, 400, { ok: false, error: "Identificador de instância inválido." }); return;
  }

  if (pathname === "/api/sessions" && req.method === "GET") {
    sendJson(res, 200, { ok: true, sessions: Array.from(sessions.values()).map((s) => s.state) }); return;
  }
  if (pathname === "/api/status" && req.method === "GET") {
    sendJson(res, 200, getOrCreateSession(instanceParam).state); return;
  }

  if (pathname === "/api/connect" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const instanceId = String(payload.instance || instanceParam || "default");
      if (!isSafeInstanceId(instanceId)) { sendJson(res, 400, { ok: false, error: "Instância inválida." }); return; }
      const mode = payload.mode === "pairing" ? "pairing" : "qr";
      const phone = String(payload.phone || "").replace(/\D/g, "");
      if (mode === "pairing" && (phone.length < 10 || phone.length > 15)) {
        sendJson(res, 400, { ok: false, error: "Informe um telefone válido para pareamento." }); return;
      }
      const session = getOrCreateSession(instanceId);
      if (!payload.force && mode === "qr" && session.state.qrCode && Date.now() - session.state.updatedAt < 30000) {
        sendJson(res, 200, { ok: true, state: session.state }); return;
      }
      await session.connect({ mode, phone: phone || null, force: Boolean(payload.force) });
      const timeoutAt = Date.now() + 5500;
      while (Date.now() < timeoutAt) {
        if ((mode === "qr" && session.state.qrCode) || (mode === "pairing" && session.state.pairingCode) || session.state.status === "open") break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      sendJson(res, 200, { ok: true, state: session.state });
    } catch (error) { sendJson(res, error?.statusCode || 400, { ok: false, error: error?.message || "Falha ao conectar." }); }
    return;
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    try {
      const payload = await readJsonBody(req);
      const instanceId = String(payload.instance || instanceParam || "default");
      if (!isSafeInstanceId(instanceId)) { sendJson(res, 400, { ok: false, error: "Instância inválida." }); return; }
      await getOrCreateSession(instanceId).logout();
      sendJson(res, 200, { ok: true });
    } catch (error) { sendJson(res, error?.statusCode || 400, { ok: false, error: error?.message || "Falha ao desconectar." }); }
    return;
  }

  if ((pathname === "/api/send-message" || pathname === "/api/send-test" || pathname.startsWith("/message/send")) && req.method === "POST") {
    try {
      const payload = await readJsonBody(req, 6 * 1024 * 1024);
      const instanceId = String(payload.instance || instanceParam || "default");
      if (!isSafeInstanceId(instanceId)) { sendJson(res, 400, { ok: false, error: "Instância inválida." }); return; }

      // A mensagem usa exclusivamente a sessão solicitada: nunca troca para outro revendedor.
      const session = sessions.get(instanceId);
      if (!session || session.state.status !== "open" || !session.sock) {
        sendJson(res, 409, { ok: false, error: "A instância solicitada não está conectada." }); return;
      }

      const jid = formatTargetJid(payload.to || payload.number || payload.phone);
      if (!jid) { sendJson(res, 400, { ok: false, error: "Número individual inválido; grupos e LIDs não são destinos aceitos." }); return; }
      const text = String(payload.text || payload.body || payload.caption || "");
      if (text.length > 12000) { sendJson(res, 413, { ok: false, error: "Mensagem muito grande." }); return; }

      const type = payload.type || (payload.buttons ? "buttons" : payload.sections ? "list" : "text");
      let ok = false;
      if (payload.media?.base64) {
        const encoded = String(payload.media.base64).replace(/^data:[^;]+;base64,/, "");
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length > 7 * 1024 * 1024) {
          sendJson(res, 400, { ok: false, error: "Arquivo de mídia inválido ou muito grande." }); return;
        }
        const buffer = Buffer.from(encoded, "base64");
        if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
          sendJson(res, 400, { ok: false, error: "Arquivo de mídia inválido ou muito grande." }); return;
        }
        await session.sock.sendMessage(await resolveJid(session.sock, jid), {
          image: buffer, caption: text || payload.media.caption || "", mimetype: payload.media.mimetype || "image/png",
        });
        ok = true;
      } else if (type === "buttons" || payload.buttons) {
        ok = await session.sendButtonsMessage(jid, { text, footer: payload.footer, buttons: payload.buttons });
      } else if (type === "list" || payload.sections) {
        ok = await session.sendListMessage(jid, {
          text, title: payload.title, footer: payload.footer, buttonText: payload.buttonText,
          sections: payload.sections, rows: payload.rows,
        });
      } else if (type === "pix_copy") {
        if (!payload.pix_code) { sendJson(res, 400, { ok: false, error: "Código Pix não informado." }); return; }
        ok = await session.sendCopyButtonMessage(jid, String(payload.pix_code), text);
      } else if (text.trim()) {
        ok = await session.sendTextSafe(jid, text);
      } else {
        sendJson(res, 400, { ok: false, error: "Informe uma mensagem para enviar." }); return;
      }

      if (!ok) { sendJson(res, 502, { ok: false, error: "Falha ao entregar mensagem." }); return; }
      sendJson(res, 200, { ok: true, instance: session.instanceId });
    } catch (error) { sendJson(res, error?.statusCode || 400, { ok: false, error: error?.message || "Falha ao enviar." }); }
    return;
  }

  sendJson(res, 404, { ok: false, error: "Endpoint não encontrado." });
});

server.listen(HTTP_PORT, HTTP_HOST, async () => {
  console.log(`🚀 Motor WhatsApp Baileys ativo em ${HTTP_HOST}:${HTTP_PORT}`);
  console.log(`🔗 Webhook IPTV vinculado à porta ${WEB_SERVER_PORT}`);
  await autoStartSavedSessions();
});
