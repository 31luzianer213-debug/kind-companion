import { describe, expect, test } from "bun:test";
import {
  consumeWebhookRateLimit,
  isValidWebhookSecret,
  timingSafeStringEquals,
  webhookRateLimitKey,
} from "./webhook-security.server";

describe("Shared webhook security helpers", () => {
  test("validates webhook secret length and whitespace", () => {
    expect(isValidWebhookSecret("a".repeat(32))).toBe(true);
    expect(isValidWebhookSecret("short")).toBe(false);
    expect(isValidWebhookSecret("a".repeat(256))).toBe(false);
    expect(isValidWebhookSecret("has spaces".padEnd(32, "x"))).toBe(false);
  });

  test("compares secrets and rejects empty credentials", () => {
    expect(timingSafeStringEquals("same", "same")).toBe(true);
    expect(timingSafeStringEquals("same", "other")).toBe(false);
    expect(timingSafeStringEquals("", "same")).toBe(false);
  });

  test("limits repeated webhooks in a fixed window and resets after expiration", () => {
    const key = `mistic-test-${Date.now()}`;
    expect(consumeWebhookRateLimit(key, 2, 1000, 1000)).toBe(true);
    expect(consumeWebhookRateLimit(key, 2, 1000, 1100)).toBe(true);
    expect(consumeWebhookRateLimit(key, 2, 1000, 1200)).toBe(false);
    expect(consumeWebhookRateLimit(key, 2, 1000, 2100)).toBe(true);
  });

  test("separates rate limits by source address and endpoint scope", () => {
    const request = new Request("https://example.test", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(webhookRateLimitKey(request, "mistic")).toBe("mistic:1.2.3.4");
  });
});
