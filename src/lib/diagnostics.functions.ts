import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CheckStatus = "ok" | "warn" | "fail";

export type CheckArea = "recebimento" | "assinaturas" | "whatsapp" | "automacao" | "dados";

export type DiagnosticCheck = {
  id: string;
  area: CheckArea;
  label: string;
  status: CheckStatus;
  detail: string;
  /** O que fazer quando o teste não passa. */
  action?: string;
};

export type DiagnosticsResult = {
  ok: boolean;
  error?: string | null;
  score: number;
  counts: { ok: number; warn: number; fail: number };
  checks: DiagnosticCheck[];
  generatedAt: string;
};

const DAY = 86_400_000;

function iso(offsetDays: number) {
  return new Date(Date.now() + offsetDays * DAY).toISOString();
}

/**
 * Bateria de testes de pré-lançamento: confere, de verdade (inclusive falando
 * com a operadora de pagamentos e com o servidor de WhatsApp), cada peça que
 * precisa estar no ar para vender assinaturas sem liberação manual.
 */
export const runLaunchDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiagnosticsResult> => {
    const empty: DiagnosticsResult = {
      ok: false,
      error: null,
      score: 0,
      counts: { ok: 0, warn: 0, fail: 0 },
      checks: [],
      generatedAt: new Date().toISOString(),
    };

    const { isAdminEmail, getAdminEmail, getMisticCreds, getMercadoPagoToken, getSaasProvider } = await import(
      "./system-settings.server"
    );
    const email = typeof context.claims?.email === "string" ? context.claims.email : null;
    if (!(await isAdminEmail(email))) {
      return { ...empty, error: "Acesso restrito ao administrador do sistema." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const checks: DiagnosticCheck[] = [];
    const add = (check: DiagnosticCheck) => checks.push(check);

    // ---------------------------------------------------------------- coleta
    const [plansRes, subsRes, pendingRes, approvedRes, usersRes, connsRes, failedMsgsRes, tablesProbe] =
      await Promise.all([
        admin.from("saas_plans").select("id,name,price_monthly,active").order("sort_order"),
        admin.from("saas_subscriptions").select("user_id,status,trial_ends_at,current_period_end"),
        admin.from("saas_payments").select("id,amount,created_at,provider").eq("status", "pending"),
        admin
          .from("saas_payments")
          .select("id,amount,approved_at")
          .eq("status", "approved")
          .gte("approved_at", iso(-30)),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin.from("whatsapp_settings").select("user_id, connection_status, connected_number"),
        admin.from("message_logs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", iso(-1)),
        Promise.all(
          ["clients", "invoices", "orders", "message_logs", "whatsapp_settings", "sigma_panels", "saas_plans", "saas_payments"].map(
            async (table) => {
              const { error } = await admin.from(table).select("id", { count: "exact", head: true });
              return { table, error: error?.message ?? null };
            },
          ),
        ),
      ]);

    const plans = (plansRes.data ?? []) as any[];
    const activePlans = plans.filter((plan) => plan.active !== false && Number(plan.price_monthly) > 0);
    const subs = (subsRes.data ?? []) as any[];
    const accounts = (usersRes?.data?.users ?? []) as any[];
    const conns = (connsRes.data ?? []) as any[];
    const paymentsPending = (pendingRes.data ?? []) as any[];
    const paymentsApproved = (approvedRes.data ?? []) as any[];
    const now = Date.now();

    // -------------------------------------------------------- quem é o dono
    const adminEmail = await getAdminEmail();
    add({
      id: "admin-email",
      area: "automacao",
      label: "Dono do sistema identificado",
      status: adminEmail ? "ok" : "fail",
      detail: adminEmail
        ? `${adminEmail} é a conta de administrador (acesso vitalício).`
        : "Nenhum e-mail de administrador configurado: ninguém consegue abrir Administração.",
      action: adminEmail ? undefined : "Defina ADMIN_EMAIL nas variáveis de ambiente (ou admin_email em system_settings).",
    });

    // --------------------------------------------------------- recebimento
    const provider = await getSaasProvider();
    const mistic = await getMisticCreds();
    const mpToken = await getMercadoPagoToken();

    add({
      id: "saas-provider",
      area: "recebimento",
      label: "Conta que recebe as assinaturas",
      status: provider ? "ok" : "fail",
      detail: provider
        ? `Provedor ativo: ${provider === "misticpay" ? "MisticPay" : "Mercado Pago"}.`
        : "Nenhuma credencial válida configurada: os revendedores não conseguem gerar o Pix.",
      action: provider ? undefined : "Administração › Recebimento: salve as credenciais e escolha o provedor.",
    });

    // Teste ao vivo da MisticPay (era o ponto que deixava o Pix pago sem liberar).
    if (mistic) {
      let status: CheckStatus = "warn";
      let detail = "Não foi possível falar com a MisticPay agora.";
      try {
        const basic = !(mistic.clientId.startsWith("ci_") || mistic.clientSecret.startsWith("cs_"));
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (basic) {
          headers.Authorization = `Basic ${Buffer.from(`${mistic.clientId}:${mistic.clientSecret}`).toString("base64")}`;
        } else {
          headers.ci = mistic.clientId;
          headers.cs = mistic.clientSecret;
        }
        const res = await fetch("https://api.misticpay.com/api/transactions/check", {
          method: "POST",
          headers,
          body: JSON.stringify({ transactionId: "0" }),
        });
        if (res.status === 401 || res.status === 403) {
          status = "fail";
          detail = "A MisticPay recusou as credenciais salvas (401/403). Pix novos vão falhar.";
        } else if (res.ok) {
          status = "ok";
          detail = "Credenciais da MisticPay aceitas agora.";
        } else {
          detail = `A MisticPay respondeu ${res.status}. Vale conferir as chaves.`;
        }
      } catch {
        detail = "Sem conexão com a MisticPay neste momento — não é erro de configuração necessariamente.";
      }
      add({
        id: "mistic-creds",
        area: "recebimento",
        label: "Credenciais da MisticPay",
        status,
        detail,
        action: status === "fail" ? "Gere uma chave nova (pk_/sk_) com permissão de receber e salve em Recebimento." : undefined,
      });
    }

    if (mpToken) {
      let status: CheckStatus = "warn";
      let detail = "Não foi possível validar o token do Mercado Pago agora.";
      try {
        const res = await fetch("https://api.mercadopago.com/users/me", {
          headers: { Authorization: `Bearer ${mpToken}` },
        });
        if (res.status === 401 || res.status === 403) {
          status = "fail";
          detail = "O Mercado Pago recusou o Access Token salvo.";
        } else if (res.ok) {
          status = "ok";
          detail = "Access Token do Mercado Pago válido.";
        } else {
          detail = `O Mercado Pago respondeu ${res.status}.`;
        }
      } catch {
        detail = "Sem conexão com o Mercado Pago neste momento.";
      }
      add({
        id: "mp-token",
        area: "recebimento",
        label: "Access Token do Mercado Pago",
        status,
        detail,
        action: status === "fail" ? "Cole novamente o Access Token de produção em Recebimento." : undefined,
      });
    }

    add({
      id: "public-url",
      area: "recebimento",
      label: "Endereço público para webhooks",
      status: process.env["PUBLIC_APP_URL"] ? "ok" : "warn",
      detail: process.env["PUBLIC_APP_URL"]
        ? `PUBLIC_APP_URL = ${process.env["PUBLIC_APP_URL"]}`
        : "PUBLIC_APP_URL não definido: o sistema usa o domínio da requisição (pode gerar webhook errado atrás de proxy).",
      action: process.env["PUBLIC_APP_URL"] ? undefined : "Defina PUBLIC_APP_URL com o domínio final (https://seudominio.com.br).",
    });

    // ---------------------------------------------------------- assinaturas
    add({
      id: "plans",
      area: "assinaturas",
      label: "Planos à venda",
      status: activePlans.length ? "ok" : "fail",
      detail: activePlans.length
        ? `${activePlans.length} plano(s) ativo(s): ${activePlans.map((p) => `${p.name} ${Number(p.price_monthly).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join(" · ")}`
        : "Nenhum plano ativo com preço: a página de assinatura fica sem botão de compra.",
      action: activePlans.length ? undefined : "Administração › Plano: crie ou reative um plano.",
    });

    const subIds = new Set(subs.map((s) => s.user_id));
    const missingSubs = accounts.filter((u) => !subIds.has(u.id));
    add({
      id: "subs-coverage",
      area: "assinaturas",
      label: "Toda conta tem assinatura registrada",
      status: missingSubs.length === 0 ? "ok" : "warn",
      detail:
        missingSubs.length === 0
          ? `${accounts.length} conta(s) com assinatura registrada.`
          : `${missingSubs.length} conta(s) sem registro em saas_subscriptions (entram como bloqueadas até abrir a tela de Assinatura).`,
      action: missingSubs.length ? "Peça para a conta abrir Assinatura uma vez, ou libere dias em Administração › Assinaturas." : undefined,
    });

    const expired = subs.filter((s) => {
      const ref = s.current_period_end || s.trial_ends_at;
      return !ref || new Date(ref).getTime() < now;
    }).length;
    add({
      id: "subs-expired",
      area: "assinaturas",
      label: "Assinaturas vencidas",
      status: expired === 0 ? "ok" : "warn",
      detail: expired === 0 ? "Nenhuma assinatura vencida." : `${expired} assinatura(s) vencida(s) ou em tolerância.`,
      action: expired ? "Confira em Assinaturas: são renovações a cobrar (ou bloqueios a revisar)." : undefined,
    });

    const expiringSoon = subs.filter(
      (s) =>
        s.status === "trialing" &&
        s.trial_ends_at &&
        new Date(s.trial_ends_at).getTime() > now &&
        new Date(s.trial_ends_at).getTime() < now + 3 * DAY,
    ).length;
    add({
      id: "trials-ending",
      area: "assinaturas",
      label: "Testes grátis terminando",
      status: "ok",
      detail: expiringSoon === 0 ? "Nenhum teste termina nos próximos 3 dias." : `${expiringSoon} teste(s) terminam em até 3 dias — bom momento para conversar.`,
    });

    const stuck = paymentsPending.filter((p) => new Date(p.created_at).getTime() < now - 2 * DAY);
    add({
      id: "payments-stuck",
      area: "recebimento",
      label: "Cobranças presas em aberto",
      status: stuck.length === 0 ? "ok" : "warn",
      detail:
        stuck.length === 0
          ? `${paymentsPending.length} cobrança(s) pendente(s), todas recentes.`
          : `${stuck.length} cobrança(s) pendente(s) há mais de 2 dias (podem ser Pix pagos e não reconhecidos).`,
      action: stuck.length ? "Rode “Conferir pagamentos pendentes” em Administração › Assinaturas." : undefined,
    });

    add({
      id: "payments-approved",
      area: "recebimento",
      label: "Pagamentos confirmados (30 dias)",
      status: "ok",
      detail:
        paymentsApproved.length === 0
          ? "Nenhuma assinatura paga nos últimos 30 dias."
          : `${paymentsApproved.length} pagamento(s) aprovado(s), somando ${paymentsApproved
              .reduce((total, p) => total + Number(p.amount || 0), 0)
              .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
    });

    // -------------------------------------------------------------- whatsapp
    let evolutionOk = false;
    try {
      const { isTenantEvolutionEnabled, tenantListInstances } = await import("./evolution-tenant.server");
      evolutionOk = isTenantEvolutionEnabled();
      const live = evolutionOk ? await tenantListInstances().catch(() => []) : [];
      const openLive = live.filter((i: any) => ["open", "connected"].includes(String(i?.state ?? "").toLowerCase())).length;
      add({
        id: "evolution",
        area: "whatsapp",
        label: "Servidor de WhatsApp (Evolution)",
        status: evolutionOk ? "ok" : "fail",
        detail: evolutionOk
          ? `Configurado. ${live.length} conexão(ões) no servidor, ${openLive} conectada(s).`
          : "Evolution não configurado: ninguém consegue conectar WhatsApp, então cobrança e robô não funcionam.",
        action: evolutionOk ? undefined : "Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no ambiente.",
      });
    } catch {
      add({
        id: "evolution",
        area: "whatsapp",
        label: "Servidor de WhatsApp (Evolution)",
        status: "fail",
        detail: "Não foi possível verificar o servidor de WhatsApp.",
        action: "Confira EVOLUTION_API_URL e EVOLUTION_API_KEY.",
      });
    }

    const connected = conns.filter((c) => c.connection_status === "open" || c.connected_number);
    add({
      id: "wa-connected",
      area: "whatsapp",
      label: "Contas com WhatsApp conectado",
      status: connected.length ? "ok" : "warn",
      detail: `${connected.length} de ${conns.length} conta(s) com número conectado.`,
      action: connected.length ? undefined : "Conecte um número em WhatsApp para testar cobrança e robô de ponta a ponta.",
    });

    const failed24h = failedMsgsRes?.count ?? 0;
    add({
      id: "msg-failed",
      area: "whatsapp",
      label: "Falhas de envio (24h)",
      status: failed24h === 0 ? "ok" : failed24h < 10 ? "warn" : "fail",
      detail: failed24h === 0 ? "Nenhuma mensagem falhou nas últimas 24 horas." : `${failed24h} mensagem(ns) falharam nas últimas 24 horas.`,
      action: failed24h ? "Veja Mensagens › falhas: normalmente número desconectado ou WhatsApp bloqueando envios." : undefined,
    });
    add({
      id: "wa-token",
      area: "automacao",
      label: "Token do webhook do robô",
      status: process.env["WHATSAPP_WEBHOOK_TOKEN"] ? "ok" : "warn",
      detail: process.env["WHATSAPP_WEBHOOK_TOKEN"]
        ? "WHATSAPP_WEBHOOK_TOKEN definido."
        : "Sem WHATSAPP_WEBHOOK_TOKEN o endpoint do robô recusa todas as chamadas (nada de atendimento automático).",
      action: process.env["WHATSAPP_WEBHOOK_TOKEN"] ? undefined : "Defina WHATSAPP_WEBHOOK_TOKEN no ambiente.",
    });

    // ------------------------------------------------------------- automação
    add({
      id: "cron-secret",
      area: "automacao",
      label: "Rotinas diárias protegidas e ativas",
      status: process.env["BILLING_CRON_SECRET"] ? "ok" : "fail",
      detail: process.env["BILLING_CRON_SECRET"]
        ? "BILLING_CRON_SECRET definido: cobrança diária e reconciliação de Pix podem rodar."
        : "Sem BILLING_CRON_SECRET as rotinas /cobranca-diaria e /saas-reconcile recusam tudo: quem pagar e o webhook falhar não é liberado.",
      action: process.env["BILLING_CRON_SECRET"]
        ? undefined
        : "Defina BILLING_CRON_SECRET e agende as chamadas diárias (ex.: cron a cada 15 min em /api/public/hooks/saas-reconcile?secret=...).",
    });

    const brokenTables = tablesProbe.filter((t) => t.error);
    add({
      id: "db-tables",
      area: "dados",
      label: "Tabelas essenciais acessíveis",
      status: brokenTables.length ? "fail" : "ok",
      detail: brokenTables.length
        ? `Falha ao ler: ${brokenTables.map((t) => t.table).join(", ")}.`
        : "clients, invoices, orders, message_logs, whatsapp_settings, sigma_panels, saas_plans e saas_payments respondendo.",
      action: brokenTables.length ? "Rode as migrations pendentes no banco antes de vender." : undefined,
    });

    const counts = {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    };
    const total = counts.ok + counts.warn + counts.fail;
    return {
      ok: true,
      error: null,
      score: total ? Math.round((counts.ok / total) * 100) : 0,
      counts,
      checks,
      generatedAt: new Date().toISOString(),
    };
  });
