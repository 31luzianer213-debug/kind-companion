/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         MOTOR WHATSAPP 24 HORAS — BAILEYS NATIVO             ║
 * ║  Baseado 100% no bot de teste enviado (media_1789061899925): ║
 * ║  - makeWASocket (@whiskeysockets/baileys)                     ║
 * ║  - Botões Rápidos Interativos (sendButtons via baileys_helper)║
 * ║  - Listas Interativas (sections e rows)                      ║
 * ║  - Botão Nativo Copiar PIX (cta_copy / copy_code)            ║
 * ║  - Botão Nativo Link (cta_url)                               ║
 * ║  - Confirmação Sim/Não (confirmar_sim / confirmar_nao)       ║
 * ║  - Conexão por QR Code ou Código de Pareamento (Pairing)     ║
 * ║  - Servidor HTTP de Controle Local (porta 3001)               ║
 * ║  - 100% Baileys — ZERO Evolution API                         ║
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
} = require("@whiskeysockets/baileys");

let sendButtonsHelper = null;
try {
  const bh = require("baileys_helper");
  sendButtonsHelper = bh.sendButtons;
} catch {}

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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

let sock = null;
let currentMode = "qr"; // 'qr' | 'pairing'
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

let botState = {
  status: "close", // 'open' | 'connecting' | 'close'
  mode: "qr",
  qrCode: null,
  pairingCode: null,
  phone: null,
  userName: null,
  lastError: null,
  updatedAt: Date.now(),
};

function saveState() {
  botState.updatedAt = Date.now();
  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(botState, null, 2), "utf8");
  } catch {}
}

// ╔══════════════════════════════════════════════════════════════╗
// ║        FUNÇÕES DE ENVIO INTERATIVO (IGUAL AO BOT TESTE)      ║
// ╚══════════════════════════════════════════════════════════════╝

/**
 * Envia botões rápidos usando sendButtons do baileys_helper (com fallback nativo no sock)
 */
async function enviarBotoes(jid, { text, footer, buttons }) {
  if (!sock) return false;
  if (sendButtonsHelper) {
    try {
      await sendButtonsHelper(sock, jid, { text, footer: footer || "IPTV Bot", buttons });
      return true;
    } catch (e) {
      console.warn("[Baileys] Fallback no sendButtons helper:", e.message);
    }
  }

  // Fallback direto via sock
  try {
    await sock.sendMessage(jid, {
      text,
      footer: footer || "IPTV Bot",
      buttons,
    });
    return true;
  } catch (e) {
    // Fallback texto limpo com numeração
    let fallback = text;
    if (buttons && buttons.length > 0) {
      fallback +=
        "\n\n🔘 *Opções:*\n" +
        buttons
          .map((b, i) => `👉 *${b.buttonId || i + 1}* - ${b.buttonText?.displayText || b.name || ""}`)
          .join("\n");
    }
    await sock.sendMessage(jid, { text: fallback });
    return false;
  }
}

/**
 * Lista interativa (list message) com seções e linhas (igual bot teste)
 */
async function enviarLista(jid, options = {}) {
  if (!sock) return false;
  const rows = options.rows || [
    { rowId: "opcao_1", title: "🔹 Opção 1", description: "Descrição da opção 1" },
    { rowId: "opcao_2", title: "🔹 Opção 2", description: "Descrição da opção 2" },
    { rowId: "opcao_3", title: "🔹 Opção 3", description: "Descrição da opção 3" },
    { rowId: "plano_1m", title: "📺 Plano Mensal (R$ 35)", description: "Todos os canais, filmes e séries" },
    { rowId: "voltar_menu", title: "⬅️ Voltar", description: "Voltar ao menu principal" },
  ];

  const sections = options.sections || [{ title: "📦 Opções Disponíveis", rows }];

  try {
    await sock.sendMessage(jid, {
      text: options.text || "📋 *LISTA DE OPÇÕES*\n\nSelecione um item abaixo:",
      footer: options.footer || "Bot de Atendimento 24h",
      title: options.title || "Opções disponíveis",
      buttonText: options.buttonText || "📋 Abrir Lista",
      sections,
    });
    return true;
  } catch (e) {
    console.warn("[Baileys] Fallback no envio de lista:", e.message);
    let fallback = (options.text || "📋 *LISTA DE OPÇÕES*") + "\n";
    for (const sec of sections) {
      fallback += `\n*${sec.title}*\n`;
      fallback += sec.rows.map((r) => `👉 *${r.rowId}* - ${r.title}${r.description ? ` (${r.description})` : ""}`).join("\n");
    }
    await sock.sendMessage(jid, { text: fallback });
    return false;
  }
}

/**
 * Confirmação com dois botões (Sim / Não) — igual ao bot teste
 */
async function enviarConfirmacao(jid, pergunta = "❓ *Confirma a ação de teste?*") {
  const buttons = [
    { buttonId: "confirmar_sim", buttonText: { displayText: "✅ Sim" }, type: 1 },
    { buttonId: "confirmar_nao", buttonText: { displayText: "❌ Não" }, type: 1 },
  ];
  return await enviarBotoes(jid, { text: pergunta, footer: "Bot de Atendimento", buttons });
}

/**
 * Resposta simples com botão de voltar — igual ao bot teste
 */
async function enviarComVoltar(jid, texto) {
  const buttons = [{ buttonId: "voltar_menu", buttonText: { displayText: "⬅️ Voltar ao Menu" }, type: 1 }];
  return await enviarBotoes(jid, { text: texto, footer: "Bot de Atendimento", buttons });
}

/**
 * Botão nativo de copiar código (ex: PIX Copia e Cola via cta_copy) — igual ao bot teste
 */
async function enviarBotaoCopiar(jid, codigo, texto) {
  if (!sock) return false;
  const buttons = [
    {
      name: "cta_copy",
      buttonParamsJson: JSON.stringify({
        display_text: "📋 Copiar Código PIX",
        copy_code: codigo,
      }),
    },
    { buttonId: "voltar_menu", buttonText: { displayText: "⬅️ Voltar ao Menu" }, type: 1 },
  ];
  const bodyText = texto || `📋 *Código PIX Copia e Cola:*\n\n\`${codigo}\``;
  return await enviarBotoes(jid, {
    text: bodyText,
    footer: "Toque no botão para copiar automaticamente",
    buttons,
  });
}

/**
 * Botão nativo de abrir URL (ex: download de aplicativos via cta_url) — igual ao bot teste
 */
async function enviarBotaoLink(jid, texto, label, url) {
  if (!sock) return false;
  const buttons = [
    {
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: label,
        url,
      }),
    },
    { buttonId: "voltar_menu", buttonText: { displayText: "⬅️ Voltar ao Menu" }, type: 1 },
  ];
  return await enviarBotoes(jid, {
    text,
    footer: "Auto-Atendimento • Download Oficial",
    buttons,
  });
}

/**
 * Menu principal com botões interativos rápidos — igual ao bot teste
 */
async function enviarMenuPrincipal(jid) {
  const mainButtons = [
    { buttonId: "btn_teste", buttonText: { displayText: "1️⃣ Gerar Teste Grátis" }, type: 1 },
    { buttonId: "btn_renovar", buttonText: { displayText: "2️⃣ Renovar / PIX" }, type: 1 },
    { buttonId: "btn_lista", buttonText: { displayText: "📋 Ver Lista de Opções" }, type: 1 },
  ];

  await enviarBotoes(jid, {
    text:
      "🤖 *ATENDIMENTO AUTOMÁTICO WHATSAPP*\n\n" +
      "Olá! Seja bem-vindo(a). Escolha uma opção abaixo tocando no botão desejado:",
    footer: "Auto-Atendimento 24h • Baileys",
    buttons: mainButtons,
  });
}

// ╔══════════════════════════════════════════════════════════════╗
// ║           HANDLER PRINCIPAL DE MENSAGENS (WHATSAPP)          ║
// ║     100% fiel à lógica do arquivo bot teste enviado          ║
// ╚══════════════════════════════════════════════════════════════╝

async function handleMessage(msg) {
  if (!msg.message || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us")) return;

  const m = msg.message;
  let text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    "";

  // Captura clique em botões native flow
  const nativeParams = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (nativeParams) {
    try {
      const parsed = JSON.parse(nativeParams);
      text = parsed.id || parsed.selected_id || parsed.row_id || text;
    } catch {}
  }

  const buttonId = m.buttonsResponseMessage?.selectedButtonId || "";
  const listRowId = m.listResponseMessage?.singleSelectReply?.selectedRowId || "";
  const actionId = (buttonId || listRowId || text).trim().toLowerCase();

  const phone = jid.replace(/@.*$/, "").replace(/\D/g, "");
  console.log(`📩 Mensagem de ${phone}: "${text}" (actionId=${actionId})`);

  try {
    switch (actionId) {
      // ── Opções do arquivo bot teste ────────────────────────────
      case "btn_lista":
      case "lista":
      case "planos":
        await enviarLista(jid, {
          title: "Opções e Planos",
          text: "📋 *LISTA DE OPÇÕES DISPONÍVEIS*\n\nSelecione um item:",
          buttonText: "📋 Abrir Lista",
          rows: [
            { rowId: "btn_teste", title: "🍿 Teste Grátis (4 Horas)", description: "Liberar acesso instantâneo" },
            { rowId: "plano_1m", title: "📺 Plano 1 Mês (R$ 35)", description: "Acesso completo a todos canais e filmes" },
            { rowId: "plano_3m", title: "📺 Plano 3 Meses (R$ 90)", description: "Trimestral com desconto" },
            { rowId: "btn_apps", title: "📲 Baixar Aplicativos", description: "Android, TV Box, iOS e PC" },
            { rowId: "btn_confirmar", title: "✅ Testar Confirmação", description: "Exemplo de botões Sim / Não" },
            { rowId: "btn_sobre", title: "ℹ️ Sobre o Bot", description: "Informações sobre este robô" },
            { rowId: "voltar_menu", title: "⬅️ Voltar", description: "Voltar ao menu inicial" },
          ],
        });
        return;

      case "btn_confirmar":
        await enviarConfirmacao(jid, "❓ *Confirma a ação de teste do robô?*");
        return;

      case "btn_sobre":
        await enviarComVoltar(
          jid,
          "ℹ️ *Sobre o Bot*\n\nEste robô funciona 24 horas por dia com Baileys nativo, respondendo mensagens instantaneamente com botões clicáveis, listas interativas e cópia de chave PIX automática.",
        );
        await enviarBotaoCopiar(jid, "CHAVE-PIX-EXEMPLO-2026", "💳 Exemplo de botão copiar chave PIX:");
        await enviarBotaoLink(jid, "🔗 Exemplo de botão de link oficial:", "🌐 Abrir Painel", "https://seu-painel.com");
        return;

      case "opcao_1":
      case "opcao_2":
      case "opcao_3":
        await enviarComVoltar(jid, `✅ Você selecionou com sucesso: *${actionId.toUpperCase()}*`);
        return;

      case "confirmar_sim":
        await enviarComVoltar(jid, "✅ Ação confirmada com sucesso pelo robô!");
        return;

      case "confirmar_nao":
        await enviarComVoltar(jid, "❌ Ação cancelada.");
        return;

      // ── Opções de IPTV e Atendimento ───────────────────────────
      case "btn_teste":
      case "1":
      case "1.":
      case "teste":
        await enviarBotoes(jid, {
          text:
            "🎉 *SEU TESTE GRÁTIS FOI GERADO COM SUCESSO!* 🍿\n\n" +
            "Seu acesso foi liberado por 4 horas com todos os canais 4K, filmes e séries!\n\n" +
            `👤 *Usuário:* teste_${phone.slice(-4)}\n` +
            `🔑 *Senha:* 123456\n` +
            `🌐 *Servidor DNS:* http://karen256.top\n\n` +
            "Toque no botão abaixo para baixar nosso aplicativo oficial:",
          footer: "Aproveite seu teste!",
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "📲 Baixar Aplicativo Oficial",
                url: "https://bit.ly/app-xciptv-oficial",
              }),
            },
            { buttonId: "voltar_menu", buttonText: { displayText: "⬅️ Voltar ao Menu" }, type: 1 },
          ],
        });
        return;

      case "btn_renovar":
      case "2":
      case "2.":
      case "renovar":
      case "plano_1m":
      case "plano_3m":
        await enviarBotaoCopiar(
          jid,
          "00020126580014br.gov.bcb.pix0136pix-iptv-cobranca-automatica-20265204000053039865802BR5915IPTV ASSINATURA6009SAO PAULO62070503***6304ABCD",
          "💳 *RENOVAÇÃO DE ASSINATURA VIA PIX* 📺\n\n" +
            "💰 *Valor:* R$ 35,00 (Mensalidade 1 Tela)\n" +
            "⚡ Seu acesso é liberado automaticamente após o pagamento!\n\n" +
            "Toque no botão abaixo para copiar a chave PIX Copia e Cola:",
        );
        return;

      case "btn_apps":
      case "4":
      case "4.":
      case "apps":
        await enviarBotoes(jid, {
          text:
            "📲 *APLICATIVOS OFICIAIS DISPONÍVEIS* 🍿\n\n" +
            "• *TV Box & Android:* Baixe o APK oficial ou use código Downloader: *389471*\n" +
            "• *iPhone / iPad:* Smarters Player Lite na App Store\n" +
            "• *Smart TVs Samsung/LG:* IBO Player ou SmartOne\n\n" +
            "Toque abaixo para baixar direto:",
          footer: "Suporte 24h",
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "📱 Baixar App Android",
                url: "https://bit.ly/app-xciptv-oficial",
              }),
            },
            { buttonId: "voltar_menu", buttonText: { displayText: "⬅️ Voltar ao Menu" }, type: 1 },
          ],
        });
        return;

      case "voltar_menu":
      default:
        // Qualquer outra mensagem abre o menu principal com botões
        await enviarMenuPrincipal(jid);
        return;
    }
  } catch (e) {
    console.error("❌ Erro ao responder mensagem Baileys:", e.message);
  }
}

// ╔══════════════════════════════════════════════════════════════╗
// ║        CONEXÃO WHATSAPP — QR CODE / CÓDIGO DE PAREAMENTO      ║
// ║     100% fiel à lógica do arquivo bot teste enviado          ║
// ╚══════════════════════════════════════════════════════════════╝

export async function startBaileysBot(options = {}) {
  const mode = options.mode || currentMode || "qr";
  currentMode = mode;
  botState.mode = mode;
  botState.status = "connecting";
  botState.lastError = null;
  saveState();

  try {
    console.log(`📱 Iniciando WhatsApp Baileys (modo: ${mode})...`);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307],
    }));
    console.log("📱 Versão Baileys:", version.join("."));

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const browserConfig =
      mode === "pairing" ? ["Ubuntu", "Edge", "110.0.1587.56"] : ["Ubuntu", "Chrome", "131.0.0.0"];

    if (sock) {
      try {
        sock.end();
      } catch {}
    }

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: browserConfig,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
    });

    // Modo Código de Pareamento
    if (mode === "pairing" && !sock.authState.creds.registered && options.phone) {
      const clean = options.phone.replace(/\D/g, "");
      if (clean.length >= 10) {
        setTimeout(async () => {
          try {
            console.log(`🔗 Solicitando código de pareamento para ${clean}...`);
            const code = await sock.requestPairingCode(clean);
            botState.pairingCode = code;
            botState.phone = clean;
            saveState();
            console.log(`\n🔑 CÓDIGO DE PAREAMENTO GERADO: ${code}\n`);
          } catch (e) {
            console.error("❌ Erro ao gerar código de pareamento:", e.message);
            botState.lastError = e.message;
            saveState();
          }
        }, 3000);
      }
    }

    // Eventos de Conexão
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && currentMode === "qr") {
        try {
          const b64 = await QRCode.toDataURL(qr);
          botState.qrCode = b64;
          botState.status = "connecting";
          saveState();
          console.log("✅ QR CODE GERADO COM SUCESSO!");
        } catch (e) {
          console.error("❌ Erro ao gerar QR Code:", e.message);
        }
      }

      if (connection === "open") {
        botState.status = "open";
        botState.qrCode = null;
        botState.pairingCode = null;
        botState.lastError = null;

        const userJid = sock.user?.id || "";
        botState.phone = userJid.split(":")[0]?.replace(/\D/g, "") || null;
        botState.userName = sock.user?.name || "WhatsApp Bot";
        saveState();

        console.log(`\n🟢 WHATSAPP CONECTADO COM SUCESSO! Número: +${botState.phone}`);
        console.log("🔘 Bot Baileys 100% operacional — respondendo com botões e listas 24h!\n");
        reconnectAttempts = 0;
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`⚠️ Conexão Baileys encerrada (status ${statusCode}). Deslogado: ${loggedOut}`);

        botState.status = "close";
        botState.qrCode = null;
        botState.pairingCode = null;
        saveState();

        if (loggedOut) {
          console.log("🗑️ Desconectado pelo WhatsApp. Limpando credenciais...");
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch {}
        } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = Math.min(reconnectAttempts * 3000, 15000);
          console.log(`🔄 Reconectando em ${delay / 1000}s... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(() => startBaileysBot({ mode: currentMode }), delay);
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        try {
          await handleMessage(msg);
        } catch (e) {
          console.error("❌ Erro ao processar mensagem:", e.message);
        }
      }
    });

    return sock;
  } catch (err) {
    console.error("❌ Erro ao iniciar Baileys:", err.message);
    botState.status = "close";
    botState.lastError = err.message;
    saveState();
  }
}

export async function logoutBaileys() {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      try {
        sock.end();
      } catch {}
    }
    sock = null;
  }
  try {
    if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {}

  botState.status = "close";
  botState.qrCode = null;
  botState.pairingCode = null;
  botState.phone = null;
  botState.userName = null;
  saveState();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║        SERVIDOR HTTP DE CONTROLE LOCAL (PORTA 3001)           ║
// ║  Permite ao Painel Web e Cobranças usarem Baileys 100%       ║
// ╚══════════════════════════════════════════════════════════════╝

function formatTargetJid(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (s.endsWith("@s.whatsapp.net") || s.endsWith("@lid")) return s;
  let digits = s.replace(/\D/g, "");
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return `${digits}@s.whatsapp.net`;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url || "/";

  // GET /api/status
  if (url === "/api/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(botState));
    return;
  }

  // POST /api/connect
  if (url === "/api/connect" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        await startBaileysBot({ mode: payload.mode || "qr", phone: payload.phone });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, state: botState }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // POST /api/logout
  if (url === "/api/logout" && req.method === "POST") {
    await logoutBaileys();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/send-message (ou /message/sendText)
  if (
    (url === "/api/send-message" || url === "/api/send-test" || url.startsWith("/message/send")) &&
    req.method === "POST"
  ) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!sock || botState.status !== "open") {
          throw new Error("WhatsApp não está conectado no momento. Conecte pelo painel.");
        }

        const targetRaw = payload.to || payload.phone || payload.number;
        const jid = formatTargetJid(targetRaw);
        if (!jid) {
          throw new Error("Número do WhatsApp destinatário inválido ou não informado.");
        }

        const text = payload.text || payload.message || payload.body || "";
        const type = payload.type || (payload.buttons ? "buttons" : payload.sections ? "list" : payload.pixCode ? "pix_copy" : payload.media ? "media" : "text");

        // Envio de Mídia / Imagem (ex: QR Code PIX em Base64)
        if (payload.media?.base64 || payload.base64) {
          const rawB64 = payload.media?.base64 || payload.base64;
          const cleanB64 = rawB64.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(cleanB64, "base64");
          const caption = payload.media?.caption || payload.caption || text || "";
          await sock.sendMessage(jid, {
            image: buffer,
            caption,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, type: "media" }));
          return;
        }

        // Envio de Botões Rápidos
        if (type === "buttons" || (Array.isArray(payload.buttons) && payload.buttons.length > 0)) {
          const buttons = payload.buttons || [
            { buttonId: "1", buttonText: { displayText: "1️⃣ Gerar Teste Grátis" }, type: 1 },
            { buttonId: "2", buttonText: { displayText: "2️⃣ Renovar Assinatura" }, type: 1 },
            { buttonId: "6", buttonText: { displayText: "3️⃣ Suporte Humano" }, type: 1 },
          ];
          await enviarBotoes(jid, {
            text: text || "🤖 *Mensagem com Botões Clicáveis*",
            footer: payload.footer || "IPTV Bot",
            buttons,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, type: "buttons" }));
          return;
        }

        // Envio de Lista Interativa
        if (type === "list" || (Array.isArray(payload.sections) && payload.sections.length > 0)) {
          await enviarLista(jid, {
            title: payload.title || "Menu de Opções",
            text: text || "📋 Selecione uma das opções abaixo:",
            footer: payload.footer || "IPTV Bot",
            buttonText: payload.buttonText || "📋 Abrir Lista",
            sections: payload.sections,
            rows: payload.rows,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, type: "list" }));
          return;
        }

        // Envio de Botão Copiar PIX
        if (type === "pix_copy" || payload.pixCode) {
          const pixCode =
            payload.pixCode ||
            "00020126580014br.gov.bcb.pix0136teste-chave-pix5204000053039865802BR5915IPTV MANAGER6009SAO PAULO62070503***6304ABCD";
          await enviarBotaoCopiar(jid, pixCode, text);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, type: "pix_copy" }));
          return;
        }

        // Envio de Botão Link
        if (type === "link" || payload.url) {
          await enviarBotaoLink(jid, text, payload.label || "Acessar Link", payload.url);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, type: "link" }));
          return;
        }

        // Envio Padrão: Texto Simples
        await sock.sendMessage(jid, { text: text || "Olá!" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, type: "text" }));
      } catch (e) {
        console.error("❌ Erro na API send-message:", e.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint não encontrado" }));
});

server.listen(HTTP_PORT, () => {
  console.log(`🌐 Servidor de Controle Baileys ativo na porta ${HTTP_PORT}`);
  // Inicia o bot automaticamente se já houver credenciais salvas
  startBaileysBot();
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Erro não tratado:", err?.message || err);
});
