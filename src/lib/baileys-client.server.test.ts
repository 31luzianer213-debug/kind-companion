import { describe, expect, test } from "bun:test";
import { resolveBaileysApiUrl } from "./baileys-client.server";

describe("Baileys API URL resolution", () => {
  test("uses loopback by default when no remote URL is configured", () => {
    expect(resolveBaileysApiUrl()).toBe("http://127.0.0.1:3001");
  });
  test("honors a valid custom local port", () => {
    expect(resolveBaileysApiUrl("", "3123")).toBe("http://127.0.0.1:3123");
  });
  test("falls back to the standard port for invalid port values", () => {
    expect(resolveBaileysApiUrl("", "99999")).toBe("http://127.0.0.1:3001");
    expect(resolveBaileysApiUrl("", "not-a-port")).toBe("http://127.0.0.1:3001");
  });
  test("prefers an explicitly configured remote or custom URL", () => {
    expect(resolveBaileysApiUrl("https://baileys.example.test///", "3123"))
      .toBe("https://baileys.example.test");
  });
});
