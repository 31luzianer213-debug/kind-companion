import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Consulta o status da conexão Baileys nativa.
 */
export const getBaileysConnectionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getBaileysState } = await import("./baileys.server");
    const state = getBaileysState();
    return { ok: true as const, state };
  });

/**
 * Inicia ou reinicia a conexão Baileys com QR Code ou Código de Pareamento.
 */
export const startBaileysConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      mode?: "qr" | "pairing";
      phone?: string;
      forceRestart?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { initBaileys } = await import("./baileys.server");
    const state = await initBaileys({
      mode: data?.mode || "qr",
      phone: data?.phone,
      forceRestart: data?.forceRestart,
    });
    return { ok: true as const, state };
  });

/**
 * Desconecta e limpa a sessão Baileys.
 */
export const disconnectBaileysSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { logoutBaileys } = await import("./baileys.server");
    await logoutBaileys();
    return { ok: true as const };
  });

/**
 * Envia uma mensagem de teste pelo Baileys (texto simples, botões ou lista).
 */
export const sendBaileysTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      to: string;
      text?: string;
      testType?: "text" | "buttons" | "list" | "pix_copy";
    }) => input,
  )
  .handler(async ({ data }) => {
    const {
      getBaileysSocket,
      formatToWhatsappJid,
      sendBaileysInteractiveButtons,
      sendBaileysInteractiveList,
    } = await import("./baileys.server");

    const sock = getBaileysSocket();
    if (!sock) {
      throw new Error("WhatsApp não está conectado via Baileys no momento.");
    }

    const jid = formatToWhatsappJid(data.to);
    const testType = data.testType || "text";
    const baseText = data.text || "🤖 *Mensagem de Teste IPTV Manager* (Baileys Nativo)";

    if (testType === "buttons") {
      await sendBaileysInteractiveButtons(sock, jid, {
        bodyText: `${baseText}\n\nEscolha uma opção rápida abaixo:`,
        title: "⚡ Teste de Botões Interativos",
        footer: "IPTV Manager • Baileys",
        buttons: [
          { id: "btn_teste_1", displayText: "1️⃣ Gerar Teste Grátis" },
          { id: "btn_teste_2", displayText: "2️⃣ Ver Planos" },
          { id: "btn_teste_3", displayText: "3️⃣ Falar com Suporte" },
        ],
      });
      return { ok: true as const, type: "buttons" };
    }

    if (testType === "pix_copy") {
      await sendBaileysInteractiveButtons(sock, jid, {
        bodyText: `${baseText}\n\n👇 Toque no botão para copiar a chave PIX:`,
        title: "💳 Teste Botão Copiar PIX",
        footer: "IPTV Manager • PIX Automático",
        buttons: [
          {
            displayText: "📋 Copiar Código PIX",
            type: "cta_copy",
            copyCode: "00020126580014br.gov.bcb.pix0136test-baileys-copia-e-cola-1234567895204000053039865802BR5915IPTV MANAGER6009SAO PAULO62070503***6304ABCD",
          },
        ],
      });
      return { ok: true as const, type: "pix_copy" };
    }

    if (testType === "list") {
      await sendBaileysInteractiveList(sock, jid, {
        bodyText: `${baseText}\n\nSelecione um item da lista interativa:`,
        title: "📋 Menu de Opções",
        footer: "IPTV Manager",
        buttonText: "📋 Abrir Opções",
        sections: [
          {
            title: "Planos IPTV",
            rows: [
              { rowId: "1", title: "1️⃣ Plano Mensal", description: "R$ 35,00 - 1 Tela" },
              { rowId: "2", title: "2️⃣ Plano Trimestral", description: "R$ 90,00 - Mais Econômico" },
              { rowId: "3", title: "3️⃣ Plano Anual", description: "R$ 290,00 - Melhor Custo-Benefício" },
            ],
          },
          {
            title: "Atendimento",
            rows: [
              { rowId: "4", title: "📲 Baixar Aplicativos", description: "Android, TV Box, PC, iOS" },
              { rowId: "6", title: "👨‍💼 Falar com Atendente", description: "Suporte Humano" },
            ],
          },
        ],
      });
      return { ok: true as const, type: "list" };
    }

    // Padrão: texto simples
    await sock.sendMessage(jid, { text: baseText });
    return { ok: true as const, type: "text" };
  });
