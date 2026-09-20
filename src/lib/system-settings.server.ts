import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_ADMIN_EMAIL = (process.env["ADMIN_EMAIL"]?.trim() || "frfrfrfrfr@gmail.com").toLowerCase();

export type SystemSettings = {
  saas_provider: string;
  mercadopago_token: string | null;
  admin_email: string | null;
};

export async function getSystemSettings(): Promise<SystemSettings | null> {
  const { data } = await (supabaseAdmin as any)
    .from("system_settings")
    .select("saas_provider, mercadopago_token, admin_email")
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

export async function getAdminEmail(): Promise<string> {
  const settings = await getSystemSettings();
  return (settings?.admin_email?.trim() || DEFAULT_ADMIN_EMAIL).toLowerCase();
}

export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  return email.trim().toLowerCase() === (await getAdminEmail());
}
