import { evolutionBaseUrl } from "./evolution-url";

export const FALLBACK_EVOLUTION_INSTANCE = "iptv_ccd7362726074f97";

function isPlaceholderEnv(v: string | undefined) {
  if (!v) return true;
  const t = v.trim();
  if (!t) return true;
  if (t.includes("COLE_A")) return true;
  if (t.length < 5) return true;
  return false;
}

export function pickEnv(name: string, fallback = "") {
  const v = process.env[name];
  return isPlaceholderEnv(v) ? fallback : (v?.trim() ?? fallback);
}

export function normalizePhone(raw: string) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.endsWith("@lid") || trimmed.endsWith("@s.whatsapp.net")) {
    return trimmed;
  }
  let digits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  // remove DDI duplicado / prefixo de operadora
  if (digits.length > 13 && digits.startsWith("55")) digits = digits.slice(-13);
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return digits;
}

export function isValidBrPhone(raw: string) {
  const digits = normalizePhone(raw).replace(/\D/g, "");
  // 55 + DDD (2) + 8 ou 9 dígitos
  return digits.length === 12 || digits.length === 13;
}

export async function sendWhatsapp(to: string, text: string, instanceOverride?: string) {
  const base = pickEnv("EVOLUTION_API_URL", "https://cobrancas-whatsapp.shop");
  const instance = instanceOverride || pickEnv("EVOLUTION_INSTANCE", FALLBACK_EVOLUTION_INSTANCE);
  const apiKey = pickEnv("EVOLUTION_API_KEY", "evolutionApiGlobalTokenSecure2026");

  if (!base || !instance || !apiKey) {
    return { ok: false as const, error: "Evolution API não configurada" };
  }

  const normalized = normalizePhone(to);
  if (!normalized) {
    return {
      ok: false as const,
      error: "Número do cliente incompleto ou inválido — confira o WhatsApp dele",
    };
  }

  try {
    const url = `${evolutionBaseUrl(base)}/message/sendText/${encodeURIComponent(instance)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: normalized, text }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Evolution API falhou [${response.status}]: ${body}`);
      if (response.status === 400) {
        return {
          ok: false as const,
          error: "Este número não tem WhatsApp ou está escrito errado",
        };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false as const, error: "WhatsApp desconectado — gere o QR Code novamente" };
      }
      return { ok: false as const, error: `Evolution API [${response.status}]` };
    }

    return { ok: true as const };
  } catch (error) {
    console.error("Evolution API erro de rede", error);
    return { ok: false as const, error: "Falha de rede ao chamar a Evolution API" };
  }
}
