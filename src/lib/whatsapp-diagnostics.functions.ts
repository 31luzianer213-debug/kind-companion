import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evolutionBaseUrl } from "./evolution-url";
import { tenantInstanceName, tenantState } from "./evolution-tenant.server";

async function webhookStatus(instance: string) {
  const rawUrl = process.env["EVOLUTION_API_URL"] || "";
  const apiKey = process.env["EVOLUTION_API_KEY"] || "";
  if (!rawUrl.trim() || !apiKey.trim()) {
    return { configured: false, error: "Evolution API não configurada no servidor." };
  }

  try {
    const response = await fetch(`${evolutionBaseUrl(rawUrl)}/webhook/find/${encodeURIComponent(instance)}`, {
      method: "GET",
      headers: { apikey: apiKey.trim(), "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { configured: false, error: null };
    const url = data?.url || data?.webhook?.url || data?.data?.url || data?.data?.webhook?.url || "";
    const enabled = data?.enabled ?? data?.webhook?.enabled ?? data?.data?.enabled ?? true;
    return { configured: Boolean(url && enabled), error: null };
  } catch (error) {
    return { configured: false, error: error instanceof Error ? error.message : "Falha ao consultar webhook." };
  }
}

export const getWhatsAppDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const instance = tenantInstanceName(context.userId);
    const checkedAt = new Date().toISOString();
    try {
      const [state, webhook] = await Promise.all([
        tenantState(context.userId),
        webhookStatus(instance),
      ]);
      return {
        ok: true as const,
        instance,
        state: state.state,
        number: state.number,
        webhookConfigured: webhook.configured,
        checkedAt,
        lastError: webhook.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível consultar o WhatsApp.";
      return {
        ok: false as const,
        instance,
        state: "none" as const,
        number: null,
        webhookConfigured: false,
        checkedAt,
        lastError: message,
      };
    }
  });

export const testWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const instance = tenantInstanceName(context.userId);
    try {
      const state = await tenantState(context.userId);
      return {
        ok: state.state === "open",
        instance,
        state: state.state,
        number: state.number,
        checkedAt: new Date().toISOString(),
        error: state.state === "open" ? null : "A instância não está conectada no momento.",
      };
    } catch (error) {
      return {
        ok: false,
        instance,
        state: "none" as const,
        number: null,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Falha no teste de conexão.",
      };
    }
  });
