import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMercadoPagoPixPayment } from "./mercadopago.server";
import { getMercadoPagoToken, getMisticCreds, getSaasProvider, isAdminEmail } from "./system-settings.server";
import { fetchMisticTransaction, createMisticPix } from "./misticpay.server";
import { buildMisticWebhookUrl, validateMisticPaymentTransaction } from "./misticpay-webhook.server";
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
  saasProvider: "mercadopago" | "misticpay" | null;
  /** Dono do sistema: nunca é bloqueado por assinatura. */
  isAdmin: boolean;
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

export async function getSubscriptionSummaryServer(userId: string, email?: string | null): Promise<SubscriptionSummary> {
  const providerPromise = getSaasProvider();
  const clientsCountPromise = supabaseAdmin.from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId);

  // O administrador do sistema é o dono do painel: ele NUNCA pode ser bloqueado
  // por assinatura (senão ele não consegue nem entrar para liberar os outros).
  let adminEmail = email ?? null;
  if (!adminEmail) {
    // Tokens sem e-mail no claim: confirma pelo cadastro do usuário.
    const { data: account } = await supabaseAdmin.auth.admin.getUserById(userId);
    adminEmail = account?.user?.email ?? null;
  }
  if (await isAdminEmail(adminEmail)) {
    const [{ count }, provider] = await Promise.all([clientsCountPromise, providerPromise]);
    return {
      state: "active",
      status: "admin",
      plan: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      daysLeft: 0,
      clientsCount: count ?? 0,
      saasPaymentsEnabled: Boolean(provider),
      saasProvider: provider,
      isAdmin: true,
    };
  }

  const [{ data: sub }, { count }] = await Promise.all([
    supabaseAdmin.from("saas_subscriptions").select("*, saas_plans(*)").eq("user_id", userId).maybeSingle(),
    clientsCountPromise,
  ]);

  let subscription: any = sub;
  if (!subscription) {
    // Conta criada antes da migração ou trigger ausente: garante o período de teste.
    const trialDays = Number(process.env["SAAS_TRIAL_DAYS"] || 7);
    const trialEndsAt = new Date(Date.now() + trialDays * 86_400_000).toISOString();
    // O plano "ilimitado" pode ter sido renomeado/excluído pelo administrador.
    // Antes o upsert falhava por chave estrangeira e a conta ficava sem linha em
    // saas_subscriptions — o que a função SQL subscription_state() trata como
    // "blocked", bloqueando o cadastro de clientes no primeiro acesso.
    const { data: planRow } = await supabaseAdmin
      .from("saas_plans")
      .select("id")
      .eq("active", true)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    const defaultPlanId = (planRow?.id as string | undefined) ?? null;
    const { data: created } = defaultPlanId
      ? await supabaseAdmin
          .from("saas_subscriptions")
          .upsert(
            { user_id: userId, plan_id: defaultPlanId, status: "trialing", trial_ends_at: trialEndsAt },
            { onConflict: "user_id" },
          )
          .select("*, saas_plans(*)")
          .maybeSingle()
      : { data: null as any };
    subscription = created;

    // Se a gravação falhar (ex.: plano padrão inexistente / FK / RLS), o usuário
    // NÃO pode ser tratado como "assinatura bloqueada". Antes isso jogava a conta
    // recém-criada num muro de "Assinatura vencida" logo depois do login.
    if (!subscription) {
      subscription = {
        status: "trialing",
        trial_ends_at: trialEndsAt,
        current_period_end: null,
        plan_id: null,
        saas_plans: null,
      };
    }
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
    isAdmin: false,
    ...(await (async () => { const p = await providerPromise; return { saasPaymentsEnabled: Boolean(p), saasProvider: p }; })()),
  };
}

export async function createSubscriptionPixServer(params: {
  userId: string;
  planId: string;
  months: number;
  email: string | null;
  name: string | null;
  document?: string | null;
}) {
  const provider = await getSaasProvider();
  if (!provider) {
    return { ok: false as const, error: "Pagamentos da assinatura ainda não estão habilitados. O administrador precisa configurar a conta de recebimento em Administração." };
  }
  const cpf = String(params.document ?? "").replace(/\D/g, "");
  if (provider === "misticpay" && cpf.length !== 11 && cpf.length !== 14) {
    return { ok: false as const, error: "Informe seu CPF (ou CNPJ) para gerar o Pix." };
  }

  const { data: planRow } = await supabaseAdmin.from("saas_plans").select("*").eq("id", params.planId).eq("active", true).maybeSingle();
  if (!planRow) return { ok: false as const, error: "Plano não encontrado." };
  const plan = mapPlan(planRow);
  const months = Math.min(12, Math.max(1, Math.floor(params.months || 1)));
  const discount = months >= 12 ? 0.8 : months >= 6 ? 0.9 : 1;
  const amount = Number((plan.price_monthly * months * discount).toFixed(2));

  // Cria ou reutiliza o Pix pendente de forma atômica por revendedor/plano/período.
  const { data: paymentData, error: paymentError } = await supabaseAdmin.rpc(
    "get_or_create_saas_pending_payment",
    {
      p_user_id: params.userId,
      p_plan_id: plan.id,
      p_months: months,
      p_provider: provider,
      p_amount: amount,
    },
  );
  if (paymentError || !paymentData || typeof paymentData !== "object") {
    return {
      ok: false as const,
      error: paymentError?.message || "Não foi possível registrar o pagamento.",
    };
  }
  const payment = paymentData as {
    id: string;
    user_id: string;
    plan_id: string;
    amount: number;
    months: number;
    status: string;
    provider: string;
    provider_payment_id: string | null;
    pix_code: string | null;
    pix_qr_base64: string | null;
    ticket_url: string | null;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
  };
  if (payment.pix_code) return { ok: true as const, payment, amount };

  const description = `Sigma Control - Plano ${plan.name} (${months} mes${months > 1 ? "es" : ""})`;
  const pix =
    provider === "misticpay"
      ? await createMisticPix((await getMisticCreds())!, {
          amount,
          payerName: params.name || params.email || "Revendedor",
          payerDocument: cpf,
          transactionId: `saas_${payment.id}`,
          description,
          webhookUrl: buildMisticWebhookUrl(publicAppUrl(), process.env.MISTICPAY_WEBHOOK_SECRET),
        }).then((r) => (r.ok ? { ok: true as const, paymentId: r.paymentId, qrCode: r.qrCode, qrCodeBase64: r.qrCodeBase64, ticketUrl: null } : { ok: false as const, error: r.error }))
      : await createMercadoPagoPixPayment({
          token: (await getMercadoPagoToken())!,
          amount,
          description,
          orderId: `saas_${payment.id}`,
          customerName: params.name || params.email || "Revendedor",
          customerPhone: "",
          webhookUrl: `${publicAppUrl()}/api/public/hooks/saas-mercadopago`,
        });

  if (!pix.ok) {
    await supabaseAdmin.from("saas_payments").update({ status: "cancelled" }).eq("id", payment.id);
    return { ok: false as const, error: (pix as any).error || "Falha ao gerar o Pix." };
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
  const { data, error } = await supabaseAdmin.rpc("activate_saas_payment_from_payment", {
    p_payment_id: paymentId,
  });

  if (error) {
    console.error("Falha na liquidação transacional da assinatura SaaS:", error);
    return { ok: false as const, error: "Não foi possível ativar a assinatura de forma segura. A cobrança continuará pendente para nova conferência." };
  }

  const result = data as {
    ok?: boolean;
    alreadyApproved?: boolean;
    periodEnd?: string;
    error?: string;
  } | null;

  if (!result?.ok) {
    return { ok: false as const, error: result?.error || "O pagamento não pôde ser liquidado." };
  }

  return {
    ok: true as const,
    alreadyApproved: Boolean(result.alreadyApproved),
    periodEnd: result.periodEnd ?? null,
  };
}

/**
 * Reconcilia as cobranças pendentes recentes. Usado como rede de segurança
 * quando o webhook da MisticPay chega sem identificador (ou não chega), para
 * que o acesso do revendedor seja liberado sem intervenção manual.
 */
export async function reconcilePendingSaasPayments(options?: { provider?: "misticpay" | "mercadopago"; hours?: number; limit?: number }) {
  const provider = options?.provider ?? "misticpay";
  const hours = Math.max(1, Math.min(24 * 7, Number(options?.hours) || 72));
  const limit = Math.max(1, Math.min(100, Number(options?.limit) || 25));
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const { data: pending } = await supabaseAdmin
    .from("saas_payments")
    .select("id")
    .eq("provider", provider)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  let approved = 0;
  let cancelled = 0;
  let failed = 0;
  for (const row of pending ?? []) {
    const result = await reconcileSaasPayment(row.id);
    if (!result.ok) failed += 1;
    else if (result.status === "approved") approved += 1;
    else if (result.status === "cancelled") cancelled += 1;
  }
  return { checked: pending?.length ?? 0, approved, cancelled, failed };
}

/**
 * Confere os Pix pendentes DESTE usuário. Chamado de tempos em tempos pela tela
 * de Assinatura: se o webhook não chegou, o acesso é liberado sozinho mesmo que
 * o revendedor tenha fechado a página do QR Code.
 */
export async function reconcileMyPendingPayments(userId: string) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: pending } = await supabaseAdmin
    .from("saas_payments")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  let approved = false;
  for (const row of pending ?? []) {
    const result = await reconcileSaasPayment(row.id, userId);
    if (result.ok && result.status === "approved") approved = true;
  }
  return { ok: true as const, approved, checked: pending?.length ?? 0 };
}

/** Consulta o Mercado Pago e ativa caso o Pix já tenha sido pago (fallback do webhook). */
export async function reconcileSaasPayment(paymentId: string, userId?: string) {
  const token = await getMercadoPagoToken();
  const { data: payment } = await supabaseAdmin.from("saas_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment || (userId && payment.user_id !== userId)) return { ok: false as const, error: "Pagamento não encontrado." };
  if (payment.status === "approved") return { ok: true as const, status: "approved" as const };

  if (payment.provider === "misticpay") {
    const creds = await getMisticCreds();
    if (!creds) return { ok: true as const, status: payment.status };

    // A MisticPay ora devolve um id próprio, ora repete o `saas_<id>` que
    // enviamos. Consulta as duas referências: era isso que deixava o pagamento
    // "pago mas não liberado" quando os ids não batiam.
    const references = Array.from(
      new Set([payment.provider_payment_id, `saas_${payment.id}`].filter((r): r is string => Boolean(r))),
    );
    let verified: Awaited<ReturnType<typeof fetchMisticTransaction>> = null;
    let lastMismatch: string | null = null;

    for (const reference of references) {
      const candidate = await fetchMisticTransaction(creds, reference);
      if (!candidate) continue;
      const mismatch = validateMisticPaymentTransaction(candidate, reference, Number(payment.amount));
      if (!mismatch) {
        verified = candidate;
        break;
      }
      lastMismatch = mismatch;
    }

    if (!verified) {
      if (lastMismatch) {
        return { ok: false as const, error: `A transação MisticPay não corresponde a esta assinatura (${lastMismatch}).` };
      }
      return { ok: false as const, error: "Não foi possível consultar a transação MisticPay agora." };
    }

    if (verified.state === "paid") {
      const result = await activateSubscriptionFromPayment(payment.id);
      return result.ok ? { ok: true as const, status: "approved" as const } : { ok: false as const, error: result.error };
    }
    if (verified.state === "failed") {
      await supabaseAdmin.from("saas_payments").update({ status: "cancelled" }).eq("id", payment.id).neq("status", "approved");
      return { ok: true as const, status: "cancelled" as const };
    }
    return { ok: true as const, status: payment.status };
  }
  if (!payment.provider_payment_id) return { ok: true as const, status: payment.status };
  if (!token) return { ok: true as const, status: payment.status };

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
