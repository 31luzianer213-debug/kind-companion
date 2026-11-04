export function isSafeInstanceId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}
export function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left ?? ""), "utf8");
  const b = Buffer.from(String(right ?? ""), "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export function isAuthorizedRequest(request, token, loopbackOnly) {
  if (!token) return loopbackOnly === true;
  const match = /^Bearer ([^\s,]+)$/i.exec(String(request.headers?.authorization ?? ""));
  return Boolean(match && constantTimeEqual(match[1], token));
}
export function normalizePrivateRecipient(raw) {
  if (!raw) return "";
  const value = String(raw).trim();
  if (value.endsWith("@g.us") || value.endsWith("@lid")) return "";
  const bare = value.endsWith("@s.whatsapp.net") ? value.slice(0, -"@s.whatsapp.net".length) : value;
  let digits = bare.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  return `${digits}@s.whatsapp.net`;
}
export function readJsonBody(request, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = (message, statusCode) => {
      if (settled) return;
      settled = true;
      const error = new Error(message);
      error.statusCode = statusCode;
      reject(error);
    };
    request.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) { fail("Corpo da requisição excede o limite.", 413); return; }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error("JSON inválido.");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", (error) => fail(error.message || "Falha ao ler a requisição.", 400));
  });
}
