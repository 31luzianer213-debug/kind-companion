import { generateM3uUrl, generateEpgUrl, extractCleanIptvDns } from "./format";
import type { SigmaConfig } from "./sigma.panel";
import { createOrderServer, listOrdersServer, approveAndReleaseOrderServer, updateOrderServer } from "./orders.server";
import { createMercadoPagoPixPayment } from "./mercadopago.server";
import type { ButtonItem, ListSection } from "./billing.server";
import { phoneVariants, samePhone } from "./phone";
import { decideWithSalesAi } from "./bot-ai.server";

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
  media?: {
    type: "image";
    base64: string;
    caption?: string;
  };
  extraMessages?: string[];
};

export type BotConfigData = {
  enabled: boolean;
  businessName: string;
  serverName?: string;
  streamingDns?: string;
  testEnabled: boolean;
  testDurationHours: number;
  testPackageName: string;
  blockRepeatDays: number;
  menuGreeting: string;
  plansText: string;
  supportMessage: string;
  pixKey?: string;
  pixHolder?: string;
  planMonthlyPrice: number;
  planQuarterlyPrice: number;
  planSemiannualPrice: number;
  planAnnualPrice: number;
  renewalPrice: number;
  mercadopago_token?: string;
  payment_provider?: string;
  // Links de Download de Aplicativos
  appAndroidApk?: string;
  appAndroidDownloaderCode?: string;
  appIosLink?: string;
  appWindowsLink?: string;
  appWebPlayerLink?: string;
  appSmartTvText?: string;
  appsCustomText?: string;
  // IA de vendas
  aiEnabled?: boolean;
  aiAgentName?: string;
  aiInstructions?: string;
};

export const DEFAULT_BOT_CONFIG: BotConfigData = {
  enabled: true,
  businessName: "Minha Revenda IPTV",
  serverName: "Meu Servidor",
  streamingDns: "",
  testEnabled: true,
  testDurationHours: 4,
  testPackageName: "Teste grátis",
  blockRepeatDays: 7,
  menuGreeting:
    "Oi! Tudo bem? 😊 Aqui é da {empresa}.\n\n" +
    "Me diz o que você precisa que eu já resolvo por aqui:\n\n" +
    "• teste grátis\n" +
    "• renovar\n" +
    "• planos e valores\n" +
    "• aplicativos\n" +
    "• meus dados de acesso\n" +
    "• falar comigo sobre outra coisa\n\n" +
    "Pode escrever do seu jeito que eu entendo.",
  plansText:
    "Claro! Deixa eu te passar os valores:\n\n" +
    "• 1 mês — R$ 35,00\n" +
    "• 3 meses — R$ 90,00\n" +
    "• 6 meses — R$ 160,00 (o pessoal costuma pegar esse)\n" +
    "• 12 meses — R$ 290,00 (sai bem mais em conta)\n\n" +
    "Em todos vem canais em 4K e Full HD, filmes e séries sempre atualizados, guia de programação e funciona na TV Box, Smart TV, celular, computador e tablet.",
  supportMessage:
    "Beleza, já te chamo aqui na conversa 🙂\n\n" +
    "Me conta com suas palavras o que aconteceu que eu te respondo assim que ver a mensagem.",
  planMonthlyPrice: 35.0,
  planQuarterlyPrice: 90.0,
  planSemiannualPrice: 160.0,
  planAnnualPrice: 290.0,
  renewalPrice: 35.0,
  mercadopago_token: "",
  payment_provider: "mercadopago",
  appAndroidApk: "",
  appAndroidDownloaderCode: "",
  appIosLink: "",
  appWindowsLink: "",
  appWebPlayerLink: "",
  appSmartTvText: "",
  appsCustomText: "",
  aiEnabled: true,
  aiAgentName: "Ana",
  aiInstructions: "",
};

export function generateDefaultPlansText(params: {
  planMonthlyPrice?: number;
  planQuarterlyPrice?: number;
  planSemiannualPrice?: number;
  planAnnualPrice?: number;
  serverName?: string;
}): string {
  const m = Number(params.planMonthlyPrice || 35).toFixed(2).replace(".", ",");
  const q = Number(params.planQuarterlyPrice || 90).toFixed(2).replace(".", ",");
  const s = Number(params.planSemiannualPrice || 160).toFixed(2).replace(".", ",");
  const a = Number(params.planAnnualPrice || 290).toFixed(2).replace(".", ",");
  const srv = params.serverName || "Meu Servidor";

  return (
    `Claro! Os valores aqui do ${srv} são esses:\n\n` +
    `• 1 mês — R$ ${m}\n` +
    `• 3 meses — R$ ${q}\n` +
    `• 6 meses — R$ ${s} (o mais pedido)\n` +
    `• 12 meses — R$ ${a} (sai bem mais barato)\n\n` +
    `Em todos vem canais em 4K e Full HD, filmes e séries atualizados, guia de programação e funciona na TV Box, Smart TV, celular, computador e tablet. O acesso é liberado assim que o Pix cai.`
  );
}

/**
 * Monta o texto de aplicativos APENAS com o que o revendedor configurou.
 * Sem nada configurado, devolve string vazia (o bot não inventa apps).
 */
export function generateAppsMessage(config: BotConfigData, _serverName?: string): string {
  if (config.appsCustomText && config.appsCustomText.trim().length > 5) {
    return config.appsCustomText.trim();
  }

  const lines: string[] = [];
  const code = (config.appAndroidDownloaderCode || "").trim();
  const apk = (config.appAndroidApk || "").trim();
  const ios = (config.appIosLink || "").trim();
  const win = (config.appWindowsLink || "").trim();
  const web = (config.appWebPlayerLink || "").trim();
  const smartTv = (config.appSmartTvText || "").trim();

  if (code) lines.push(`Na TV Box, Android TV ou Fire Stick: abra o app Downloader e digite o código ${code}.`);
  if (apk) lines.push(`No celular ou tablet Android: ${apk}`);
  if (ios) lines.push(`No iPhone, iPad ou Apple TV: ${ios}`);
  if (win) lines.push(`No computador com Windows: ${win}`);
  if (web) lines.push(`Direto pelo navegador: ${web}`);
  if (smartTv) lines.push(smartTv);

  if (lines.length === 0) return "";

  return (
    `Sobre os aplicativos, vai depender do aparelho que você usa:\n\n` +
    lines.join("\n") +
    `\n\nDepois de instalar, abra o app e coloque seu usuário, senha e o endereço do servidor. Se travar em algum passo me fala que eu te ajudo.`
  );
}

// Cache em memória para leitura ultrarrápida (0ms) sem bloqueio de RLS
const botConfigCache = new Map<string, BotConfigData>();
const botConfigCacheAt = new Map<string, number>();

const paymentSettingsCache = new Map<string, any>();

export function getCanonicalUserId(userId?: string): string {
  if (!userId || userId === "default") return "default";
  const clean = userId.replace(/^iptv_/i, "").replace(/[^a-zA-Z0-9]/g, "");
  return clean.slice(0, 16) || "default";
}

export function getLocalPaymentPath(userId?: string): string {
  const canonicalId = getCanonicalUserId(userId);
  return `payment_settings_${canonicalId}.json`;
}

export function readLocalPaymentSettings(userId?: string): any {
  const canonicalId = getCanonicalUserId(userId);
  return paymentSettingsCache.get(canonicalId) || paymentSettingsCache.get(userId || "default") || null;
}

export function writeLocalPaymentSettings(userId: string | undefined, data: any): void {
  const canonicalId = getCanonicalUserId(userId);
  paymentSettingsCache.set(canonicalId, data);
  if (userId) paymentSettingsCache.set(userId, data);
}

function readLocalConfig(userId?: string): Partial<BotConfigData> | null {
  const canonicalId = getCanonicalUserId(userId);
  return botConfigCache.get(canonicalId) || botConfigCache.get(userId || "default") || null;
}

function writeLocalConfig(userId: string | undefined, data: BotConfigData): void {
  const canonicalId = getCanonicalUserId(userId);
  botConfigCache.set(canonicalId, data);
  botConfigCacheAt.set(canonicalId, Date.now());
  if (userId) {
    botConfigCache.set(userId, data);
    botConfigCacheAt.set(userId, Date.now());
  }

}

/** Carrega as configurações do bot com persistência em cache e banco de dados */
export async function loadBotConfig(supabase: any, userId: string): Promise<BotConfigData> {
  const uid = userId || "default";

  // 1. Cache em memória bem curto (5s). Se o cache disser que o robô está
  //    desligado, sempre reconsulta o banco para que ligar no painel valha na hora.
  const cachedAt = botConfigCacheAt.get(uid) || 0;
  const cached = botConfigCache.get(uid);
  if (cached && cached.enabled && Date.now() - cachedAt < 5_000) {
    return cached;
  }


  const localPayment = readLocalPaymentSettings(uid);

  // 2. Consulta banco de dados e metadata
  try {
    let wsRow: any = null;
    try {
      if (supabase) {
        const { data } = await supabase
          .from("whatsapp_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        wsRow = data;
      }
    } catch {
      wsRow = null;
    }

    // Fonte principal e permanente: tabela bot_settings (sobrevive a reinícios do servidor)
    let storedConfig: any = null;
    try {
      if (supabase && userId && userId !== "default") {
        const { data } = await supabase
          .from("bot_settings")
          .select("config")
          .eq("user_id", userId)
          .maybeSingle();
        storedConfig = data?.config ?? null;
      }
    } catch {
      storedConfig = null;
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

    metaBot = { ...(metaBot ?? {}), ...(storedConfig ?? {}) };


    const businessName =
      wsRow?.business_name?.trim() ||
      metaBot?.businessName?.trim() ||
      DEFAULT_BOT_CONFIG.businessName;

    // O robô de atendimento é independente da cobrança automática:
    // só fica desligado se o painel desligar explicitamente.
    // Só o interruptor do próprio robô desliga o atendimento. A cobrança
    // automática (auto_send_enabled) é outro recurso e não pode derrubá-lo.
    const enabled = metaBot?.enabled !== undefined ? Boolean(metaBot.enabled) : DEFAULT_BOT_CONFIG.enabled;


    const config: BotConfigData = {
      enabled,
      businessName,
      serverName:
        wsRow?.sigma_server_name?.trim() ||
        metaBot?.serverName?.trim() ||
        DEFAULT_BOT_CONFIG.serverName,
      streamingDns:
        wsRow?.sigma_streaming_dns?.trim() ||
        metaBot?.streamingDns?.trim() ||
        DEFAULT_BOT_CONFIG.streamingDns,
      testEnabled: metaBot?.testEnabled ?? DEFAULT_BOT_CONFIG.testEnabled,
      testDurationHours: metaBot?.testDurationHours ?? DEFAULT_BOT_CONFIG.testDurationHours,
      testPackageName:
        metaBot?.testPackageName?.trim() ||
        DEFAULT_BOT_CONFIG.testPackageName,
      blockRepeatDays: metaBot?.blockRepeatDays ?? DEFAULT_BOT_CONFIG.blockRepeatDays,
      menuGreeting: metaBot?.menuGreeting?.trim() || DEFAULT_BOT_CONFIG.menuGreeting,
      plansText: metaBot?.plansText?.trim() || DEFAULT_BOT_CONFIG.plansText,
      supportMessage: metaBot?.supportMessage?.trim() || DEFAULT_BOT_CONFIG.supportMessage,
      pixKey: wsRow?.pix_key || metaBot?.pixKey || localPayment?.pix_key,
      pixHolder: wsRow?.pix_holder || metaBot?.pixHolder || localPayment?.pix_holder,
      planMonthlyPrice: metaBot?.planMonthlyPrice ?? DEFAULT_BOT_CONFIG.planMonthlyPrice,
      planQuarterlyPrice: metaBot?.planQuarterlyPrice ?? DEFAULT_BOT_CONFIG.planQuarterlyPrice,
      planSemiannualPrice: metaBot?.planSemiannualPrice ?? DEFAULT_BOT_CONFIG.planSemiannualPrice,
      planAnnualPrice: metaBot?.planAnnualPrice ?? DEFAULT_BOT_CONFIG.planAnnualPrice,
      renewalPrice: metaBot?.renewalPrice ?? DEFAULT_BOT_CONFIG.renewalPrice,
      mercadopago_token: wsRow?.mercadopago_token || metaBot?.mercadopago_token || localPayment?.mercadopago_token,
      payment_provider: wsRow?.payment_provider || metaBot?.payment_provider || localPayment?.payment_provider,
      appAndroidApk: metaBot?.appAndroidApk ?? DEFAULT_BOT_CONFIG.appAndroidApk,
      appAndroidDownloaderCode: metaBot?.appAndroidDownloaderCode ?? DEFAULT_BOT_CONFIG.appAndroidDownloaderCode,
      appIosLink: metaBot?.appIosLink ?? DEFAULT_BOT_CONFIG.appIosLink,
      appWindowsLink: metaBot?.appWindowsLink ?? DEFAULT_BOT_CONFIG.appWindowsLink,
      appWebPlayerLink: metaBot?.appWebPlayerLink ?? DEFAULT_BOT_CONFIG.appWebPlayerLink,
      appSmartTvText: metaBot?.appSmartTvText ?? DEFAULT_BOT_CONFIG.appSmartTvText,
      appsCustomText: metaBot?.appsCustomText ?? DEFAULT_BOT_CONFIG.appsCustomText,
      aiEnabled: metaBot?.aiEnabled ?? DEFAULT_BOT_CONFIG.aiEnabled,
      aiAgentName: metaBot?.aiAgentName?.trim() || DEFAULT_BOT_CONFIG.aiAgentName,
      aiInstructions: metaBot?.aiInstructions ?? DEFAULT_BOT_CONFIG.aiInstructions,
    };

    botConfigCache.set(uid, config);
    botConfigCacheAt.set(uid, Date.now());

    return config;
  } catch (err) {
    console.error("[loadBotConfig] Fallback para DEFAULT_BOT_CONFIG:", err);
    return { ...DEFAULT_BOT_CONFIG };
  }
}

/** Salva as configurações do bot imediatamente em memória e banco de dados */
export async function saveBotConfigServer(
  supabase: any,
  userId: string,
  config: Partial<BotConfigData>,
): Promise<void> {
  const uid = userId || "default";
  const current = await loadBotConfig(supabase, userId);
  const updated: BotConfigData = { ...current, ...config };

  // 1. Atualiza imediatamente cache em memória
  botConfigCache.set(uid, updated);
  botConfigCacheAt.set(uid, Date.now());

  writeLocalConfig(uid, updated);

  if (updated.mercadopago_token || updated.pixKey || updated.pixHolder) {
    writeLocalPaymentSettings(uid, {
      user_id: userId,
      mercadopago_token: updated.mercadopago_token ?? "",
      payment_provider: updated.payment_provider ?? "mercadopago",
      pix_key: updated.pixKey ?? "",
      pix_holder: updated.pixHolder ?? "",
    });
  }

  // 1.5 Persiste a configuração completa no banco (fonte definitiva, não se perde)
  try {
    if (supabase && userId && userId !== "default") {
      await supabase
        .from("bot_settings")
        .upsert(
          { user_id: userId, config: updated, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
    }
  } catch (persistErr) {
    console.warn("Aviso ao salvar bot_settings:", persistErr);
  }

  // 2. Atualiza na tabela whatsapp_settings de forma segura
  try {
    if (supabase) {
      const updatePayload: Record<string, any> = {
        business_name: updated.businessName,
        auto_send_enabled: updated.enabled,
      };
      if (updated.mercadopago_token) {
        updatePayload.mercadopago_token = updated.mercadopago_token.trim();
        updatePayload.payment_provider = "mercadopago";
      }
      if (updated.pixKey) updatePayload.pix_key = updated.pixKey.trim();
      if (updated.pixHolder) updatePayload.pix_holder = updated.pixHolder.trim();

      await supabase
        .from("whatsapp_settings")
        .upsert(
          { user_id: userId, ...updatePayload },
          { onConflict: "user_id" }
        );
    }
  } catch (dbErr) {
    console.warn("Aviso ao salvar whatsapp_settings:", dbErr);
  }

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

  // 4. Configura AUTOMATICAMENTE o Webhook e parâmetros na VPS da Evolution API
  try {
    const { ensureInstanceWebhook } = await import("./evolution.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    let appUrl = "";
    try {
      const req = getRequest();
      if (req) {
        const proto = req.headers.get("x-forwarded-proto") || "https";
        const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
        if (host) appUrl = `${proto}://${host}`;
      }
    } catch {}
    if (!appUrl) appUrl = process.env["APP_URL"] || "";
    if (appUrl) {
      ensureInstanceWebhook(userId, appUrl).catch(() => {});
    }
  } catch (syncErr) {
    console.warn("[Auto Webhook VPS] Aviso:", syncErr);
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
      .in("phone", phoneVariants(cleanPhone))
      .gte("created_at", cutoffDate);

    if (recentTrials && recentTrials.length > 0) {
      return {
        ok: false,
        error:
          `Poxa, esse número já pegou um teste faz pouco tempo 😅\n\n` +
          `Mas posso te passar os valores ou já deixar seu acesso ativo, é só me falar o que prefere.`,
      };
    }
  }

  // 2. Carrega as credenciais do painel cadastrado na tela Sigma (com fallback legado)
  const { resolveSigmaPanel } = await import("./sigma-credentials.server");
  const panel = await resolveSigmaPanel(supabase, userId);

  const panelUrl = panel.url;
  const panelToken = panel.token;
  const panelUser = panel.username;
  const panelPass = panel.password;

  const serverName = botConfig.serverName || panel.serverName || botConfig.businessName || "Meu Servidor";
  const streamingDns = botConfig.streamingDns || panel.streamingDns || "";

  // 3. Gera credenciais aleatórias para o teste
  const trialUsername = Math.floor(10000000 + Math.random() * 90000000).toString();
  const trialPassword = Math.floor(100000 + Math.random() * 900000).toString();
  const clientDisplayName = (params.senderName?.trim() || "Cliente Teste WhatsApp") + " (Teste)";

  const hours = botConfig.testDurationHours || 4;
  const expiryDate = new Date(Date.now() + hours * 60 * 60 * 1000);
  const expiryIso = expiryDate.toISOString().slice(0, 10);

  // 4. O teste só existe se houver um painel Sigma configurado e a criação der certo
  const hasPanel = Boolean(panelUrl && (panelToken || (panelUser && panelPass)));
  if (!hasPanel) {
    return {
      ok: false,
      error:
        `😕 *Teste indisponível no momento*\n\n` +
        `Nosso sistema de testes está temporariamente fora do ar.\n` +
        `Fale com o atendimento ou digite *3* para ver os planos.`,
    };
  }

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
    const detail = sigmaErr instanceof Error ? sigmaErr.message : String(sigmaErr);
    console.error("Erro ao criar teste no Sigma:", detail);
    // Deixa o motivo real registrado para o revendedor ver em Histórico/Logs.
    try {
      await supabase.from("message_logs").insert({
        user_id: userId,
        phone: cleanPhone,
        body: `Falha ao criar teste grátis no painel "${panel.serverName}".`,
        status: "failed",
        error: detail.slice(0, 500),
      });
    } catch {}
    return {
      ok: false,
      error:
        `😕 *Não consegui gerar seu teste agora*\n\n` +
        `Houve uma falha ao criar o acesso no servidor.\n` +
        `Tente novamente em alguns minutos ou digite *3* para ver os planos.`,
    };
  }

  // 5. Gera links de acesso oficiais do IPTV
  const cleanDns = extractCleanIptvDns(streamingDns) || "";
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

  // 7. Registra o teste para o lembrete automático antes de expirar
  try {
    await supabase.from("client_trials").insert({
      user_id: userId,
      name: params.senderName?.trim() || null,
      phone: cleanPhone,
      username: trialUsername,
      password: trialPassword,
      expires_at: expiryDate.toISOString(),
    });
  } catch (trialErr) {
    console.error("Erro ao registrar teste para lembrete:", trialErr);
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
  step: "awaiting_renew_username" | "awaiting_renew_confirm" | "awaiting_plan_choice";
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
 * Cria pedido para o plano escolhido e formata a resposta com Pix Copia e Cola (Mercado Pago) ou Chave Manual
 */
async function handlePlanOrderCreation({
  userId,
  cleanPhone,
  pushName,
  durationMonths,
  wsRow,
  config,
}: {
  userId: string;
  cleanPhone: string;
  pushName?: string;
  durationMonths: number;
  wsRow: any;
  config: BotConfigData;
}): Promise<BotProcessResult> {
  let planName = "Plano Mensal (1 Mês - 1 Tela)";
  let amount = config.planMonthlyPrice || 35.0;

  if (durationMonths === 3) {
    planName = "Plano Trimestral (3 Meses - Econômico)";
    amount = config.planQuarterlyPrice || 90.0;
  } else if (durationMonths === 6) {
    planName = "Plano Semestral (6 Meses - Super Desconto)";
    amount = config.planSemiannualPrice || 160.0;
  } else if (durationMonths === 12) {
    planName = "Plano Anual (12 Meses - Melhor Custo-Benefício)";
    amount = config.planAnnualPrice || 290.0;
  }

  const order = await createOrderServer(userId, {
    customer_name: pushName || "Cliente WhatsApp",
    customer_phone: cleanPhone,
    plan_name: planName,
    amount,
    duration_months: durationMonths,
    screens: 1,
    type: "new_access",
  });

  const mpToken =
    config.mercadopago_token ||
    wsRow?.mercadopago_token?.trim() ||
    readLocalPaymentSettings(userId)?.mercadopago_token?.trim() ||
    DEFAULT_BOT_CONFIG.mercadopago_token?.trim() ||
    "";

  let mpPixResult: any = null;

  if (mpToken) {
    console.log(`[Bot Plan] ⚡ Gerando Pix Mercado Pago para ${cleanPhone} (R$ ${amount.toFixed(2)})...`);
    mpPixResult = await createMercadoPagoPixPayment({
      token: mpToken,
      amount,
      description: `${planName} - Pedido #${order.order_number}`,
      orderId: order.id,
      customerName: pushName || "Cliente",
      customerPhone: cleanPhone,
    });

    if (mpPixResult.ok && mpPixResult.qrCode) {
      console.log(`[Bot Plan] ✅ Pix gerado com sucesso para Pedido #${order.order_number}!`);
      order.pix_code = mpPixResult.qrCode;
      order.gateway_payment_id = mpPixResult.paymentId;
      order.payment_method = "mercadopago_pix";
      await updateOrderServer(userId, order.id, {
        pix_code: mpPixResult.qrCode,
        gateway_payment_id: mpPixResult.paymentId,
        payment_method: "mercadopago_pix",
      }).catch((e) => console.warn("[Bot] falha ao salvar Pix no pedido:", e));
    } else {
      console.warn(`[Bot Plan] ⚠️ Falha na API do Mercado Pago: ${mpPixResult?.error}`);
    }
  } else {
    console.warn("[Bot Plan] ⚠️ Nenhum Access Token do Mercado Pago encontrado.");
  }

  if (mpPixResult?.ok && mpPixResult?.qrCode) {
    // MODO AUTOMÁTICO MERCADO PAGO COM Pix COPIA E COLA & QR CODE FOTO
    const reply =
      `Perfeito! Anotei aqui o ${planName}, fica R$ ${amount.toFixed(2).replace(".", ",")}.\n\n` +
      `Te mandei o código do Pix logo abaixo. É só copiar, abrir o app do seu banco, ir em Pix Copia e Cola e pagar.\n\n` +
      `Assim que o pagamento cair eu já libero seu acesso e mando usuário, senha e a lista aqui mesmo 🙂`;

    return {
      reply,
      action: "order_created_mp",
      media: mpPixResult.qrCodeBase64
        ? {
            type: "image",
            base64: mpPixResult.qrCodeBase64,
            caption: `Se preferir, é só apontar a câmera do banco nesse QR Code. Valor: R$ ${amount.toFixed(2).replace(".", ",")}`,
          }
        : undefined,
      interactive: {
        type: "buttons",
        title: "💳 Pagamento Pix",
        description: reply,
        footer: `Pedido #${order.order_number} • Pagamento Seguro`,
        buttons: [
          {
            id: "btn_copy_pix",
            displayText: "📋 Copiar Código Pix",
            type: "copy",
            copyCode: mpPixResult.qrCode,
          },
        ],
      },
    };
  }

  // MODO MANUAL (Sem Mercado Pago cadastrado ou falha de token)
  const effectivePixKey = config.pixKey || wsRow?.pix_key || readLocalPaymentSettings(userId)?.pix_key || "Consulte nossa chave Pix com nosso suporte";
  const effectivePixHolder = config.pixHolder || wsRow?.pix_holder || readLocalPaymentSettings(userId)?.pix_holder || config.businessName;

  const reply =
    `Show! Anotei o ${planName}, dá R$ ${amount.toFixed(2).replace(".", ",")}.\n\n` +
    `Minha chave Pix é ${effectivePixKey} (em nome de ${effectivePixHolder}).\n\n` +
    `Depois que fizer o Pix, me manda o comprovante aqui que eu libero seu acesso na hora 🙂`;

  return {
    reply,
    action: "order_created_manual",
    interactive: {
      type: "buttons",
      title: "💳 Chave Pix (Manual)",
      description: reply,
      footer: `Pedido #${order.order_number} • Titular: ${effectivePixHolder}`,
      buttons: [
        {
          id: "btn_copy_pix",
          displayText: "📋 Copiar Chave Pix",
          type: "copy",
          copyCode: effectivePixKey,
        },
      ],
    },
  };
}

/**
 * Cria pedido de RENOVAÇÃO e formata a resposta com Pix Copia e Cola (Mercado Pago) ou Chave Manual
 */
async function handleRenewOrderCreation({
  userId,
  cleanPhone,
  pushName,
  targetUsername,
  clientMatch,
  wsRow,
  config,
  serverName,
}: {
  userId: string;
  cleanPhone: string;
  pushName?: string;
  targetUsername: string;
  clientMatch?: any;
  wsRow?: any;
  config: BotConfigData;
  serverName: string;
}): Promise<BotProcessResult> {
  const amount = clientMatch?.monthly_fee
    ? Number(clientMatch.monthly_fee)
    : (config.renewalPrice || config.planMonthlyPrice || 35.0);

  const order = await createOrderServer(userId, {
    customer_name: clientMatch?.name || pushName || "Cliente WhatsApp",
    customer_phone: cleanPhone,
    plan_name: `Renovação Mensal - ${targetUsername}`,
    amount,
    duration_months: 1,
    screens: clientMatch?.screens || 1,
    type: "renewal",
    target_username: targetUsername,
  });

  const mpToken =
    config.mercadopago_token ||
    wsRow?.mercadopago_token?.trim() ||
    readLocalPaymentSettings(userId)?.mercadopago_token?.trim() ||
    DEFAULT_BOT_CONFIG.mercadopago_token?.trim() ||
    "";

  let mpPixResult: any = null;

  if (mpToken) {
    console.log(`[Bot Renew] ⚡ Gerando Pix Mercado Pago para renovação de ${targetUsername} (R$ ${amount.toFixed(2)})...`);
    mpPixResult = await createMercadoPagoPixPayment({
      token: mpToken,
      amount,
      description: `Renovação IPTV ${targetUsername} (#${order.order_number})`,
      orderId: order.id,
      customerName: clientMatch?.name || pushName || "Cliente",
      customerPhone: cleanPhone,
    });

    if (mpPixResult.ok && mpPixResult.qrCode) {
      console.log(`[Bot Renew] ✅ Pix gerado com sucesso para Renovação #${order.order_number}!`);
      order.pix_code = mpPixResult.qrCode;
      order.gateway_payment_id = mpPixResult.paymentId;
      order.payment_method = "mercadopago_pix";
      await updateOrderServer(userId, order.id, {
        pix_code: mpPixResult.qrCode,
        gateway_payment_id: mpPixResult.paymentId,
        payment_method: "mercadopago_pix",
      }).catch((e) => console.warn("[Bot] falha ao salvar Pix no pedido:", e));
    } else {
      console.warn(`[Bot Renew] ⚠️ Falha na API do Mercado Pago: ${mpPixResult?.error}`);
    }
  } else {
    console.warn("[Bot Renew] ⚠️ Nenhum Access Token do Mercado Pago encontrado.");
  }

  if (mpPixResult?.ok && mpPixResult?.qrCode) {
    // MODO AUTOMÁTICO MERCADO PAGO COM Pix COPIA E COLA & QR CODE FOTO
    const reply =
      `Beleza${clientMatch?.name ? `, ${String(clientMatch.name).split(" ")[0]}` : ""}! Vou renovar o usuário ${targetUsername}, fica R$ ${amount.toFixed(2).replace(".", ",")}.\n\n` +
      `Te mandei o código do Pix aqui embaixo, é só copiar e pagar no app do seu banco em Pix Copia e Cola.\n\n` +
      `Quando o pagamento cair seu acesso volta na hora, não precisa me avisar 🙂`;

    return {
      reply,
      action: "renew_pix_mp_sent",
      media: mpPixResult.qrCodeBase64
        ? {
            type: "image",
            base64: mpPixResult.qrCodeBase64,
            caption: `Se preferir pagar pelo QR Code, é esse aqui. Usuário ${targetUsername} • R$ ${amount.toFixed(2).replace(".", ",")}`,
          }
        : undefined,
      interactive: {
        type: "buttons",
        title: "💳 Renovação Pix",
        description: reply,
        footer: `Pedido #${order.order_number} • Pagamento Seguro`,
        buttons: [
          {
            id: "btn_copy_pix",
            displayText: "📋 Copiar Código Pix",
            type: "copy",
            copyCode: mpPixResult.qrCode,
          },
        ],
      },
    };
  }

  // MODO MANUAL (Sem Mercado Pago cadastrado ou falha no token)
  const effectivePixKey = config.pixKey || wsRow?.pix_key || readLocalPaymentSettings(userId)?.pix_key || "Consulte nossa chave Pix com nosso suporte";
  const effectivePixHolder = config.pixHolder || wsRow?.pix_holder || readLocalPaymentSettings(userId)?.pix_holder || config.businessName;

  const reply =
    `Beleza${clientMatch?.name ? `, ${String(clientMatch.name).split(" ")[0]}` : ""}! Vou renovar o usuário ${targetUsername}, fica R$ ${amount.toFixed(2).replace(".", ",")}.\n\n` +
    `Minha chave Pix é ${effectivePixKey} (em nome de ${effectivePixHolder}).\n\n` +
    `Assim que pagar, me manda o comprovante aqui que eu renovo na hora 🙂`;

  return {
    reply,
    action: "renew_pix_manual_sent",
    interactive: {
      type: "buttons",
      title: "💳 Chave Pix (Renovação)",
      description: reply,
      footer: `Pedido #${order.order_number} • Titular: ${effectivePixHolder}`,
      buttons: [
        {
          id: "btn_copy_pix",
          displayText: "📋 Copiar Chave Pix",
          type: "copy",
          copyCode: effectivePixKey,
        },
      ],
    },
  };
}

/**
 * Processador central de mensagens do Bot.
 * Recebe o texto que o cliente mandou, decide o fluxo e devolve a resposta formatada.
 */
function normalizeBotInput(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/1️⃣/g, "1").replace(/2️⃣/g, "2").replace(/3️⃣/g, "3")
    .replace(/4️⃣/g, "4").replace(/5️⃣/g, "5").replace(/6️⃣/g, "6")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMainMenu(config: BotConfigData, serverName: string): BotProcessResult {
  const business = config.businessName || "Central IPTV";
  const custom = (config.menuGreeting || "").trim();
  const greeting = custom
    ? custom.replace(/\{empresa\}/g, business).replace(/\{servidor\}/g, serverName)
    : `Oi! Tudo bem? 😊 Aqui é da ${business}.\n\n` +
      `Me diz o que você precisa que eu já resolvo por aqui: pode ser um teste grátis de ${config.testDurationHours} horas, renovar seu acesso, ver os valores dos planos, pegar os aplicativos ou receber de novo seu usuário e senha.\n\n` +
      `Pode escrever do seu jeito que eu entendo.`;

  return {
    reply: greeting,
    action: "menu_shown",
    interactive: {
      type: "buttons",
      title: business,
      description: greeting,
      footer: serverName,
      buttons: [
        { id: "1", displayText: "Quero testar", type: "reply" },
        { id: "3", displayText: "Ver valores", type: "reply" },
        { id: "2", displayText: "Quero renovar", type: "reply" },
      ],
    },
  };
}

export async function processBotMessage(
  supabase: any,
  userId: string,
  params: {
    phone: string;
    text: string;
    pushName?: string;
  },
  opts?: { skipAi?: boolean },
): Promise<BotProcessResult> {
  const config = await loadBotConfig(supabase, userId);

  // Se o robô foi desligado no painel pelo revendedor, não responde nada
  if (!config.enabled) {
    return { reply: "", action: "bot_disabled" };
  }

  const cleanPhone = params.phone.replace(/\D/g, "");
  const text = normalizeBotInput(params.text ?? "");

  const aiOn = config.aiEnabled !== false && !opts?.skipAi;
  const isGreeting = ["oi", "olá", "ola", "opa", "ei", "eae", "e ai", "bom dia", "boa tarde", "boa noite", "start"].includes(text);
  const wantsMenu = ["menu", "início", "inicio", "0", "voltar ao menu", "voltar menu", "menu inicial", "menu principal"].includes(text);

  // Saudações e pedido explícito de menu não precisam de uma segunda consulta
  // ao banco: loadBotConfig já trouxe nome, servidor e duração do teste.
  if (wantsMenu || (isGreeting && !aiOn)) {
    const quickServerName = config.serverName || config.businessName || "Meu Servidor";
    return buildMainMenu(config, quickServerName);
  }


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

  const serverName = config.serverName || wsRow?.sigma_server_name?.trim() || config.businessName || "Meu Servidor";
  const streamingDns = config.streamingDns || wsRow?.sigma_streaming_dns?.trim() || "";
  const pixKey = config.pixKey || wsRow?.pix_key || readLocalPaymentSettings(userId)?.pix_key || "Consulte nossa chave Pix";
  const pixHolder = config.pixHolder || wsRow?.pix_holder || readLocalPaymentSettings(userId)?.pix_holder || config.businessName;

  // =========================================================================
  // IA DE VENDAS: entende o que o cliente quer e dispara a ação certa
  // =========================================================================
  const runSalesAi = async (): Promise<BotProcessResult | null> => {
    let clientSummary = "ainda não é cliente cadastrado";
    try {
      const { data } = await supabase
        .from("clients")
        .select("name,iptv_username,next_due_date,monthly_fee")
        .eq("user_id", userId)
        .in("phone", phoneVariants(cleanPhone))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        clientSummary =
          `já é cliente — nome ${data.name}, usuário ${data.iptv_username || "não informado"}, ` +
          `vencimento ${data.next_due_date || "não informado"}, mensalidade R$ ${data.monthly_fee ?? config.renewalPrice}`;
      }
    } catch {}

    const decision = await decideWithSalesAi({
      config,
      serverName,
      phone: cleanPhone,
      text: params.text,
      customerName: params.pushName,
      clientSummary,
    });
    if (!decision) return null;

    const routes: Record<string, string> = {
      trial: "1",
      renew: "2",
      plans: "3",
      apps: "4",
      credentials: "5",
      support: "6",
      order_status: "status",
      buy_1m: "plano 1m",
      buy_3m: "plano 3m",
      buy_6m: "plano 6m",
      buy_12m: "plano 12m",
    };

    const route = routes[decision.intent];
    if (!route) {
      return { reply: decision.reply, action: "ai_sales_reply" };
    }

    const forwarded =
      decision.intent === "renew" && decision.username ? `renovar ${decision.username}` : route;

    const result = await processBotMessage(
      supabase,
      userId,
      { phone: params.phone, text: forwarded, pushName: params.pushName },
      { skipAi: true },
    );

    if (!result.reply) return { reply: decision.reply, action: "ai_sales_reply" };
    return {
      ...result,
      reply: `${decision.reply}\n\n${result.reply}`.trim(),
      action: `ai_${result.action}`,
    };
  };

  if (aiOn && isGreeting) {
    const aiResult = await runSalesAi();
    if (aiResult) return aiResult;
    return buildMainMenu(config, serverName);
  }


  // =========================================================================
  // CONSULTA DE STATUS DE PEDIDO ("verificar", "status", "paguei", etc.)
  // =========================================================================
  if (
    text === "verificar" ||
    text === "status" ||
    text === "paguei" ||
    text === "ja paguei" ||
    text === "já paguei" ||
    text === "conferi" ||
    text.startsWith("check_order_") ||
    text.startsWith("status_order_")
  ) {
    let orderId = "";
    if (text.startsWith("check_order_") || text.startsWith("status_order_")) {
      orderId = text.replace(/^(check_order_|status_order_)/, "").trim();
    }
    const orders = await listOrdersServer(userId);
    const order = orderId
      ? orders.find((o) => o.id === orderId)
      : orders.find((o) => samePhone(o.customer_phone, cleanPhone));

    if (!order) {
      return {
        reply: "Olhei aqui e não achei nenhum pagamento em aberto no seu número. Se quiser, te passo os valores dos planos 🙂",
        action: "order_not_found",
      };
    }

    if (order.status === "approved") {
      return {
        reply:
          `Esse já está pago e liberado 👍\n\n` +
          `É o ${order.plan_name}, no usuário ${order.target_username}.\n\n` +
          `Se quiser eu reenvio seus dados de acesso ou o link dos aplicativos, é só pedir.`,
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
                  `Seu pagamento caiu aqui, obrigado! 🙌\n\n` +
                  `Já ativei seu acesso. Quer que eu mande seus dados de conexão ou o link do aplicativo?`,
                action: "order_auto_approved",
              };
            }
          }
        }
      } catch {}
    }

    const pixCodeNotice = order.pix_code
      ? `\n\nSegue o código do Pix:\n${order.pix_code}`
      : "";

    const orderButtons: any[] = [];
    if (order.pix_code) {
      orderButtons.push({
        id: "btn_copy_pix",
        displayText: "Copiar código Pix",
        type: "copy",
        copyCode: order.pix_code,
      });
    } else {
      orderButtons.push({
        id: "0",
        displayText: "Voltar",
        type: "reply",
      });
    }

    return {
      reply:
        `Ainda não caiu o pagamento do seu ${order.plan_name} (R$ ${Number(order.amount).toFixed(2).replace(".", ",")}).\n` +
        (order.payment_method === "mercadopago_pix"
          ? `Assim que o Pix for concluído eu libero automaticamente, não precisa avisar.${pixCodeNotice}`
          : `Minha chave Pix é ${pixKey} (em nome de ${pixHolder}). Depois me manda o comprovante aqui que eu libero 🙂`),
      action: "order_status_checked",
      interactive: {
        type: "buttons",
        title: `Pagamento em aberto`,
        description: `Esperando o Pix de R$ ${Number(order.amount).toFixed(2).replace(".", ",")} cair.`,
        footer: serverName,
        buttons: orderButtons,
      },
    };
  }

  // =========================================================================
  // SELEÇÃO DIRETA DE PLANO (Via comando rápido de texto)
  // =========================================================================
  const isPlan1m =
    text === "plano 1" ||
    text === "plano 1m" ||
    text === "plano_1m" ||
    text === "1m" ||
    text === "mensal" ||
    text === "plano mensal";

  const isPlan3m =
    text === "plano 2" ||
    text === "plano 3m" ||
    text === "plano_3m" ||
    text === "3m" ||
    text === "trimestral" ||
    text === "plano trimestral";

  const isPlan6m =
    text === "plano 3" ||
    text === "plano 6m" ||
    text === "plano_6m" ||
    text === "6m" ||
    text === "semestral" ||
    text === "plano semestral";

  const isPlan12m =
    text === "plano 4" ||
    text === "plano 4." ||
    text === "plano 12m" ||
    text === "plano_12m" ||
    text === "12m" ||
    text === "anual" ||
    text === "plano anual";

  if (isPlan1m) {
    return await handlePlanOrderCreation({
      userId,
      cleanPhone,
      pushName: params.pushName,
      durationMonths: 1,
      wsRow,
      config,
    });
  }
  if (isPlan3m) {
    return await handlePlanOrderCreation({
      userId,
      cleanPhone,
      pushName: params.pushName,
      durationMonths: 3,
      wsRow,
      config,
    });
  }
  if (isPlan6m) {
    return await handlePlanOrderCreation({
      userId,
      cleanPhone,
      pushName: params.pushName,
      durationMonths: 6,
      wsRow,
      config,
    });
  }
  if (isPlan12m) {
    return await handlePlanOrderCreation({
      userId,
      cleanPhone,
      pushName: params.pushName,
      durationMonths: 12,
      wsRow,
      config,
    });
  }

  // =========================================================================
  // GERENCIAMENTO DE SESSÃO MULTI-PASSO (Ex: pergunta de usuário na renovação)
  // =========================================================================
  const now = Date.now();
  const session = conversationSessions.get(cleanPhone);
  const isSessionValid = session && now - session.timestamp < 15 * 60 * 1000;
  if (session && !isSessionValid) conversationSessions.delete(cleanPhone);
  if (isSessionValid && session) session.timestamp = now;

  // Se o cliente digitou comando para trocar de opção, limpa o estado anterior
  if (
    text === "0" ||
    text === "menu" ||
    text === "sair" ||
    text === "cancelar" ||
    text === "voltar" ||
    (session?.step !== "awaiting_plan_choice" &&
      (text === "1" || text === "2" || text === "3" || text === "4" || text === "5" || text === "6"))
  ) {
    if (session) conversationSessions.delete(cleanPhone);
  } else if (isSessionValid && session) {
    // -----------------------------------------------------------------------
    // Etapa de Escolha do Plano (Opção 3 via texto)
    // -----------------------------------------------------------------------
    if (session.step === "awaiting_plan_choice") {
      // Se o cliente tocou em outra opção do menu (ex.: "4️⃣ Baixar Aplicativos"),
      // NÃO interpreta como escolha de plano — encerra a sessão e segue o fluxo normal.
      const isMenuOptionText =
        text.includes("baixar") ||
        text.includes("aplicativ") ||
        text.includes("teste") ||
        text.includes("renovar") ||
        text.includes("acesso") ||
        text.includes("atendimento") ||
        text.includes("suporte") ||
        text.includes("preç") ||
        text.includes("preco");

      let chosenMonths = 0;
      if (!isMenuOptionText) {
        if (text === "1" || text === "1m" || text === "mensal" || text === "plano mensal") chosenMonths = 1;
        else if (text === "2" || text === "3m" || text === "trimestral" || text === "plano trimestral") chosenMonths = 3;
        else if (text === "3" || text === "6m" || text === "semestral" || text === "plano semestral") chosenMonths = 6;
        else if (text === "4" || text === "12m" || text === "anual" || text === "plano anual") chosenMonths = 12;
      }

      if (isMenuOptionText) {
        conversationSessions.delete(cleanPhone);
      }

      if (chosenMonths > 0) {
        conversationSessions.delete(cleanPhone);
        return await handlePlanOrderCreation({
          userId,
          cleanPhone,
          pushName: params.pushName,
          durationMonths: chosenMonths,
          wsRow,
          config,
        });
      }
    }

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

      return await handleRenewOrderCreation({
        userId,
        cleanPhone,
        pushName: params.pushName,
        targetUsername,
        clientMatch,
        wsRow,
        config,
        serverName,
      });
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

      return await handleRenewOrderCreation({
        userId,
        cleanPhone,
        pushName: params.pushName,
        targetUsername,
        clientMatch,
        wsRow,
        config,
        serverName,
      });
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
        reply: trialRes.error || "Deu um probleminha aqui pra gerar seu teste agora. Tenta de novo daqui a pouco que eu resolvo 🙏",
        action: "trial_failed",
      };
    }

    const appsBlock = generateAppsMessage(config, trialRes.serverName || "IPTV");
    const firstName = (params.pushName || "").split(" ")[0];
    const reply =
      `Prontinho${firstName ? `, ${firstName}` : ""}! Liberei seu teste por ${config.testDurationHours} horas 🙂\n\n` +
      `Servidor: ${trialRes.serverName}\n` +
      `Endereço: ${trialRes.streamingDns}\n` +
      `Usuário: ${trialRes.username}\n` +
      `Senha: ${trialRes.password}\n\n` +
      `Sua lista:\n${trialRes.m3uUrl}\n\n` +
      `Guia de programação:\n${trialRes.epgUrl}\n\n` +
      `${appsBlock}\n\n` +
      `Bom teste! Se travar alguma coisa é só me chamar aqui.`;

    const apkUrl = config.appAndroidApk || "https://bit.ly/app-xciptv-oficial";

    return {
      reply:
        reply +
        `\n\nSe gostar, me avisa que eu te passo os valores pra deixar fixo.`,
      action: "trial_created",
      interactive: {
        type: "buttons",
        title: "Teste liberado",
        description: "Seu teste já está ativo. Se precisar do aplicativo ou dos valores, é só tocar abaixo.",
        footer: serverName,
        buttons: [
          {
            id: "btn_download_apk",
            displayText: "Baixar aplicativo",
            type: "url",
            url: apkUrl,
          },
          { id: "3", displayText: "Ver valores", type: "reply" },
          { id: "0", displayText: "Voltar", type: "reply" },
        ],
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

      return await handleRenewOrderCreation({
        userId,
        cleanPhone,
        pushName: params.pushName,
        targetUsername: inlineUser,
        clientMatch,
        wsRow,
        config,
        serverName,
      });
    }

    // 2. Busca linhas existentes cadastradas para esse número de WhatsApp
    let matchingClients: any[] = [];
    try {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId)
        .in("phone", phoneVariants(cleanPhone))
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
        `Achei sua conta aqui: usuário ${c.iptv_username || c.name}` +
        (c.next_due_date ? `, com vencimento em ${c.next_due_date}` : "") +
        `. A renovação fica ${fee}.\n\n` +
        `Posso seguir com essa? Responde "sim" que eu já gero o Pix. Se for outro usuário, é só me dizer qual.`;

      return {
        reply,
        action: "renew_confirm_prompted",
        interactive: {
          type: "buttons",
          title: "Renovar",
          description: `Renovar ${c.iptv_username || c.name} por ${fee}?`,
          footer: serverName,
          buttons: [
            { id: "SIM", displayText: "Sim, pode renovar", type: "reply" },
            { id: "0", displayText: "Agora não", type: "reply" },
          ],
        },
      };
    }

    // Caso B: Mais de 1 linha associada a este WhatsApp
    if (matchingClients.length > 1) {
      conversationSessions.set(cleanPhone, {
        step: "awaiting_renew_username",
        timestamp: Date.now(),
      });

      let listText = "";
      matchingClients.slice(0, 5).forEach((c) => {
        listText += `• ${c.iptv_username || c.name}${c.next_due_date ? ` (vence em ${c.next_due_date})` : ""}\n`;
      });

      const reply =
        `Vi que tem mais de um acesso no seu número:\n\n` +
        listText +
        `\nMe diz qual deles você quer renovar 🙂`;

      return {
        reply,
        action: "renew_multiple_prompted",
        interactive: {
          type: "list",
          title: "Qual deles?",
          description: "Tem mais de um acesso no seu número. Me diz qual você quer renovar.",
          buttonText: "Escolher",
          footerText: serverName,
          sections: [
            {
              title: "Suas Assinaturas",
              rows: matchingClients.slice(0, 10).map((mc, idx) => ({
                rowId: mc.iptv_username || mc.name,
                title: `${idx + 1}. ${mc.iptv_username || mc.name}`,
                description: `Venc: ${mc.next_due_date || "N/A"} • R$ ${Number(mc.monthly_fee || 35).toFixed(2).replace(".", ",")}`,
              })),
            },
          ],
        },
      };
    }

    // Caso C: Nenhuma linha encontrada para este WhatsApp -> Pergunta o usuário
    conversationSessions.set(cleanPhone, {
      step: "awaiting_renew_username",
      timestamp: Date.now(),
    });

    const reply =
      `Claro! Só me diz qual é o seu usuário (aquele login que você usa no aplicativo) que eu já vejo a renovação pra você.`;

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
    conversationSessions.set(cleanPhone, {
      step: "awaiting_plan_choice",
      timestamp: Date.now(),
    });

    const p1 = `R$ ${Number(config.planMonthlyPrice || 35).toFixed(2).replace(".", ",")}`;
    const p2 = `R$ ${Number(config.planQuarterlyPrice || 90).toFixed(2).replace(".", ",")}`;
    const p3 = `R$ ${Number(config.planSemiannualPrice || 160).toFixed(2).replace(".", ",")}`;
    const p4 = `R$ ${Number(config.planAnnualPrice || 290).toFixed(2).replace(".", ",")}`;

    const reply =
      `${config.plansText}\n\n` +
      `Me diz qual deles você prefere que eu já gero o Pix pra você 🙂`;

    return {
      reply,
      action: "plans_shown",
      interactive: {
        type: "list",
        title: "Nossos planos",
        description: "Escolhe o que combina mais com você que eu já gero o Pix.",
        buttonText: "Ver planos",
        footerText: serverName,
        sections: [
          {
            title: "Planos",
            rows: [
              {
                rowId: "plano_1m",
                title: `1 mês — ${p1}`,
                description: "Acesso por 30 dias, liberado na hora",
              },
              {
                rowId: "plano_3m",
                title: `3 meses — ${p2}`,
                description: "Acesso por 90 dias",
              },
              {
                rowId: "plano_6m",
                title: `6 meses — ${p3}`,
                description: "Acesso por 180 dias, o mais pedido",
              },
              {
                rowId: "plano_12m",
                title: `12 meses — ${p4}`,
                description: "Acesso por 365 dias, sai bem mais barato",
              },
              {
                rowId: "0",
                title: "Depois eu vejo",
                description: "Voltar pro começo da conversa",
              },
            ],
          },
        ],
      },
    };
  }

  // =========================================================================
  // OPÇÃO 4: BAIXAR APLICATIVOS (ANDROID, TV BOX, PC, IOS)
  // =========================================================================
  if (
    text === "4" ||
    text === "4." ||
    text.includes("app") ||
    text.includes("apps") ||
    text.includes("baixar") ||
    text.includes("download") ||
    text.includes("aplicativo") ||
    text.includes("aplicativos") ||
    text.includes("instalar") ||
    text.includes("tv box") ||
    text.includes("celular") ||
    text.includes("ios") ||
    text.includes("iphone") ||
    text.includes("computador") ||
    text.includes("pc") ||
    text.includes("smart tv") ||
    text.includes("firestick") ||
    text.includes("downloader")
  ) {
    const appsReply = generateAppsMessage(config, serverName);
    const apkUrl = config.appAndroidApk || "https://bit.ly/app-xciptv-oficial";
    const iosUrl = config.appIosLink || "https://apps.apple.com/app/smarters-player-lite/id1628995509";
    const winUrl = config.appWindowsLink || "https://www.iptvsmarters.com/download?download=windows";

    return {
      reply: appsReply,
      action: "apps_links_sent",
      interactive: {
        type: "buttons",
        title: "📲 Aplicativos de Streaming",
        description: "Toque nos botões abaixo para baixar direto no seu dispositivo:",
        footer: `${serverName} • Suporte 24h`,
        buttons: [
          {
            id: "btn_download_apk",
            displayText: "🤖 Baixar APK Android",
            type: "url",
            url: apkUrl,
          },
          {
            id: "btn_download_ios",
            displayText: "🍏 App iPhone / iPad",
            type: "url",
            url: iosUrl,
          },
          {
            id: "btn_download_pc",
            displayText: "💻 App Windows (PC)",
            type: "url",
            url: winUrl,
          },
        ],
      },
    };
  }

  // =========================================================================
  // OPÇÃO 5: REENVIAR MEUS DADOS DE ACESSO / LISTA M3U
  // =========================================================================
  if (
    text === "5" ||
    text === "5." ||
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
        .in("phone", phoneVariants(cleanPhone))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      client = data;
    } catch {}

    if (!client) {
      return {
        reply:
          `Procurei aqui e não achei nenhum acesso ativo nesse número.\n\n` +
          `Se você contratou por outro número, me fala que eu procuro. Ou, se preferir, posso liberar um teste grátis pra você agora 🙂`,
        action: "credentials_not_found",
        interactive: {
          type: "buttons",
          title: "Não achei por aqui",
          description: "Não encontrei um acesso ativo nesse número. O que você prefere?",
          footer: serverName,
          buttons: [
            { id: "1", displayText: "Quero um teste", type: "reply" },
            { id: "3", displayText: "Ver valores", type: "reply" },
            { id: "6", displayText: "Falar com você", type: "reply" },
          ],
        },
      };
    }

    const u = client.iptv_username || client.name;
    const p = client.iptv_password || "••••••••";
    const cleanDns = extractCleanIptvDns(streamingDns) || "";
    const m3uUrl = generateM3uUrl(cleanDns, u, p, "ts");
    const epgUrl = generateEpgUrl(cleanDns, u, p);

    const appsBlock = generateAppsMessage(config, serverName);
    const reply =
      `Claro! Seguem seus dados${client.name ? `, ${String(client.name).split(" ")[0]}` : ""}:\n\n` +
      `Servidor: ${serverName}\n` +
      `Endereço: ${cleanDns}\n` +
      `Usuário: ${u}\n` +
      `Senha: ${p}\n` +
      `Telas: ${client.screens ?? 1}\n` +
      (client.next_due_date ? `Vence em: ${client.next_due_date}\n` : "") +
      `\nSua lista:\n${m3uUrl}\n\n` +
      `Guia de programação:\n${epgUrl}\n\n` +
      `${appsBlock}\n\n` +
      `Qualquer coisa me chama 🙂`;

    const apkUrl = config.appAndroidApk || "https://bit.ly/app-xciptv-oficial";

    return {
      reply,
      action: "credentials_resent",
      interactive: {
        type: "buttons",
        title: "Seus dados",
        description: "Se precisar do aplicativo ou quiser renovar, é só tocar aqui.",
        footer: serverName,
        buttons: [
          {
            id: "btn_download_apk",
            displayText: "Baixar aplicativo",
            type: "url",
            url: apkUrl,
          },
          { id: "2", displayText: "Quero renovar", type: "reply" },
          { id: "0", displayText: "Voltar", type: "reply" },
        ],
      },
    };
  }

  // =========================================================================
  // OPÇÃO 6: ATENDENTE HUMANO
  // =========================================================================
  if (
    text === "6" ||
    text === "6." ||
    text.includes("suporte") ||
    text.includes("humano") ||
    text.includes("atendente") ||
    text.includes("falar")
  ) {
    return {
      reply: config.supportMessage,
      action: "human_support",
      interactive: {
        type: "buttons",
        title: "Já te respondo",
        description: "Me conta o que aconteceu que eu respondo assim que ver. Se quiser adiantar algo:",
        footer: serverName,
        buttons: [
          { id: "1", displayText: "Quero um teste", type: "reply" },
          { id: "3", displayText: "Ver valores", type: "reply" },
          { id: "0", displayText: "Voltar", type: "reply" },
        ],
      },
    };
  }

  if (aiOn) {
    const aiResult = await runSalesAi();
    if (aiResult) return aiResult;
  }

  return buildMainMenu(config, serverName);

}

// Conjunto de IDs de mensagens já tratadas pelo bot para evitar respostas duplicadas
const globalHandledMessageIds = new Set<string>();
const recentPhoneReplies = new Map<string, number>();
let isInitialBotPoll = true;

function unwrapRawBotMessage(m: any): any {
  if (!m || typeof m !== "object") return {};
  if (m.ephemeralMessage?.message) return unwrapRawBotMessage(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return unwrapRawBotMessage(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrapRawBotMessage(m.viewOnceMessageV2.message);
  if (m.viewOnceMessageV2Extension?.message) return unwrapRawBotMessage(m.viewOnceMessageV2Extension.message);
  if (m.documentWithCaptionMessage?.message) return unwrapRawBotMessage(m.documentWithCaptionMessage.message);
  return m;
}

/**
 * Consulta mensagens recentes na Evolution API e processa respostas automaticamente.
 * Funciona tanto em segundo plano no navegador quanto no Webhook e Daemon.
 */
export async function pollAndProcessWhatsAppMessages(userId?: string): Promise<{
  ok: boolean;
  processed: number;
  handled?: string[];
}> {
  const { evolutionConfig } = await import("./evolution.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendViaEvolution, sendMediaViaEvolution } = await import("./billing.server");

  const { base, key, instance } = evolutionConfig(userId);
  if (!base || !instance) {
    return { ok: false, processed: 0 };
  }

  let rawMessages: any[] = [];
  try {
    const res = await fetch(`${base}/chat/findMessages/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 15 }),
    });

    if (!res.ok) {
      return { ok: false, processed: 0 };
    }

    const data = await res.json();
    rawMessages = data.messages?.records || data.records || (Array.isArray(data) ? data : []);
  } catch {
    return { ok: false, processed: 0 };
  }

  if (!rawMessages || rawMessages.length === 0) {
    return { ok: true, processed: 0 };
  }

  let processedCount = 0;
  const handled: string[] = [];
  const targetUserId = userId || "00000000-0000-0000-0000-000000000000";

  // Busca configurações da conta
  let settings: any = null;
  try {
    const { data: s } = await supabaseAdmin
      .from("whatsapp_settings")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();
    settings = s;
  } catch {}

  // Carrega configuração do bot
  const botConfig = await loadBotConfig(supabaseAdmin, targetUserId);
  if (!botConfig.enabled) {
    return { ok: true, processed: 0 };
  }

  const now = Date.now();

  for (const item of rawMessages) {
    const keyObj = item.key || {};
    const msgId = String(keyObj.id || item.id || "");
    if (!msgId) continue;

    // Se é mensagem enviada pelo próprio robô, marca como tratada e pula
    if (keyObj.fromMe || item.fromMe) {
      globalHandledMessageIds.add(msgId);
      continue;
    }

    // Ignora grupos e transmissões
    const remoteJid = String(keyObj.remoteJid || item.remoteJid || "");
    if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("@broadcast")) {
      continue;
    }

    // Verifica idade da mensagem
    const msgTimestamp = Number(item.messageTimestamp || 0) * 1000;
    const ageSeconds = Math.floor((now - msgTimestamp) / 1000);

    // No primeiro ciclo após inicialização do servidor, não responde mensagens antigas (> 2 min)
    if (isInitialBotPoll && ageSeconds > 120) {
      globalHandledMessageIds.add(msgId);
      continue;
    }

    // Se a mensagem for mais velha que 5 minutos, ignora para não floodar
    if (ageSeconds > 300) {
      globalHandledMessageIds.add(msgId);
      continue;
    }

    if (globalHandledMessageIds.has(msgId)) {
      continue;
    }

    // Extrai o texto do cliente
    const rawMsg = item.message ?? item;
    const messageObj = unwrapRawBotMessage(rawMsg);
    let incomingText = String(
      messageObj?.conversation ||
      messageObj?.extendedTextMessage?.text ||
      messageObj?.buttonsResponseMessage?.selectedButtonId ||
      messageObj?.buttonsResponseMessage?.selectedDisplayText ||
      messageObj?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      messageObj?.listResponseMessage?.title ||
      messageObj?.templateButtonReplyMessage?.selectedId ||
      messageObj?.interactiveResponseMessage?.body?.text ||
      item?.body ||
      ""
    ).trim();

    if (!incomingText) {
      const nativeFlow = messageObj?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
      if (nativeFlow) {
        try {
          const parsed = JSON.parse(nativeFlow);
          incomingText = String(parsed.id || parsed.selectedId || parsed.rowId || nativeFlow).trim();
        } catch {
          incomingText = String(nativeFlow).trim();
        }
      }
    }

    if (!incomingText) {
      globalHandledMessageIds.add(msgId);
      continue;
    }

    // Nunca tente inferir telefone a partir de @lid: sem senderPn a mensagem não é roteável com segurança.
    const resolvedJid = String(keyObj.senderPn || item.senderPn || keyObj.remoteJidAlt || item.remoteJidAlt || remoteJid);
    if (resolvedJid.endsWith("@lid")) {
      globalHandledMessageIds.add(msgId);
      console.warn("[Bot Auto-Poll] Ignorando mensagem LID sem telefone resolvido", msgId);
      continue;
    }
    // Extrai número do cliente e garante envio no JID primário (@s.whatsapp.net)
    const cleanDigits = resolvedJid.replace(/@.*$/, "").replace(/\D/g, "");
    let realPhone = cleanDigits;
    if (realPhone.length > 13 && realPhone.startsWith("55")) realPhone = realPhone.slice(-13);
    if (!realPhone.startsWith("55") && realPhone.length >= 10 && realPhone.length <= 11) {
      realPhone = `55${realPhone}`;
    }

    const targetSendJid = `${realPhone}@s.whatsapp.net`;
    const pushName = item.pushName || "Cliente";

    globalHandledMessageIds.add(msgId);

    const { isDuplicateMessage } = await import("./whatsapp-engine.server");
    if (isDuplicateMessage(msgId, realPhone)) {
      console.log(`[Bot Auto-Poll] 🛡️ Ignorando duplicata para ${realPhone} (ID: ${msgId})`);
      continue;
    }

    try {
      console.log(`[Bot Auto-Poll] 📩 Processando mensagem de ${realPhone} (${pushName}): "${incomingText}"`);

      const botResult = await processBotMessage(supabaseAdmin, targetUserId, {
        phone: realPhone,
        text: incomingText,
        pushName,
      });

      if (botResult?.reply) {
        // Envia resposta oficial via Evolution API
        await sendViaEvolution(settings ?? {}, targetSendJid, botResult.reply, targetUserId);
        console.log(`[Bot Auto-Poll] 📤 Resposta enviada para ${targetSendJid}: "${botResult.reply.slice(0, 60)}..."`);

        // Envia QR Code se houver
        if (
          botResult.media?.base64 &&
          ["order_created_mp", "order_created_manual", "renew_pix_mp_sent", "renew_pix_manual_sent", "order_status_checked"].includes(
            String(botResult.action),
          )
        ) {
          try {
            await sendMediaViaEvolution(
              settings ?? {},
              targetSendJid,
              {
                base64: botResult.media.base64,
                ...(botResult.media.caption ? { caption: botResult.media.caption } : {}),
                mimetype: "image/png",
                fileName: "qrcode-pix.png",
              },
              targetUserId,
            );
          } catch {}
        }

        // Envia mensagens adicionais (ex: código Pix copia e cola)
        if (Array.isArray(botResult.extraMessages)) {
          for (const extra of botResult.extraMessages) {
            if (extra && extra.trim()) {
              await sendViaEvolution(settings ?? {}, targetSendJid, extra, targetUserId);
            }
          }
        }

        // Salva log de mensagem enviada
        try {
          await supabaseAdmin.from("message_logs").insert({
            user_id: targetUserId,
            phone: realPhone,
            body: botResult.reply,
            status: "sent",
          });
        } catch {}

        processedCount++;
        handled.push(msgId);
      }
    } catch (err) {
      console.error(`[Bot Auto-Poll] Erro ao responder para ${realPhone}:`, err);
    }
  }

  isInitialBotPoll = false;

  // Limpa cache se exceder 3000 mensagens
  if (globalHandledMessageIds.size > 3000) {
    const arr = Array.from(globalHandledMessageIds);
    globalHandledMessageIds.clear();
    arr.slice(-1500).forEach((id) => globalHandledMessageIds.add(id));
  }

  return { ok: true, processed: processedCount, handled };
}

