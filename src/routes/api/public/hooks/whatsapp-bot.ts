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

        console.log("[WhatsApp Bot Webhook] Evento recebido da Evolution API:", {
          event: payload?.event,
          instance: payload?.instance,
        });

        const url = new URL(request.url);
        let targetUserId = url.searchParams.get("userId") || url.searchParams.get("user_id");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processBotMessage, loadBotConfig } = await import("@/lib/bot.server");
        const { sendViaEvolution } = await import("@/lib/billing.server");
        const { instanceNameFor } = await import("@/lib/evolution.server");

        // Extrai dados da mensagem da Evolution API (compatível com v1, v2 e Baileys)
        const rawData = payload?.data ?? payload;
        const item = Array.isArray(rawData?.messages)
          ? rawData.messages[0]
          : (rawData?.message ? rawData : (payload?.message ? payload : rawData));

        const instance = String(payload?.instance ?? item?.instance ?? rawData?.instance ?? "").trim();

        // Se não passou userId na query string, tenta localizar pela instância ou buscar usuário ativo
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

          if (!targetUserId) {
            try {
              const { data: profs } = await supabaseAdmin.from("profiles").select("id");
              for (const p of profs ?? []) {
                if (instanceNameFor(p.id) === instance) {
                  targetUserId = p.id;
                  break;
                }
              }
            } catch {}
          }
        }

        // Se ainda não encontrou e só há uma conta no sistema, usa a primeira
        if (!targetUserId) {
          try {
            const { data: firstAccount } = await supabaseAdmin
              .from("whatsapp_settings")
              .select("user_id")
              .limit(1)
              .maybeSingle();
            if (firstAccount?.user_id) {
              targetUserId = firstAccount.user_id;
            }
          } catch {}
        }

        if (!targetUserId) {
          try {
            const { data: firstProf } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .limit(1)
              .maybeSingle();
            if (firstProf?.id) {
              targetUserId = firstProf.id;
            }
          } catch {}
        }

        // Se ainda assim não houver userId no banco, usa fallback padrão
        if (!targetUserId) {
          targetUserId = "00000000-0000-0000-0000-000000000000";
        }

        // Filtra mensagens próprias (fromMe)
        const key = item?.key ?? rawData?.key ?? payload?.key ?? {};
        const fromMe = Boolean(key?.fromMe ?? item?.fromMe ?? rawData?.fromMe);
        if (fromMe) {
          return Response.json({ ok: true, ignored: "from_me" });
        }

        // Filtra mensagens de grupo (@g.us ou @broadcast)
        const remoteJid = String(
          key?.remoteJid ||
          key?.participant ||
          item?.remoteJid ||
          rawData?.remoteJid ||
          payload?.sender ||
          ""
        );

        if (!remoteJid || remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
          return Response.json({ ok: true, ignored: "group_or_missing_jid" });
        }

        const senderPhone = remoteJid.replace(/@.+$/, "").replace(/\D/g, "");
        if (!senderPhone || senderPhone.length < 8) {
          return Response.json({ ok: true, ignored: "invalid_sender_phone" });
        }

        const pushName = item?.pushName || rawData?.pushName || payload?.pushName || "Cliente";

        // Extrai o conteúdo do texto enviado pelo cliente (todos os formatos conhecidos)
        const messageObj = item?.message ?? rawData?.message ?? payload?.message ?? {};
        const incomingText = String(
          messageObj?.conversation ||
          messageObj?.extendedTextMessage?.text ||
          messageObj?.buttonsResponseMessage?.selectedButtonId ||
          messageObj?.buttonsResponseMessage?.selectedDisplayText ||
          messageObj?.listResponseMessage?.singleSelectReply?.selectedRowId ||
          messageObj?.listResponseMessage?.title ||
          messageObj?.templateButtonReplyMessage?.selectedId ||
          messageObj?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
          item?.body ||
          rawData?.body ||
          payload?.body ||
          ""
        ).trim();

        if (!incomingText) {
          return Response.json({ ok: true, ignored: "empty_text" });
        }

        console.log(`[WhatsApp Bot Webhook] Mensagem de ${senderPhone} (${pushName}): "${incomingText}"`);

        // Verifica se o bot está ativo para o usuário
        const botConfig = await loadBotConfig(supabaseAdmin, targetUserId);
        if (!botConfig.enabled) {
          console.log("[WhatsApp Bot Webhook] Robô desativado nas configurações.");
          return Response.json({ ok: true, ignored: "bot_disabled" });
        }

        try {
          const botResult = await processBotMessage(supabaseAdmin, targetUserId, {
            phone: senderPhone,
            text: incomingText,
            pushName,
          });

          if (botResult?.reply) {
            console.log(`[WhatsApp Bot Webhook] Respondendo para ${senderPhone}: "${botResult.reply.slice(0, 80)}..."`);

            // Busca configurações da conta para envio
            let settings: any = null;
            try {
              const { data: s } = await supabaseAdmin
                .from("whatsapp_settings")
                .select("*")
                .eq("user_id", targetUserId)
                .maybeSingle();
              settings = s;
            } catch {}

            try {
              const { sendViaEvolution } = await import("@/lib/billing.server");
              await sendViaEvolution(settings ?? {}, senderPhone, botResult.reply, targetUserId);
              console.log(`[WhatsApp Bot Webhook] Resposta em texto enviada com sucesso para ${senderPhone}!`);
            } catch (sendErr) {
              console.error("[WhatsApp Bot Webhook] Erro ao enviar resposta via Evolution:", sendErr);
            }

            // Registra nos logs da conta
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
          console.error("[WhatsApp Bot Webhook] Erro no processamento da mensagem:", botErr);
          return Response.json(
            { ok: false, error: botErr instanceof Error ? botErr.message : "erro desconhecido" },
            { status: 200 },
          );
        }
      },
    },
  },
});
