import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import { constantTimeEqual, isAuthorizedRequest, isSafeInstanceId, normalizePrivateRecipient, readJsonBody } from "./whatsapp-bot-security.mjs";

describe("Baileys daemon security", () => {
  test("validates session ids against traversal and unsafe characters", () => {
    expect(isSafeInstanceId("default")).toBe(true);
    expect(isSafeInstanceId("iptv_abc-123")).toBe(true);
    expect(isSafeInstanceId("../other")).toBe(false);
    expect(isSafeInstanceId("tenant/../../data")).toBe(false);
    expect(isSafeInstanceId("")).toBe(false);
    expect(isSafeInstanceId("a".repeat(65))).toBe(false);
  });
  test("requires a bearer token on non-loopback listeners", () => {
    expect(isAuthorizedRequest({ headers: {} }, "", false)).toBe(false);
    expect(isAuthorizedRequest({ headers: {} }, "", true)).toBe(true);
    expect(isAuthorizedRequest({ headers: { authorization: "Bearer secret" } }, "secret", false)).toBe(true);
    expect(isAuthorizedRequest({ headers: { authorization: "Bearer wrong" } }, "secret", false)).toBe(false);
  });
  test("does not accept empty or different tokens", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "other")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(false);
  });
  test("allows only individual phone destinations", () => {
    expect(normalizePrivateRecipient("(93) 99177-1170")).toBe("5593991771170@s.whatsapp.net");
    expect(normalizePrivateRecipient("5593991771170@s.whatsapp.net")).toBe("5593991771170@s.whatsapp.net");
    expect(normalizePrivateRecipient("12345")).toBe("");
    expect(normalizePrivateRecipient("123@g.us")).toBe("");
    expect(normalizePrivateRecipient("123@lid")).toBe("");
  });
  test("parses valid JSON bodies", async () => {
    const req = Readable.from([Buffer.from('{"instance":"default"}')]);
    await expect(readJsonBody(req)).resolves.toEqual({ instance: "default" });
  });
  test("rejects malformed JSON and oversized bodies", async () => {
    await expect(readJsonBody(Readable.from([Buffer.from("{bad")]))).rejects.toMatchObject({ statusCode: 400 });
    await expect(readJsonBody(Readable.from([Buffer.from('{"long":"12345"}')]), 4)).rejects.toMatchObject({ statusCode: 413 });
  });
});
