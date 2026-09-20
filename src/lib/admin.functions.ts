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
    const rows: AdminSubscriptionRow[] = (subs ?? []).map((s: any) => ({
      user_id: s.user_id,
      email: emails.get(s.user_id) ?? s.user_id.slice(0, 8),
      status: s.status,
      trial_ends_at: s.trial_ends_at,
      current_period_end: s.current_period_end,
      clients: counts.get(s.user_id) ?? 0,
    }));
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
