import { describe, expect, test } from "bun:test";
import { findReusablePendingBotOrder } from "./bot-order-idempotency";

const order = {
  id: "ord_1",
  user_id: "tenant-a",
  customer_phone: "5593991771170",
  plan_name: "Plano Mensal",
  amount: 35,
  duration_months: 1,
  status: "pending",
  type: "new_access",
  target_username: null,
  created_at: new Date(100_000).toISOString(),
};

describe("WhatsApp bot pending order idempotency", () => {
  const query = { userId: "tenant-a", phone: "+55 (93) 99177-1170", planName: "Plano Mensal", amount: 35, durationMonths: 1, type: "new_access" as const };

  test("reuses a fresh equivalent pending order for the same reseller", () => {
    expect(findReusablePendingBotOrder([order], query, 101_000)?.id).toBe("ord_1");
  });
  test("isolates order reuse by reseller, phone and amount", () => {
    expect(findReusablePendingBotOrder([order], { ...query, userId: "tenant-b" }, 101_000)).toBeNull();
    expect(findReusablePendingBotOrder([order], { ...query, phone: "5593888888888" }, 101_000)).toBeNull();
    expect(findReusablePendingBotOrder([order], { ...query, amount: 90 }, 101_000)).toBeNull();
  });
  test("does not reuse approved or expired orders", () => {
    expect(findReusablePendingBotOrder([{ ...order, status: "approved" }], query, 101_000)).toBeNull();
    expect(findReusablePendingBotOrder([{ ...order, created_at: new Date(101_000 - 31 * 60_000).toISOString() }], query, 101_000)).toBeNull();
  });
  test("SQL migration serializes claims and only exposes RPCs to service_role", async () => {
    const migration = await Bun.file("supabase/migrations/20261104001000_bot_order_idempotency.sql").text();
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(p_user_id))");
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("TO service_role");
  });

  test("renewals must match the same target username", () => {
    const renewal = { ...order, type: "renewal", target_username: "cliente123", plan_name: "Renovação Mensal - cliente123" };
    const renewalQuery = { ...query, planName: "Renovação Mensal - cliente123", type: "renewal" as const, targetUsername: "cliente123" };
    expect(findReusablePendingBotOrder([renewal], renewalQuery, 101_000)?.id).toBe("ord_1");
    expect(findReusablePendingBotOrder([renewal], { ...renewalQuery, targetUsername: "outro" }, 101_000)).toBeNull();
  });
});
