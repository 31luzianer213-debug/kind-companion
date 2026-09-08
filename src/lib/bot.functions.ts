import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadBotConfig,
  saveBotConfigServer,
  processBotMessage,
  createTrialForBot,
  type BotConfigData,
} from "./bot.server";

/** Carrega as configurações do Bot de Auto-Atendimento */
export const getBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const config = await loadBotConfig(supabase, userId);
    return { ok: true as const, config };
  });

/** Salva as configurações do Bot */
export const saveBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<BotConfigData>) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await saveBotConfigServer(supabase, userId, data);
    return { ok: true as const };
  });

/** Simula uma mensagem no Bot sem enviar pelo WhatsApp (para o simulador interativo na tela) */
export const simulateBotMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string; phone?: string; pushName?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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
    const res = await createTrialForBot(supabase, userId, {
      phone: data.phone,
      senderName: data.name,
    });
    return res;
  });

