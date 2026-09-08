import { createRequire } from "module";
const require = createRequire(import.meta.url);

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || "https://cobrancas-whatsapp.shop";
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || "evolutionApiGlobalTokenSecure2026";
const LOCAL_API_URL = process.env.LOCAL_API_URL || "http://localhost:8080/api/public/hooks/whatsapp-bot";

const processedMsgIds = new Set();
const configuredInstances = new Set();
const lidToPhoneMap = new Map();
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

async function ensureGroupIgnore(instanceName) {
  if (configuredInstances.has(instanceName)) return;
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
    if (res.ok) {
      configuredInstances.add(instanceName);
      console.log(`[Daemon] 🛡️ Ignorar grupos ativado na instância ${instanceName}`);
    }
  } catch {}
}

async function getConnectedInstances() {
  try {
    const res = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_KEY },
    });
    if (!res.ok) return [];
    const instances = await res.json();
    return (instances || []).filter((i) => i.connectionStatus === "open");
  } catch (err) {
    console.error("[Daemon] Erro ao buscar instâncias:", err.message);
    return [];
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
        order: [["messageTimestamp", "DESC"]],
        limit: 50,
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

async function forwardToLocalWebhook(instanceName, msg) {
  const remoteJid = msg.key?.remoteJid || "";
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("@broadcast")) return;

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.buttonsResponseMessage?.selectedDisplayText ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.message?.listResponseMessage?.title ||
    msg.message?.templateButtonReplyMessage?.selectedId ||
    msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    "";

  if (!text.trim()) return;

  const cleanId = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
  const realPhone = lidToPhoneMap.get(cleanId) || lidToPhoneMap.get(remoteJid) || cleanId;

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

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
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
    console.error("[Daemon] Erro ao enviar para webhook local:", err.message);
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
    await ensureGroupIgnore(inst.name);
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

      // No primeiro ciclo (startup), adiciona as mensagens existentes ao conjunto para não responder passado
      if (isFirstRun) {
        processedMsgIds.add(msgId);
        continue;
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
  console.log("[Daemon] Conectando ao Evolution API na VPS com suporte a LIDs e tempo real (DESC)...");
  await pollOnce();

  setInterval(async () => {
    try {
      await pollOnce();
    } catch (e) {
      console.error("[Daemon] Erro no loop de polling:", e.message);
    }
  }, 1500);
}

start();
