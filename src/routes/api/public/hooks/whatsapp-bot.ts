import { createFileRoute } from "@tanstack/react-router";
import { processIncomingWhatsAppEvent } from "@/lib/whatsapp-engine.server";

/** Comparação em tempo constante (evita descobrir o token por timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function consumeRateLimit(request: Request): boolean {
  try {
    const url = new URL(request.url);
    const key = `${request.headers.get("x-forwarded-for") || "local"}|${url.searchParams.get("userId") || "global"}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
      if (rateBuckets.size > 500) {
        for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
      }
      return true;
    }
    bucket.count += 1;
    return bucket.count <= RATE_MAX;
  } catch {
    return true;
  }
}

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
        // Fail-closed: sem token configurado o endpoint recusa tudo. Antes ele
        // aceitava POST de qualquer origem, e o dono da conta vinha de ?userId=
        // na URL — dava para forjar conversa e disparar pedido/Pix/liberação.
        const expectedToken = (process.env["WHATSAPP_WEBHOOK_TOKEN"] || "").trim();
        if (!expectedToken) {
          console.error(
            "[WhatsApp Bot Webhook] WHATSAPP_WEBHOOK_TOKEN não configurado — requisição recusada.",
          );
          return new Response("Webhook disabled: missing token", { status: 503 });
        }

        let sent = request.headers.get("x-webhook-token") || "";
        if (!sent) {
          const authHeader = request.headers.get("authorization") || "";
          if (authHeader.toLowerCase().startsWith("bearer ")) sent = authHeader.slice(7).trim();
        }
        const queryToken = new URL(request.url).searchParams.get("token");
        if (!sent) sent = queryToken || "";

        if (!timingSafeEqual(sent, expectedToken)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Freio simples contra abuso: cada origem só pode disparar 60 eventos
        // por minuto. Sem isso, um token vazado vira envio em massa e o número
        // do revendedor é bloqueado pelo WhatsApp.
        if (!consumeRateLimit(request)) {
          return new Response("Too many requests", { status: 429 });
        }

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
        const queryUserId = url.searchParams.get("userId") || url.searchParams.get("user_id");

        try {
          const result = await processIncomingWhatsAppEvent(payload, queryUserId);
          return Response.json({ ok: true, ...result });
        } catch (error: any) {
          console.error("[WhatsApp Bot Webhook] Erro ao processar evento:", error?.message || error);
          return Response.json(
            { ok: false, error: error?.message || "Erro interno no servidor" },
            { status: 500 },
          );
        }
      },
    },
  },
});
