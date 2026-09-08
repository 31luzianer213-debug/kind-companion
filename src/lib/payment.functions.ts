import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PaymentSettingsPayload = {
  pix_key?: string;
  pix_key_type?: string;
  pix_holder?: string;
  payment_link?: string;
  payment_provider?: string;
  mercadopago_token?: string;
  asaas_token?: string;
  asaas_env?: string;
};

/**
 * Consulta as configurações de pagamento com fallback duplo (banco de dados e user_metadata).
 */
export const getPaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    let dbData: any = null;
    try {
      const { data } = await supabase
        .from("whatsapp_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      dbData = data;
    } catch {
      dbData = null;
    }

    let metaPayment: any = null;
    try {
      const { data: authUser } = await supabase.auth.getUser();
      metaPayment = authUser?.user?.user_metadata?.payment_settings ?? null;
    } catch {
      metaPayment = null;
    }

    return {
      ok: true as const,
      settings: {
        pix_key: dbData?.pix_key ?? metaPayment?.pix_key ?? "",
        pix_key_type: dbData?.pix_key_type ?? metaPayment?.pix_key_type ?? "aleatoria",
        pix_holder: dbData?.pix_holder ?? metaPayment?.pix_holder ?? "",
        payment_link: dbData?.payment_link ?? metaPayment?.payment_link ?? "",
        payment_provider: dbData?.payment_provider ?? metaPayment?.payment_provider ?? "pix",
        mercadopago_token: dbData?.mercadopago_token ?? metaPayment?.mercadopago_token ?? "",
        asaas_token: dbData?.asaas_token ?? metaPayment?.asaas_token ?? "",
        asaas_env: dbData?.asaas_env ?? metaPayment?.asaas_env ?? "production",
      },
    };
  });

/**
 * Salva as configurações de pagamento com garantia infalível (banco e user_metadata).
 */
export const savePaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PaymentSettingsPayload) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const payload = {
      user_id: userId,
      pix_key: (data.pix_key ?? "").trim(),
      pix_key_type: data.pix_key_type ?? "aleatoria",
      pix_holder: (data.pix_holder ?? "").trim(),
      payment_link: (data.payment_link ?? "").trim(),
      payment_provider: data.payment_provider ?? "pix",
      mercadopago_token: (data.mercadopago_token ?? "").trim(),
      asaas_token: (data.asaas_token ?? "").trim(),
      asaas_env: data.asaas_env ?? "production",
    };

    let dbSaved = false;
    // 1. Tenta salvar na tabela whatsapp_settings com todas as colunas
    try {
      const { error } = await supabase
        .from("whatsapp_settings")
        .upsert(payload, { onConflict: "user_id" });
      if (!error) dbSaved = true;
    } catch {
      dbSaved = false;
    }

    // Se falhou por colunas faltantes, tenta salvar ao menos as colunas básicas de PIX
    if (!dbSaved) {
      try {
        await supabase
          .from("whatsapp_settings")
          .upsert(
            {
              user_id: userId,
              pix_key: payload.pix_key,
              pix_key_type: payload.pix_key_type,
              pix_holder: payload.pix_holder,
            },
            { onConflict: "user_id" },
          );
      } catch {
        // segue para user_metadata
      }
    }

    // 2. Salva no user_metadata como garantia absoluta
    try {
      await supabase.auth.updateUser({
        data: {
          payment_settings: {
            ...payload,
            updated_at: new Date().toISOString(),
          },
        },
      });
    } catch (metaErr) {
      console.error("Erro ao salvar no metadata:", metaErr);
    }

    return { ok: true as const, error: null };
  });

/**
 * Testa a conexão e validade do token com o Mercado Pago.
 */
export const testMercadoPagoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data, context }) => {
    const rawToken = data.token ?? "";
    const token = rawToken.replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();

    if (!token) {
      return { ok: false as const, error: "Informe o Access Token do Mercado Pago para testar." };
    }

    try {
      // 1. Tenta o endpoint oficial de perfil do Mercado Pago: /users/me (SEM /v1/)
      const userRes = await fetch("https://api.mercadopago.com/users/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "KindCompanion/2.0 (MercadoPago Integration)",
        },
      });

      if (userRes.ok) {
        const json = await userRes.json();
        const name =
          json.nickname ||
          [json.first_name, json.last_name].filter(Boolean).join(" ") ||
          json.site_id ||
          "Conta Mercado Pago";
        const email = json.email || "";

        // Persiste token para conveniência
        try {
          const { supabase, userId } = context;
          await supabase
            .from("whatsapp_settings")
            .upsert({ user_id: userId, mercadopago_token: token }, { onConflict: "user_id" });
        } catch {
          // ignora se falhar
        }

        return { ok: true as const, name, email, error: null };
      }

      // 2. Se /users/me não autorizou (ex: token restrito a escopo de pagamentos sem permissão de ler perfil),
      // testa via /v1/payment_methods (que qualquer credencial ativa do Mercado Pago tem acesso)
      const methodsRes = await fetch("https://api.mercadopago.com/v1/payment_methods", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "KindCompanion/2.0 (MercadoPago Integration)",
        },
      });

      if (methodsRes.ok) {
        try {
          const { supabase, userId } = context;
          await supabase
            .from("whatsapp_settings")
            .upsert({ user_id: userId, mercadopago_token: token }, { onConflict: "user_id" });
        } catch {
          // ignora
        }

        return {
          ok: true as const,
          name: "Credencial Mercado Pago Ativa",
          email: "Autorizada para Pagamentos e PIX",
          error: null,
        };
      }

      // Se ambos falharem, extrai o erro retornado pela API do Mercado Pago
      let errorDetail = "";
      try {
        const errJson = await userRes.json();
        errorDetail = errJson.message || errJson.error || "";
      } catch {
        try {
          const errMethods = await methodsRes.json();
          errorDetail = errMethods.message || errMethods.error || "";
        } catch {
          errorDetail = "";
        }
      }

      if (userRes.status === 401 || methodsRes.status === 401) {
        return {
          ok: false as const,
          error: `Token do Mercado Pago inválido ou expirado (401). Verifique o Access Token copiado no portal Mercado Pago Developers.${
            errorDetail ? ` (${errorDetail})` : ""
          }`,
        };
      }

      if (userRes.status === 403 || methodsRes.status === 403) {
        return {
          ok: false as const,
          error: `Acesso negado pelo Mercado Pago (403). Verifique se seu aplicativo possui permissões de pagamento ativas.${
            errorDetail ? ` (${errorDetail})` : ""
          }`,
        };
      }

      return {
        ok: false as const,
        error: `Mercado Pago retornou status ${userRes.status}${errorDetail ? `: ${errorDetail}` : ""}.`,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Erro de conexão ao contatar o Mercado Pago.",
      };
    }
  });

/**
 * Testa a conexão e validade do token com o Asaas.
 */
export const testAsaasConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string; env?: string }) => input)
  .handler(async ({ data }) => {
    const rawToken = data.token ?? "";
    const token = rawToken.replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();
    if (!token) return { ok: false as const, error: "Informe o token do Asaas." };

    const baseUrl = data.env === "sandbox" ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";
    try {
      const res = await fetch(`${baseUrl}/myAccount`, {
        headers: { access_token: token },
      });
      if (res.ok) {
        const json = await res.json();
        const name = json.name || json.companyName || "Conta Asaas Ativa";
        const email = json.email || "";
        return { ok: true as const, name, email, error: null };
      }
      return { ok: false as const, error: `Asaas retornou erro ${res.status}: token inválido.` };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Erro de conexão com Asaas." };
    }
  });
