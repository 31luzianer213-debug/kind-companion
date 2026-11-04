import { describe, expect, test } from "bun:test";
import {
  claimWhatsappBotTrial,
  completeWhatsappBotTrial,
  releaseWhatsappBotTrialClaim,
} from "./whatsapp-trial.server";

describe("WhatsApp free trial claim persistence", () => {
  test("returns the existing active trial without creating another Sigma account", async () => {
    const supabase = {
      rpc: async (name: string) => {
        expect(name).toBe("claim_whatsapp_bot_trial");
        return {
          data: {
            status: "reuse",
            username: "12345678",
            password: "123456",
            m3uUrl: "https://stream.test/get.php?username=12345678",
            epgUrl: "https://stream.test/xmltv.php?username=12345678",
            serverName: "Servidor",
            streamingDns: "https://stream.test",
          },
          error: null,
        };
      },
    };
    const result = await claimWhatsappBotTrial(supabase, {
      userId: "tenant-a",
      phone: "5593991771170",
      phoneVariants: ["5593991771170"],
      blockRepeatDays: 7,
      claimToken: "token",
    });
    expect(result.status).toBe("reuse");
    if (result.status === "reuse") expect(result.username).toBe("12345678");
  });

  test("fails closed when the database cannot reserve a phone", async () => {
    const supabase = { rpc: async () => ({ data: null, error: { message: "database offline" } }) };
    await expect(claimWhatsappBotTrial(supabase, {
      userId: "tenant-a",
      phone: "5593991771170",
      phoneVariants: ["5593991771170"],
      blockRepeatDays: 7,
      claimToken: "token",
    })).rejects.toThrow("database offline");
  });

  test("uses the same claim token for completion and releases a failed reservation", async () => {
    const calls: Array<{ name: string; args: any }> = [];
    const supabase = {
      rpc: async (name: string, args: any) => {
        calls.push({ name, args });
        return { data: name === "complete_whatsapp_bot_trial", error: null };
      },
    };
    await completeWhatsappBotTrial(supabase, {
      userId: "tenant-a",
      phone: "5593991771170",
      claimToken: "claim-token",
      username: "12345678",
      password: "123456",
      m3uUrl: "https://stream.test/list",
      epgUrl: "https://stream.test/epg",
      serverName: "Servidor",
      streamingDns: "https://stream.test",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await releaseWhatsappBotTrialClaim(supabase, "tenant-a", "5593991771170", "claim-token");
    expect(calls[0].args.p_claim_token).toBe("claim-token");
    expect(calls[1].args.p_claim_token).toBe("claim-token");
  });

  test("migration serializes account/phone claims and stores recoverable credentials", async () => {
    const migration = await Bun.file("supabase/migrations/20261104002000_whatsapp_bot_trial_claims.sql").text();
    expect(migration).toContain("PRIMARY KEY (user_id, phone)");
    expect(migration).toContain("WHERE user_id = p_user_id");
    expect(migration).not.toContain("WHERE user_id = p_user_id::TEXT");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_claim.expires_at > now()");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.claim_whatsapp_bot_trial");
    expect(migration).toContain("status = 'processing'");
  });
});
