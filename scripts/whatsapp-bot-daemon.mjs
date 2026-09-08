import { createRequire } from "module";
const require = createRequire(import.meta.url);

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || "https://cobrancas-whatsapp.shop";
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || "evolutionApiGlobalTokenSecure2026";
const LOCAL_API_URL = "http://localhost:8080/api/public/hooks/whatsapp-bot";

const processedMsgIds = new Set();
let isFirstRun = true;

function normalizeNumber(num) {
  if (!num) return "";
  let clean = num.replace(/\D/g, "");
  if (clean.length === 10 || clean.length === 11) {
    clean = "55" + clean;
  }
  return clean;
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
        limit: 25,
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
  if (!remoteJid || remoteJid.endsWith("@g.us")) return; // ignora grupos

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.buttonsResponseMessage?.selectedDisplayText ||
    msg.message?.listResponseMessage?.title ||
    "";

  if (!text.trim()) return;

  const senderPhone = remoteJid.replace(/@.*$/, "");
  const pushName = msg.pushName || "Cliente";

  // Extrai userId da instância se formato iptv_userId
  let userId = "";
  if (instanceName.startsWith("iptv_")) {
    const raw = instanceName.slice(5);
    if (raw.length === 32) {
      userId = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
    } else {
      userId = raw;
    }
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

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const resJson = await res.json().catch(() => null);
      console.log(`[Daemon] ✅ Mensagem de ${senderPhone} processada com sucesso: "${text}" (Ação: ${resJson?.action || "ok"})`);
    } else {
      console.warn(`[Daemon] ⚠️ Webhook local respondeu com status ${res.status}`);
    }
  } catch (err) {
    console.error("[Daemon] Erro ao enviar para webhook local:", err.message);
  }
}

async function pollOnce() {
  const instances = await getConnectedInstances();
  for (const inst of instances) {
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
      await forwardToLocalWebhook(inst.name, msg);
    }
  }

  if (isFirstRun) {
    isFirstRun = false;
    console.log(`[Daemon] 🚀 Robô WhatsApp Daemon iniciado! Monitorando ${instances.length} instância(s) em tempo real...`);
  }
}

async function start() {
  console.log("[Daemon] Conectando ao Evolution API na VPS com ordenação em tempo real (DESC)...");
  await pollOnce(); // Popula mensagens existentes

  setInterval(async () => {
    try {
      await pollOnce();
    } catch (e) {
      console.error("[Daemon] Erro no loop de polling:", e.message);
    }
  }, 1500);
}

start();
