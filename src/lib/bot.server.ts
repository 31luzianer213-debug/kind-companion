import fs from "fs";
import path from "path";
import { generateM3uUrl, generateEpgUrl, extractCleanIptvDns } from "./format";
import type { SigmaConfig } from "./sigma.panel";
import { createOrderServer, listOrdersServer, approveAndReleaseOrderServer } from "./orders.server";
import { createMercadoPagoPixPayment } from "./mercadopago.server";
import type { ButtonItem, ListSection } from "./billing.server";

export type BotInteractivePayload =
  | {
      type: "buttons";
      title?: string;
      description: string;
      buttons: ButtonItem[];
      footer?: string;
    }
  | {
      type: "list";
      title: string;
      description: string;
      buttonText: string;
      footerText?: string;
      sections: ListSection[];
    };

export type BotProcessResult = {
  reply: string;
  action: string;
  interactive?: BotInteractivePayload;
};

export type BotConfigData = {
  enabled: boolean;
  businessName: string;
  testEnabled: boolean;
  testDurationHours: number;
  testPackageName: string;
  blockRepeatDays: number;
  menuGreeting: string;
  plansText: string;
  supportMessage: string;
  pixKey?: string;
  pixHolder?: string;
};

export const DEFAULT_BOT_CONFIG: BotConfigData = {
  enabled: true,
  businessName: "Alpha IPTV",
  testEnabled: true,
  testDurationHours: 4,
  testPackageName: "TESTE LISTA IPTV ALPHA COM TODOS CONTEUDOS COM ADULTOS 🔞",
  blockRepeatDays: 7,
  menuGreeting:
    "👋 Olá! Seja muito bem-vindo(a) à *{empresa}*! 🍿\n" +
    "Eu sou o assistente virtual do *{servidor}* e estou aqui para te atender 24h por dia.\n\n" +
    "Como posso te ajudar hoje? Digite o *número* da opção desejada:\n\n" +
    "1️⃣ *Gerar Teste Grátis* (Acesso Imediato)\n" +
    "2️⃣ *Renovar Minha Assinatura* (PIX Automático)\n" +
    "3️⃣ *Comprar Novo Acesso / Planos*\n" +
    "4️⃣ *Reenviar Meus Dados de Acesso / Lista M3U*\n" +
    "5️⃣ *Falar com Atendente Humano*\n\n" +
    "_Responda com 1, 2, 3, 4 ou 5._",
  plansText:
    "🛒 *PLANOS E ASSINATURAS DISPONÍVEIS* 🍿\n\n" +
    "📺 *1 Mês (1 Tela):* R$ 35,00\n" +
    "📺 *1 Mês (2 Telas):* R$ 55,00\n" +
    "📺 *3 Meses (Trimestral):* R$ 90,00 (Mais econômico!)\n" +
    "📺 *6 Meses (Semestral):* R$ 160,00\n\n" +
    "⭐ *Todos os planos incluem:*\n" +
    "• Mais de 80.000 conteúdos (Canais 4K/FHD, Filmes e Séries atualizados)\n" +
    "• Guia de Canais completo (EPG)\n" +
    "• Funciona em TV Box, Smart TV, Celular, Computador e Tablet.",
  supportMessage:
    "👨‍💼 *ATENDIMENTO HUMANO*\n\n" +
    "Sua solicitação foi recebida! Um de nossos atendentes irá te responder diretamente aqui em instantes.\n" +
    "Por favor, deixe sua dúvida ou mensagem abaixo para agilizar seu atendimento. 👇",
};

// Cache em memória para leitura ultrarrápida (0ms) sem bloqueio de RLS
const botConfigCache = new Map<string, BotConfigData>();

function getLocalConfigPath(userId?: string): string {
  const safeId = (userId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, `bot_config_${safeId}.json`);
}

function readLocalConfig(userId?: string): Partial<BotConfigData> | null {
  try {
    const file = getLocalConfigPath(userId);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function writeLocalConfig(userId: string | undefined, data: BotConfigData): void {
  try {
    const file = getLocalConfigPath(userId);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Aviso ao gravar config local do bot:", err);
  }
}

/** Carrega as configurações do bot com persistência em 3 níveis (Disco -> Memória -> Banco) */
export async function loadBotConfig(supabase: any, userId: string): Promise<BotConfigData> {
  const uid = userId || "default";

  // 1. Arquivo persistente no disco (garante atualização instantânea entre processos)
  const diskData = readLocalConfig(uid);
  if (diskData && typeof diskData.enabled === "boolean") {
    const merged: BotConfigData = { ...DEFAULT_BOT_CONFIG, ...diskData };
    botConfigCache.set(uid, merged);
    return merged;
  }

  // 2. Cache em memória
  if (botConfigCache.has(uid)) {
    return botConfigCache.get(uid)!;
  }

  // 3. Fallback para banco de dados e metadata
  try {
    let wsRow: any = null;
    try {
      const { data } = await supabase
        .from("whatsapp_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      wsRow = data;
    } catch {
      wsRow = null;
    }

    let metaBot: any = null;
    try {
      if (supabase?.auth?.getUser) {
        const { data: authUser } = await supabase.auth.getUser();
        metaBot = authUser?.user?.user_metadata?.bot_settings ?? null;
      }
    } catch {
      metaBot = null;
    }

    const businessName =
      wsRow?.business_name?.trim() ||
      metaBot?.businessName?.trim() ||
      DEFAULT_BOT_CONFIG.businessName;

    const enabled =
      metaBot?.enabled !== undefined
        ? Boolean(metaBot.enabled)
        : wsRow?.auto_send_enabled !== undefined
          ? Boolean(wsRow.auto_send_enabled)
          : DEFAULT_BOT_CONFIG.enabled;

    const config: BotConfigData = {
      enabled,
      businessName,
      testEnabled: metaBot?.testEnabled ?? DEFAULT_BOT_CONFIG.testEnabled,
      testDurationHours: metaBot?.testDurationHours ?? DEFAULT_BOT_CONFIG.testDurationHours,
      testPackageName:
        metaBot?.testPackageName?.trim() ||
        DEFAULT_BOT_CONFIG.testPackageName,
      blockRepeatDays: metaBot?.blockRepeatDays ?? DEFAULT_BOT_CONFIG.blockRepeatDays,
      menuGreeting: metaBot?.menuGreeting?.trim() || DEFAULT_BOT_CONFIG.menuGreeting,
      plansText: metaBot?.plansText?.trim() || DEFAULT_BOT_CONFIG.plansText,
      supportMessage: metaBot?.supportMessage?.trim() || DEFAULT_BOT_CONFIG.supportMessage,
      pixKey: wsRow?.pix_key || metaBot?.pixKey,
      pixHolder: wsRow?.pix_holder || metaBot?.pixHolder,
    };

    botConfigCache.set(uid, config);
    writeLocalConfig(uid, config);
    return config;
  } catch (err) {
    console.error("[loadBotConfig] Fallback para DEFAULT_BOT_CONFIG:", err);
    return { ...DEFAULT_BOT_CONFIG };
  }
}

/** Salva as configurações do bot imediatamente no disco, memória e banco */
export async function saveBotConfigServer(
  supabase: any,
  userId: string,
  config: Partial<BotConfigData>,
): Promise<void> {
  const uid = userId || "default";
  const current = await loadBotConfig(supabase, userId);
  const updated: BotConfigData = { ...current, ...config };

  // 1. Atualiza imediatamente cache em memória e arquivo no disco
  botConfigCache.set(uid, updated);
  writeLocalConfig(uid, updated);

  // 2. Atualiza na tabela whatsapp_settings
  try {
    await supabase
      .from("whatsapp_settings")
      .update({
        business_name: updated.businessName,
        auto_send_enabled: updated.enabled,
        ...(updated.pixKey ? { pix_key: updated.pixKey } : {}),
        ...(updated.pixHolder ? { pix_holder: updated.pixHolder } : {}),
      })
      .eq("user_id", userId);
  } catch {}

  // 3. Salva no user_metadata se houver autenticação
  try {
    if (supabase?.auth?.updateUser) {
      await supabase.auth.updateUser({
        data: {
          bot_settings: {
            ...updated,
            updated_at: new Date().toISOString(),
          },
        },
      });
    }
  } catch (err) {
    console.error("Erro ao salvar bot_settings no metadata:", err);
  }
}

/** Cria um teste no Sigma e registra o cliente no sistema */
export async function createTrialForBot(
  supabase: any,
  userId: string,
  params: {
    phone: string;
    senderName?: string;
  },
): Promise<{
  ok: boolean;
  username?: string;
  password?: string;
  m3uUrl?: string;
  epgUrl?: string;
  serverName?: string;
  streamingDns?: string;
  error?: string;
}> {
  const cleanPhone = params.phone.replace(/\D/g, "");
  const botConfig = await loadBotConfig(supabase, userId);

  // 1. Verificação Anti-Fraude: confere se esse número já teve teste nos últimos X dias
  if (botConfig.blockRepeatDays > 0 && cleanPhone) {
    const cutoffDate = new Date(Date.now() - botConfig.blockRepeatDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentTrials } = await supabase
      .from("clients")
      .select("id, created_at, iptv_username")
      .eq("user_id", userId)
      .eq("phone", cleanPhone)
      .gte("created_at", cutoffDate);

    if (recentTrials && recentTrials.length > 0) {
      return {
        ok: false,
        error:
          `⚠️ *Aviso de Teste Grátis*\n\n` +
          `Identificamos que este número de WhatsApp já gerou um teste recente.\n\n` +
          `Para continuar assistindo com todos os canais liberados, escolha:\n` +
          `• Digite *2* para Renovar sua assinatura\n` +
          `• Digite *3* para Comprar um Plano`,
      };
    }
  }

  // 2. Carrega as credenciais salvas do Sigma
  let wsRow: any = null;
  try {
    const { data } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    wsRow = data;
  } catch {}

  let userMetaSigma: any = null;
  try {
    const { data: authUser } = await supabase.auth.getUser();
    userMetaSigma = authUser?.user?.user_metadata?.sigma_settings ?? null;
  } catch {}

  const panelUrl = wsRow?.sigma_url || userMetaSigma?.url;
  const panelToken = wsRow?.sigma_token || userMetaSigma?.token;
  const panelUser = wsRow?.sigma_username || userMetaSigma?.username;
  const panelPass = wsRow?.sigma_password || userMetaSigma?.password;

  const serverName =
    wsRow?.sigma_server_name?.trim() ||
    userMetaSigma?.server_name?.trim() ||
    botConfig.businessName ||
    "Alpha server IPTV";

  const streamingDns =
    wsRow?.sigma_streaming_dns?.trim() ||
    userMetaSigma?.streaming_dns?.trim() ||
    "http://karen256.top";

  // 3. Gera credenciais aleatórias para o teste
  const trialUsername = Math.floor(10000000 + Math.random() * 90000000).toString();
  const trialPassword = Math.floor(100000 + Math.random() * 900000).toString();
  const clientDisplayName = (params.senderName?.trim() || "Cliente Teste WhatsApp") + " (Teste)";

  const hours = botConfig.testDurationHours || 4;
  const expiryDate = new Date(Date.now() + hours * 60 * 60 * 1000);
  const expiryIso = expiryDate.toISOString().slice(0, 10);

  // 4. Cria a linha no painel Sigma se as credenciais estiverem configuradas
  if (panelUrl && (panelToken || (panelUser && panelPass))) {
    try {
      const { createSigmaCustomer } = await import("./sigma.panel");
      const sigmaConfig: SigmaConfig = {
        url: panelUrl,
        token: panelToken,
        username: panelUser,
        password: panelPass,
      };

      await createSigmaCustomer(sigmaConfig, {
        name: clientDisplayName,
        username: trialUsername,
        password: trialPassword,
        phone: cleanPhone,
        screens: 1,
        dueDate: expiryIso,
        notes: `Teste automático gerado via Bot WhatsApp (${hours}h)`,
      });
    } catch (sigmaErr) {
      console.warn("Aviso ao criar teste no Sigma (prosseguindo com entrega da lista e credenciais):", sigmaErr);
    }
  }

  // 5. Gera links de acesso oficiais do IPTV
  const cleanDns = extractCleanIptvDns(streamingDns) || "http://karen256.top";
  const m3uUrl = generateM3uUrl(cleanDns, trialUsername, trialPassword, "ts");
  const epgUrl = generateEpgUrl(cleanDns, trialUsername, trialPassword);

  // 6. Registra no banco de dados local na tabela `clients`
  try {
    await supabase.from("clients").insert({
      user_id: userId,
      name: clientDisplayName,
      phone: cleanPhone,
      iptv_username: trialUsername,
      iptv_password: trialPassword,
      screens: 1,
      monthly_fee: 35.0,
      next_due_date: expiryIso,
      status: "active",
      notes: `[TESTE_BOT_WHATSAPP]\nM3U: ${m3uUrl}\nServidor: ${serverName}\nPacote: ${botConfig.testPackageName}`,
    });
  } catch (dbErr) {
    console.error("Erro ao registrar cliente teste no banco:", dbErr);
  }

  return {
    ok: true,
    username: trialUsername,
    password: trialPassword,
    m3uUrl,
    epgUrl,
    serverName,
    streamingDns: cleanDns,
  };
}

// Estado de conversa em memória para gerenciar fluxos interativos (timeout 15 minutos)
type ConversationSession = {
  step: "awaiting_renew_username" | "awaiting_renew_confirm";
  timestamp: number;
  data?: {
    candidateUsername?: string;
    clientId?: string;
    clientName?: string;
    fee?: string;
  };
};

const conversationSessions = new Map<string, ConversationSession>();

/**
 * Processador central de mensagens do Bot.
 * Recebe o texto que o cliente mandou, decide o fluxo e devolve a resposta formatada.
 */
export async function processBotMessage(
  supabase: any,
  userId: string,
  params: {
    phone: string;
    text: string;
    pushName?: string;
  },
): Promise<BotProcessResult> {
  const config = await loadBotConfig(supabase, userId);

  // Se o robô foi desligado no painel pelo revendedor, não responde nada
  if (!config.enabled) {
    return { reply: "", action: "bot_disabled" };
  }

  const cleanPhone = params.phone.replace(/\D/g, "");
  const text = (params.text ?? "").trim().toLowerCase();

  // Carrega dados do servidor IPTV
  let wsRow: any = null;
  try {
    const { data } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    wsRow = data;
  } catch {}

  const serverName = wsRow?.sigma_server_name?.trim() || config.businessName || "Alpha server IPTV";
  const streamingDns = wsRow?.sigma_streaming_dns?.trim() || "http://karen256.top";
  const pixKey = config.pixKey || wsRow?.pix_key || "Consulte nossa chave PIX";
  const pixHolder = config.pixHolder || wsRow?.pix_holder || config.businessName;

  // =========================================================================
  // CONSULTA DE STATUS DE PEDIDO (Botão "Verificar Pagamento" ou "Status")
  // =========================================================================
  if (text.startsWith("check_order_") || text.startsWith("status_order_")) {
    const orderId = text.replace(/^(check_order_|status_order_)/, "").trim();
    const orders = await listOrdersServer(userId);
    const order = orders.find((o) => o.id === orderId);

    if (!order) {
      return {
        reply: "🔍 Pedido não encontrado ou já processado. Toque em *3* para ver os planos e iniciar uma assinatura!",
        action: "order_not_found",
      };
    }

    if (order.status === "approved") {
      return {
        reply:
          `🎉 *PEDIDO #${order.order_number} APROVADO E LIBERADO!* 🍿\n\n` +
          `📦 *Plano:* ${order.plan_name}\n` +
          `🔑 *Usuário:* *${order.target_username}*\n` +
          `📺 *Servidor:* ${serverName}\n\n` +
          `Para ver seus dados de acesso completos (usuário, senha e M3U), envie *4*! 🍿`,
        action: "order_already_approved",
      };
    }

    // Se é Mercado Pago, consulta em tempo real na API do MP para ver se foi pago
    if (order.status === "pending" && wsRow?.mercadopago_token && order.gateway_payment_id) {
      try {
        const mpCheck = await fetch(`https://api.mercadopago.com/v1/payments/${order.gateway_payment_id}`, {
          headers: { Authorization: `Bearer ${wsRow.mercadopago_token.trim()}` },
        });
        if (mpCheck.ok) {
          const mpData = await mpCheck.json();
          if (mpData.status === "approved") {
            const approvedRes = await approveAndReleaseOrderServer(userId, order.id);
            if (approvedRes.ok) {
              return {
                reply:
                  `🎉 *PAGAMENTO CONFIRMADO COM SUCESSO!* 🍿\n\n` +
                  `Identificamos seu pagamento do Pedido *#${order.order_number}* via Mercado Pago!\n` +
                  `Seu acesso acabou de ser ativado no servidor. Digite *4* para ver seus dados de conexão completos! 🍿`,
                action: "order_auto_approved",
              };
            }
          }
        }
      } catch {}
    }

    const pixCodeNotice = order.pix_code
      ? `\n\n👇 *PIX Copia e Cola:*\n\`${order.pix_code}\``
      : "";

    return {
      reply:
        `⏳ *PEDIDO #${order.order_number} AGUARDANDO PAGAMENTO* ⏳\n\n` +
        `📦 *Plano:* ${order.plan_name}\n` +
        `💰 *Valor:* R$ ${Number(order.amount).toFixed(2).replace(".", ",")}\n` +
        (order.payment_method === "mercadopago_pix"
          ? `⚡ O Mercado Pago confirmará automaticamente assim que o PIX for concluído.${pixCodeNotice}`
          : `💳 Chave PIX: \`${pixKey}\`\nPor favor, envie o comprovante do PIX aqui para liberação pelo painel do administrador!`),
      action: "order_status_checked",
      interactive: {
        type: "buttons",
        title: `Pedido #${order.order_number} Pendente ⏳`,
        description: `Seu pedido #${order.order_number} está aguardando confirmação do PIX de R$ ${Number(order.amount).toFixed(2).replace(".", ",")}.`,
        buttons: [
          { id: `check_order_${order.id}`, displayText: "🔄 Verificar Novamente", type: "reply" },
          { id: "5", displayText: "👨‍💼 Falar com Atendente", type: "reply" },
        ],
        footer: "Sistema IPTV Inteligente",
      },
    };
  }

  // =========================================================================
  // SELEÇÃO DIRETA DE PLANO (Via Botões Interativos ou Resposta Rápida)
  // =========================================================================
  const isPlan1m =
    text === "plano_1m" ||
    text === "1m" ||
    text === "1 mes" ||
    text === "1 mês" ||
    text === "mensal" ||
    text === "plano mensal";

  const isPlan3m =
    text === "plano_3m" ||
    text === "3m" ||
    text === "3 meses" ||
    text === "trimestral" ||
    text === "plano trimestral";

  const isPlan6m =
    text === "plano_6m" ||
    text === "6m" ||
    text === "6 meses" ||
    text === "semestral" ||
    text === "plano semestral";

  if (isPlan1m || isPlan3m || isPlan6m) {
    let planName = "Plano Mensal (1 Mês - 1 Tela)";
    let amount = 35.0;
    let durationMonths = 1;

    if (isPlan3m) {
      planName = "Plano Trimestral (3 Meses - Econômico)";
      amount = 90.0;
      durationMonths = 3;
    } else if (isPlan6m) {
      planName = "Plano Semestral (6 Meses - Super Desconto)";
      amount = 160.0;
      durationMonths = 6;
    }

    const order = await createOrderServer(userId, {
      customer_name: params.pushName || "Cliente WhatsApp",
      customer_phone: cleanPhone,
      plan_name: planName,
      amount,
      duration_months: durationMonths,
      screens: 1,
      type: "new_access",
    });

    const mpToken = wsRow?.mercadopago_token?.trim();
    let mpPixResult: any = null;

    if (mpToken) {
      mpPixResult = await createMercadoPagoPixPayment({
        token: mpToken,
        amount,
        description: `${planName} - Pedido #${order.order_number}`,
        orderId: order.id,
        customerName: params.pushName || "Cliente",
        customerPhone: cleanPhone,
      });

      if (mpPixResult.ok && mpPixResult.qrCode) {
        order.pix_code = mpPixResult.qrCode;
        order.gateway_payment_id = mpPixResult.paymentId;
        order.payment_method = "mercadopago_pix";
      }
    }

    if (mpPixResult?.ok && mpPixResult?.qrCode) {
      // MODO AUTOMÁTICO MERCADO PAGO
      const reply =
        `🎉 *PEDIDO #${order.order_number} GERADO COM SUCESSO!* 🍿\n\n` +
        `📦 *Plano:* ${planName}\n` +
        `💰 *Valor:* *R$ ${amount.toFixed(2).replace(".", ",")}*\n` +
        `⚡ *Forma de Pagamento:* PIX Automático (Mercado Pago)\n\n` +
        `👇 *PIX COPIA E COLA (Toque para copiar):*\n` +
        `\`${mpPixResult.qrCode}\`\n\n` +
        `✅ *Liberação 100% Automática!*\n` +
        `Assim que você pagar no seu banco, o sistema reconhece em poucos segundos e já envia seu Login, Senha e Lista M3U aqui mesmo nesta conversa! 🚀`;

      return {
        reply,
        action: "order_created_mp",
        interactive: {
          type: "buttons",
          title: `Pedido #${order.order_number} Gerado 🍿`,
          description: reply,
          buttons: [
            { id: `check_order_${order.id}`, displayText: "⚡ Já Paguei / Verificar", type: "reply" },
            { id: "menu", displayText: "🏠 Menu Principal", type: "reply" },
          ],
          footer: "Liberação automática via Mercado Pago",
        },
      };
    }

    // MODO MANUAL (Sem Mercado Pago cadastrado ou falha de token)
    const effectivePixKey = pixKey || "Consulte nossa chave PIX com nosso suporte";
    const reply =
      `🎉 *PEDIDO #${order.order_number} GERADO COM SUCESSO!* 🍿\n\n` +
      `📦 *Plano:* ${planName}\n` +
      `💰 *Valor:* *R$ ${amount.toFixed(2).replace(".", ",")}*\n` +
      `💳 *Forma de Pagamento:* Transferência PIX\n\n` +
      `🔑 *Chave PIX:* \`${effectivePixKey}\`\n` +
      `👤 *Titular:* ${pixHolder}\n\n` +
      `📌 *Como Ativar Seu Acesso:*\n` +
      `1️⃣ Faça o PIX no valor de *R$ ${amount.toFixed(2).replace(".", ",")}* para a chave acima.\n` +
      `2️⃣ *Envie o comprovante do PIX aqui nesta conversa*.\n` +
      `3️⃣ Nosso administrador confirmará pelo painel e seu acesso será liberado imediatamente! 🚀`;

    return {
      reply,
      action: "order_created_manual",
      interactive: {
        type: "buttons",
        title: `Pedido #${order.order_number} Criado 🍿`,
        description: reply,
        buttons: [
          { id: `status_order_${order.id}`, displayText: "📋 Status do Pedido", type: "reply" },
          { id: "5", displayText: "👨‍💼 Falar com Atendente", type: "reply" },
        ],
        footer: "Liberação manual via Painel de Pedidos",
      },
    };
  }

  // =========================================================================
  // GERENCIAMENTO DE SESSÃO MULTI-PASSO (Ex: pergunta de usuário na renovação)
  // =========================================================================
  const now = Date.now();
  const session = conversationSessions.get(cleanPhone);
  const isSessionValid = session && now - session.timestamp < 15 * 60 * 1000;

  // Se o cliente digitou comando para trocar de opção, limpa o estado anterior
  if (
    text === "0" ||
    text === "menu" ||
    text === "sair" ||
    text === "cancelar" ||
    text === "voltar" ||
    text === "1" ||
    text === "3" ||
    text === "4" ||
    text === "5"
  ) {
    if (session) conversationSessions.delete(cleanPhone);
  } else if (isSessionValid && session) {
    // -----------------------------------------------------------------------
    // Etapa 2A: Cliente confirmando o usuário sugerido ("SIM") ou digitando outro
    // -----------------------------------------------------------------------
    if (session.step === "awaiting_renew_confirm") {
      const isYes =
        text === "sim" ||
        text === "s" ||
        text === "ok" ||
        text === "confirmo" ||
        text === "quero" ||
        text === "renovar";

      const targetUsername = isYes
        ? (session.data?.candidateUsername || cleanPhone)
        : params.text.trim();

      conversationSessions.delete(cleanPhone);

      let clientMatch: any = null;
      try {
        const { data } = await supabase
          .from("clients")
          .select("*")
          .eq("user_id", userId)
          .or(`iptv_username.eq.${targetUsername},name.ilike.%${targetUsername}%`)
          .limit(1)
          .maybeSingle();
        clientMatch = data;
      } catch {}

      const fee = clientMatch?.monthly_fee
        ? `R$ ${Number(clientMatch.monthly_fee).toFixed(2).replace(".", ",")}`
        : (session.data?.fee || "R$ 35,00");

      const reply =
        `💳 *DADOS PARA PAGAMENTO PIX* 📺\n\n` +
        `✅ *Usuário a Renovar:* *${targetUsername}*\n` +
        (clientMatch?.name ? `👤 *Cliente:* ${clientMatch.name}\n` : "") +
        `📺 *Servidor:* ${serverName}\n` +
        `💰 *Valor:* ${fee}\n\n` +
        `🔑 *Chave PIX:* \`${pixKey}\`\n` +
        `👤 *Titular:* ${pixHolder}\n\n` +
        `Após realizar o PIX, *envie o comprovante aqui* nesta conversa para ativarmos imediatamente! 🚀\n` +
        `Dúvidas? Digite *5* para falar com um atendente.`;

      return { reply, action: "renew_pix_sent" };
    }

    // -----------------------------------------------------------------------
    // Etapa 2B: Cliente digitou o login/usuário que quer renovar
    // -----------------------------------------------------------------------
    if (session.step === "awaiting_renew_username") {
      const targetUsername = params.text.trim();
      conversationSessions.delete(cleanPhone);

      let clientMatch: any = null;
      try {
        const { data } = await supabase
          .from("clients")
          .select("*")
          .eq("user_id", userId)
          .or(`iptv_username.eq.${targetUsername},name.ilike.%${targetUsername}%`)
          .limit(1)
          .maybeSingle();
        clientMatch = data;
      } catch {}

      const fee = clientMatch?.monthly_fee
        ? `R$ ${Number(clientMatch.monthly_fee).toFixed(2).replace(".", ",")}`
        : "R$ 35,00";

      const reply =
        `💳 *DADOS PARA PAGAMENTO PIX* 📺\n\n` +
        `✅ *Usuário a Renovar:* *${targetUsername}*\n` +
        (clientMatch?.name ? `👤 *Cliente:* ${clientMatch.name}\n` : "") +
        `📺 *Servidor:* ${serverName}\n` +
        `💰 *Valor da Mensalidade:* ${fee}\n\n` +
        `🔑 *Chave PIX:* \`${pixKey}\`\n` +
        `👤 *Titular:* ${pixHolder}\n\n` +
        `Após realizar o PIX, por favor *envie o comprovante aqui* nesta conversa para renovarmos seu acesso imediatamente! 🚀\n` +
        `Se precisar de suporte, digite *5*.`;

      return { reply, action: "renew_pix_sent" };
    }
  }

  // =========================================================================
  // OPÇÃO 1: TESTE GRÁTIS
  // =========================================================================
  if (
    text === "1" ||
    text === "1." ||
    text.includes("teste") ||
    text.includes("testar") ||
    text.includes("gratis") ||
    text.includes("grátis")
  ) {
    const trialRes = await createTrialForBot(supabase, userId, {
      phone: cleanPhone,
      senderName: params.pushName,
    });

    if (!trialRes.ok) {
      return {
        reply: trialRes.error || "Não foi possível gerar seu teste agora. Tente novamente em alguns instantes.",
        action: "trial_failed",
      };
    }

    const reply =
      `🎉 *SEU TESTE GRÁTIS ESTÁ LIBERADO!* 🍿\n\n` +
      `👤 *Cliente:* ${params.pushName || "Cliente"}\n` +
      `📺 *Servidor:* ${trialRes.serverName}\n` +
      `🌐 *URL / DNS:* ${trialRes.streamingDns}\n` +
      `🔑 *Usuário:* ${trialRes.username}\n` +
      `🔒 *Senha:* ${trialRes.password}\n` +
      `🖥️ *Telas:* 1 Tela\n` +
      `⏳ *Validade:* ${config.testDurationHours} Horas\n\n` +
      `🔗 *Lista M3U Plus Completa:*\n${trialRes.m3uUrl}\n\n` +
      `📺 *Guia de Canais (EPG):*\n${trialRes.epgUrl}\n\n` +
      `📱 *Como Conectar:*\n` +
      `• No IPTV Smarters Pro, XCIPTV ou TiviMate: use a opção *Xtream Codes API* com o Servidor, Usuário e Senha acima.\n` +
      `• Em Smart TVs ou SS IPTV: adicione a *Lista M3U Plus* completa acima.\n\n` +
      `Bom divertimento! Qualquer dúvida, digite *5* para falar conosco. 🍿`;

    return {
      reply,
      action: "trial_created",
      interactive: {
        type: "buttons",
        title: "🍿 Teste Grátis Ativado!",
        description: reply,
        buttons: [
          { id: "3", displayText: "🛒 Comprar Assinatura", type: "reply" },
          { id: "5", displayText: "👨‍💼 Falar com Suporte", type: "reply" },
        ],
        footer: "Aproveite seu teste!",
      },
    };
  }

  // =========================================================================
  // OPÇÃO 2: RENOVAR ASSINATURA (Pergunta qual usuário a pessoa quer renovar)
  // =========================================================================
  if (
    text === "2" ||
    text === "2." ||
    text.startsWith("2 ") ||
    text.includes("renovar") ||
    text.includes("renovacao") ||
    text.includes("renovação") ||
    text.includes("pagar") ||
    text.includes("pix")
  ) {
    // 1. Verifica se o cliente já enviou o usuário junto na mensagem (ex: "renovar carlos123" ou "2 114818587")
    const words = params.text.trim().split(/\s+/);
    let inlineUser = "";
    if (words.length >= 2 && (words[0].toLowerCase().includes("renov") || words[0] === "2")) {
      inlineUser = words.slice(1).join(" ").trim();
    }

    if (inlineUser) {
      let clientMatch: any = null;
      try {
        const { data } = await supabase
          .from("clients")
          .select("*")
          .eq("user_id", userId)
          .or(`iptv_username.eq.${inlineUser},name.ilike.%${inlineUser}%`)
          .limit(1)
          .maybeSingle();
        clientMatch = data;
      } catch {}

      const fee = clientMatch?.monthly_fee
        ? `R$ ${Number(clientMatch.monthly_fee).toFixed(2).replace(".", ",")}`
        : "R$ 35,00";

      const reply =
        `💳 *DADOS PARA PAGAMENTO PIX* 📺\n\n` +
        `✅ *Usuário a Renovar:* *${inlineUser}*\n` +
        (clientMatch?.name ? `👤 *Cliente:* ${clientMatch.name}\n` : "") +
        `📺 *Servidor:* ${serverName}\n` +
        `💰 *Valor da Mensalidade:* ${fee}\n\n` +
        `🔑 *Chave PIX:* \`${pixKey}\`\n` +
        `👤 *Titular:* ${pixHolder}\n\n` +
        `Após realizar o PIX, por favor *envie o comprovante aqui* nesta conversa para renovação imediata! 🚀`;

      return { reply, action: "renew_pix_sent" };
    }

    // 2. Busca linhas existentes cadastradas para esse número de WhatsApp
    let matchingClients: any[] = [];
    try {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId)
        .eq("phone", cleanPhone)
        .order("created_at", { ascending: false });
      matchingClients = data ?? [];
    } catch {}

    // Caso A: Encontrou exatamente 1 linha associada a este WhatsApp
    if (matchingClients.length === 1) {
      const c = matchingClients[0];
      const fee = c.monthly_fee ? `R$ ${Number(c.monthly_fee).toFixed(2).replace(".", ",")}` : "R$ 35,00";

      conversationSessions.set(cleanPhone, {
        step: "awaiting_renew_confirm",
        timestamp: Date.now(),
        data: {
          candidateUsername: c.iptv_username || c.name,
          clientId: c.id,
          clientName: c.name,
          fee,
        },
      });

      const reply =
        `💳 *RENOVAÇÃO DE ASSINATURA* 📺\n\n` +
        `Localizamos a seguinte conta vinculada ao seu WhatsApp:\n` +
        `👤 *Cliente:* ${c.name}\n` +
        `🔑 *Usuário:* *${c.iptv_username || c.name}*\n` +
        (c.next_due_date ? `📅 *Vencimento:* ${c.next_due_date}\n` : "") +
        `💰 *Valor:* ${fee}\n\n` +
        `👉 Digite *SIM* para renovar este usuário acima.\n` +
        `👉 Ou *digite o outro usuário* que você deseja renovar: 👇`;

      return { reply, action: "renew_confirm_prompted" };
    }

    // Caso B: Mais de 1 linha associada a este WhatsApp
    if (matchingClients.length > 1) {
      conversationSessions.set(cleanPhone, {
        step: "awaiting_renew_username",
        timestamp: Date.now(),
      });

      let listText = "";
      matchingClients.slice(0, 5).forEach((c) => {
        listText += `• Usuário: *${c.iptv_username || c.name}* (Vencimento: ${c.next_due_date || "N/A"})\n`;
      });

      const reply =
        `💳 *RENOVAÇÃO DE ASSINATURA* 📺\n\n` +
        `Encontramos mais de uma assinatura vinculada ao seu WhatsApp:\n\n` +
        listText +
        `\n👉 Por favor, *digite o Usuário* que você deseja renovar: 👇`;

      return { reply, action: "renew_multiple_prompted" };
    }

    // Caso C: Nenhuma linha encontrada para este WhatsApp -> Pergunta o usuário
    conversationSessions.set(cleanPhone, {
      step: "awaiting_renew_username",
      timestamp: Date.now(),
    });

    const reply =
      `💳 *RENOVAÇÃO DE ASSINATURA* 📺\n\n` +
      `Por favor, **digite o seu Usuário** (login do seu aplicativo IPTV) que você deseja renovar: 👇\n\n` +
      `_Exemplo: digite apenas o nome do seu usuário._`;

    return { reply, action: "renew_user_prompted" };
  }

  // =========================================================================
  // OPÇÃO 3: COMPRAR NOVO ACESSO / PLANOS
  // =========================================================================
  if (
    text === "3" ||
    text === "3." ||
    text.includes("comprar") ||
    text.includes("plano") ||
    text.includes("planos") ||
    text.includes("assinar") ||
    text.includes("preço") ||
    text.includes("preco") ||
    text.includes("valor")
  ) {
    const pixKey = config.pixKey || wsRow?.pix_key || "";
    const pixBlock = pixKey ? `\n\n🔑 *Chave PIX:* \`${pixKey}\`` : "";

    const reply =
      `${config.plansText}${pixBlock}\n\n` +
      `👇 *Para assinar agora, toque no botão do plano desejado abaixo:*`;

    return {
      reply,
      action: "plans_shown",
      interactive: {
        type: "buttons",
        title: "🍿 Escolha seu Plano IPTV",
        description: `${config.plansText}\n\n👇 *Selecione o plano desejado nos botões abaixo para gerar seu PIX imediato:*`,
        buttons: [
          { id: "plano_1m", displayText: "1️⃣ Mensal - R$ 35", type: "reply" },
          { id: "plano_3m", displayText: "2️⃣ Trimestral - R$ 90", type: "reply" },
          { id: "plano_6m", displayText: "3️⃣ Semestral - R$ 160", type: "reply" },
        ],
        footer: "Liberação imediata pós-pagamento",
      },
    };
  }

  // =========================================================================
  // OPÇÃO 4: REENVIAR MEUS DADOS DE ACESSO / LISTA M3U
  // =========================================================================
  if (
    text === "4" ||
    text === "4." ||
    text.includes("dados") ||
    text.includes("acesso") ||
    text.includes("m3u") ||
    text.includes("senha") ||
    text.includes("perdi")
  ) {
    let client: any = null;
    try {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId)
        .eq("phone", cleanPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      client = data;
    } catch {}

    if (!client) {
      return {
        reply:
          `🔍 Não encontrei uma assinatura ativa com o número *${cleanPhone}*.\n\n` +
          `• Digite *1* para gerar um Teste Grátis agora mesmo!\n` +
          `• Digite *3* para assinar um novo plano.\n` +
          `• Digite *5* se você contratou com outro número para falar com o suporte.`,
        action: "credentials_not_found",
      };
    }

    const u = client.iptv_username || client.name;
    const p = client.iptv_password || "••••••••";
    const cleanDns = extractCleanIptvDns(streamingDns) || "http://karen256.top";
    const m3uUrl = generateM3uUrl(cleanDns, u, p, "ts");
    const epgUrl = generateEpgUrl(cleanDns, u, p);

    const reply =
      `📡 *SEUS DADOS DE ACESSO IPTV* 📡\n\n` +
      `👤 *Cliente:* ${client.name}\n` +
      `📺 *Servidor:* ${serverName}\n` +
      `🌐 *URL / DNS:* ${cleanDns}\n` +
      `🔑 *Usuário:* ${u}\n` +
      `🔒 *Senha:* ${p}\n` +
      `🖥️ *Telas:* ${client.screens ?? 1}\n` +
      (client.next_due_date ? `📅 *Vencimento:* ${client.next_due_date}\n\n` : "\n") +
      `🔗 *Lista M3U Plus Completa:*\n${m3uUrl}\n\n` +
      `📺 *Guia de Canais (EPG):*\n${epgUrl}\n\n` +
      `Bom divertimento! 🍿`;

    return {
      reply,
      action: "credentials_resent",
      interactive: {
        type: "buttons",
        title: "📡 Dados de Conexão IPTV",
        description: reply,
        buttons: [
          { id: "2", displayText: "💳 Renovar Assinatura", type: "reply" },
          { id: "menu", displayText: "🏠 Menu Principal", type: "reply" },
        ],
        footer: "Sistema IPTV Inteligente",
      },
    };
  }

  // =========================================================================
  // OPÇÃO 5: ATENDENTE HUMANO
  // =========================================================================
  if (
    text === "5" ||
    text === "5." ||
    text.includes("suporte") ||
    text.includes("humano") ||
    text.includes("atendente") ||
    text.includes("falar")
  ) {
    return {
      reply: config.supportMessage,
      action: "human_support",
    };
  }

  // =========================================================================
  // MENU PRINCIPAL (PADRÃO PARA SAUDAÇÃO OU RESPOSTA NÃO RECONHECIDA)
  // =========================================================================
  let greeting = config.menuGreeting
    .replace(/{empresa}/g, config.businessName)
    .replace(/{servidor}/g, serverName);

  return {
    reply: greeting,
    action: "menu_shown",
    interactive: {
      type: "list",
      title: "Menu de Atendimento 🍿",
      description: `👋 Olá! Bem-vindo(a) à *${config.businessName}*! Escolha uma das opções abaixo:`,
      buttonText: "Abrir Opções 🍿",
      footerText: "Atendimento automático 24h",
      sections: [
        {
          title: "Opções de Atendimento",
          rows: [
            {
              title: "1️⃣ Gerar Teste Grátis",
              description: `Teste grátis de ${config.testDurationHours}h imediato`,
              rowId: "1",
            },
            {
              title: "2️⃣ Renovar Assinatura",
              description: "Renove seu login existente com PIX",
              rowId: "2",
            },
            {
              title: "3️⃣ Comprar Assinatura",
              description: "Ver planos e assinar novo acesso",
              rowId: "3",
            },
            {
              title: "4️⃣ Meus Acessos / M3U",
              description: "Recupere login, senha e lista IPTV",
              rowId: "4",
            },
            {
              title: "5️⃣ Suporte Humano",
              description: "Fale com nossa equipe de atendentes",
              rowId: "5",
            },
          ],
        },
      ],
    },
  };
}
