import type { MisticTransactionDetails } from "./misticpay.server";

export function validateMisticPaymentTransaction(
  transaction: MisticTransactionDetails,
  expectedTransactionId: string,
  expectedAmount: number,
): "transaction_id_mismatch" | "not_deposit" | "invalid_amount" | "underpaid" | null {
  if (String(transaction.transactionId) !== String(expectedTransactionId)) return "transaction_id_mismatch";
  if (String(transaction.transactionType).toUpperCase() !== "DEPOSITO") return "not_deposit";
  const actual = Number(transaction.value);
  if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return "invalid_amount";
  }
  if (actual + 0.01 < expectedAmount) return "underpaid";
  return null;
}

/** Builds the provider callback URL with the shared secret sent via projectWebhook. */
export function buildMisticWebhookUrl(baseUrl: string, secret: string | null | undefined): string | undefined {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) return undefined;
  try {
    const url = new URL(`${base}/api/public/hooks/saas-misticpay`);
    const sharedSecret = String(secret || "").trim();
    if (sharedSecret) url.searchParams.set("secret", sharedSecret);
    return url.toString();
  } catch {
    return undefined;
  }
}
