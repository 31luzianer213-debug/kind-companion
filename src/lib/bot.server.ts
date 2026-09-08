import { generateM3uUrl, generateEpgUrl, extractCleanIptvDns } from "./format";
import type { SigmaConfig } from "./sigma.panel";

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

/** Carrega as configurações do bot com fallback no user_metadata */
export async function loadBotConfig(supabase: any, userId: string): Promise<BotConfigData> {
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
      const { data: authUser } = await supabase.auth.getUser();
      metaBot = authUser?.user?.user_metadata?.bot_settings ?? null;
    } catch {
      metaBot = null;
    }

    const businessName =
      wsRow?.business_name?.trim() ||
      metaBot?.businessName?.trim() ||
      DEFAULT_BOT_CONFIG.businessName;

    return {
      enabled: metaBot?.enabled ?? (wsRow?.auto_send_enabled ?? DEFAULT_BOT_CONFIG.enabled),
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
  } catch (err) {
    console.error("[loadBotConfig] Fallback para DEFAULT_BOT_CONFIG:", err);
    return { ...DEFAULT_BOT_CONFIG };
  }
}

/** Salva as configurações do bot */
export async function saveBotConfigServer(
  supabase: any,
  userId: string,
  config: Partial<BotConfigData>,
): Promise<void> {
  const current = await loadBotConfig(supabase, userId);
  const updated: BotConfigData = { ...current, ...config };

  // 1. Tenta salvar na tabela whatsapp_settings se colunas existirem
  try {
    await supabase
      .from("whatsapp_settings")
      .update({
        business_name: updated.businessName,
        ...(updated.pixKey ? { pix_key: updated.pixKey } : {}),
        ...(updated.pixHolder ? { pix_holder: updated.pixHolder } : {}),
      })
      .eq("user_id", userId);
  } catch {}

  // 2. Salva SEMPRE no user_metadata
  try {
    await supabase.auth.updateUser({
      data: {
        bot_settings: {
          ...updated,
          updated_at: new Date().toISOString(),
        },
      },
    });
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

  if (!panelUrl || (!panelToken && (!panelUser || !panelPass))) {
    return {
      ok: false,
      error: "O Painel Sigma ainda não está configurado na sua conta. Acesse o menu 'Servidor Sigma' e conecte sua conta.",
    };
  }

  // 3. Gera credenciais aleatórias para o teste
  const trialUsername = Math.floor(10000000 + Math.random() * 90000000).toString();
  const trialPassword = Math.floor(100000 + Math.random() * 900000).toString();
  const clientDisplayName = (params.senderName?.trim() || "Cliente Teste WhatsApp") + " (Teste)";

  const hours = botConfig.testDurationHours || 4;
  const expiryDate = new Date(Date.now() + hours * 60 * 60 * 1000);
  const expiryIso = expiryDate.toISOString().slice(0, 10);

  // 4. Cria a linha no painel Sigma
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
    console.warn("Aviso ao criar teste no Sigma (prosseguindo com registro local):", sigmaErr);
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
): Promise<{ reply: string; action: string }> {
  const config = await loadBotConfig(supabase, userId);
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

    return { reply, action: "trial_created" };
  }

  // =========================================================================
  // OPÇÃO 2: RENOVAR ASSINATURA
  // =========================================================================
  if (
    text === "2" ||
    text === "2." ||
    text.includes("renovar") ||
    text.includes("renovacao") ||
    text.includes("renovação") ||
    text.includes("pagar") ||
    text.includes("pix")
  ) {
    // Procura a linha do cliente cadastrada com esse número de WhatsApp
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

    const fee = client?.monthly_fee ? `R$ ${Number(client.monthly_fee).toFixed(2).replace(".", ",")}` : "R$ 35,00";
    const pixKey = config.pixKey || wsRow?.pix_key || "Consulte nossa chave PIX";
    const pixHolder = config.pixHolder || wsRow?.pix_holder || config.businessName;

    const reply =
      `💳 *RENOVAÇÃO DE ASSINATURA* 📺\n\n` +
      (client ? `👤 *Cliente:* ${client.name}\n🔑 *Usuário:* ${client.iptv_username || client.name}\n` : "") +
      `📺 *Servidor:* ${serverName}\n` +
      `💰 *Valor da Mensalidade:* ${fee}\n\n` +
      `🔑 *Chave PIX:* \`${pixKey}\`\n` +
      `👤 *Titular:* ${pixHolder}\n\n` +
      `Assim que efetuar o pagamento, envie o comprovante aqui para ativação imediata! ✅\n` +
      `Se preferir pagar no Cartão ou Boleto, digite *5* para falar com o suporte.`;

    return { reply, action: "renew_requested" };
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
    const pixBlock = pixKey ? `\n\n🔑 *Chave PIX para Assinatura:* \`${pixKey}\`` : "";

    const reply =
      `${config.plansText}${pixBlock}\n\n` +
      `Para ativar agora, basta escolher o plano e nos enviar o comprovante aqui! 🍿`;

    return { reply, action: "plans_shown" };
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

    return { reply, action: "credentials_resent" };
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
  };
}
