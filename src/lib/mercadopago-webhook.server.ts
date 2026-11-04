import { createHmac, timingSafeEqual } from "node:crypto";

export type MercadoPagoPaymentVerification = {
  id?: unknown;
  status?: unknown;
  external_reference?: unknown;
  transaction_amount?: unknown;
};

export function validateMercadoPagoPayment(
  payment: MercadoPagoPaymentVerification,
  expectedPaymentId: string,
  expectedExternalReference?: string | null,
): "payment_id_mismatch" | "not_approved" | "external_reference_mismatch" | "invalid_amount" | null {
  if (String(payment?.id ?? "") !== String(expectedPaymentId)) return "payment_id_mismatch";
  if (String(payment?.status ?? "").toLowerCase() !== "approved") return "not_approved";

  const externalReference = String(payment?.external_reference ?? "").trim();
  const expectedReference = String(expectedExternalReference ?? "").trim();
  if (expectedReference && externalReference !== expectedReference) return "external_reference_mismatch";

  const amount = Number(payment?.transaction_amount);
  if (!Number.isFinite(amount) || amount <= 0) return "invalid_amount";
  return null;
}

export function isMercadoPagoAmountSufficient(
  receivedAmount: unknown,
  expectedAmount: unknown,
): boolean {
  const received = Number(receivedAmount);
  const expected = Number(expectedAmount);
  if (!Number.isFinite(received) || !Number.isFinite(expected) || received <= 0 || expected <= 0) return false;
  return received + 0.01 >= expected;
}

/**
 * Validates Mercado Pago's x-signature HMAC-SHA256 notification.
 * The manifest format follows Mercado Pago's current webhook docs/Node SDK:
 * id:<data.id>;request-id:<x-request-id>;ts:<timestamp>;
 */
export function verifyMercadoPagoWebhookSignature(input: {
  dataId: string | null | undefined;
  requestId: string | null | undefined;
  signatureHeader: string | null | undefined;
  secret: string | null | undefined;
  nowMs?: number;
  toleranceSeconds?: number;
}): boolean {
  const dataId = String(input.dataId || "").trim();
  const requestId = String(input.requestId || "").trim();
  const secret = String(input.secret || "");
  const header = String(input.signatureHeader || "");
  if (!dataId || !requestId || !secret || !header) return false;

  const parts: Record<string, string> = {};
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    parts[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }

  const timestamp = parts.ts || "";
  const signature = parts.v1 || "";
  const timestampNumber = Number(timestamp);
  if (!Number.isSafeInteger(timestampNumber) || timestampNumber <= 0 || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const nowMs = input.nowMs ?? Date.now();
  const toleranceMs = Math.max(1, input.toleranceSeconds ?? 300) * 1000;
  const ageMs = nowMs - timestampNumber * 1000;
  if (ageMs > toleranceMs || ageMs < -60_000) return false;

  const normalizedId = /^\d+$/.test(dataId) ? dataId : dataId.toLowerCase();
  const manifest = `id:${normalizedId};request-id:${requestId};ts:${timestamp};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
