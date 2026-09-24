import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_ADMIN_EMAIL = (process.env["ADMIN_EMAIL"]?.trim() || "frfrfrfrfr@gmail.com").toLowerCase();

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

export async function getAdminEmail(): Promise<string> {
  const settings = await getSystemSettings();
  return (settings?.admin_email?.trim() || DEFAULT_ADMIN_EMAIL).toLowerCase();
}

export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  return email.trim().toLowerCase() === (await getAdminEmail());
}
