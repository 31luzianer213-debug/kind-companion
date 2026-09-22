import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function emailFromClaims(claims: any): string | null {
  return typeof claims?.email === "string" ? claims.email : null;
}

/** Retorna se o usuário autenticado é o administrador do sistema. */
export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdminEmail } = await import("./system-settings.server");
    return { isAdmin: await isAdminEmail(emailFromClaims(context.claims)) };
  });

/** Carrega as configurações globais (sem devolver o token em texto puro). */
export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdminEmail, getSystemSettings } = await import("./system-settings.server");
    if (!(await isAdminEmail(emailFromClaims(context.claims)))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const settings = await getSystemSettings();
    return {
      ok: true as const,
      settings: {
        saas_provider: settings?.saas_provider ?? "mercadopago",
        has_token: Boolean(settings?.mercadopago_token),
        admin_email: settings?.admin_email ?? "",
      },
    };
  });

/** Salva o Access Token do Mercado Pago. */
export const saveAdminSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mercadopago_token?: string }) => input)
  .handler(async ({ data, context }) => {
    const { isAdminEmail } = await import("./system-settings.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isAdminEmail(emailFromClaims(context.claims)))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const payload: Record<string, unknown> = { id: "global", saas_provider: "mercadopago" };
    // Só sobrescreve o token quando um novo valor é enviado (mantém o atual se vier vazio).
    if (typeof data.mercadopago_token === "string" && data.mercadopago_token.trim()) {
      payload.mercadopago_token = data.mercadopago_token.trim();
    }
    const { error } = await (supabaseAdmin as any).from("system_settings").upsert(payload, { onConflict: "id" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Testa o Access Token do Mercado Pago consultando a conta vinculada. */
export const testMercadoPagoToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data, context }) => {
    const { isAdminEmail } = await import("./system-settings.server");
    if (!(await isAdminEmail(emailFromClaims(context.claims)))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const token = data.token?.trim();
    if (!token) return { ok: false as const, error: "Informe o Access Token do Mercado Pago." };
    try {
      const res = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false as const, error: "Token recusado pelo Mercado Pago. Verifique o Access Token." };
      }
      if (!res.ok) return { ok: false as const, error: "Não foi possível validar o token agora. Tente de novo." };
      const info: any = await res.json().catch(() => ({}));
      const nickname = info?.nickname || info?.email || "conta Mercado Pago";
      return { ok: true as const, message: `Token válido — conectado à ${nickname}.` };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Falha na conexão com o Mercado Pago." };
    }
  });

export type AdminPlan = {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  max_clients: number | null;
  features: string[];
};

/** Plano de assinatura do sistema (o que os revendedores pagam). */
export const getAdminPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdminEmail } = await import("./system-settings.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isAdminEmail(emailFromClaims(context.claims)))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const { data, error } = await (supabaseAdmin as any)
      .from("saas_plans")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    const plan: AdminPlan = {
      id: data?.id ?? "ilimitado",
      name: data?.name ?? "Plano Mensal",
      description: data?.description ?? "",
      price_monthly: Number(data?.price_monthly) || 0,
      max_clients: data?.max_clients === null || data?.max_clients === undefined ? null : Number(data.max_clients),
      features: Array.isArray(data?.features) ? data.features.map(String) : [],
    };
    return { ok: true as const, plan };
  });

/** Salva nome, preço, limite e benefícios do plano de assinatura. */
export const saveAdminPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AdminPlan) => input)
  .handler(async ({ data, context }) => {
    const { isAdminEmail } = await import("./system-settings.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isAdminEmail(emailFromClaims(context.claims)))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const price = Number(data.price_monthly);
    if (!Number.isFinite(price) || price <= 0) return { ok: false as const, error: "Informe um valor mensal válido." };
    if (!data.name?.trim()) return { ok: false as const, error: "Informe o nome do plano." };
    const { error } = await (supabaseAdmin as any)
      .from("saas_plans")
      .update({
        name: data.name.trim(),
        description: data.description?.trim() ?? "",
        price_monthly: price,
        max_clients: data.max_clients === null ? null : Number(data.max_clients) || null,
        features: (data.features ?? []).map((f) => String(f).trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export type AdminSubscriptionRow = {
  user_id: string;
  email: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  clients: number;
};

/** Lista os revendedores e o estado de cada assinatura. */
export const listAdminSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdminEmail } = await import("./system-settings.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isAdminEmail(emailFromClaims(context.claims)))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema.", rows: [] as AdminSubscriptionRow[] };
    }
    const [{ data: subs }, users, { data: clients }] = await Promise.all([
      (supabaseAdmin as any).from("saas_subscriptions").select("user_id, status, trial_ends_at, current_period_end"),
      (supabaseAdmin as any).auth.admin.listUsers({ page: 1, perPage: 200 }),
      (supabaseAdmin as any).from("clients").select("user_id"),
    ]);
    const emails = new Map<string, string>();
    for (const u of users?.data?.users ?? []) emails.set(u.id, u.email ?? "");
    const counts = new Map<string, number>();
    for (const c of clients ?? []) counts.set(c.user_id, (counts.get(c.user_id) ?? 0) + 1);
    const subsById = new Map<string, any>();
    for (const s of subs ?? []) subsById.set(s.user_id, s);
    const ids = new Set<string>([...subsById.keys(), ...emails.keys()]);
    const rows: AdminSubscriptionRow[] = [...ids].map((id) => {
      const s = subsById.get(id);
      return {
        user_id: id,
        email: emails.get(id) ?? id.slice(0, 8),
        status: s?.status ?? "sem_assinatura",
        trial_ends_at: s?.trial_ends_at ?? null,
        current_period_end: s?.current_period_end ?? null,
        clients: counts.get(id) ?? 0,
      };
    });
    rows.sort((a, b) => a.email.localeCompare(b.email));
    return { ok: true as const, rows };
  });

/** Libera dias de acesso ou bloqueia a assinatura de um revendedor. */
export const updateAdminSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; action: "grant" | "block"; days?: number }) => input)
  .handler(async ({ data, context }) => {
    const { isAdminEmail } = await import("./system-settings.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isAdminEmail(emailFromClaims(context.claims)))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    if (data.action === "block") {
      const { error } = await (supabaseAdmin as any)
        .from("saas_subscriptions")
        .update({ status: "canceled", current_period_end: new Date(Date.now() - 86_400_000).toISOString() })
        .eq("user_id", data.userId);
      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const };
    }
    const days = Math.max(1, Math.min(365, Number(data.days) || 30));
    const { data: current } = await (supabaseAdmin as any)
      .from("saas_subscriptions")
      .select("current_period_end")
      .eq("user_id", data.userId)
      .maybeSingle();
    const base = current?.current_period_end ? new Date(current.current_period_end).getTime() : 0;
    const start = base > Date.now() ? base : Date.now();
    const { error } = await (supabaseAdmin as any)
      .from("saas_subscriptions")
      .update({ status: "active", current_period_end: new Date(start + days * 86_400_000).toISOString() })
      .eq("user_id", data.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

async function assertAdmin(claims: any) {
  const { isAdminEmail } = await import("./system-settings.server");
  return isAdminEmail(emailFromClaims(claims));
}

/** Cria um novo revendedor (conta de acesso + assinatura ativa). */
export const createAdminReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; days?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const email = data.email?.trim().toLowerCase();
    const password = data.password ?? "";
    if (!email || !email.includes("@")) return { ok: false as const, error: "Informe um e-mail válido." };
    if (password.length < 6) return { ok: false as const, error: "A senha precisa ter ao menos 6 caracteres." };

    const { data: created, error } = await (supabaseAdmin as any).auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return { ok: false as const, error: error.message };
    const userId = created?.user?.id as string | undefined;
    if (!userId) return { ok: false as const, error: "Não foi possível criar a conta." };

    const days = Math.max(1, Math.min(365, Number(data.days) || 30));
    const periodEnd = new Date(Date.now() + days * 86_400_000).toISOString();
    const { error: subError } = await (supabaseAdmin as any)
      .from("saas_subscriptions")
      .upsert(
        { user_id: userId, status: "active", current_period_end: periodEnd, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (subError) return { ok: false as const, error: subError.message };
    return { ok: true as const, userId };
  });

/** Define uma nova senha para o revendedor. */
export const resetAdminResellerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    if (!data.password || data.password.length < 6) {
      return { ok: false as const, error: "A senha precisa ter ao menos 6 caracteres." };
    }
    const { error } = await (supabaseAdmin as any).auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Exclui um revendedor e todos os dados ligados a ele. */
export const deleteAdminReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    if (data.userId === (context as any).userId) {
      return { ok: false as const, error: "Você não pode excluir a sua própria conta de administrador." };
    }
    const tables = [
      "billing_rule_sends",
      "billing_rules",
      "message_logs",
      "invoices",
      "orders",
      "iptv_lists",
      "clients",
      "sigma_panels",
      "whatsapp_settings",
      "bot_settings",
      "activity_logs",
      "saas_payments",
      "saas_subscriptions",
    ];
    for (const table of tables) {
      await (supabaseAdmin as any).from(table).delete().eq("user_id", data.userId);
    }
    await (supabaseAdmin as any).from("profiles").delete().eq("id", data.userId);
    const { error } = await (supabaseAdmin as any).auth.admin.deleteUser(data.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Coloca a assinatura em teste grátis por alguns dias. */
export const startAdminTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; days?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const days = Math.max(1, Math.min(90, Number(data.days) || 7));
    const { error } = await (supabaseAdmin as any)
      .from("saas_subscriptions")
      .upsert(
        {
          user_id: data.userId,
          status: "trialing",
          trial_ends_at: new Date(Date.now() + days * 86_400_000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export type AdminOverview = {
  resellers: number;
  active: number;
  trialing: number;
  expired: number;
  clients: number;
  connected: number;
  messages24h: number;
  failed24h: number;
  monthlyRevenue: number;
};

/** Números gerais do negócio para o administrador. */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [{ data: subs }, { data: clients }, { data: logs }, { data: conns }, { data: plan }, users] =
      await Promise.all([
        (supabaseAdmin as any)
          .from("saas_subscriptions")
          .select("user_id, status, trial_ends_at, current_period_end"),
        (supabaseAdmin as any).from("clients").select("id"),
        (supabaseAdmin as any).from("message_logs").select("status, created_at").gte("created_at", since),
        (supabaseAdmin as any).from("whatsapp_settings").select("user_id, connection_status"),
        (supabaseAdmin as any)
          .from("saas_plans")
          .select("price_monthly")
          .eq("active", true)
          .order("sort_order")
          .limit(1)
          .maybeSingle(),
        (supabaseAdmin as any).auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);

    // A base de revendedores são as contas existentes, mesmo sem assinatura criada.
    const subsByUser = new Map<string, any>();
    for (const s of subs ?? []) subsByUser.set(s.user_id, s);
    const accountIds = new Set<string>([
      ...(users?.data?.users ?? []).map((u: any) => u.id),
      ...subsByUser.keys(),
    ]);

    const now = Date.now();
    const isFuture = (value: any) => Boolean(value) && new Date(value).getTime() > now;

    let active = 0;
    let trialing = 0;
    let expired = 0;
    for (const id of accountIds) {
      const sub = subsByUser.get(id);
      if (sub?.status === "active" && isFuture(sub.current_period_end)) active += 1;
      else if (sub?.status === "trialing" && (isFuture(sub.trial_ends_at) || isFuture(sub.current_period_end)))
        trialing += 1;
      else expired += 1;
    }

    const messages = logs ?? [];
    const connectedIds = new Set(
      (conns ?? []).filter((c: any) => c.connection_status === "open").map((c: any) => c.user_id),
    );

    const overview: AdminOverview = {
      resellers: accountIds.size,
      active,
      trialing,
      expired,
      clients: (clients ?? []).length,
      connected: connectedIds.size,
      messages24h: messages.length,
      failed24h: messages.filter((m: any) => m.status === "failed").length,
      monthlyRevenue: active * (Number(plan?.price_monthly) || 0),
    };
    return { ok: true as const, overview };
  });

export type AdminConnectionRow = {
  user_id: string;
  email: string;
  instance: string;
  status: string;
  number: string | null;
  last_connected_at: string | null;
  last_error: string | null;
};

/** Mostra a conexão de WhatsApp de cada revendedor, comparando banco e Evolution. */
export const listAdminConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema.", rows: [] as AdminConnectionRow[] };
    }
    const { isTenantEvolutionEnabled, tenantInstanceName, tenantListInstances } = await import("./evolution-tenant.server");

    const [{ data: settings }, users] = await Promise.all([
      (supabaseAdmin as any).from("whatsapp_settings").select("user_id, instance_name, connection_status, connected_number, last_connected_at, last_connection_error"),
      (supabaseAdmin as any).auth.admin.listUsers({ page: 1, perPage: 200 }),
    ]);

    const live = isTenantEvolutionEnabled() ? await tenantListInstances().catch(() => []) : [];
    const liveByInstance = new Map(live.map((i: any) => [i.instance, i]));
    const settingsByUser = new Map((settings ?? []).map((s: any) => [s.user_id, s]));

    const rows: AdminConnectionRow[] = (users?.data?.users ?? []).map((u: any) => {
      let instance = "";
      try {
        instance = tenantInstanceName(u.id);
      } catch {
        instance = "";
      }
      const saved = settingsByUser.get(u.id) as any;
      const found = liveByInstance.get(instance) as any;
      return {
        user_id: u.id,
        email: u.email ?? u.id.slice(0, 8),
        instance,
        status: found?.state ?? saved?.connection_status ?? "none",
        number: found?.number ?? saved?.connected_number ?? null,
        last_connected_at: saved?.last_connected_at ?? null,
        last_error: saved?.last_connection_error ?? null,
      };
    });
    rows.sort((a, b) => a.email.localeCompare(b.email));
    return { ok: true as const, rows };
  });

/** Desconecta ou recria a sessão de WhatsApp de um revendedor. */
export const adminManageConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; action: "logout" | "reset" }) => input)
  .handler(async ({ data, context }) => {
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const { isTenantEvolutionEnabled, tenantDeleteInstance, tenantLogout } = await import("./evolution-tenant.server");
    if (!isTenantEvolutionEnabled()) {
      return { ok: false as const, error: "A conexão de WhatsApp ainda não está configurada no servidor." };
    }
    try {
      if (data.action === "reset") await tenantDeleteInstance(data.userId);
      else await tenantLogout(data.userId);
      const { persistConnectionState } = await import("./whatsapp-presence.server");
      await persistConnectionState(data.userId, { status: "close", number: null });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Falha ao atualizar a conexão." };
    }
  });

export type AdminPlanFull = AdminPlan & {
  active: boolean;
  highlighted: boolean;
  sort_order: number;
};

/** Lista todos os planos vendidos (ativos e desativados). */
export const listAdminPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema.", plans: [] as AdminPlanFull[] };
    }
    const { data, error } = await (supabaseAdmin as any).from("saas_plans").select("*").order("sort_order");
    if (error) return { ok: false as const, error: error.message, plans: [] as AdminPlanFull[] };
    const plans: AdminPlanFull[] = (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      price_monthly: Number(p.price_monthly) || 0,
      max_clients: p.max_clients === null || p.max_clients === undefined ? null : Number(p.max_clients),
      features: Array.isArray(p.features) ? p.features.map(String) : [],
      active: Boolean(p.active),
      highlighted: Boolean(p.highlighted),
      sort_order: Number(p.sort_order) || 0,
    }));
    return { ok: true as const, plans };
  });

/** Cria ou atualiza um plano vendido aos revendedores. */
export const upsertAdminPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AdminPlanFull) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const name = data.name?.trim();
    if (!name) return { ok: false as const, error: "Informe o nome do plano." };
    const price = Number(data.price_monthly);
    if (!Number.isFinite(price) || price <= 0) return { ok: false as const, error: "Informe um valor mensal válido." };

    const id =
      (data.id?.trim() ||
        name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "")) || `plano_${Date.now()}`;

    const payload = {
      id,
      name,
      description: data.description?.trim() ?? "",
      price_monthly: price,
      max_clients: data.max_clients === null ? null : Number(data.max_clients) || null,
      features: (data.features ?? []).map((f) => String(f).trim()).filter(Boolean),
      active: Boolean(data.active),
      highlighted: Boolean(data.highlighted),
      sort_order: Number(data.sort_order) || 1,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabaseAdmin as any).from("saas_plans").upsert(payload, { onConflict: "id" });
    if (error) return { ok: false as const, error: error.message };

    if (payload.highlighted) {
      await (supabaseAdmin as any).from("saas_plans").update({ highlighted: false }).neq("id", id);
    }
    return { ok: true as const, id };
  });

/** Ativa ou desativa um plano sem excluí-lo. */
export const toggleAdminPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; active: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const { error } = await (supabaseAdmin as any)
      .from("saas_plans")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Exclui um plano que não está mais à venda. */
export const deleteAdminPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await assertAdmin(context.claims))) {
      return { ok: false as const, error: "Acesso restrito ao administrador do sistema." };
    }
    const { count } = await (supabaseAdmin as any)
      .from("saas_plans")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    const { data: plan } = await (supabaseAdmin as any).from("saas_plans").select("active").eq("id", data.id).maybeSingle();
    if (plan?.active && (count ?? 0) <= 1) {
      return { ok: false as const, error: "Mantenha pelo menos um plano à venda antes de excluir este." };
    }
    const { error } = await (supabaseAdmin as any).from("saas_plans").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
