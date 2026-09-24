import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SaasPlan, SubscriptionSummary } from "./subscription.server";

export type { SaasPlan, SubscriptionSummary };

/** Planos públicos (landing page e tela de assinatura). */
export const listSaasPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { listPlansServer } = await import("./subscription.server");
  return { ok: true as const, plans: await listPlansServer() };
});

/** Situação da assinatura do revendedor autenticado. */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getSubscriptionSummaryServer } = await import("./subscription.server");
    return await getSubscriptionSummaryServer(context.userId);
  });

/** Gera um Pix para assinar/renovar um plano do sistema. */
export const createSubscriptionPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; months?: number; document?: string; payerName?: string }) => {
    if (!input?.planId) throw new Error("Escolha um plano.");
    const payerName = String(input.payerName ?? "").trim().slice(0, 80);
    const document = String(input.document ?? "").replace(/\D/g, "").slice(0, 14);
    return { planId: String(input.planId), months: input.months, document, payerName };
  })
  .handler(async ({ data, context }) => {
    const { createSubscriptionPixServer } = await import("./subscription.server");
    const email = typeof context.claims?.email === "string" ? context.claims.email : null;
    const meta = (context.claims as any)?.user_metadata;
    const name = data.payerName || (typeof meta?.display_name === "string" ? meta.display_name : null);
    return await createSubscriptionPixServer({
      userId: context.userId,
      planId: data.planId,
      months: data.months ?? 1,
      email,
      name,
      document: data.document ?? null,
    });
  });

/** Verifica se o Pix da assinatura já foi pago (fallback do webhook). */
export const checkSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paymentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { reconcileSaasPayment } = await import("./subscription.server");
    return await reconcileSaasPayment(data.paymentId, context.userId);
  });
