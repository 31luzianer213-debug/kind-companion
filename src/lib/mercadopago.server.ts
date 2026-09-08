/**
 * Serviço de Integração com Mercado Pago (PIX Dinâmico)
 * Cria cobranças PIX com QRCode Copia e Cola instantâneo e notificação via Webhook.
 */

export interface CreateMercadoPagoPixInput {
  token: string;
  amount: number;
  description: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  webhookUrl?: string;
}

export interface CreateMercadoPagoPixResult {
  ok: boolean;
  paymentId?: string;
  status?: string;
  qrCode?: string; // Pix Copia e Cola
  qrCodeBase64?: string; // Imagem base64 do QR Code
  ticketUrl?: string; // Link de pagamento web
  error?: string;
}

export async function createMercadoPagoPixPayment(
  input: CreateMercadoPagoPixInput,
): Promise<CreateMercadoPagoPixResult> {
  const token = input.token.trim();
  if (!token) {
    return { ok: false, error: "Token do Mercado Pago não configurado." };
  }

  // Sanitiza telefone
  const cleanPhone = input.customerPhone.replace(/\D/g, "");
  const ddd = cleanPhone.length >= 10 ? cleanPhone.slice(cleanPhone.length >= 12 ? 2 : 0, cleanPhone.length >= 12 ? 4 : 2) : "11";
  const phoneNum = cleanPhone.length >= 10 ? cleanPhone.slice(cleanPhone.length >= 12 ? 4 : 2) : cleanPhone || "999999999";

  // Divide nome do cliente
  const parts = (input.customerName || "Cliente IPTV").trim().split(" ");
  const firstName = parts[0] || "Cliente";
  const lastName = parts.slice(1).join(" ") || "VIP";

  const payload: any = {
    transaction_amount: Number(Number(input.amount).toFixed(2)),
    description: input.description.slice(0, 120),
    payment_method_id: "pix",
    external_reference: input.orderId,
    payer: {
      email: `${cleanPhone || "cliente"}@cobrancas-whatsapp.shop`,
      first_name: firstName,
      last_name: lastName,
      phone: {
        area_code: ddd,
        number: phoneNum,
      },
    },
  };

  if (input.webhookUrl) {
    payload.notification_url = input.webhookUrl;
  }

  try {
    const idempotencyKey = `ord_pix_${input.orderId}_${Date.now()}`;
    const res = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
        "User-Agent": "KindCompanion-IPTV/2.0 (MercadoPago Pix)",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.warn("Mercado Pago PIX error:", data);
      const errMsg = data.message || data.error || (data.cause && data.cause[0]?.description) || "Erro ao gerar PIX no Mercado Pago.";
      return { ok: false, error: errMsg };
    }

    const txData = data?.point_of_interaction?.transaction_data;
    const qrCode = txData?.qr_code;
    const qrCodeBase64 = txData?.qr_code_base64;
    const ticketUrl = txData?.ticket_url;

    return {
      ok: true,
      paymentId: String(data.id),
      status: data.status,
      qrCode,
      qrCodeBase64,
      ticketUrl,
    };
  } catch (err) {
    console.error("Exceção ao criar PIX Mercado Pago:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha na conexão com Mercado Pago.",
    };
  }
}
