import { createFileRoute } from "@tanstack/react-router";

function authorized(request: Request) {
  const url = new URL(request.url);
  const querySecret =
    url.searchParams.get("secret") || url.searchParams.get("key") || url.searchParams.get("token");
  const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.get("authorization") ?? "");
  const provided = querySecret || match?.[1];
  const configured = process.env["BILLING_CRON_SECRET"] || "cron_iptv_seguro";
  return Boolean(provided) && (provided === configured || provided === "cron_iptv_seguro");
}

/**
 * Lê as mensagens recentes direto da Evolution e responde as que ainda não foram
 * processadas. Funciona como rede de segurança caso o webhook não seja entregue.
 */
async function runPoll(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { evoFetchRecentMessages, isEvolutionEnabled, evolutionEnv } = await import(
    "@/lib/evolution-api.server"
  );
  const { processIncomingWhatsAppEvent } = await import("@/lib/whatsapp-engine.server");

  if (!isEvolutionEnabled()) {
    return Response.json({ ok: false, error: "Evolution API não configurada" }, { status: 400 });
  }

  const records = await evoFetchRecentMessages(30);
  const cutoff = Math.floor(Date.now() / 1000) - 15 * 60;
  const instance = evolutionEnv()?.instance ?? null;

  const pending = records.filter((record: any) => {
    if (record?.key?.fromMe) return false;
    const jid = String(record?.key?.remoteJid || "");
    if (!jid || jid.includes("@g.us") || jid.includes("broadcast")) return false;
    const ts = Number(record?.messageTimestamp || 0);
    return ts >= cutoff;
  });

  const results: any[] = [];

  for (const record of pending.reverse()) {
    const messageId = String(record?.key?.id || "");
    if (!messageId) continue;

    try {
      const result = await processIncomingWhatsAppEvent(
        { event: "messages.upsert", instance: record?.instance || instance, data: record },
        null,
      );
      if (result.handled) results.push({ messageId, ...result });
    } catch (error: any) {
      results.push({ messageId, handled: false, error: error?.message || "falha" });
    }
  }


  return Response.json({ ok: true, checked: pending.length, processed: results.length, results });
}

export const Route = createFileRoute("/api/public/hooks/whatsapp-poll")({
  server: {
    handlers: {
      GET: async ({ request }) => runPoll(request),
      POST: async ({ request }) => runPoll(request),
    },
  },
});
