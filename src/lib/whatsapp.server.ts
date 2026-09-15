const BAILEYS_PORT = process.env.BAILEYS_PORT ? Number(process.env.BAILEYS_PORT) : 3001;
const BAILEYS_URL = process.env.BAILEYS_API_URL || `http://127.0.0.1:${BAILEYS_PORT}`;

export function normalizePhone(raw: string) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.endsWith("@lid") || trimmed.endsWith("@s.whatsapp.net")) {
    return trimmed;
  }
  let digits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length > 13 && digits.startsWith("55")) digits = digits.slice(-13);
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return digits;
}

export function isValidBrPhone(raw: string) {
  const digits = normalizePhone(raw).replace(/\D/g, "");
  return digits.length === 12 || digits.length === 13;
}

/** Envia mensagem usando exclusivamente a instância recebida quando houver Evolution. */
export async function sendWhatsapp(to: string, text: string, instance?: string) {
  const normalized = normalizePhone(to);
  if (!normalized) {
    return {
      ok: false as const,
      error: "Número do cliente incompleto ou inválido — confira o WhatsApp dele",
    };
  }

  const tenant = await import("./evolution-tenant.server");
  if (tenant.isTenantEvolutionEnabled()) {
    if (!instance) {
      return {
        ok: false as const,
        error: "Instância do WhatsApp não informada para este usuário.",
      };
    }
    const res = await tenant.tenantSendText(instance, normalized, text, true);
    return res.ok
      ? { ok: true as const }
      : { ok: false as const, error: res.error || "Falha no envio pela Evolution API" };
  }

  try {
    const response = await fetch(`${BAILEYS_URL}/api/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: normalized, text, instance }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      console.error(`[Baileys sendWhatsapp] Falha:`, data.error || response.statusText);
      return {
        ok: false as const,
        error: data.error || `Baileys falhou [${response.status}]`,
      };
    }

    return { ok: true as const };
  } catch (error: any) {
    console.error("[Baileys sendWhatsapp] Erro de rede:", error?.message);
    return {
      ok: false as const,
      error: "Motor Baileys não está respondendo. Conecte o WhatsApp pelo painel.",
    };
  }
}
