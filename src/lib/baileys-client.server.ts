export function resolveBaileysApiUrl(
  explicitUrl?: string | null,
  portValue?: string | number | null,
): string {
  const configured = String(explicitUrl || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  const parsedPort = Number(portValue);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 3001;
  return `http://127.0.0.1:${port}`;
}

export const BAILEYS_API_URL = resolveBaileysApiUrl(
  process.env.BAILEYS_API_URL,
  process.env.BAILEYS_PORT,
);

export async function baileysFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = process.env.BAILEYS_API_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${BAILEYS_API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(8000),
  });
}
