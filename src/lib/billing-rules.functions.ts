import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_RULES = [
  {
    offset_days: -3,
    message_template: "Olá {nome}! Sua mensalidade vence em 3 dias, em {vencimento}. Se precisar de ajuda, é só chamar.",
  },
  {
    offset_days: 0,
    message_template: "Olá {nome}! Sua mensalidade vence hoje ({vencimento}). Se já realizou o pagamento, desconsidere esta mensagem.",
  },
  {
    offset_days: 1,
    message_template: "Olá {nome}! Identificamos que sua mensalidade venceu ontem ({vencimento}). Posso te ajudar com a renovação?",
  },
  {
    offset_days: 5,
    message_template: "Olá {nome}! Sua mensalidade está vencida há 5 dias desde {vencimento}. Fale com a gente para regularizar seu acesso.",
  },
] as const;

async function ensureDefaults(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("billing_rules")
    .select("id,offset_days")
    .eq("user_id", userId);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const existing = new Set(rows.map((row: any) => Number(row.offset_days)));
  const missing = DEFAULT_RULES.filter((rule) => !existing.has(rule.offset_days));

  if (missing.length > 0) {
    const { error: insertError } = await supabase.from("billing_rules").insert(
      missing.map((rule) => ({
        user_id: userId,
        offset_days: rule.offset_days,
        enabled: true,
        message_template: rule.message_template,
      })),
    );
    if (insertError) throw insertError;
  }
}

export const listBillingRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    try {
      await ensureDefaults(supabase, context.userId);
      const { data, error } = await supabase
        .from("billing_rules")
        .select("id,offset_days,enabled,message_template,created_at,updated_at")
        .eq("user_id", context.userId)
        .order("offset_days", { ascending: true });
      if (error) throw error;
      return { ok: true as const, rules: Array.isArray(data) ? data : [], error: null };
    } catch (error) {
      console.warn("Falha ao carregar regras de cobrança:", error);
      return { ok: false as const, rules: [], error: "Não foi possível carregar as regras de cobrança." };
    }
  });

export const saveBillingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; offsetDays: number; enabled: boolean; messageTemplate: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const offsetDays = Number(data.offsetDays);
    const messageTemplate = String(data.messageTemplate || "").trim();
    if (!Number.isInteger(offsetDays) || offsetDays < -30 || offsetDays > 60) {
      return { ok: false as const, rule: null, error: "Informe um intervalo válido entre -30 e 60 dias." };
    }
    if (!messageTemplate) return { ok: false as const, rule: null, error: "A mensagem da regra não pode ficar vazia." };

    const payload = {
      user_id: context.userId,
      offset_days: offsetDays,
      enabled: Boolean(data.enabled),
      message_template: messageTemplate,
      updated_at: new Date().toISOString(),
    };

    let query;
    if (data.id) {
      query = supabase
        .from("billing_rules")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("*")
        .single();
    } else {
      query = supabase
        .from("billing_rules")
        .upsert(payload, { onConflict: "user_id,offset_days" })
        .select("*")
        .single();
    }

    const { data: rule, error } = await query;
    if (error) {
      console.warn("Falha ao salvar regra de cobrança:", error.message);
      return { ok: false as const, rule: null, error: "Não foi possível salvar esta regra." };
    }
    return { ok: true as const, rule, error: null };
  });
