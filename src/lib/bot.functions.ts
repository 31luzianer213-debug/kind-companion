import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BotConfigData } from "./bot.server";

/** Carrega as configurações do Bot de Auto-Atendimento */
export const getBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { loadBotConfig } = await import("./bot.server");
    const config = await loadBotConfig(supabase, userId);
    return { ok: true as const, config };
  });

/** Salva as configurações do Bot */
export const saveBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<BotConfigData>) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { saveBotConfigServer } = await import("./bot.server");
    await saveBotConfigServer(supabase, userId, data);
    return { ok: true as const };
  });

/** Simula uma mensagem no Bot sem enviar pelo WhatsApp (para o simulador interativo na tela) */
export const simulateBotMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; phone?: string; pushName?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { processBotMessage } = await import("./bot.server");
    const result = await processBotMessage(supabase, userId, {
      phone: data.phone || "5511999999999",
      text: data.text,
      pushName: data.pushName || "Cliente Teste",
    });
    return { ok: true as const, ...result };
  });

/** Gera um teste rápido diretamente pelo painel administrativo */
export const generateTrialQuick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; name?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { createTrialForBot } = await import("./bot.server");
    const res = await createTrialForBot(supabase, userId, {
      phone: data.phone,
      senderName: data.name,
    });
    return res;
  });

/** Gera o texto formatado dos planos com os valores preenchidos */
export const generatePlansMessageText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      planMonthlyPrice?: number;
      planQuarterlyPrice?: number;
      planSemiannualPrice?: number;
      planAnnualPrice?: number;
      serverName?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { generateDefaultPlansText } = await import("./bot.server");
    const text = generateDefaultPlansText(data);
    return { ok: true as const, text };
  });
