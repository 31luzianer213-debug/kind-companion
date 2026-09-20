import { addMonths } from "date-fns";
import { generateM3uUrl, generateEpgUrl, extractCleanIptvDns } from "./format";
import type { SigmaConfig } from "./sigma.panel";
import { sendViaBaileys } from "./billing.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type OrderItem = {
  id: string;
  user_id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  plan_name: string;
  amount: number;
  duration_months: number;
  screens: number;
  status: "pending" | "approved" | "cancelled";
  type: "new_access" | "renewal";
  target_username?: string;
  payment_method: string;
  gateway_payment_id?: string;
  pix_code?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
};

export function getCanonicalUserId(userId?: string): string {
  if (!userId || userId === "default") return "default";
  const clean = userId.replace(/^iptv_/i, "").replace(/[^a-zA-Z0-9]/g, "");
  return clean.slice(0, 16) || "default";
}

function mapRow(row: any): OrderItem {
  return {
    ...row,
    amount: Number(row.amount) || 0,
    duration_months: Number(row.duration_months) || 1,
    screens: Number(row.screens) || 1,
    order_number: Number(row.order_number) || 0,
  } as OrderItem;
}

/** Lê os pedidos direto do banco (fonte única de verdade). */
export async function readOrders(userId: string): Promise<OrderItem[]> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao ler pedidos: ${error.message}`);
  return (data ?? []).map(mapRow);
}

async function getOrder(userId: string, orderId: string): Promise<OrderItem | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler o pedido: ${error.message}`);
  return data ? mapRow(data) : null;
}

export async function updateOrderServer(
  userId: string,
  orderId: string,
  updates: Partial<OrderItem>,
): Promise<OrderItem | null> {
  const { id: _ignoredId, user_id: _ignoredUser, created_at: _ignoredCreated, ...patch } = updates as any;
  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", orderId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Falha ao atualizar o pedido: ${error.message}`);
  return data ? mapRow(data) : null;
}


/** Cria um novo pedido (novo acesso ou renovação) */
export async function createOrderServer(
  userId: string,
  params: {
    customer_name: string;
    customer_phone: string;
    plan_name: string;
    amount: number;
    duration_months?: number;
    screens?: number;
    type?: "new_access" | "renewal";
    target_username?: string;
    payment_method?: string;
    gateway_payment_id?: string;
    pix_code?: string;
    notes?: string;
  },
): Promise<OrderItem> {
  const { data: lastOrder } = await supabaseAdmin
    .from("orders")
    .select("order_number")
    .eq("user_id", userId)
    .order("order_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNumber = Math.max(1000, Number(lastOrder?.order_number) || 1000) + 1;

  const newOrder: OrderItem = {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: userId,
    order_number: nextNumber,
    customer_name: params.customer_name || "Cliente",
    customer_phone: params.customer_phone.replace(/\D/g, ""),
    plan_name: params.plan_name,
    amount: Number(params.amount) || 35.0,
    duration_months: params.duration_months || 1,
    screens: params.screens || 1,
    status: "pending",
    type: params.type || "new_access",
    target_username: params.target_username,
    payment_method: params.payment_method || "pix",
    gateway_payment_id: params.gateway_payment_id,
    pix_code: params.pix_code,
    notes: params.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("orders")
    .insert({
      id: newOrder.id,
      user_id: userId,
      order_number: newOrder.order_number,
      customer_name: newOrder.customer_name,
      customer_phone: newOrder.customer_phone,
      plan_name: newOrder.plan_name,
      amount: newOrder.amount,
      duration_months: newOrder.duration_months,
      screens: newOrder.screens,
      status: newOrder.status,
      type: newOrder.type,
      target_username: newOrder.target_username,
      payment_method: newOrder.payment_method,
      gateway_payment_id: newOrder.gateway_payment_id,
      pix_code: newOrder.pix_code,
      notes: newOrder.notes,
    })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Falha ao salvar o pedido: ${error.message}`);
  return data ? mapRow(data) : newOrder;
}

/** Lista os pedidos do revendedor (direto do banco) */
export async function listOrdersServer(
  userId: string,
  filterStatus?: string,
): Promise<OrderItem[]> {
  const list = await readOrders(userId);
  return filterStatus && filterStatus !== "all"
    ? list.filter((o) => o.status === filterStatus)
    : list;
}


/**
 * Aprova o pedido e libera o acesso no Sigma e WhatsApp.
 * Pode ser chamado:
 * 1. Pelo Admin no painel ao clicar em "Confirmar PIX & Liberar Acesso"
 * 2. Automaticamente pelo Webhook do Mercado Pago quando o PIX for pago.
 */
export async function approveAndReleaseOrderServer(
  userId: string,
  orderId: string,
): Promise<{
  ok: boolean;
  message: string;
  order?: OrderItem;
  username?: string;
  password?: string;
  m3uUrl?: string;
}> {
  const order = await getOrder(userId, orderId);
  if (!order) {
    return { ok: false, message: "Pedido não encontrado." };
  }

  if (order.status === "approved") {
    return { ok: true, message: "Este pedido já foi liberado anteriormente.", order };
  }


  // 1. Carrega configurações do revendedor (Sigma e WhatsApp)
  let wsRow: any = null;
  try {
    const { data } = await supabaseAdmin
      .from("whatsapp_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    wsRow = data;
  } catch {}

  const panelUrl = wsRow?.sigma_url?.trim() || "";
  const panelToken = wsRow?.sigma_token || null;
  const panelUser = wsRow?.sigma_username || "";
  const panelPass = wsRow?.sigma_password || "";
  const serverName = wsRow?.sigma_server_name?.trim() || wsRow?.business_name || "Meu Servidor";
  const streamingDns = wsRow?.sigma_streaming_dns?.trim() || "";
  const cleanDns = extractCleanIptvDns(streamingDns) || "";

  if (!panelUrl || !(panelToken || (panelUser && panelPass))) {
    return {
      ok: false,
      message: "Configure o Painel Sigma (URL e credenciais) em Sigma antes de liberar pedidos.",
      order,
    };
  }
  if (!cleanDns) {
    return {
      ok: false,
      message: "Informe o DNS de streaming do seu servidor em Sigma para gerar a lista M3U do cliente.",
      order,
    };
  }

  const durationMonths = order.duration_months || 1;
  const expiryDate = addMonths(new Date(), durationMonths);
  const expiryIso = expiryDate.toISOString().slice(0, 10);

  let username = order.target_username;
  let password = Math.floor(100000 + Math.random() * 900000).toString();

  // Se é novo acesso, gera usuário aleatório de 8 dígitos caso não tenha sido informado
  if (order.type === "new_access" || !username) {
    username = Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  // 2. Cria ou renova a linha no Painel Sigma
  if (panelUrl && (panelToken || (panelUser && panelPass))) {
    try {
      const { createSigmaCustomer, renewSigmaCustomer } = await import("./sigma.panel");
      const sigmaConfig: SigmaConfig = {
        url: panelUrl,
        token: panelToken,
        username: panelUser,
        password: panelPass,
      };

      if (order.type === "renewal" && order.target_username) {
        // Tenta renovar a linha existente
        try {
          await renewSigmaCustomer(sigmaConfig, { username: order.target_username }, durationMonths);
        } catch (renErr) {
          console.warn("Aviso ao renovar no Sigma (prosseguindo localmente):", renErr);
        }
      } else {
        // Cria a nova linha no Sigma
        await createSigmaCustomer(sigmaConfig, {
          name: order.customer_name,
          username,
          password,
          phone: order.customer_phone,
          screens: order.screens || 1,
          dueDate: expiryIso,
          notes: `Liberado via Pedido #${order.order_number} (${order.plan_name})`,
        });
      }
    } catch (sigmaErr) {
      console.warn("Aviso ao sincronizar linha no Sigma:", sigmaErr);
    }
  }

  // 3. Gera URLs completas M3U Plus e EPG
  const m3uUrl = generateM3uUrl(cleanDns, username, password, "ts");
  const epgUrl = generateEpgUrl(cleanDns, username, password);

  // 4. Cadastra ou atualiza na tabela `clients`
  let clientWarning = "";
  try {
    const { data: existingClient } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .or(`iptv_username.eq.${username},phone.eq.${order.customer_phone}`)
      .limit(1)
      .maybeSingle();

    if (existingClient?.id) {
      const { error: updErr } = await supabaseAdmin
        .from("clients")
        .update({
          status: "active",
          next_due_date: expiryIso,
          monthly_fee: order.amount,
          notes: `M3U: ${m3uUrl}\nServidor: ${serverName}\nPedido #${order.order_number}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingClient.id);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await supabaseAdmin.from("clients").insert({
        user_id: userId,
        name: order.customer_name,
        phone: order.customer_phone,
        iptv_username: username,
        iptv_password: password,
        screens: order.screens || 1,
        monthly_fee: order.amount,
        due_day: new Date().getDate(),
        next_due_date: expiryIso,
        status: "active",
        notes: `M3U: ${m3uUrl}\nServidor: ${serverName}\nPedido #${order.order_number}`,
      });
      if (insErr) throw new Error(insErr.message);
    }
  } catch (dbErr) {
    clientWarning = dbErr instanceof Error ? dbErr.message : "erro desconhecido";
    console.warn("Aviso ao salvar cliente no banco:", dbErr);
  }


  // 5. Dispara a mensagem de liberação no WhatsApp do cliente
  let accessMessage = "";
  if (order.type === "renewal") {
    accessMessage =
      `🎉 *ASSINATURA RENOVADA COM SUCESSO!* 🍿\n\n` +
      `Olá, *${order.customer_name}*! Confirmamos o seu pagamento.\n\n` +
      `📦 *Plano:* ${order.plan_name}\n` +
      `🔑 *Usuário:* *${username}*\n` +
      `📅 *Novo Vencimento:* ${expiryIso}\n` +
      `📺 *Servidor:* ${serverName}\n` +
      `🖥️ *Telas:* ${order.screens} Tela(s)\n\n` +
      `🔗 *Sua Lista M3U Plus:*\n${m3uUrl}\n\n` +
      `Muito obrigado pela preferência! Bom divertimento. 🍿`;
  } else {
    accessMessage =
      `🎉 *SEU ACESSO ESTÁ LIBERADO!* 🍿\n\n` +
      `Olá, *${order.customer_name}*! Seja muito bem-vindo(a)!\n` +
      `Confirmamos seu pedido *#${order.order_number}* (${order.plan_name}).\n\n` +
      `📺 *Servidor:* ${serverName}\n` +
      `🌐 *URL / DNS:* ${cleanDns}\n` +
      `🔑 *Usuário:* *${username}*\n` +
      `🔒 *Senha:* *${password}*\n` +
      `🖥️ *Telas:* ${order.screens} Tela(s)\n` +
      `📅 *Vencimento:* ${expiryIso}\n\n` +
      `🔗 *Lista M3U Plus Completa:*\n${m3uUrl}\n\n` +
      `📺 *Guia de Canais (EPG):*\n${epgUrl}\n\n` +
      `📱 *Como Conectar:*\n` +
      `• No IPTV Smarters Pro, XCIPTV ou TiviMate: use a opção *Xtream Codes API* com o Servidor, Usuário e Senha acima.\n` +
      `• Em Smart TVs ou SS IPTV: adicione a *Lista M3U Plus* completa acima.\n\n` +
      `Qualquer dúvida, estamos sempre à disposição aqui no WhatsApp! 🍿`;
  }

  let whatsappSent = false;
  let whatsappWarning = "";
  try {
    const sendResult: any = await sendViaBaileys(order.customer_phone, accessMessage);
    whatsappSent = sendResult === undefined ? true : Boolean(sendResult?.ok ?? true);
    if (!whatsappSent) whatsappWarning = sendResult?.error || "WhatsApp não conectado";
  } catch (sendErr) {
    whatsappWarning = sendErr instanceof Error ? sendErr.message : "falha ao enviar";
    console.error("Aviso ao enviar mensagem de acesso via WhatsApp:", sendErr);
  }

  // 6. Atualiza o status do pedido para 'approved'
  const approvedNotes = `${order.notes ? order.notes + " | " : ""}Liberado em ${new Date().toLocaleString()}`;
  const updated = await updateOrderServer(userId, orderId, {
    status: "approved",
    target_username: username,
    notes: approvedNotes,
  });

  return {
    ok: true,
    message:
      `Pedido #${order.order_number} aprovado e acesso liberado.` +
      (whatsappSent
        ? " Os dados foram enviados no WhatsApp do cliente."
        : ` Não foi possível enviar no WhatsApp (${whatsappWarning}). Envie os dados manualmente.`) +
      (clientWarning ? ` Atenção: não foi possível salvar o cliente (${clientWarning}).` : ""),
    order: updated ?? { ...order, status: "approved", target_username: username, notes: approvedNotes },
    username,
    password,
    m3uUrl,

  };
}

/** Cancela um pedido */
export async function cancelOrderServer(
  userId: string,
  orderId: string,
): Promise<{ ok: boolean; message: string }> {
  const updated = await updateOrderServer(userId, orderId, { status: "cancelled" });
  if (!updated) return { ok: false, message: "Pedido não encontrado." };
  return { ok: true, message: "Pedido cancelado com sucesso." };
}

/** Exclui permanentemente um pedido do sistema */
export async function deleteOrderServer(
  userId: string,
  orderId: string,
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabaseAdmin
    .from("orders")
    .delete()
    .eq("user_id", userId)
    .eq("id", orderId);
  if (error) return { ok: false, message: `Falha ao excluir o pedido: ${error.message}` };
  return { ok: true, message: "Pedido excluído com sucesso!" };
}

/** Exclui múltiplos pedidos de uma vez (ou limpa todos os cancelados) */
export async function bulkDeleteOrdersServer(
  userId: string,
  orderIds: string[],
): Promise<{ ok: boolean; message: string; count: number }> {
  if (!orderIds || orderIds.length === 0) {
    return { ok: true, message: "Nenhum pedido para excluir.", count: 0 };
  }

  const { error } = await supabaseAdmin
    .from("orders")
    .delete()
    .eq("user_id", userId)
    .in("id", orderIds);
  if (error) return { ok: false, message: `Falha ao excluir os pedidos: ${error.message}`, count: 0 };

  return { ok: true, message: `${orderIds.length} pedidos excluídos permanentemente.`, count: orderIds.length };
}
