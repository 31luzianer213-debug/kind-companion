import fs from "fs";
import path from "path";
import { generateM3uUrl, generateEpgUrl, extractCleanIptvDns } from "./format";
import type { SigmaConfig } from "./sigma.panel";
import { createOrderServer, listOrdersServer, approveAndReleaseOrderServer, updateOrderServer } from "./orders.server";
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
};

export const DEFAULT_BOT_CONFIG: BotConfigData = {
  enabled: true,
  businessName: "Alpha IPTV",
  serverName: "Alpha server IPTV",
  streamingDns: "http://karen256.top",
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
    "4️⃣ *Baixar Aplicativos* (Celular, TV Box, PC, iOS) 📲\n" +
    "5️⃣ *Reenviar Meus Dados de Acesso / Lista M3U*\n" +
    "6️⃣ *Falar com Atendente Humano*\n\n" +
    "_Responda com 1, 2, 3, 4, 5 ou 6._",
  plansText:
    "🛒 *PLANOS E ASSINATURAS DISPONÍVEIS* 🍿\n\n" +
    "📺 *1 Mês (1 Tela):* R$ 35,00\n" +
    "📺 *3 Meses (Trimestral):* R$ 90,00 (Mais econômico!)\n" +
    "📺 *6 Meses (Semestral):* R$ 160,00\n" +
    "📺 *12 Meses (Anual):* R$ 290,00 (Melhor custo-benefício!)\n\n" +
    "⭐ *Todos os planos incluem:*\n" +
    "• Mais de 80.000 conteúdos (Canais 4K/FHD, Filmes e Séries atualizados)\n" +
    "• Guia de Canais completo (EPG)\n" +
    "• Funciona em TV Box, Smart TV, Celular, Computador e Tablet.",
  supportMessage:
    "👨‍💼 *ATENDIMENTO HUMANO*\n\n" +
    "Sua solicitação foi recebida! Um de nossos atendentes irá te responder diretamente aqui em instantes.\n" +
    "Por favor, deixe sua dúvida ou mensagem abaixo para agilizar seu atendimento. 👇",
  planMonthlyPrice: 35.0,
  planQuarterlyPrice: 90.0,
  planSemiannualPrice: 160.0,
  planAnnualPrice: 290.0,
  renewalPrice: 35.0,
  mercadopago_token:
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    "APP_USR-3160859496295692-031614-d4b7df3cf7507800baabef77d641c0f2-1487021055",
  payment_provider: "mercadopago",
  appAndroidApk: "https://bit.ly/app-xciptv-oficial",
  appAndroidDownloaderCode: "389471",
  appIosLink: "https://apps.apple.com/app/smarters-player-lite/id1628995509",
  appWindowsLink: "https://www.iptvsmarters.com/download?download=windows",
  appWebPlayerLink: "http://webtv.iptvsmarters.com",
  appSmartTvText: "• Smart TV Samsung / LG: Baixe o app IBO Player, SmartOne IPTV ou Bob Player na loja da sua TV e nos envie o Mac / Device ID.",
  appsCustomText: "",
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
  const srv = params.serverName || "Alpha IPTV";

  return (
    `🛒 *PLANOS E ASSINATURAS ${srv.toUpperCase()}* 🍿\n\n` +
    `📺 *1 Mês (Mensal):* R$ ${m}\n` +
    `📺 *3 Meses (Trimestral):* R$ ${q} (Econômico!)\n` +
    `📺 *6 Meses (Semestral):* R$ ${s} (Mais Vendido! 🔥)\n` +
    `📺 *12 Meses (Anual):* R$ ${a} (Super Desconto ⭐)\n\n` +
    `⭐ *Todos os planos incluem:*\n` +
    `• Mais de 80.000 conteúdos (Canais 4K/FHD, Filmes e Séries atualizados)\n` +
    `• Guia de Canais completo (EPG)\n` +
    `• Compatível com TV Box, Smart TV, Celular, Computador e Tablet\n` +
    `• Ativação Imediata via PIX Automático!`
  );
}

export function generateAppsMessage(config: BotConfigData, serverName: string): string {
  if (config.appsCustomText && config.appsCustomText.trim().length > 10) {
    return config.appsCustomText.trim();
  }

  const apk = config.appAndroidApk || DEFAULT_BOT_CONFIG.appAndroidApk;
  const code = config.appAndroidDownloaderCode || DEFAULT_BOT_CONFIG.appAndroidDownloaderCode;
  const ios = config.appIosLink || DEFAULT_BOT_CONFIG.appIosLink;
  const win = config.appWindowsLink || DEFAULT_BOT_CONFIG.appWindowsLink;
  const web = config.appWebPlayerLink || DEFAULT_BOT_CONFIG.appWebPlayerLink;
  const smartTv = config.appSmartTvText || DEFAULT_BOT_CONFIG.appSmartTvText;

  return (
    `📲 *APLICATIVOS OFICIAIS — ${serverName.toUpperCase()}* 🍿\n\n` +
    `Escolha o seu dispositivo abaixo para instalar nosso aplicativo recomendado:\n\n` +
    `🤖 *TV BOX / ANDROID TV / FIRESTICK:*\n` +
    `• Abra o aplicativo *Downloader* na TV e digite o código: *${code}*\n` +
    `• Ou baixe o instalador APK direto: ${apk}\n\n` +
    `📱 *CELULAR & TABLET ANDROID:*\n` +
    `• Baixar APK Direto: ${apk}\n\n` +
    `🍏 *IPHONE / IPAD / APPLE TV (iOS):*\n` +
    `• Baixar na App Store (Smarters Player Lite):\n` +
    `${ios}\n\n` +
    `💻 *COMPUTADOR & NOTEBOOK (WINDOWS):*\n` +
    `• Baixar IPTV Smarters Pro (.exe):\n` +
    `${win}\n\n` +
    `🌐 *ASSISTIR NO NAVEGADOR (WEB PLAYER):*\n` +
    `• Acesso direto sem instalar nada: ${web}\n\n` +
    `📺 *SMART TV (SAMSUNG / LG / ROKU):*\n` +
    `${smartTv}\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🔑 *Como Conectar:*\n` +
    `Após instalar, abra o app e entre com os dados do seu teste ou assinatura (Usuário, Senha e URL/DNS do servidor).\n\n` +
    `_Precisa dos seus dados de acesso? Digite *5*._\n` +
    `_Dúvidas na instalação? Digite *6* para falar com o suporte._`
  );
}

// Cache em memória para leitura ultrarrápida (0ms) sem bloqueio de RLS
const botConfigCache = new Map<string, BotConfigData>();

export function getCanonicalUserId(userId?: string): string {
  if (!userId || userId === "default") return "default";
  const clean = userId.replace(/^iptv_/i, "").replace(/[^a-zA-Z0-9]/g, "");
  return clean.slice(0, 16) || "default";
}

export function getLocalPaymentPath(userId?: string): string {
  const canonicalId = getCanonicalUserId(userId);
  const dir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, `payment_settings_${canonicalId}.json`);
}

export function readLocalPaymentSettings(userId?: string): any {
  try {
    const file = getLocalPaymentPath(userId);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  } catch {}
  return null;
}

export function writeLocalPaymentSettings(userId: string | undefined, data: any): void {
  try {
    const file = getLocalPaymentPath(userId);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Aviso ao gravar payment settings local:", err);
  }
}

function getLocalConfigPath(userId?: string): string {
  const safeId = (userId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const canonicalId = getCanonicalUserId(userId);
  const dir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  // Se o arquivo canonical já existir, usa ele para consistência
  const canonicalPath = path.join(dir, `bot_config_${canonicalId}.json`);
  if (fs.existsSync(canonicalPath)) return canonicalPath;

  const safePath = path.join(dir, `bot_config_${safeId}.json`);
  if (fs.existsSync(safePath)) return safePath;

  return canonicalPath;
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

    // Grava também no nome canonical se for diferente para sincronização total
    const canonicalId = getCanonicalUserId(userId);
    const canonicalPath = path.join(path.resolve(process.cwd(), "data"), `bot_config_${canonicalId}.json`);
    if (file !== canonicalPath) {
      fs.writeFileSync(canonicalPath, JSON.stringify(data, null, 2), "utf-8");
    }
  } catch (err) {
    console.warn("Aviso ao gravar config local do bot:", err);
  }
}

/** Carrega as configurações do bot com persistência em 3 níveis (Disco -> Memória -> Banco) */
export async function loadBotConfig(supabase: any, userId: string): Promise<BotConfigData> {
  const uid = userId || "default";

  // 1. Arquivo persistente no disco (garante atualização instantânea entre processos)
  const diskData = readLocalConfig(uid);
  const localPayment = readLocalPaymentSettings(uid);
  if (diskData && typeof diskData.enabled === "boolean") {
    let mpToken = diskData.mercadopago_token || localPayment?.mercadopago_token;
    let paymentProvider = diskData.payment_provider || localPayment?.payment_provider || (mpToken ? "mercadopago" : "pix");

    // Se o token ainda não estava no disco e recebemos cliente supabase, tenta puxar do banco/metadata
    if (!mpToken && supabase) {
      try {
        const { data } = await supabase
          .from("whatsapp_settings")
          .select("mercadopago_token, payment_provider, pix_key, pix_holder, sigma_server_name, sigma_streaming_dns")
          .eq("user_id", userId)
          .maybeSingle();
        if (data?.mercadopago_token) {
          mpToken = data.mercadopago_token.trim();
          paymentProvider = data.payment_provider || "mercadopago";
          // Grava no disco para as próximas chamadas não precisarem de query
          writeLocalPaymentSettings(uid, {
            mercadopago_token: mpToken,
            payment_provider: paymentProvider,
            pix_key: data.pix_key || diskData.pixKey,
            pix_holder: data.pix_holder || diskData.pixHolder,
          });
        }
      } catch {}
    }

    const merged: BotConfigData = {
      ...DEFAULT_BOT_CONFIG,
      ...diskData,
      mercadopago_token: mpToken,
      payment_provider: paymentProvider,
      pixKey: diskData.pixKey || localPayment?.pix_key || DEFAULT_BOT_CONFIG.pixKey,
      pixHolder: diskData.pixHolder || localPayment?.pix_holder || DEFAULT_BOT_CONFIG.pixHolder,
    };
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

  // Sincroniza também no arquivo local de pagamento para o bot ter 100% de acesso
  if (updated.mercadopago_token || updated.pixKey || updated.pixHolder) {
    try {
      const existingP = readLocalPaymentSettings(uid) || {};
      writeLocalPaymentSettings(uid, {
        ...existingP,
        user_id: userId,
        mercadopago_token: updated.mercadopago_token ?? existingP.mercadopago_token ?? "",
        payment_provider: updated.payment_provider ?? existingP.payment_provider ?? "mercadopago",
        pix_key: updated.pixKey ?? existingP.pix_key ?? "",
        pix_holder: updated.pixHolder ?? existingP.pix_holder ?? "",
      });
    } catch {}
  }

  // 2. Atualiza na tabela whatsapp_settings de forma segura (apenas colunas existentes no schema)
  try {
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
    botConfig.serverName ||
    wsRow?.sigma_server_name?.trim() ||
    userMetaSigma?.server_name?.trim() ||
    botConfig.businessName ||
    "Alpha server IPTV";

  const streamingDns =
    botConfig.streamingDns ||
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
 * Cria pedido para o plano escolhido e formata a resposta com PIX Copia e Cola (Mercado Pago) ou Chave Manual
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
    console.log(`[Bot Plan] ⚡ Gerando PIX Mercado Pago para ${cleanPhone} (R$ ${amount.toFixed(2)})...`);
    mpPixResult = await createMercadoPagoPixPayment({
      token: mpToken,
      amount,
      description: `${planName} - Pedido #${order.order_number}`,
      orderId: order.id,
      customerName: pushName || "Cliente",
      customerPhone: cleanPhone,
    });

    if (mpPixResult.ok && mpPixResult.qrCode) {
      console.log(`[Bot Plan] ✅ PIX gerado com sucesso para Pedido #${order.order_number}!`);
      order.pix_code = mpPixResult.qrCode;
      order.gateway_payment_id = mpPixResult.paymentId;
      order.payment_method = "mercadopago_pix";
      updateOrderServer(userId, order.id, {
        pix_code: mpPixResult.qrCode,
        gateway_payment_id: mpPixResult.paymentId,
        payment_method: "mercadopago_pix",
      });
    } else {
      console.warn(`[Bot Plan] ⚠️ Falha na API do Mercado Pago: ${mpPixResult?.error}`);
    }
  } else {
    console.warn("[Bot Plan] ⚠️ Nenhum Access Token do Mercado Pago encontrado.");
  }

  if (mpPixResult?.ok && mpPixResult?.qrCode) {
    // MODO AUTOMÁTICO MERCADO PAGO COM PIX COPIA E COLA & QR CODE FOTO
    const reply =
      `🎉 *PEDIDO #${order.order_number} GERADO COM SUCESSO!* 🍿\n\n` +
      `📦 *Plano:* ${planName}\n` +
      `💰 *Valor:* *R$ ${amount.toFixed(2).replace(".", ",")}*\n` +
      `⚡ *Forma de Pagamento:* PIX Automático (Mercado Pago)\n\n` +
      `Escaneie a imagem do QR Code abaixo ou utilize o código Copia e Cola enviado a seguir:`;

    const extraMessages: string[] = [
      // 1. Mensagem dedicada contendo APENAS o código PIX Copia e Cola (facilita cópia com 1 toque)
      mpPixResult.qrCode,
      // 2. Orientações de ativação automática
      `✅ *Liberação 100% Automática!*\n` +
      `Assim que você realizar o pagamento no aplicativo do seu banco, o sistema reconhece em poucos segundos e já envia seu Login, Senha e Lista M3U aqui mesmo nesta conversa! 🚀\n\n` +
      `_Dica: Se já concluiu o PIX e quer checar agora, basta digitar *verificar*._`,
    ];

    return {
      reply,
      action: "order_created_mp",
      media: mpPixResult.qrCodeBase64
        ? {
            type: "image",
            base64: mpPixResult.qrCodeBase64,
            caption: `📱 *QR CODE PIX — PEDIDO #${order.order_number}*\n💰 Valor: R$ ${amount.toFixed(2).replace(".", ",")}\nAponte a câmera do aplicativo do seu banco para pagar!`,
          }
        : undefined,
      extraMessages,
    };
  }

  // MODO MANUAL (Sem Mercado Pago cadastrado ou falha de token)
  const effectivePixKey = config.pixKey || wsRow?.pix_key || readLocalPaymentSettings(userId)?.pix_key || "Consulte nossa chave PIX com nosso suporte";
  const effectivePixHolder = config.pixHolder || wsRow?.pix_holder || readLocalPaymentSettings(userId)?.pix_holder || config.businessName;

  const reply =
    `🎉 *PEDIDO #${order.order_number} GERADO COM SUCESSO!* 🍿\n\n` +
    `📦 *Plano:* ${planName}\n` +
    `💰 *Valor:* *R$ ${amount.toFixed(2).replace(".", ",")}*\n` +
    `💳 *Forma de Pagamento:* Transferência PIX (Liberação Manual)\n\n` +
    `🔑 *Chave PIX:* \`${effectivePixKey}\`\n` +
    `👤 *Titular:* ${effectivePixHolder}\n\n` +
    `📌 *Como Ativar Seu Acesso:*\n` +
    `1️⃣ Faça o PIX no valor de *R$ ${amount.toFixed(2).replace(".", ",")}* para a chave acima.\n` +
    `2️⃣ *Envie o comprovante do PIX aqui nesta conversa*.\n` +
    `3️⃣ Nosso administrador confirmará pelo painel e seu acesso será liberado imediatamente! 🚀`;

  return {
    reply,
    action: "order_created_manual",
  };
}

/**
 * Cria pedido de RENOVAÇÃO e formata a resposta com PIX Copia e Cola (Mercado Pago) ou Chave Manual
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
    console.log(`[Bot Renew] ⚡ Gerando PIX Mercado Pago para renovação de ${targetUsername} (R$ ${amount.toFixed(2)})...`);
    mpPixResult = await createMercadoPagoPixPayment({
      token: mpToken,
      amount,
      description: `Renovação IPTV ${targetUsername} (#${order.order_number})`,
      orderId: order.id,
      customerName: clientMatch?.name || pushName || "Cliente",
      customerPhone: cleanPhone,
    });

    if (mpPixResult.ok && mpPixResult.qrCode) {
      console.log(`[Bot Renew] ✅ PIX gerado com sucesso para Renovação #${order.order_number}!`);
      order.pix_code = mpPixResult.qrCode;
      order.gateway_payment_id = mpPixResult.paymentId;
      order.payment_method = "mercadopago_pix";
      updateOrderServer(userId, order.id, {
        pix_code: mpPixResult.qrCode,
        gateway_payment_id: mpPixResult.paymentId,
        payment_method: "mercadopago_pix",
      });
    } else {
      console.warn(`[Bot Renew] ⚠️ Falha na API do Mercado Pago: ${mpPixResult?.error}`);
    }
  } else {
    console.warn("[Bot Renew] ⚠️ Nenhum Access Token do Mercado Pago encontrado.");
  }

  if (mpPixResult?.ok && mpPixResult?.qrCode) {
    // MODO AUTOMÁTICO MERCADO PAGO COM PIX COPIA E COLA & QR CODE FOTO
    const reply =
      `💳 *DADOS PARA PAGAMENTO PIX (RENOVAÇÃO)* 📺\n\n` +
      `✅ *Usuário a Renovar:* *${targetUsername}*\n` +
      (clientMatch?.name ? `👤 *Cliente:* ${clientMatch.name}\n` : "") +
      `📺 *Servidor:* ${serverName}\n` +
      `💰 *Valor da Mensalidade:* *R$ ${amount.toFixed(2).replace(".", ",")}*\n` +
      `⚡ *Forma de Pagamento:* PIX Automático (Mercado Pago)\n\n` +
      `Escaneie a imagem do QR Code abaixo ou utilize o código Copia e Cola enviado a seguir:`;

    const extraMessages: string[] = [
      // 1. Mensagem dedicada contendo APENAS o código PIX Copia e Cola (facilita cópia com 1 toque)
      mpPixResult.qrCode,
      // 2. Orientações de renovação automática
      `✅ *Liberação 100% Automática!*\n` +
      `Assim que você realizar o pagamento no aplicativo do seu banco, o sistema reconhece em poucos segundos e renova seu acesso imediatamente no servidor! 🚀\n\n` +
      `_Dica: Se já concluiu o PIX e quer checar agora, basta digitar *verificar*._`,
    ];

    return {
      reply,
      action: "renew_pix_mp_sent",
      media: mpPixResult.qrCodeBase64
        ? {
            type: "image",
            base64: mpPixResult.qrCodeBase64,
            caption: `📱 *QR CODE PIX — RENOVAÇÃO IPTV*\n👤 Usuário: ${targetUsername}\n💰 Valor: R$ ${amount.toFixed(2).replace(".", ",")}`,
          }
        : undefined,
      extraMessages,
    };
  }

  // MODO MANUAL (Sem Mercado Pago cadastrado ou falha no token)
  const effectivePixKey = config.pixKey || wsRow?.pix_key || readLocalPaymentSettings(userId)?.pix_key || "Consulte nossa chave PIX com nosso suporte";
  const effectivePixHolder = config.pixHolder || wsRow?.pix_holder || readLocalPaymentSettings(userId)?.pix_holder || config.businessName;

  const reply =
    `💳 *DADOS PARA PAGAMENTO PIX (RENOVAÇÃO)* 📺\n\n` +
    `✅ *Usuário a Renovar:* *${targetUsername}*\n` +
    (clientMatch?.name ? `👤 *Cliente:* ${clientMatch.name}\n` : "") +
    `📺 *Servidor:* ${serverName}\n` +
    `💰 *Valor da Mensalidade:* *R$ ${amount.toFixed(2).replace(".", ",")}*\n` +
    `💳 *Forma de Pagamento:* Transferência PIX (Liberação Manual)\n\n` +
    `🔑 *Chave PIX:* \`${effectivePixKey}\`\n` +
    `👤 *Titular:* ${effectivePixHolder}\n\n` +
    `📌 *Como Confirmar Sua Renovação:*\n` +
    `1️⃣ Faça o PIX no valor de *R$ ${amount.toFixed(2).replace(".", ",")}* para a chave acima.\n` +
    `2️⃣ *Envie o comprovante do PIX aqui nesta conversa*.\n` +
    `3️⃣ Nosso administrador confirmará pelo painel e seu acesso será renovado imediatamente! 🚀\n\n` +
    `Se precisar de suporte, digite *6*.`;

  return {
    reply,
    action: "renew_pix_manual_sent",
  };
}

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

  const serverName = config.serverName || wsRow?.sigma_server_name?.trim() || config.businessName || "Alpha server IPTV";
  const streamingDns = config.streamingDns || wsRow?.sigma_streaming_dns?.trim() || "http://karen256.top";
  const pixKey = config.pixKey || wsRow?.pix_key || readLocalPaymentSettings(userId)?.pix_key || "Consulte nossa chave PIX";
  const pixHolder = config.pixHolder || wsRow?.pix_holder || readLocalPaymentSettings(userId)?.pix_holder || config.businessName;

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
      : orders.find((o) => o.customer_phone === cleanPhone);

    if (!order) {
      return {
        reply: "🔍 Não encontrei nenhum pedido pendente para o seu número. Digite *3* para ver nossos planos e assinar!",
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
          `• Digite *5* para ver seus dados de acesso completos (usuário, senha e M3U)!\n` +
          `• Digite *4* para baixar os aplicativos de TV Box, Celular e PC! 📲`,
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
                  `Seu acesso acabou de ser ativado no servidor.\n\n` +
                  `• Digite *5* para ver seus dados de conexão e lista M3U!\n` +
                  `• Digite *4* para baixar os aplicativos oficiais! 📲`,
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
          ? `⚡ O Mercado Pago confirmará automaticamente assim que o PIX for concluído.${pixCodeNotice}\n\n_Assim que pagar, digite *verificar* para checar novamente._`
          : `💳 *Chave PIX:* \`${pixKey}\`\n👤 *Titular:* ${pixHolder}\n\nPor favor, envie o comprovante do PIX aqui para liberação pelo administrador!`),
      action: "order_status_checked",
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
      let chosenMonths = 0;
      if (text === "1" || text === "1m" || text === "mensal" || text.includes("mensal")) chosenMonths = 1;
      else if (text === "2" || text === "3m" || text === "trimestral" || text.includes("trimestral")) chosenMonths = 3;
      else if (text === "3" || text === "6m" || text === "semestral" || text.includes("semestral")) chosenMonths = 6;
      else if (text === "4" || text === "12m" || text === "anual" || text.includes("anual")) chosenMonths = 12;

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
      `📲 *Precisa baixar o aplicativo?* Digite *4* para receber os links de download!\n` +
      `Bom divertimento! Qualquer dúvida, digite *6* para falar conosco. 🍿`;

    return {
      reply:
        reply +
        `\n\n_Gostou e quer assinar? Digite *3* para ver nossos planos e garantir seu acesso definitivo!_ 🚀`,
      action: "trial_created",
      interactive: {
        type: "buttons",
        title: "🎉 Teste Liberado!",
        description: "Seu teste gratuito foi ativado com sucesso! Escolha o próximo passo:",
        footer: `${serverName} • Suporte 24h`,
        buttons: [
          { id: "4", displayText: "📲 Baixar Aplicativos", type: "reply" },
          { id: "3", displayText: "🛒 Ver Nossos Planos", type: "reply" },
          { id: "6", displayText: "💬 Falar com Suporte", type: "reply" },
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

      return {
        reply,
        action: "renew_confirm_prompted",
        interactive: {
          type: "buttons",
          title: "💳 Confirmar Renovação",
          description: `Renovar assinatura de ${c.name} (${c.iptv_username || c.name}) por ${fee}?`,
          footer: `${serverName} • PIX Automático`,
          buttons: [
            { id: "SIM", displayText: "✅ Sim, Renovar Agora", type: "reply" },
            { id: "0", displayText: "❌ Menu Principal", type: "reply" },
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
        listText += `• Usuário: *${c.iptv_username || c.name}* (Vencimento: ${c.next_due_date || "N/A"})\n`;
      });

      const reply =
        `💳 *RENOVAÇÃO DE ASSINATURA* 📺\n\n` +
        `Encontramos mais de uma assinatura vinculada ao seu WhatsApp:\n\n` +
        listText +
        `\n👉 Por favor, *digite o Usuário* que você deseja renovar: 👇`;

      return {
        reply,
        action: "renew_multiple_prompted",
        interactive: {
          type: "list",
          title: "Escolha a Assinatura",
          description: "Encontramos mais de uma conta vinculada ao seu WhatsApp. Escolha qual deseja renovar:",
          buttonText: "Selecionar Conta",
          footerText: `${serverName} • Renovação 24h`,
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
    conversationSessions.set(cleanPhone, {
      step: "awaiting_plan_choice",
      timestamp: Date.now(),
    });

    const pixKey = config.pixKey || wsRow?.pix_key || "";
    const pixBlock = pixKey ? `\n\n🔑 *Chave PIX:* \`${pixKey}\`` : "";

    const p1 = `R$ ${Number(config.planMonthlyPrice || 35).toFixed(2).replace(".", ",")}`;
    const p2 = `R$ ${Number(config.planQuarterlyPrice || 90).toFixed(2).replace(".", ",")}`;
    const p3 = `R$ ${Number(config.planSemiannualPrice || 160).toFixed(2).replace(".", ",")}`;
    const p4 = `R$ ${Number(config.planAnnualPrice || 290).toFixed(2).replace(".", ",")}`;

    const reply =
      `${config.plansText}${pixBlock}\n\n` +
      `👇 *Para assinar agora, responda com o número do plano desejado:*\n\n` +
      `👉 Digite *1* para *Plano Mensal (${p1})*\n` +
      `👉 Digite *2* para *Plano Trimestral (${p2})*\n` +
      `👉 Digite *3* para *Plano Semestral (${p3})*\n` +
      `👉 Digite *4* para *Plano Anual (${p4})*\n\n` +
      `_Ou digite *0* para voltar ao menu principal._`;

    return {
      reply,
      action: "plans_shown",
      interactive: {
        type: "buttons",
        title: "🍿 Escolha seu Plano IPTV",
        description: "Selecione o plano desejado para gerar seu PIX Automático:",
        footer: `${serverName} • Liberação Imediata`,
        buttons: [
          { id: "1", displayText: `1️⃣ Mensal (${p1})`, type: "reply" },
          { id: "2", displayText: `2️⃣ Trimestral (${p2})`, type: "reply" },
          { id: "3", displayText: `3️⃣ Semestral (${p3})`, type: "reply" },
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
    return {
      reply: appsReply,
      action: "apps_links_sent",
      interactive: {
        type: "buttons",
        title: "📲 Aplicativos de Streaming",
        description: "Links de download para Celular, TV Box, PC, Smart TV e iPhone.",
        footer: `${serverName} • Suporte 24h`,
        buttons: [
          { id: "1", displayText: "1️⃣ Gerar Teste Grátis", type: "reply" },
          { id: "5", displayText: "5️⃣ Meus Dados de Acesso", type: "reply" },
          { id: "6", displayText: "6️⃣ Atendimento Humano", type: "reply" },
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
          `• Digite *4* para baixar nossos aplicativos.\n` +
          `• Digite *6* se você contratou com outro número para falar com o suporte.`,
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
      `📲 _Precisa instalar o aplicativo no seu aparelho? Digite *4*._\n\n` +
      `Bom divertimento! 🍿`;

    return {
      reply,
      action: "credentials_resent",
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
      title: config.businessName || "Menu IPTV",
      description: greeting,
      buttonText: "Ver Opções do Menu",
      footerText: `${serverName} • Auto-Atendimento 24h`,
      sections: [
        {
          title: "Auto-Atendimento",
          rows: [
            {
              rowId: "1",
              title: "1️⃣ Gerar Teste Grátis",
              description: `Acesso imediato de ${config.testDurationHours}h liberado na hora`,
            },
            {
              rowId: "2",
              title: "2️⃣ Renovar Assinatura",
              description: "Renovação rápida com PIX Automático",
            },
            {
              rowId: "3",
              title: "3️⃣ Comprar Acesso / Planos",
              description: "Consulte nossos planos e valores",
            },
            {
              rowId: "4",
              title: "4️⃣ Baixar Aplicativos",
              description: "Links para Celular, TV Box, PC, iOS e Smart TV 📲",
            },
            {
              rowId: "5",
              title: "5️⃣ Reenviar Meus Dados",
              description: "Receber login, senha e lista M3U",
            },
            {
              rowId: "6",
              title: "6️⃣ Falar com Atendente",
              description: "Suporte com nossa equipe humana",
            },
          ],
        },
      ],
    },
  };
}
