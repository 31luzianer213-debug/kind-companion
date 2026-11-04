import { describe, expect, test } from "bun:test";
import { parseEvolutionMessages } from "./whatsapp-event.server";

describe("Evolution webhook message parsing", () => {
  test("parses a regular direct message and instance identity", () => {
    const [message] = parseEvolutionMessages({
      event: "messages.upsert",
      instance: "tenant-one",
      data: {
        key: { id: "message-1", remoteJid: "5593991771170@s.whatsapp.net", fromMe: false },
        pushName: "Ana",
        message: { conversation: "Olá" },
      },
    });
    expect(message.phone).toBe("5593991771170");
    expect(message.senderJid).toBe("5593991771170@s.whatsapp.net");
    expect(message.text).toBe("Olá");
    expect(message.pushName).toBe("Ana");
    expect(message.messageId).toBe("message-1");
    expect(message.instance).toBe("tenant-one");
    expect(message.fromMe).toBe(false);
  });
  test("unwraps ephemeral extended text", () => {
    const [message] = parseEvolutionMessages({
      event: "MESSAGES_UPSERT",
      data: {
        key: { id: "message-2", remoteJid: "93991771170@s.whatsapp.net" },
        message: { ephemeralMessage: { message: { extendedTextMessage: { text: "Quero renovar" } } } },
      },
    });
    expect(message.phone).toBe("5593991771170");
    expect(message.text).toBe("Quero renovar");
  });
  test("reads native interactive response identifiers", () => {
    const [message] = parseEvolutionMessages({
      event: "MESSAGES_UPSERT",
      data: {
        key: { id: "message-3", remoteJid: "5593991771170@s.whatsapp.net" },
        message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: "plano_3m" }) } } },
      },
    });
    expect(message.text).toBe("plano_3m");
  });
  test("resolves subsequent LID-only messages from a known phone mapping", () => {
    const lid = "123456789012345@lid";
    parseEvolutionMessages({
      event: "MESSAGES_UPSERT",
      data: { key: { id: "message-4", remoteJid: lid, remoteJidAlt: "5593991771170@s.whatsapp.net" }, message: { conversation: "oi" } },
    });
    const [next] = parseEvolutionMessages({
      event: "MESSAGES_UPSERT",
      data: { key: { id: "message-5", remoteJid: lid }, message: { conversation: "menu" } },
    });
    expect(next.phone).toBe("5593991771170");
    expect(next.senderJid).toBe("5593991771170@s.whatsapp.net");
  });
  test("identifies groups and self-sent messages", () => {
    const [group, own] = parseEvolutionMessages({
      event: "MESSAGES_UPSERT",
      data: [
        { key: { id: "message-6", remoteJid: "123456@g.us", participant: "5593991771170@s.whatsapp.net" }, message: { conversation: "grupo" } },
        { key: { id: "message-7", remoteJid: "5593991771170@s.whatsapp.net", fromMe: true }, message: { conversation: "minha mensagem" } },
      ],
    });
    expect(group.isGroup).toBe(true);
    expect(own.fromMe).toBe(true);
  });
  test("ignores unsupported event types and malformed payloads", () => {
    expect(parseEvolutionMessages(null)).toEqual([]);
    expect(parseEvolutionMessages({ event: "connection.update", data: {} })).toEqual([]);
    expect(parseEvolutionMessages({ event: "MESSAGES_UPSERT", data: [] })).toEqual([]);
  });
});
