import { describe, expect, test } from "bun:test";
import {
  asaasApiBaseUrl,
  isValidAsaasWebhookToken,
  validateAsaasPayment,
  verifyAsaasWebhookToken,
} from "./asaas-webhook.server";

describe("Asaas webhook verification", () => {
  const secret = "webhook_secret_0123456789abcdef012345";

  test("uses the current production and sandbox API endpoints", () => {
    expect(asaasApiBaseUrl("production")).toBe("https://api.asaas.com/v3");
    expect(asaasApiBaseUrl("sandbox")).toBe("https://api-sandbox.asaas.com/v3");
    expect(asaasApiBaseUrl("unknown")).toBe("https://api.asaas.com/v3");
  });

  test("requires webhook auth tokens with the documented size and no spaces", () => {
    expect(isValidAsaasWebhookToken(secret)).toBe(true);
    expect(isValidAsaasWebhookToken("too-short")).toBe(false);
    expect(isValidAsaasWebhookToken("a".repeat(256))).toBe(false);
    expect(isValidAsaasWebhookToken("token with spaces".padEnd(32, "x"))).toBe(false);
  });

  test("rejects missing, short and mismatched webhook tokens", () => {
    expect(verifyAsaasWebhookToken(secret, secret)).toBe(true);
    expect(verifyAsaasWebhookToken("", secret)).toBe(false);
    expect(verifyAsaasWebhookToken(secret, "")).toBe(false);
    expect(verifyAsaasWebhookToken("x".repeat(secret.length), secret)).toBe(false);
  });

  test("requires the server-side payment id and invoice reference to match", () => {
    const payment = { id: "pay_123", externalReference: "invoice_123", status: "RECEIVED", value: 35 };
    expect(validateAsaasPayment(payment, "pay_123", "invoice_123", 35)).toBeNull();
    expect(validateAsaasPayment(payment, "pay_other", "invoice_123", 35)).toBe("payment_id_mismatch");
    expect(validateAsaasPayment(payment, "pay_123", "invoice_other", 35)).toBe("invoice_reference_mismatch");
  });

  test("rejects pending, invalid and underpaid transactions", () => {
    const base = { id: "pay_123", externalReference: "invoice_123", value: 35 };
    expect(validateAsaasPayment({ ...base, status: "PENDING" }, "pay_123", "invoice_123", 35)).toBe("not_received");
    expect(validateAsaasPayment({ ...base, status: "RECEIVED", value: "invalid" }, "pay_123", "invoice_123", 35)).toBe("invalid_amount");
    expect(validateAsaasPayment({ ...base, status: "CONFIRMED", value: 10 }, "pay_123", "invoice_123", 35)).toBe("underpaid");
  });

  test("accepts a small cent rounding difference without accepting underpayment", () => {
    const payment = { id: "pay_123", externalReference: "invoice_123", status: "RECEIVED", value: 34.995 };
    expect(validateAsaasPayment(payment, "pay_123", "invoice_123", 35)).toBeNull();
  });
});
