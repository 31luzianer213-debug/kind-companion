import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Status da conexão do robô no Telegram */
export const getTelegramConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getTelegramStatus } = await import("./telegram.server");
    return getTelegramStatus(context.userId);
  });

/** Conecta o robô usando o token do @BotFather */
export const connectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data, context }) => {
    const { connectTelegram } = await import("./telegram.server");
    try {
      const status = await connectTelegram(context.userId, data.token || "");
      return { ok: true as const, status };
    } catch (error: any) {
      return { ok: false as const, error: String(error?.message || "Não foi possível conectar o Telegram.") };
    }
  });

/** Desconecta o robô do Telegram */
export const disconnectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectTelegram } = await import("./telegram.server");
    const status = await disconnectTelegram(context.userId);
    return { ok: true as const, status };
  });

/** Liga/desliga o atendimento no Telegram */
export const toggleTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { setTelegramEnabled } = await import("./telegram.server");
    const status = await setTelegramEnabled(context.userId, Boolean(data.enabled));
    return { ok: true as const, status };
  });

/** Envia uma mensagem de teste pelo Telegram */
export const testTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chatId?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { sendTelegramTest } = await import("./telegram.server");
    try {
      return await sendTelegramTest(context.userId, data?.chatId);
    } catch (error: any) {
      return { ok: false as const, message: String(error?.message || "Falha ao enviar teste.") };
    }
  });
