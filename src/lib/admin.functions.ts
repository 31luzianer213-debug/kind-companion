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
