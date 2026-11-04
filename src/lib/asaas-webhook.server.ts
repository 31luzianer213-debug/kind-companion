import { timingSafeEqual } from "node:crypto";

export function asaasApiBaseUrl(environment?: string | null): string {
  return String(environment || "").toLowerCase() === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";
}

export function isValidAsaasWebhookToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.length >= 32 && value.length <= 255 && !/\s/.test(value);
}

export function verifyAsaasWebhookToken(
  supplied: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!isValidAsaasWebhookToken(expected) || !supplied) return false;
  const actualBuffer = Buffer.from(supplied, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

/** Returns a stable reason when a server-side Asaas payment does not match the invoice. */
export function validateAsaasPayment(
  payment: {
    id?: unknown;
    externalReference?: unknown;
    status?: unknown;
    value?: unknown;
  },
  expectedPaymentId: string,
  expectedInvoiceId: string,
  expectedAmount: number,
): "payment_id_mismatch" | "invoice_reference_mismatch" | "not_received" | "invalid_amount" | "underpaid" | null {
  if (String(payment?.id ?? "") !== expectedPaymentId) return "payment_id_mismatch";
  if (String(payment?.externalReference ?? "") !== expectedInvoiceId) return "invoice_reference_mismatch";
  const status = String(payment?.status ?? "").toUpperCase();
  if (status !== "RECEIVED" && status !== "CONFIRMED") return "not_received";
  const value = Number(payment?.value);
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return "invalid_amount";
  }
  if (value + 0.01 < expectedAmount) return "underpaid";
  return null;
}
