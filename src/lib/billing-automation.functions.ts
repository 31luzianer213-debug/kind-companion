import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runAutomaticBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runAutomaticBillingForUser } = await import("./billing-automation.server");
    return runAutomaticBillingForUser(context.supabase as any, context.userId);
  });
