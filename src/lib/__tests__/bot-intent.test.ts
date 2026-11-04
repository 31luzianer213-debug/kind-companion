import { describe, expect, it } from "vitest";
import { detectMenuIntent, isPlainGreeting } from "../bot-ai.server";

const intent = (t: string) => detectMenuIntent(t)?.intent ?? null;

describe("robô entende o cliente", () => {
  it("'app' não casa dentro de 'whatsapp'", () => expect(intent("vi seu whatsapp")).toBe(null));
  it("'erro' não casa dentro de 'ferro'", () => expect(intent("ferro velho")).toBe(null));
  it("teste acabou + renovar = renovação", () => expect(intent("meu teste acabou quero renovar")).toBe("renew"));
  it("pedido de teste", () => expect(intent("quero testar")).toBe("trial"));
  it("paguei = status do pagamento", () => expect(intent("Já paguei!")).toBe("order_status"));
  it("plano anual", () => expect(intent("quero o plano anual")).toBe("buy_12m"));
  it("valores", () => expect(intent("quanto custa?")).toBe("plans"));
  it("app não funciona = suporte", () => expect(intent("o app não funciona")).toBe("support"));
  it("baixar aplicativo", () => expect(intent("como baixar o aplicativo")).toBe("apps"));
  it("perdi a senha", () => expect(intent("perdi minha senha")).toBe("credentials"));
});

describe("saudação", () => {
  it("oi tudo bem é saudação", () => expect(isPlainGreeting("oi tudo bem")).toBe(true));
  it("boa noite é saudação", () => expect(isPlainGreeting("boa noite")).toBe(true));
  it("oi quero renovar não é só saudação", () => expect(isPlainGreeting("oi quero renovar")).toBe(false));
});
