import type { BotConfigData } from "./bot.server";

export type AiIntent =
  | "trial"
  | "renew"
  | "plans"
  | "buy_1m"
  | "buy_3m"
  | "buy_6m"
  | "buy_12m"
  | "apps"
  | "credentials"
  | "order_status"
  | "support"
  | "chat";

export type AiDecision = {
  intent: AiIntent;
  reply: string;
  username?: string;
};

type HistoryItem = { role: "user" | "assistant"; content: string };

const history = new Map<string, HistoryItem[]>();
const HISTORY_LIMIT = 10;

export function getAiHistory(phone: string): HistoryItem[] {
  return history.get(phone) ?? [];
}

export function pushAiHistory(phone: string, item: HistoryItem): void {
  const list = history.get(phone) ?? [];
  list.push(item);
  while (list.length > HISTORY_LIMIT) list.shift();
  history.set(phone, list);
}

function brl(value: number): string {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function buildSystemPrompt(config: BotConfigData, serverName: string, customerName?: string): string {
  const extra = (config.aiInstructions || "").trim();
  return [
    `Você é ${config.aiAgentName || "Ana"}, vendedora virtual da revenda de IPTV "${config.businessName}" (servidor ${serverName}).`,
    `Você atende pelo WhatsApp, em português do Brasil, com tom humano, simpático, direto e vendedor. Nunca diga que é uma inteligência artificial nem fale de menus numerados.`,
    `Mensagens curtas (no máximo 3 linhas), no máximo 1 emoji, e sempre terminando com uma pergunta ou convite para avançar na venda.`,
    customerName ? `O cliente se chama ${customerName}.` : "",
    `Preços: mensal ${brl(config.planMonthlyPrice)}, trimestral ${brl(config.planQuarterlyPrice)}, semestral ${brl(config.planSemiannualPrice)}, anual ${brl(config.planAnnualPrice)}. Renovação ${brl(config.renewalPrice)}.`,
    config.testEnabled
      ? `Você pode liberar um teste grátis de ${config.testDurationHours} horas na hora, sem pedir cartão.`
      : `No momento não há teste grátis disponível; ofereça os planos.`,
    `O sistema executa as ações reais (gerar teste, criar cobrança Pix, enviar dados de acesso, links de aplicativos). Você apenas escolhe a ação e escreve a fala curta que acompanha.`,
    extra ? `Orientações do dono da revenda: ${extra}` : "",
    `Responda SEMPRE em JSON válido, sem markdown, no formato:`,
    `{"intent":"<intencao>","reply":"<mensagem curta>","username":"<login citado pelo cliente, se houver>"}`,
    `Intenções possíveis: trial (quer testar), renew (quer renovar/pagar acesso existente), plans (quer saber planos/preços), buy_1m, buy_3m, buy_6m, buy_12m (já escolheu o período), apps (quer baixar aplicativo/instalar), credentials (quer receber login, senha ou lista), order_status (diz que pagou ou pergunta do pagamento), support (quer falar com uma pessoa ou reclamou de problema técnico), chat (conversa geral, dúvida sobre conteúdo, saudação).`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseDecision(raw: string): AiDecision | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const intent = String(parsed?.intent || "chat") as AiIntent;
    const reply = String(parsed?.reply || "").trim();
    if (!reply) return null;
    return {
      intent,
      reply,
      username: parsed?.username ? String(parsed.username).trim() : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Consulta a IA de vendas e devolve a intenção do cliente + a fala curta.
 * Retorna null quando a IA está indisponível (o robô cai no fluxo tradicional).
 */
export async function decideWithSalesAi(params: {
  config: BotConfigData;
  serverName: string;
  phone: string;
  text: string;
  customerName?: string;
  clientSummary?: string;
}): Promise<AiDecision | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;

  const messages: HistoryItem[] | any[] = [
    { role: "system", content: buildSystemPrompt(params.config, params.serverName, params.customerName) },
  ];
  if (params.clientSummary) {
    messages.push({ role: "system", content: `Dados do cliente no sistema: ${params.clientSummary}` });
  }
  messages.push(...getAiHistory(params.phone));
  messages.push({ role: "user", content: params.text });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.6,
        messages,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn("[bot-ai] Gateway respondeu", res.status);
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const decision = parseDecision(typeof content === "string" ? content : "");
    if (!decision) return null;

    pushAiHistory(params.phone, { role: "user", content: params.text });
    pushAiHistory(params.phone, { role: "assistant", content: decision.reply });
    return decision;
  } catch (err) {
    console.warn("[bot-ai] Falha ao consultar IA de vendas:", err);
    return null;
  }
}
