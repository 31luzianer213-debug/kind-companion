import { createFileRoute } from "@tanstack/react-router";
import { processIncomingWhatsAppEvent } from "@/lib/whatsapp-engine.server";

export const Route = createFileRoute("/api/public/hooks/whatsapp-bot")({
  server: {
    handlers: {
      GET: async () => {
        return new Response("WhatsApp Bot Webhook Active", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
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
        const queryUserId =
          url.searchParams.get("userId") ||
          url.searchParams.get("user_id") ||
          payload?.instance ||
          payload?.data?.instance;

        try {
          const result = await processIncomingWhatsAppEvent(payload, queryUserId);
          return Response.json({ ok: true, ...result });
        } catch (error: any) {
          console.error("[WhatsApp Bot Webhook] Erro ao processar evento:", error);
          return Response.json(
            { ok: false, error: error?.message || "Erro interno no servidor" },
            { status: 500 },
          );
        }
      },
    },
  },
});
