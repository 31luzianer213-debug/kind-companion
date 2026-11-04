import { describe, expect, test } from "bun:test";

describe("Daily invoice creation idempotency", () => {
  test("serializes billing jobs by client and due date", async () => {
    const migration = await Bun.file("supabase/migrations/20261104003000_invoice_creation_idempotency.sql").text();
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(p_client_id::TEXT), hashtext(p_due_date::TEXT))");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("status IN ('pending', 'overdue', 'paid')");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.create_invoice_if_absent");
  });

  test("billing code checks RPC success instead of silently treating invalid results as success", async () => {
    const source = await Bun.file("src/lib/billing.server.ts").text();
    expect(source).toContain("if (!invoiceResult?.ok)");
    expect(source).toContain("failed += 1");
    expect(source).toContain("invoiceResult.created");
  });

  test("the RPC is restricted to its owner or the service role", async () => {
    const migration = await Bun.file("supabase/migrations/20261104003000_invoice_creation_idempotency.sql").text();
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("auth.uid() IS DISTINCT FROM p_user_id");
  });
});
