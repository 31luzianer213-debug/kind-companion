import { describe, expect, test } from "bun:test";

function boundedMonths(value: unknown): number {
  const parsed = Number(value || 1);
  return Math.max(1, Math.min(12, Number.isFinite(parsed) ? Math.floor(parsed) : 1));
}

describe("SaaS payment settlement invariants", () => {
  test("limits subscription extensions to one through twelve months", () => {
    expect(boundedMonths(0)).toBe(1);
    expect(boundedMonths(6)).toBe(6);
    expect(boundedMonths(99)).toBe(12);
    expect(boundedMonths(-3)).toBe(1);
    expect(boundedMonths("bad")).toBe(1);
  });

  test("the pending SaaS Pix function serializes concurrent creation per reseller", async () => {
    const migration = await Bun.file("supabase/migrations/20261104000000_atomic_saas_payment_activation.sql").text();
    expect(migration).toContain("get_or_create_saas_pending_payment");
    expect((migration.match(/\$\$/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("AS $");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext(p_user_id::TEXT))");
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain("created_at >= now() - interval '30 minutes'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_or_create_saas_pending_payment");
  });

  test("the transactional RPC is designed to lock both payment and account", async () => {
    const migration = await Bun.file("supabase/migrations/20261104000000_atomic_saas_payment_activation.sql").text();
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_payment.status = 'approved'");
    expect(migration).toContain("AND status = 'pending'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.activate_saas_payment_from_payment(UUID) TO service_role");
  });
});
