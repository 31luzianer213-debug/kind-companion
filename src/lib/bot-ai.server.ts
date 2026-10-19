/**
 * Roteador do atendimento automático — 100% local e determinístico.
 *
 * Antes este arquivo consultava um serviço de inteligência artificial na nuvem
 * (e cada mensagem recebida consumia créditos). Agora ele apenas reconhece
 * palavras-chave e devolve o comando do MENU correspondente: nenhuma chamada
 * externa é feita, nada é cobrado e a resposta é instantânea.
 */

export type MenuIntent =
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
  | "support";

export type MenuIntentMatch = {
  intent: MenuIntent;
  /** Comando que o fluxo do menu já entende (ex.: "1", "status", "plano 6m"). */
  command: string;
};

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Entende o que o cliente escreveu e devolve a opção do MENU correspondente.
 * Sem IA: apenas comparação de palavras-chave, instantânea e sem custo.
 * Devolve null quando não reconhece nada (o robô então mostra o menu).
 */
export function detectMenuIntent(rawText: string): MenuIntentMatch | null {
  const text = normalizeText(rawText);
  if (!text) return null;

  const has = (...words: string[]) => words.some((w) => text.includes(w));

  // 1) Status de pagamento
  if (has("paguei", "comprovante", "status", "verificar pagamento", "caiu o pix", "ja fiz o pix")) {
    return { intent: "order_status", command: "status" };
  }

  // 2) Período já escolhido (mais específico primeiro)
  if (has("12 meses", "doze meses", "anual", "plano anual", "1 ano", "um ano", "12m")) {
    return { intent: "buy_12m", command: "plano 12m" };
  }
  if (has("6 meses", "seis meses", "semestral", "plano semestral", "180 dias", "6m")) {
    return { intent: "buy_6m", command: "plano 6m" };
  }
  if (has("3 meses", "tres meses", "trimestral", "plano trimestral", "90 dias", "3m")) {
    return { intent: "buy_3m", command: "plano 3m" };
  }
  if (has("1 mes", "um mes", "mensal", "plano mensal", "30 dias", "1m")) {
    return { intent: "buy_1m", command: "plano 1m" };
  }

  // 3) Problemas técnicos (antes de "app": "o app não funciona" é suporte)
  if (
    has(
      "nao funciona",
      "nao esta funcionando",
      "parou de funcionar",
      "travando",
      "trava",
      "sem sinal",
      "nao abre",
      "nao entra",
      "nao conecta",
      "erro",
      "problema",
      "reclamacao",
    )
  ) {
    return { intent: "support", command: "6" };
  }

  // 3) Ações do menu
  if (has("teste", "testar", "gratis", "demonstracao", "experimentar")) {
    return { intent: "trial", command: "1" };
  }
  if (has("renovar", "renovacao", "segunda via", "venceu", "vencimento", "pagar", "pix", "pagamento")) {
    return { intent: "renew", command: "2" };
  }
  if (has("plano", "planos", "preco", "precos", "valor", "valores", "quanto custa", "quanto e", "comprar", "assinar")) {
    return { intent: "plans", command: "3" };
  }
  if (
    has(
      "aplicativo",
      "aplicativos",
      "app",
      "apps",
      "baixar",
      "download",
      "instalar",
      "tv box",
      "smart tv",
      "smarttv",
      "firestick",
      "fire stick",
      "downloader",
      "celular",
      "iphone",
      "ios",
      "computador",
      "notebook",
    )
  ) {
    return { intent: "apps", command: "4" };
  }
  if (has("meus dados", "dados de acesso", "usuario", "senha", "login", "m3u", "lista", "perdi", "acesso")) {
    return { intent: "credentials", command: "5" };
  }
  if (
    has(
      "atendente",
      "humano",
      "suporte",
      "falar com",
      "atendimento",
      "ajuda",
      "problema",
      "nao funciona",
      "travando",
      "sem sinal",
      "caiu",
    )
  ) {
    return { intent: "support", command: "6" };
  }

  return null;
}

/**
 * Atalho para quem já usava `decideWithSalesAi`. Mantido apenas como
 * compatibilidade: agora responde na hora, sem chamar nenhum serviço externo.
 */
export function decideWithMenu(text: string): MenuIntentMatch | null {
  return detectMenuIntent(text);
}
