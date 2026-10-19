/** Integração MisticPay (Pix). Docs: https://docs.misticpay.com */
const BASE = "https://api.misticpay.com/api";

export type MisticCreds = { clientId: string; clientSecret: string };

function headers(c: MisticCreds): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  // Chave de acesso nova (pk_/sk_) usa Basic; credencial antiga (ci_/cs_) usa headers ci/cs.
  if (c.clientId.startsWith("ci_") || c.clientSecret.startsWith("cs_")) {
    h.ci = c.clientId;
    h.cs = c.clientSecret;
  } else {
    h.Authorization = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`;
  }
  return h;
}

export async function createMisticPix(
  c: MisticCreds,
  p: { amount: number; payerName: string; payerDocument: string; transactionId: string; description: string; webhookUrl?: string },
) {
  try {
    const res = await fetch(`${BASE}/transactions/create`, {
      method: "POST",
      headers: headers(c),
      body: JSON.stringify({
        amount: p.amount,
        payerName: p.payerName.slice(0, 80),
        payerDocument: p.payerDocument,
        transactionId: p.transactionId,
        description: p.description,
        ...(p.webhookUrl ? { projectWebhook: p.webhookUrl } : {}),
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.data) {
      if (res.status === 401 || res.status === 403) return { ok: false as const, error: "Credenciais da MisticPay recusadas. Confira em Administração." };
      return { ok: false as const, error: json?.message || `MisticPay recusou (${res.status}).` };
    }
    const d = json.data;
    const b64 = String(d.qrCodeBase64 || "").replace(/^data:image\/\w+;base64,/, "");
    // Guarda o identificador que a MisticPay realmente usa (usa o dela quando
    // vier; senão mantém o transactionId que nós enviamos).
    const paymentId = String(d.transactionId || d.id || p.transactionId || "");
    return { ok: true as const, paymentId, qrCode: String(d.copyPaste || ""), qrCodeBase64: b64 || null };
  } catch {
    return { ok: false as const, error: "Não foi possível falar com a MisticPay." };
  }
}

const PAID_STATES = [
  "COMPLETO", "COMPLETA", "CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA",
  "PAGO", "PAGA", "APROVADO", "APROVADA", "APPROVED", "PAID", "SUCCESS", "SUCESSO", "LIQUIDADO",
];
const FAILED_STATES = [
  "FALHA", "ERRO", "ERROR", "CANCELADO", "CANCELADA", "CANCELED", "CANCELLED",
  "EXPIRADO", "EXPIRADA", "EXPIRED", "RECUSADO", "RECUSADA", "REJECTED", "ESTORNADO", "CHARGEBACK",
];

export type MisticTransactionState = "paid" | "failed" | "pending" | null;

/**
 * Traduz o estado devolvido pela MisticPay. Cada versão da API usa um nome
 * diferente ("COMPLETO", "PAGO", "FINALIZADO"...), por isso a comparação é feita
 * por palavras conhecidas em vez de um único texto exato.
 */
export function classifyMisticState(raw: unknown): MisticTransactionState {
  if (raw === null || raw === undefined) return null;
  const state = String(raw).trim().toUpperCase();
  if (!state) return null;
  if (PAID_STATES.includes(state)) return "paid";
  if (FAILED_STATES.includes(state)) return "failed";
  return "pending";
}

/** Consulta a transação e devolve paid | failed | pending (null = não deu para consultar). */
export async function checkMisticTransaction(c: MisticCreds, transactionId: string): Promise<MisticTransactionState> {
  try {
    const res = await fetch(`${BASE}/transactions/check`, {
      method: "POST",
      headers: headers(c),
      body: JSON.stringify({ transactionId }),
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => ({}));
    const raw =
      json?.transaction?.transactionState ??
      json?.transaction?.state ??
      json?.transaction?.status ??
      json?.data?.transactionState ??
      json?.data?.state ??
      json?.data?.status ??
      json?.transactionState ??
      json?.status;
    return classifyMisticState(raw);
  } catch {
    return null;
  }
}
