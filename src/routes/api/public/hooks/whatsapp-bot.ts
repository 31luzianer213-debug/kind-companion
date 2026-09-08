import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/whatsapp-bot")({
  server: {
    handlers: {
      GET: async () => {
        return new Response("WhatsApp Bot Webhook Active", { status: 200 });
      },
      POST: async ({ request }) => {
        let payload: any = null;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (!payload) {
          return new Response("Empty body", { status: 400 });
        }

        const url = new URL(request.url);
        let targetUserId = url.searchParams.get("userId") || url.searchParams.get("user_id");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processBotMessage, loadBotConfig } = await import("@/lib/bot.server");
        const { sendViaEvolution } = await import("@/lib/billing.server");
        const { instanceNameFor } = await import("@/lib/evolution.server");

        // Extrai dados da mensagem da Evolution API (compatível com v1 e v2)
        const event = String(payload?.event ?? "").toLowerCase();
        const instance = payload?.instance ?? "";
        const data = payload?.data ?? payload;

        // Se não passou userId na query string, tenta localizar pela instância
        if (!targetUserId && instance) {
          try {
            const { data: accounts } = await supabaseAdmin.from("whatsapp_settings").select("user_id");
            for (const acc of accounts ?? []) {
              if (instanceNameFor(acc.user_id) === instance) {
                targetUserId = acc.user_id;
                break;
              }
            }
          } catch {}
        }

        // Se ainda não encontrou e só há uma conta no sistema, usa a primeira
        if (!targetUserId) {
          const { data: firstAccount } = await supabaseAdmin
            .from("whatsapp_settings")
            .select("user_id")
            .limit(1)
            .maybeSingle();
          if (firstAccount?.user_id) {
            targetUserId = firstAccount.user_id;
          }
        }

        if (!targetUserId) {
          return Response.json({ ok: false, error: "Conta não identificada" }, { status: 404 });
        }

        // Verifica se o bot está ativo
        const botConfig = await loadBotConfig(supabaseAdmin, targetUserId);
        if (!botConfig.enabled) {
          return Response.json({ ok: true, ignored: "bot_disabled" });
        }

        // Filtra mensagens próprias (fromMe) e grupos (@g.us)
        const key = data?.key ?? {};
        if (key.fromMe) {
          return Response.json({ ok: true, ignored: "from_me" });
        }

        const remoteJid = String(key.remoteJid ?? "");
        if (!remoteJid || remoteJid.includes("@g.us")) {
          return Response.json({ ok: true, ignored: "group_or_missing_jid" });
        }

        const senderPhone = remoteJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
        const pushName = data?.pushName || "";

        // Extrai o conteúdo do texto enviado pelo cliente
        const messageObj = data?.message ?? {};
        const incomingText =
          messageObj?.conversation ||
          messageObj?.extendedTextMessage?.text ||
          messageObj?.buttonsResponseMessage?.selectedButtonId ||
          messageObj?.listResponseMessage?.singleSelectReply?.selectedRowId ||
          data?.body ||
          "";

        if (!incomingText || !incomingText.trim()) {
          return Response.json({ ok: true, ignored: "empty_text" });
        }

        try {
          const botResult = await processBotMessage(supabaseAdmin, targetUserId, {
            phone: senderPhone,
            text: incomingText,
            pushName,
          });

          if (botResult?.reply) {
            // Envia a resposta automática de volta pelo WhatsApp
            let settings: any = null;
            try {
              const { data: s } = await supabaseAdmin
                .from("whatsapp_settings")
                .select("*")
                .eq("user_id", targetUserId)
                .maybeSingle();
              settings = s;
            } catch {}

            await sendViaEvolution(settings ?? {}, senderPhone, botResult.reply, targetUserId);

            // Registra nos logs
            try {
              await supabaseAdmin.from("message_logs").insert({
                user_id: targetUserId,
                phone: senderPhone,
                body: botResult.reply,
                status: "sent",
              });
            } catch {}
          }

          return Response.json({
            ok: true,
            action: botResult?.action,
            phone: senderPhone,
          });
        } catch (botErr) {
          console.error("Erro no processamento do Bot WhatsApp:", botErr);
          return Response.json(
            { ok: false, error: botErr instanceof Error ? botErr.message : "erro desconhecido" },
            { status: 500 },
          );
        }
      },
    },
  },
});
