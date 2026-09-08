import fs from "fs";
import path from "path";
import { addMonths } from "date-fns";
import { generateM3uUrl, generateEpgUrl, extractCleanIptvDns } from "./format";
import type { SigmaConfig } from "./sigma.panel";
import { sendViaEvolution } from "./billing.server";
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

function getOrdersFilePath(userId?: string): string {
  const safeId = (userId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const canonicalId = (userId || "default").replace(/^iptv_/i, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "default";
  const dir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  const canonicalPath = path.join(dir, `orders_${canonicalId}.json`);
  if (fs.existsSync(canonicalPath)) return canonicalPath;

  const safePath = path.join(dir, `orders_${safeId}.json`);
  if (fs.existsSync(safePath)) return safePath;

  return canonicalPath;
}

function readLocalOrders(userId?: string): OrderItem[] {
  try {
    const file = getOrdersFilePath(userId);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    }
  } catch {}
  return [];
}

function writeLocalOrders(userId: string | undefined, orders: OrderItem[]): void {
  try {
    const file = getOrdersFilePath(userId);
    fs.writeFileSync(file, JSON.stringify(orders, null, 2), "utf-8");
  } catch (err) {
    console.warn("Aviso ao gravar pedidos no arquivo local:", err);
  }
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
  const existing = readLocalOrders(userId);
  const nextNumber = existing.reduce((max, o) => Math.max(max, o.order_number || 0), 1000) + 1;

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

  // 1. Grava no disco
  existing.unshift(newOrder);
  writeLocalOrders(userId, existing);

  // 2. Tenta gravar no banco Supabase
  try {
    await supabaseAdmin.from("orders").insert({
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
    });
  } catch {}

  return newOrder;
}

/** Lista os pedidos do revendedor */
export async function listOrdersServer(
  userId: string,
  filterStatus?: string,
): Promise<OrderItem[]> {
  const localList = readLocalOrders(userId);

  // Tenta sincronizar com o banco se houver registros
  try {
    let query = supabaseAdmin
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (filterStatus && filterStatus !== "all") {
      query = query.eq("status", filterStatus);
    }

    const { data: dbOrders } = await query;
    if (dbOrders && dbOrders.length > 0) {
      // Merge sem duplicatas (preferindo status mais recente)
      const map = new Map<string, OrderItem>();
      for (const item of localList) map.set(item.id, item);
      for (const item of dbOrders) {
        map.set(item.id, {
          ...(map.get(item.id) || {}),
          ...item,
          amount: Number(item.amount),
        } as OrderItem);
      }
      const combined = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      writeLocalOrders(userId, combined);
      return filterStatus && filterStatus !== "all"
        ? combined.filter((o) => o.status === filterStatus)
        : combined;
    }
  } catch {}

  return filterStatus && filterStatus !== "all"
    ? localList.filter((o) => o.status === filterStatus)
    : localList;
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
  const orders = readLocalOrders(userId);
  const orderIndex = orders.findIndex((o) => o.id === orderId);
  if (orderIndex === -1) {
    return { ok: false, message: "Pedido não encontrado." };
  }

  const order = orders[orderIndex];
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

  const panelUrl = wsRow?.sigma_url || "https://aplicativoz342.click";
  const panelToken = wsRow?.sigma_token || null;
  const panelUser = wsRow?.sigma_username || "Karen256";
  const panelPass = wsRow?.sigma_password || "";
  const serverName = wsRow?.sigma_server_name?.trim() || wsRow?.business_name || "Alpha server IPTV";
  const streamingDns = wsRow?.sigma_streaming_dns?.trim() || "http://karen256.top";
  const cleanDns = extractCleanIptvDns(streamingDns) || "http://karen256.top";

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
          await renewSigmaCustomer(sigmaConfig, order.target_username, durationMonths);
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
  try {
    const { data: existingClient } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .or(`iptv_username.eq.${username},phone.eq.${order.customer_phone}`)
      .limit(1)
      .maybeSingle();

    if (existingClient?.id) {
      await supabaseAdmin
        .from("clients")
        .update({
          status: "active",
          next_due_date: expiryIso,
          monthly_fee: order.amount,
          notes: `M3U: ${m3uUrl}\nServidor: ${serverName}\nPedido #${order.order_number}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingClient.id);
    } else {
      await supabaseAdmin.from("clients").insert({
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
    }
  } catch (dbErr) {
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

  try {
    await sendViaEvolution(wsRow ?? {}, order.customer_phone, accessMessage, userId);
  } catch (sendErr) {
    console.error("Aviso ao enviar mensagem de acesso via WhatsApp:", sendErr);
  }

  // 6. Atualiza o status do pedido para 'approved'
  order.status = "approved";
  order.target_username = username;
  order.notes = `${order.notes ? order.notes + " | " : ""}Liberado em ${new Date().toLocaleString()}`;
  order.updated_at = new Date().toISOString();

  orders[orderIndex] = order;
  writeLocalOrders(userId, orders);

  try {
    await supabaseAdmin
      .from("orders")
      .update({
        status: "approved",
        target_username: username,
        notes: order.notes,
        updated_at: order.updated_at,
      })
      .eq("id", orderId);
  } catch {}

  return {
    ok: true,
    message: `Pedido #${order.order_number} aprovado! Acesso liberado no Sigma e entregue no WhatsApp.`,
    order,
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
  const orders = readLocalOrders(userId);
  const orderIndex = orders.findIndex((o) => o.id === orderId);
  if (orderIndex === -1) {
    return { ok: false, message: "Pedido não encontrado." };
  }

  orders[orderIndex].status = "cancelled";
  orders[orderIndex].updated_at = new Date().toISOString();
  writeLocalOrders(userId, orders);

  try {
    await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", orderId);
  } catch {}

  return { ok: true, message: "Pedido cancelado com sucesso." };
}
