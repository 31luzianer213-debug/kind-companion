import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { verifyMercadoPagoWebhookSignature } from "./mercadopago-webhook.server";

function signedHeader(dataId: string, requestId: string, secret: string, timestamp: number) {
  const normalizedId = /^\d+$/.test(dataId) ? dataId : dataId.toLowerCase();
  const manifest = `id:${normalizedId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${timestamp},v1=${signature}`;
}

describe("Mercado Pago webhook HMAC verification", () => {
  const secret = "mercado-pago-webhook-secret-0123456789";
  const now = 1_800_000_000_000;

  test("accepts a correct signature built from data.id, request id and timestamp", () => {
    const signatureHeader = signedHeader("123456", "request-abc", secret, now / 1000);
    expect(verifyMercadoPagoWebhookSignature({
      dataId: "123456",
      requestId: "request-abc",
      signatureHeader,
      secret,
      nowMs: now,
    })).toBe(true);
  });

  test("rejects changed payment ids and request ids", () => {
    const signatureHeader = signedHeader("123456", "request-abc", secret, now / 1000);
    expect(verifyMercadoPagoWebhookSignature({
      dataId: "654321", requestId: "request-abc", signatureHeader, secret, nowMs: now,
    })).toBe(false);
    expect(verifyMercadoPagoWebhookSignature({
      dataId: "123456", requestId: "request-other", signatureHeader, secret, nowMs: now,
    })).toBe(false);
  });

  test("rejects stale, future and malformed signatures", () => {
    const stale = signedHeader("123456", "request-abc", secret, now / 1000 - 600);
    const future = signedHeader("123456", "request-abc", secret, now / 1000 + 120);
    expect(verifyMercadoPagoWebhookSignature({
      dataId: "123456", requestId: "request-abc", signatureHeader: stale, secret, nowMs: now,
    })).toBe(false);
    expect(verifyMercadoPagoWebhookSignature({
      dataId: "123456", requestId: "request-abc", signatureHeader: future, secret, nowMs: now,
    })).toBe(false);
    expect(verifyMercadoPagoWebhookSignature({
      dataId: "123456", requestId: "request-abc", signatureHeader: "v1=bad,ts=invalid", secret, nowMs: now,
    })).toBe(false);
  });

  test("requires every signature input", () => {
    const signatureHeader = signedHeader("123456", "request-abc", secret, now / 1000);
    expect(verifyMercadoPagoWebhookSignature({
      dataId: null, requestId: "request-abc", signatureHeader, secret, nowMs: now,
    })).toBe(false);
  });
});
