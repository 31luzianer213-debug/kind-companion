import { createFileRoute } from "@tanstack/react-router";

function authorized(request: Request) {
  const url = new URL(request.url);
  const querySecret =
    url.searchParams.get("secret") || url.searchParams.get("key") || url.searchParams.get("token");
  const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.get("authorization") ?? "");
  const provided = querySecret || match?.[1];
  const configured = process.env["BILLING_CRON_SECRET"];
  return Boolean(configured) && Boolean(provided) && provided === configured;
}

/**
 * Lê as mensagens recentes direto da Evolution e responde as que ainda não foram
 * processadas. Funciona como rede de segurança caso o webhook não seja entregue.
 */
async function runPoll(request: Request) {
  // O webhook MESSAGES_UPSERT é o único processador oficial. O polling fica
  // desativado por padrão para não responder novamente mensagens já tratadas.
  if (process.env["WHATSAPP_POLL_ENABLED"] !== "true") {
    return Response.json({ ok: true, disabled: true, reason: "webhook_primary" });
  }

  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }

  const { isTenantEvolutionEnabled, tenantListInstances, tenantFetchRecentMessages } = await import(
    "@/lib/evolution-tenant.server"
  );
  const { processIncomingWhatsAppEvent } = await import("@/lib/whatsapp-engine.server");

  if (!isTenantEvolutionEnabled()) {
    return Response.json({ ok: false, error: "Evolution API não configurada" }, { status: 400 });
  }

  const instances = (await tenantListInstances().catch(() => []))
    .filter((item) => item.state === "open" && item.instance)
    .map((item) => item.instance);

  const cutoff = Math.floor(Date.now() / 1000) - 15 * 60;
  const results: any[] = [];
  let checked = 0;

  for (const instance of instances) {
    const records = await tenantFetchRecentMessages(instance, 30);
    const pending = records.filter((record: any) => {
      if (record?.key?.fromMe) return false;
      const jid = String(record?.key?.remoteJid || "");
      if (!jid || jid.includes("@g.us") || jid.includes("broadcast")) return false;
      const ts = Number(record?.messageTimestamp || 0);
      return ts >= cutoff;
    });
    checked += pending.length;

    for (const record of pending.reverse()) {
      const messageId = String(record?.key?.id || "");
      if (!messageId) continue;
      try {
        const result = await processIncomingWhatsAppEvent(
          { event: "messages.upsert", instance, data: record },
          null,
        );
        if (result.handled) results.push({ instance, messageId, ...result });
      } catch (error: any) {
        results.push({ instance, messageId, handled: false, error: error?.message || "falha" });
      }
    }
  }

  return Response.json({
    ok: true,
    instances: instances.length,
    checked,
    processed: results.length,
    results,
  });
}

export const Route = createFileRoute("/api/public/hooks/whatsapp-poll")({
  server: {
    handlers: {
      GET: async ({ request }) => runPoll(request),
      POST: async ({ request }) => runPoll(request),
    },
  },
});
