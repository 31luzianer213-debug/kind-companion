import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMercadoPagoPixPayment } from "./mercadopago.server";
import { getMercadoPagoToken } from "./system-settings.server";
import { publicAppUrl } from "./whatsapp-connection.server";

export type SubscriptionState = "active" | "trialing" | "grace" | "blocked";

export type SaasPlan = {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  max_clients: number | null;
  features: string[];
  highlighted: boolean;
  sort_order: number;
};

export type SubscriptionSummary = {
  state: SubscriptionState;
  status: string;
  plan: SaasPlan | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  daysLeft: number;
  clientsCount: number;
  saasPaymentsEnabled: boolean;
};

const GRACE_DAYS = 3;

function mapPlan(row: any): SaasPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    price_monthly: Number(row.price_monthly) || 0,
    max_clients: row.max_clients === null || row.max_clients === undefined ? null : Number(row.max_clients),
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    highlighted: Boolean(row.highlighted),
    sort_order: Number(row.sort_order) || 0,
  };
}

export async function listPlansServer(): Promise<SaasPlan[]> {
  const { data, error } = await supabaseAdmin.from("saas_plans").select("*").eq("active", true).order("sort_order");
  if (error) throw new Error(`Falha ao carregar planos: ${error.message}`);
  return (data ?? []).map(mapPlan);
}

export function computeState(sub: { status: string; trial_ends_at: string | null; current_period_end: string | null } | null): SubscriptionState {
  if (!sub) return "blocked";
  const now = Date.now();
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
  if (sub.status === "active" && periodEnd > now) return "active";
  if (sub.status === "trialing" && trialEnd > now) return "trialing";
  const reference = periodEnd || trialEnd;
  if (reference > now - GRACE_DAYS * 86_400_000) return "grace";
  return "blocked";
}

export async function getSubscriptionSummaryServer(userId: string): Promise<SubscriptionSummary> {
  const [{ data: sub }, { count }] = await Promise.all([
    supabaseAdmin.from("saas_subscriptions").select("*, saas_plans(*)").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  let subscription: any = sub;
  if (!subscription) {
    // Conta criada antes da migração ou trigger ausente: garante o período de teste.
    const trialDays = Number(process.env["SAAS_TRIAL_DAYS"] || 7);
    const trialEndsAt = new Date(Date.now() + trialDays * 86_400_000).toISOString();
    const { data: created } = await supabaseAdmin
      .from("saas_subscriptions")
      .upsert({ user_id: userId, plan_id: "ilimitado", status: "trialing", trial_ends_at: trialEndsAt }, { onConflict: "user_id" })
      .select("*, saas_plans(*)")
      .maybeSingle();
    subscription = created;
  }

  const state = computeState(subscription);
  const reference = subscription?.status === "active" ? subscription.current_period_end : subscription?.trial_ends_at;
  const daysLeft = reference ? Math.ceil((new Date(reference).getTime() - Date.now()) / 86_400_000) : 0;

  return {
    state,
    status: subscription?.status ?? "none",
    plan: subscription?.saas_plans ? mapPlan(subscription.saas_plans) : null,
    trialEndsAt: subscription?.trial_ends_at ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    daysLeft,
    clientsCount: count ?? 0,
    saasPaymentsEnabled: Boolean(await getMercadoPagoToken()),
  };
}

export async function createSubscriptionPixServer(params: {
  userId: string;
  planId: string;
  months: number;
  email: string | null;
  name: string | null;
}) {
  const token = await getMercadoPagoToken();
  if (!token) {
    return { ok: false as const, error: "Pagamentos da assinatura ainda não estão habilitados. O administrador precisa configurar o Access Token do Mercado Pago em Administração." };
  }

  const { data: planRow } = await supabaseAdmin.from("saas_plans").select("*").eq("id", params.planId).eq("active", true).maybeSingle();
  if (!planRow) return { ok: false as const, error: "Plano não encontrado." };
  const plan = mapPlan(planRow);
  const months = Math.min(12, Math.max(1, Math.floor(params.months || 1)));
  const discount = months >= 12 ? 0.8 : months >= 6 ? 0.9 : 1;
  const amount = Number((plan.price_monthly * months * discount).toFixed(2));

  // Reaproveita um Pix pendente recente do mesmo plano/período (evita cobranças duplicadas).
  const { data: pending } = await supabaseAdmin
    .from("saas_payments")
    .select("*")
    .eq("user_id", params.userId)
    .eq("plan_id", plan.id)
    .eq("months", months)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending?.pix_code) return { ok: true as const, payment: pending, amount };

  const { data: payment, error } = await supabaseAdmin
    .from("saas_payments")
    .insert({ user_id: params.userId, plan_id: plan.id, amount, months, status: "pending", provider: "mercadopago" })
    .select("*")
    .single();
  if (error || !payment) return { ok: false as const, error: error?.message || "Não foi possível registrar o pagamento." };

  const pix = await createMercadoPagoPixPayment({
    token,
    amount,
    description: `Sigma Control - Plano ${plan.name} (${months} mes${months > 1 ? "es" : ""})`,
    orderId: `saas_${payment.id}`,
    customerName: params.name || params.email || "Revendedor",
    customerPhone: "",
    webhookUrl: `${publicAppUrl()}/api/public/hooks/saas-mercadopago`,
  });

  if (!pix.ok) {
    await supabaseAdmin.from("saas_payments").update({ status: "cancelled" }).eq("id", payment.id);
    return { ok: false as const, error: pix.error || "Falha ao gerar o Pix." };
  }

  const { data: updated } = await supabaseAdmin
    .from("saas_payments")
    .update({ provider_payment_id: pix.paymentId, pix_code: pix.qrCode, pix_qr_base64: pix.qrCodeBase64, ticket_url: pix.ticketUrl })
    .eq("id", payment.id)
    .select("*")
    .single();

  return { ok: true as const, payment: updated ?? payment, amount };
}

/** Ativa/renova a assinatura a partir de um pagamento aprovado (idempotente). */
export async function activateSubscriptionFromPayment(paymentId: string) {
  const { data: payment } = await supabaseAdmin.from("saas_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return { ok: false as const, error: "Pagamento não encontrado." };
  if (payment.status === "approved") return { ok: true as const, alreadyApproved: true };

  const { data: sub } = await supabaseAdmin.from("saas_subscriptions").select("*").eq("user_id", payment.user_id).maybeSingle();
  const now = Date.now();
  const currentEnd = sub?.status === "active" && sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
  const base = currentEnd > now && sub?.plan_id === payment.plan_id ? currentEnd : now;
  const periodEnd = new Date(base + Number(payment.months || 1) * 30 * 86_400_000).toISOString();

  const { error: subError } = await supabaseAdmin
    .from("saas_subscriptions")
    .upsert({ user_id: payment.user_id, plan_id: payment.plan_id, status: "active", current_period_end: periodEnd }, { onConflict: "user_id" });
  if (subError) return { ok: false as const, error: subError.message };

  await supabaseAdmin
    .from("saas_payments")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", payment.id)
    .neq("status", "approved");

  return { ok: true as const, periodEnd };
}

/** Consulta o Mercado Pago e ativa caso o Pix já tenha sido pago (fallback do webhook). */
export async function reconcileSaasPayment(paymentId: string, userId?: string) {
  const token = await getMercadoPagoToken();
  const { data: payment } = await supabaseAdmin.from("saas_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment || (userId && payment.user_id !== userId)) return { ok: false as const, error: "Pagamento não encontrado." };
  if (payment.status === "approved") return { ok: true as const, status: "approved" as const };
  if (!token || !payment.provider_payment_id) return { ok: true as const, status: payment.status };

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${payment.provider_payment_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: true as const, status: payment.status };
    const data: any = await res.json();
    if (data?.status === "approved") {
      const result = await activateSubscriptionFromPayment(payment.id);
      return result.ok ? { ok: true as const, status: "approved" as const } : { ok: false as const, error: result.error };
    }
    if (["cancelled", "rejected", "expired"].includes(String(data?.status))) {
      await supabaseAdmin.from("saas_payments").update({ status: "cancelled" }).eq("id", payment.id);
      return { ok: true as const, status: "cancelled" as const };
    }
  } catch {}
  return { ok: true as const, status: payment.status };
}
