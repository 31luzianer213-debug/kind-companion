import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/telegram")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Telegram Bot Webhook Active", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),

      POST: async ({ request }) => {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId") || "";
        if (!userId) return new Response("Missing userId", { status: 400 });

        const { getTelegramRow, processTelegramUpdate } = await import("@/lib/telegram.server");

        const row = await getTelegramRow(userId);
        if (!row?.bot_token || !row?.webhook_secret) {
          return new Response("Not configured", { status: 404 });
        }

        const sent = request.headers.get("x-telegram-bot-api-secret-token") || "";
        if (sent !== row.webhook_secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: any = null;
        try {
          update = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        try {
          const result = await processTelegramUpdate(userId, update);
          return Response.json({ ok: true, ...result });
        } catch (error: any) {
          console.error("[Telegram Webhook] Erro:", error?.message || error);
          // Responde 200 para o Telegram não reenviar indefinidamente.
          return Response.json({ ok: false, error: error?.message || "Erro interno" });
        }
      },
    },
  },
});
