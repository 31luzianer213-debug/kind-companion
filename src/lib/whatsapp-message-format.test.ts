import { describe, expect, test } from "bun:test";
import { completeBotReply, interactivePayloadAsText } from "./whatsapp-message-format";

describe("WhatsApp text fallback for interactive messages", () => {
  test("includes Pix copy-and-paste content in the sent text", () => {
    const reply = completeBotReply("Seu pedido foi criado.", {
      type: "buttons",
      buttons: [{ id: "copy", displayText: "Copiar Pix", type: "copy", copyCode: "000201PIXTEST" }],
    });
    expect(reply).toContain("Seu pedido foi criado.");
    expect(reply).toContain("000201PIXTEST");
  });

  test("preserves interactive URLs as ordinary links", () => {
    expect(interactivePayloadAsText({
      type: "buttons",
      buttons: [{ id: "open", displayText: "Abrir", type: "url", url: "https://example.test/app" }],
    })).toContain("https://example.test/app");
  });

  test("renders list choices and descriptions in text", () => {
    expect(completeBotReply("Escolha:", {
      type: "list",
      sections: [{ rows: [{ rowId: "3", title: "Plano mensal", description: "30 dias" }] }],
    })).toContain("3. Plano mensal — 30 dias");
  });

  test("does not append an empty fallback", () => {
    expect(completeBotReply("Resposta simples", null)).toBe("Resposta simples");
    expect(completeBotReply("", { type: "buttons", buttons: [] })).toBe("");
  });
});
