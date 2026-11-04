/** Integração MisticPay (Pix). Docs: https://docs.misticpay.com */
import { createHash } from "node:crypto";

const BASE = "https://api.misticpay.com/api";

export type MisticCreds = { clientId: string; clientSecret: string };
export type MisticTransactionState = "paid" | "failed" | "pending" | null;
export type MisticTransactionDetails = {
  transactionId: string;
  value: number;
  transactionType: string;
  state: MisticTransactionState;
};

/** Chave curta e estável usada no retry da mesma cobrança MisticPay. */
export function misticPayPixIdempotencyKey(transactionId: string): string {
  const normalized = String(transactionId || "").trim();
  if (!normalized) throw new Error("ID da transação é obrigatório para gerar a chave de idempotência.");
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 48);
  return `misticpay_pix_${digest}`;
}

export function isModernMisticCredentialPair(clientId: string, clientSecret: string): boolean {
  return /^pk_[A-Za-z0-9_-]{8,}$/.test(clientId) && /^sk_[A-Za-z0-9_-]{8,}$/.test(clientSecret);
}

function headers(credentials: MisticCreds): Record<string, string> {
  if (!isModernMisticCredentialPair(credentials.clientId, credentials.clientSecret)) {
    throw new Error(
      "A MisticPay desativou as credenciais antigas ci_/cs_. Gere uma nova Chave de Acesso pk_/sk_ com as permissões TRANSACTION_CREATE e TRANSACTION_READ.",
    );
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
  };
}

export async function createMisticPix(
  credentials: MisticCreds,
  input: {
    amount: number;
    payerName: string;
    payerDocument: string;
    transactionId: string;
    description: string;
    webhookUrl?: string;
  },
) {
  try {
    const response = await fetch(`${BASE}/transactions/create`, {
      method: "POST",
      headers: {
        ...headers(credentials),
        "X-Idempotency-Key": misticPayPixIdempotencyKey(input.transactionId),
      },
      body: JSON.stringify({
        amount: input.amount,
        payerName: input.payerName.slice(0, 80),
        payerDocument: input.payerDocument,
        transactionId: input.transactionId,
        description: input.description,
        ...(input.webhookUrl ? { projectWebhook: input.webhookUrl } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    const json: any = await response.json().catch(() => ({}));
    if (!response.ok || !json?.data) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false as const, error: "Credenciais MisticPay recusadas ou sem escopo TRANSACTION_CREATE." };
      }
      return { ok: false as const, error: json?.message || `MisticPay recusou (${response.status}).` };
    }
    const data = json.data;
    const qrCodeBase64 = String(data.qrCodeBase64 || "").replace(/^data:image\/\w+;base64,/, "");
    const paymentId = String(data.transactionId || data.id || input.transactionId || "");
    return {
      ok: true as const,
      paymentId,
      qrCode: String(data.copyPaste || ""),
      qrCodeBase64: qrCodeBase64 || null,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Não foi possível falar com a MisticPay.",
    };
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

export function classifyMisticState(raw: unknown): MisticTransactionState {
  if (raw === null || raw === undefined) return null;
  const state = String(raw).trim().toUpperCase();
  if (!state) return null;
  if (PAID_STATES.includes(state)) return "paid";
  if (FAILED_STATES.includes(state)) return "failed";
  return "pending";
}

/** Consulta a transação e devolve os dados do próprio provedor, não do webhook. */
export async function fetchMisticTransaction(
  credentials: MisticCreds,
  transactionId: string,
): Promise<MisticTransactionDetails | null> {
  try {
    const response = await fetch(`${BASE}/transactions/check`, {
      method: "POST",
      headers: headers(credentials),
      body: JSON.stringify({ transactionId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const json: any = await response.json().catch(() => ({}));
    const transaction = json?.transaction ?? json?.data?.transaction ?? json?.data ?? json;
    const rawState =
      transaction?.transactionState ??
      transaction?.state ??
      transaction?.status ??
      json?.transactionState ??
      json?.status;
    const id = String(transaction?.transactionId ?? transaction?.id ?? "");
    const value = Number(transaction?.value ?? transaction?.amount ?? transaction?.transactionAmount);
    const type = String(transaction?.transactionType ?? transaction?.type ?? "").toUpperCase();

    if (!id || !Number.isFinite(value) || value <= 0 || !type) return null;
    return { transactionId: id, value, transactionType: type, state: classifyMisticState(rawState) };
  } catch {
    return null;
  }
}

/** Compatibilidade para consumidores que precisam apenas do status. */
export async function checkMisticTransaction(
  credentials: MisticCreds,
  transactionId: string,
): Promise<MisticTransactionState> {
  const transaction = await fetchMisticTransaction(credentials, transactionId);
  return transaction?.state ?? null;
}
