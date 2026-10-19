import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * E-mail do admin definido por ambiente — usado apenas quando o painel Admin
 * ainda não gravou um valor em `system_settings.admin_email`.
 *
 * IMPORTANTE: não existe mais e-mail padrão fixo no código. Antes havia um
 * fallback hardcoded e, como o cadastro é aberto, qualquer pessoa que se
 * registrasse com aquele e-mail viraria administrador do sistema. Agora, sem
 * `admin_email` no banco nem `ADMIN_EMAIL` no ambiente, ninguém é admin.
 */
const ENV_ADMIN_EMAIL = (process.env["ADMIN_EMAIL"]?.trim() || "").toLowerCase();

export type SystemSettings = {
  saas_provider: string;
  mercadopago_token: string | null;
  admin_email: string | null;
  misticpay_client_id: string | null;
  misticpay_client_secret: string | null;
};

export async function getSystemSettings(): Promise<SystemSettings | null> {
  const { data } = await (supabaseAdmin as any)
    .from("system_settings")
    .select("saas_provider, mercadopago_token, admin_email, misticpay_client_id, misticpay_client_secret")
    .eq("id", "global")
    .maybeSingle();
  return (data as SystemSettings) ?? null;
}

/** Token do Mercado Pago: primeiro o salvo no painel Admin, senão o env (compatibilidade). */
export async function getMercadoPagoToken(): Promise<string | null> {
  const settings = await getSystemSettings();
  const token = settings?.mercadopago_token?.trim();
  if (token) return token;
  const envToken = process.env["SAAS_MERCADOPAGO_TOKEN"]?.trim();
  return envToken || null;
}

export async function getMisticCreds(): Promise<{ clientId: string; clientSecret: string } | null> {
  const s = await getSystemSettings();
  const clientId = s?.misticpay_client_id?.trim();
  const clientSecret = s?.misticpay_client_secret?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Qual conta recebe as assinaturas agora. */
export async function getSaasProvider(): Promise<"mercadopago" | "misticpay" | null> {
  const s = await getSystemSettings();
  if (s?.saas_provider === "misticpay") return (await getMisticCreds()) ? "misticpay" : null;
  return (await getMercadoPagoToken()) ? "mercadopago" : null;
}

/** Retorna o e-mail admin configurado, ou null quando não há nenhum (estado seguro). */
export async function getAdminEmail(): Promise<string | null> {
  const settings = await getSystemSettings();
  const saved = settings?.admin_email?.trim().toLowerCase();
  if (saved) return saved;
  return ENV_ADMIN_EMAIL || null;
}

export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return false;
  return email.trim().toLowerCase() === adminEmail;
}
