import { describe, expect, test } from "bun:test";
import { isModernMisticCredentialPair, classifyMisticState, misticPayPixIdempotencyKey } from "./misticpay.server";
import { buildMisticWebhookUrl, validateMisticPaymentTransaction } from "./misticpay-webhook.server";

describe("MisticPay credentials and transaction verification", () => {
  test("accepts current pk/sk access keys and rejects disabled ci/cs keys", () => {
    expect(isModernMisticCredentialPair("pk_1234567890", "sk_1234567890")).toBe(true);
    expect(isModernMisticCredentialPair("ci_1234567890", "cs_1234567890")).toBe(false);
    expect(isModernMisticCredentialPair("pk_1234567890", "cs_1234567890")).toBe(false);
  });

  test("uses a stable bounded idempotency key for repeated Pix creation", () => {
    const first = misticPayPixIdempotencyKey("saas_123");
    const second = misticPayPixIdempotencyKey("saas_123");
    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(() => misticPayPixIdempotencyKey("")).toThrow();
  });

  test("maps provider transaction states", () => {
    expect(classifyMisticState("COMPLETO")).toBe("paid");
    expect(classifyMisticState("PENDENTE")).toBe("pending");
    expect(classifyMisticState("FALHA")).toBe("failed");
    expect(classifyMisticState(null)).toBeNull();
  });

  test("requires exact transaction id, deposit type and expected amount", () => {
    const transaction = { transactionId: "tx_123", value: 35, transactionType: "DEPOSITO", state: "paid" as const };
    expect(validateMisticPaymentTransaction(transaction, "tx_123", 35)).toBeNull();
    expect(validateMisticPaymentTransaction(transaction, "other", 35)).toBe("transaction_id_mismatch");
    expect(validateMisticPaymentTransaction({ ...transaction, transactionType: "RETIRADA" }, "tx_123", 35)).toBe("not_deposit");
    expect(validateMisticPaymentTransaction({ ...transaction, value: 10 }, "tx_123", 35)).toBe("underpaid");
  });

  test("rejects invalid payment values", () => {
    const transaction = { transactionId: "tx_123", value: Number.NaN, transactionType: "DEPOSITO", state: "paid" as const };
    expect(validateMisticPaymentTransaction(transaction, "tx_123", 35)).toBe("invalid_amount");
  });

  test("adds the shared secret to the per-transaction callback URL", () => {
    expect(buildMisticWebhookUrl("https://example.test/", "shared-secret-32-characters-long"))
      .toBe("https://example.test/api/public/hooks/saas-misticpay?secret=shared-secret-32-characters-long");
    expect(buildMisticWebhookUrl("", "secret")).toBeUndefined();
  });
});
