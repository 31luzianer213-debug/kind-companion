/** Acesso à Evolution API usando as credenciais globais do servidor. */

export function instanceNameFor(userId: string) {
  return `iptv_${userId.replace(/-/g, "").slice(0, 16)}`;
}

export function evolutionConfig(userId: string) {
  const base = (process.env["EVOLUTION_API_URL"] ?? "").replace(/\/+$/, "");
  const key = process.env["EVOLUTION_API_KEY"] ?? "";
  if (!base || !key) {
    throw new Error("Servidor do WhatsApp não configurado.");
  }
  return { base, key, instance: instanceNameFor(userId) };
}

async function call(
  path: string,
  init: RequestInit & { base: string; key: string },
): Promise<{ status: number; json: any; raw: string }> {
  const { base, key, ...rest } = init;
  const res = await fetch(`${base}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", apikey: key, ...(rest.headers ?? {}) },
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  return { status: res.status, json, raw };
}

/** open | connecting | close | none */
export async function fetchState(userId: string) {
  const { base, key, instance } = evolutionConfig(userId);
  const { status, json } = await call(`/instance/connectionState/${instance}`, {
    method: "GET",
    base,
    key,
  });
  if (status === 404) return "none" as const;
  const state = json?.instance?.state ?? json?.state ?? "close";
  return state as "open" | "connecting" | "close";
}

function extractQr(json: any) {
  const base64 = json?.qrcode?.base64 ?? json?.base64 ?? null;
  const code = json?.qrcode?.code ?? json?.code ?? null;
  return { base64, code };
}

/** Cria a instância se necessário e devolve o QR Code para leitura. */
export async function connectInstance(userId: string) {
  const { base, key, instance } = evolutionConfig(userId);
  const state = await fetchState(userId);
  if (state === "open") return { state: "open" as const, qr: null };

  if (state === "none") {
    const created = await call(`/instance/create`, {
      method: "POST",
      base,
      key,
      body: JSON.stringify({
        instanceName: instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    const qr = extractQr(created.json);
    if (qr.base64) return { state: "connecting" as const, qr };
  }

  const connected = await call(`/instance/connect/${instance}`, { method: "GET", base, key });
  if (connected.status >= 400) {
    throw new Error(`Erro ${connected.status}: ${connected.raw.slice(0, 200)}`);
  }
  return { state: "connecting" as const, qr: extractQr(connected.json) };
}

/** Desconecta o número do WhatsApp mantendo a instância criada. */
export async function logoutInstance(userId: string) {
  const { base, key, instance } = evolutionConfig(userId);
  await call(`/instance/logout/${instance}`, { method: "DELETE", base, key });
  return true;
}
