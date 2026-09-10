import { createRequire } from "module";
const require = createRequire(import.meta.url);

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || "https://cobrancas-whatsapp.shop";
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || "evolutionApiGlobalTokenSecure2026";
const LOCAL_API_URL = process.env.LOCAL_API_URL || "http://localhost:3000/api/public/hooks/whatsapp-bot";

const processedMsgIds = new Set();
const configuredInstances = new Set();
const lidToPhoneMap = new Map();
const phoneCooldownMap = new Map();
let isFirstRun = true;
let lastHeartbeat = 0;
let lastLidRefresh = 0;

function pruneProcessedSet() {
  if (processedMsgIds.size > 2000) {
    const arr = Array.from(processedMsgIds);
    processedMsgIds.clear();
    arr.slice(-1000).forEach((id) => processedMsgIds.add(id));
  }
}

async function updateLidMapping(instanceName) {
  const now = Date.now();
  if (now - lastLidRefresh < 60000 && lidToPhoneMap.size > 0) return;
  lastLidRefresh = now;

  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/findContacts/${instanceName}`, {
      method: "POST",
      headers: { apikey: EVOLUTION_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return;
    const data = await res.json();
    const contacts = Array.isArray(data) ? data : data?.records || [];

    const picMap = new Map();
    for (const c of contacts) {
      if (c.remoteJid?.endsWith("@s.whatsapp.net") && c.profilePicUrl) {
        const phone = c.remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
        picMap.set(c.profilePicUrl, phone);
      }
    }
    for (const c of contacts) {
      if (c.remoteJid?.endsWith("@lid") && c.profilePicUrl) {
        const phone = picMap.get(c.profilePicUrl);
        if (phone) {
          const lid = c.remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
          lidToPhoneMap.set(lid, phone);
          lidToPhoneMap.set(c.remoteJid, phone);
        }
      }
    }
  } catch {}
}

async function ensureInstanceOnlineAndSettings(instanceName) {
  try {
    const res = await fetch(`${EVOLUTION_URL}/settings/set/${instanceName}`, {
      method: "POST",
      headers: {
        apikey: EVOLUTION_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rejectCall: false,
        msgCall: "",
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: true,
        readStatus: false,
        syncFullHistory: false,
      }),
    });
    if (res.ok && !configuredInstances.has(instanceName)) {
      configuredInstances.add(instanceName);
      console.log(`[Daemon] 🛡️ Instância ${instanceName} configurada: alwaysOnline=true, readMessages=true, groupsIgnore=true`);
    }

    // Mantém presença global permanentemente disponível no WhatsApp
    await fetch(`${EVOLUTION_URL}/instance/setPresence/${instanceName}`, {
      method: "POST",
      headers: {
        apikey: EVOLUTION_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        presence: "available",
      }),
    }).catch(() => {});
  } catch {}
}

let cachedInstances = [];
let lastInstancesFetch = 0;

async function getConnectedInstances() {
  const now = Date.now();
  if (now - lastInstancesFetch < 10000 && cachedInstances.length > 0) {
    return cachedInstances;
  }
  try {
    const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_KEY },
    });
    if (!res.ok) return cachedInstances;
    const instances = await res.json();
    cachedInstances = (instances || []).filter((i) => i.connectionStatus === "open");
    lastInstancesFetch = now;
    return cachedInstances;
  } catch (err) {
    console.error("[Daemon] Erro ao buscar instâncias:", err.message);
    return cachedInstances;
  }
}

async function getRecentMessages(instanceName) {
  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/findMessages/${instanceName}`, {
      method: "POST",
      headers: {
        apikey: EVOLUTION_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: 15,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.messages?.records || data.records || [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error(`[Daemon] Erro ao buscar mensagens para ${instanceName}:`, err.message);
    return [];
  }
}

function unwrapMessage(m) {
  if (!m || typeof m !== "object") return {};
  if (m.ephemeralMessage?.message) return unwrapMessage(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return unwrapMessage(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrapMessage(m.viewOnceMessageV2.message);
  if (m.viewOnceMessageV2Extension?.message) return unwrapMessage(m.viewOnceMessageV2Extension.message);
  if (m.documentWithCaptionMessage?.message) return unwrapMessage(m.documentWithCaptionMessage.message);
  return m;
}

async function forwardToLocalWebhook(instanceName, msg) {
  const remoteJid = msg.key?.remoteJid || "";
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("@broadcast")) return;

  const mObj = unwrapMessage(msg.message);

  let text =
    mObj?.conversation ||
    mObj?.extendedTextMessage?.text ||
    mObj?.buttonsResponseMessage?.selectedButtonId ||
    mObj?.buttonsResponseMessage?.selectedDisplayText ||
    mObj?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    mObj?.listResponseMessage?.title ||
    mObj?.templateButtonReplyMessage?.selectedId ||
    mObj?.interactiveResponseMessage?.body?.text ||
    "";

  if (!text) {
    const nativeFlow = mObj?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    if (nativeFlow) {
      try {
        const parsed = JSON.parse(nativeFlow);
        text = String(parsed.id || parsed.selectedId || parsed.rowId || nativeFlow);
      } catch {
        text = String(nativeFlow);
      }
    }
  }

  if (!text.trim()) return;

  const cleanId = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
  const realPhone = lidToPhoneMap.get(cleanId) || lidToPhoneMap.get(remoteJid) || cleanId;
  const normalizedPhone = realPhone.startsWith("55") ? realPhone : `55${realPhone}`;

  const lastTime = phoneCooldownMap.get(normalizedPhone) || 0;
  const now = Date.now();
  if (now - lastTime < 1200) {
    console.log(`[Daemon] 🛡️ Ignorando duplicata para ${normalizedPhone} (recebida há ${now - lastTime}ms)`);
    return;
  }
  phoneCooldownMap.set(normalizedPhone, now);

  const pushName = msg.pushName || "Cliente";

  // Extrai userId da instância se formato iptv_userId
  let userId = "";
  if (instanceName.startsWith("iptv_")) {
    userId = instanceName.slice(5);
  }

  const payload = {
    event: "messages.upsert",
    instance: instanceName,
    data: {
      key: msg.key,
      pushName,
      message: msg.message,
    },
  };

  const webhookUrl = `${LOCAL_API_URL}${userId ? `?userId=${userId}` : ""}`;

  console.log(`[Daemon] 📩 Nova mensagem de ${realPhone} [${remoteJid}] (${pushName}): "${text.slice(0, 60)}"`);

    let forwardedSuccessfully = false;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        forwardedSuccessfully = true;
        const resJson = await res.json().catch(() => null);
        if (resJson?.ignored === "bot_disabled" || resJson?.action === "bot_disabled") {
          console.log(`[Daemon] 🛑 Robô DESLIGADO no painel. Nenhuma mensagem enviada para ${realPhone}.`);
        } else {
          console.log(`[Daemon] ✅ Resposta enviada com sucesso para ${realPhone} [${remoteJid}]! (Ação: ${resJson?.action || "ok"})`);
        }
      } else {
        console.warn(`[Daemon] ⚠️ Webhook local respondeu com status ${res.status}`);
      }
    } catch (err) {
      console.warn(`[Daemon] Webhook local inacessível (${err.message}). Acionando resposta direta autônoma...`);
    }

    // Se o webhook local não respondeu (ex: app rodando no navegador ou sem localhost), responde diretamente via Evolution API
    if (!forwardedSuccessfully) {
      const t = text.trim().toLowerCase();
      let reply = "";

      if (t === "4" || t === "4." || t.includes("app") || t.includes("baixar") || t.includes("aplicativo")) {
        reply =
          `📲 *APLICATIVOS OFICIAIS — ALPHA IPTV* 🍿\n\n` +
          `🤖 *TV Box / Android TV / FireStick:*\n` +
          `• Abra o app *Downloader* na TV e digite o código: *389471*\n` +
          `• Ou baixe o APK direto: https://bit.ly/app-xciptv-oficial\n\n` +
          `📱 *Celular & Tablet Android:*\n` +
          `• Baixar APK Direto: https://bit.ly/app-xciptv-oficial\n\n` +
          `🍏 *iPhone / iPad / Apple TV (iOS):*\n` +
          `• Baixar na App Store (Smarters Player Lite):\nhttps://apps.apple.com/app/smarters-player-lite/id1628995509\n\n` +
          `💻 *Computador & Notebook (Windows):*\n` +
          `• Baixar IPTV Smarters Pro (.exe):\nhttps://www.iptvsmarters.com/download?download=windows\n\n` +
          `🌐 *Assistir no Navegador (Web Player):*\n` +
          `• Acesso direto sem instalar nada: http://webtv.iptvsmarters.com\n\n` +
          `📺 *Smart TV (Samsung, LG e Roku):*\n` +
          `• Baixe o app IBO Player, SmartOne IPTV ou Bob Player na loja da sua TV e nos envie o Mac / Device ID.`;
      } else if (t === "3" || t === "3." || t.includes("plano") || t.includes("comprar")) {
        reply =
          `🛒 *PLANOS E ASSINATURAS ALPHA IPTV* 🍿\n\n` +
          `📺 *1 Mês (1 Tela):* R$ 35,00\n` +
          `📺 *3 Meses (Trimestral):* R$ 90,00 (Mais econômico!)\n` +
          `📺 *6 Meses (Semestral):* R$ 160,00\n` +
          `📺 *12 Meses (Anual):* R$ 290,00 (Super Desconto ⭐)\n\n` +
          `⭐ *Todos os planos incluem:*\n` +
          `• Mais de 80.000 conteúdos (Canais 4K/FHD, Filmes e Séries atualizados)\n` +
          `• Guia de Canais completo (EPG)\n` +
          `• Compatível com TV Box, Smart TV, Celular, Computador e Tablet\n` +
          `• Ativação Imediata via PIX Automático!`;
      } else if (t === "6" || t === "6." || t.includes("suporte") || t.includes("humano")) {
        reply =
          `👨‍💼 *ATENDIMENTO HUMANO*\n\n` +
          `Sua solicitação foi recebida! Um de nossos atendentes irá te responder diretamente aqui em instantes.\n` +
          `Por favor, deixe sua dúvida ou mensagem abaixo para agilizar seu atendimento. 👇`;
      } else {
        reply =
          `👋 Olá! Seja muito bem-vindo(a) à *Alpha IPTV*! 🍿\n` +
          `Eu sou o assistente virtual do *Alpha server IPTV* e estou aqui para te atender 24h por dia.\n\n` +
          `Como posso te ajudar hoje? Digite o *número* da opção desejada:\n\n` +
          `1️⃣ *Gerar Teste Grátis* (Acesso Imediato)\n` +
          `2️⃣ *Renovar Minha Assinatura* (PIX Automático)\n` +
          `3️⃣ *Comprar Novo Acesso / Planos*\n` +
          `4️⃣ *Baixar Aplicativos* (Celular, TV Box, PC, iOS) 📲\n` +
          `5️⃣ *Reenviar Meus Dados de Acesso / Lista M3U*\n` +
          `6️⃣ *Falar com Atendente Humano*\n\n` +
          `_Responda com 1, 2, 3, 4, 5 ou 6._`;
      }

      const targetSendJid = remoteJid || `${realPhone}@s.whatsapp.net`;
      try {
        await fetch(`${EVOLUTION_URL}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { apikey: EVOLUTION_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            number: targetSendJid,
            text: reply,
            textMessage: { text: reply },
            options: {
              delay: 1200,
              presence: "composing",
              linkPreview: false,
            },
          }),
        });
        console.log(`[Daemon] ✅ Resposta direta autônoma enviada para ${targetSendJid}!`);
      } catch (directErr) {
        console.error(`[Daemon] Falha ao enviar resposta direta:`, directErr.message);
      }
    }
}

async function pollOnce() {
  const instances = await getConnectedInstances();

  const now = Date.now();
  if (now - lastHeartbeat > 30000 && !isFirstRun) {
    lastHeartbeat = now;
    const timeStr = new Date().toLocaleTimeString();
    const instNames = instances.map((i) => i.name).join(", ") || "Nenhuma";
    console.log(`[Daemon ${timeStr}] 🟢 Ativo | Instâncias online: ${instances.length} (${instNames}) | LIDs mapeados: ${lidToPhoneMap.size} | Pronto para responder!`);
  }

  for (const inst of instances) {
    await ensureInstanceOnlineAndSettings(inst.name);
    await updateLidMapping(inst.name);
    const msgs = await getRecentMessages(inst.name);

    for (const msg of msgs) {
      const msgId = msg.key?.id;
      if (!msgId) continue;

      // Se é mensagem enviada pelo próprio bot/revendedor, ignora
      if (msg.key?.fromMe) {
        processedMsgIds.add(msgId);
        continue;
      }

      // No primeiro ciclo (startup), ignora apenas mensagens com mais de 2 minutos para não responder passado antigo
      if (isFirstRun) {
        const msgAgeSec = Math.floor((Date.now() - ((msg.messageTimestamp || 0) * 1000)) / 1000);
        if (msgAgeSec > 120) {
          processedMsgIds.add(msgId);
          continue;
        }
      }

      if (processedMsgIds.has(msgId)) continue;

      // Nova mensagem recebida de cliente em tempo real!
      processedMsgIds.add(msgId);
      pruneProcessedSet();
      await forwardToLocalWebhook(inst.name, msg);
    }
  }

  if (isFirstRun) {
    isFirstRun = false;
    lastHeartbeat = Date.now();
    console.log(`[Daemon] 🚀 Robô WhatsApp Daemon iniciado! Monitorando ${instances.length} instância(s) em tempo real (LIDs mapeados: ${lidToPhoneMap.size})...`);
  }
}

async function start() {
  console.log("[Daemon] Conectando ao Evolution API na VPS com suporte a LIDs e tempo real (800ms)...");
  await pollOnce();

  setInterval(async () => {
    try {
      await pollOnce();
    } catch (e) {
      console.error("[Daemon] Erro no loop de polling:", e.message);
    }
  }, 800);
}

start();
