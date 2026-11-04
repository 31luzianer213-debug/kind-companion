import { describe, expect, test } from "bun:test";
import {
  isMercadoPagoAmountSufficient,
  validateMercadoPagoPayment,
} from "./mercadopago-webhook.server";

describe("Mercado Pago payment verification", () => {
  const payment = {
    id: 123456,
    status: "approved",
    external_reference: "invoice_123",
    transaction_amount: 35,
  };

  test("accepts an approved payment with the requested id and reference", () => {
    expect(validateMercadoPagoPayment(payment, "123456", "invoice_123")).toBeNull();
  });

  test("rejects a different payment id or unapproved status", () => {
    expect(validateMercadoPagoPayment(payment, "other", "invoice_123")).toBe("payment_id_mismatch");
    expect(validateMercadoPagoPayment({ ...payment, status: "pending" }, "123456", "invoice_123")).toBe("not_approved");
  });

  test("rejects an external reference belonging to another invoice", () => {
    expect(validateMercadoPagoPayment(payment, "123456", "invoice_other")).toBe("external_reference_mismatch");
  });

  test("does not treat invalid or zero transaction values as payment", () => {
    expect(validateMercadoPagoPayment({ ...payment, transaction_amount: "bad" }, "123456")).toBe("invalid_amount");
    expect(validateMercadoPagoPayment({ ...payment, transaction_amount: 0 }, "123456")).toBe("invalid_amount");
  });

  test("requires the invoice to be fully covered, allowing only one cent rounding", () => {
    expect(isMercadoPagoAmountSufficient(35, 35)).toBe(true);
    expect(isMercadoPagoAmountSufficient(34.995, 35)).toBe(true);
    expect(isMercadoPagoAmountSufficient(34.98, 35)).toBe(false);
    expect(isMercadoPagoAmountSufficient(0, 35)).toBe(false);
    expect(isMercadoPagoAmountSufficient("bad", 35)).toBe(false);
  });
});
