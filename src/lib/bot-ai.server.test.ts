import { describe, expect, test } from "bun:test";
import { detectMenuIntent } from "./bot-ai.server";

describe("WhatsApp bot intent routing", () => {
  test("recognizes payment confirmations", () => {
    expect(detectMenuIntent("Já fiz o PIX, pode confirmar?")?.intent).toBe("order_status");
    expect(detectMenuIntent("Meu pagamento foi aprovado")?.intent).toBe("order_status");
  });
  test("recognizes different plan periods", () => {
    expect(detectMenuIntent("quero o plano de doze meses")?.command).toBe("plano 12m");
    expect(detectMenuIntent("plano semestral")?.command).toBe("plano 6m");
    expect(detectMenuIntent("quero 90 dias")?.command).toBe("plano 3m");
    expect(detectMenuIntent("mensal")?.command).toBe("plano 1m");
  });
  test("recognizes free trial requests", () => {
    expect(detectMenuIntent("Quero experimentar grátis")?.intent).toBe("trial");
    expect(detectMenuIntent("pode liberar um teste?")?.command).toBe("1");
  });
  test("routes technical failures to human support before purchase intents", () => {
    expect(detectMenuIntent("meu aplicativo não funciona")?.intent).toBe("support");
    expect(detectMenuIntent("meu plano anual não conecta")?.intent).toBe("support");
    expect(detectMenuIntent("não consigo assistir, fica carregando")?.intent).toBe("support");
  });
  test("recognizes app installation questions", () => {
    expect(detectMenuIntent("onde baixo o aplicativo?")?.intent).toBe("apps");
    expect(detectMenuIntent("como instalar na Smart TV")?.intent).toBe("apps");
  });
  test("recognizes forgotten credentials", () => {
    expect(detectMenuIntent("esqueci a senha")?.intent).toBe("credentials");
    expect(detectMenuIntent("preciso recuperar meu login")?.intent).toBe("credentials");
  });
  test("explicitly asks for a human attendant", () => {
    expect(detectMenuIntent("quero falar com uma pessoa para renovar")?.intent).toBe("support");
  });
  test("returns null for unrelated messages", () => {
    expect(detectMenuIntent("qual a previsão para amanhã?")).toBeNull();
    expect(detectMenuIntent("   ")).toBeNull();
  });
});
