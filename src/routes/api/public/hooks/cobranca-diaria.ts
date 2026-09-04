import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/cobranca-diaria")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BILLING_CRON_SECRET"];
        const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
        if (!secret || !match || match[1] !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runBillingForUser } = await import("@/lib/billing.server");

        const { data: accounts, error } = await supabaseAdmin
          .from("whatsapp_settings")
          .select("user_id")
          .eq("auto_send_enabled", true);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: Record<string, unknown>[] = [];
        for (const account of accounts ?? []) {
          try {
            const result = await runBillingForUser(supabaseAdmin, account.user_id);
            results.push({ user_id: account.user_id, ...result });
          } catch (err) {
            results.push({
              user_id: account.user_id,
              error: err instanceof Error ? err.message : "erro",
            });
          }
        }

        return Response.json({ ok: true, accounts: results.length, results });
      },
    },
  },
});
