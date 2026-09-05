// ==========================================
// Sincronização de Clientes com Sigma
// ==========================================

import { supabase } from "@/integrations/supabase/client";
import { getSigmaConfig } from "./sigma.config";
import { fetchSigmaClients, type SigmaClient } from "./sigma.api";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;

export interface SyncResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  errors: string[];
  message: string;
  details?: {
    newClients: string[];
    updatedClients: string[];
    skippedClients: string[];
  };
}

export interface AutoRenewResult {
  success: boolean;
  renewed: number;
  failed: number;
  errors: string[];
  details: Array<{
    clientName: string;
    username: string;
    status: "renewed" | "failed";
    message: string;
  }>;
}

// ==========================================
// SINCRONIZAÇÃO PRINCIPAL
// ==========================================

/**
 * Sincroniza clientes do painel Sigma para o banco local.
 * - Clientes novos são criados
 * - Clientes existentes são atualizados (busca por iptv_username)
 * - Não exclui clientes locais que não existem mais no Sigma
 */
export async function syncSigmaClients(): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    total: 0,
    created: 0,
    updated: 0,
    errors: [],
    message: "",
    details: {
      newClients: [],
      updatedClients: [],
      skippedClients: [],
    },
  };

  try {
    // 1. Buscar configuração do Sigma
    const config = await getSigmaConfig();
    if (!config) {
      result.message = "Configure o painel Sigma primeiro";
      return result;
    }

    // 2. Buscar clientes do Sigma
    const sigmaResponse = await fetchSigmaClients(config);
    if (!sigmaResponse.success || !sigmaResponse.data) {
      result.message = sigmaResponse.message || "Erro ao buscar clientes do Sigma";
      return result;
    }

    const sigmaClients = sigmaResponse.data;
    result.total = sigmaClients.length;

    // 3. Buscar clientes locais
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      result.message = "Usuário não autenticado";
      return result;
    }

    const { data: localClients, error: fetchError } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", auth.user.id);

    if (fetchError) {
      result.message = "Erro ao buscar clientes locais";
      result.errors.push(fetchError.message);
      return result;
    }

    // 4. Criar mapa de clientes locais por username
    const localByUsername = new Map<string, Client>();
    localClients?.forEach((client) => {
      if (client.iptv_username) {
        localByUsername.set(client.iptv_username.toLowerCase(), client);
      }
    });

    // 5. Processar cada cliente do Sigma
    for (const sigmaClient of sigmaClients) {
      try {
        const normalizedUsername = sigmaClient.username.toLowerCase();
        const existingLocal = localByUsername.get(normalizedUsername);

        // Calcular próxima data de vencimento
        const nextDueDate = calculateNextDueDate(sigmaClient.expiration_date);

        // Calcular status baseado na expiração
        const isExpired = sigmaClient.expiration_date
          ? new Date(sigmaClient.expiration_date) < new Date()
          : false;

        const mappedClient = {
          user_id: auth.user.id,
          name: sigmaClient.name || sigmaClient.username,
          phone: sigmaClient.phone || "",
          email: sigmaClient.email || null,
          monthly_fee: 0, // Será definido após sincronização
          due_day: new Date().getDate(),
          next_due_date: nextDueDate,
          status: isExpired ? "expired" : (sigmaClient.status === "active" ? "active" : "inactive"),
          list_id: config.list_id || null,
          notes: `Sincronizado do Sigma em ${new Date().toLocaleString("pt-BR")}. Screens: ${sigmaClient.max_connections}`,
          iptv_username: sigmaClient.username,
          iptv_password: sigmaClient.password,
          screens: sigmaClient.max_connections,
          activated_at: sigmaClient.created_at || null,
        };

        if (existingLocal) {
          // Atualizar cliente existente
          const { error } = await supabase
            .from("clients")
            .update(mappedClient)
            .eq("id", existingLocal.id);

          if (error) {
            result.errors.push(`Erro ao atualizar ${sigmaClient.username}: ${error.message}`);
          } else {
            result.updated++;
            result.details?.updatedClients.push(sigmaClient.username);
          }
        } else {
          // Criar novo cliente
          const { error } = await supabase
            .from("clients")
            .insert(mappedClient);

          if (error) {
            result.errors.push(`Erro ao criar ${sigmaClient.username}: ${error.message}`);
          } else {
            result.created++;
            result.details?.newClients.push(sigmaClient.username);
          }
        }
      } catch (err) {
        result.errors.push(`Erro ao processar ${sigmaClient.username}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    result.success = true;
    result.message = `Sincronização concluída: ${result.created} novos, ${result.updated} atualizados`;

  } catch (error) {
    console.error("[Sigma Sync] Erro na sincronização:", error);
    result.message = error instanceof Error ? error.message : "Erro na sincronização";
    result.errors.push(result.message);
  }

  return result;
}

// ==========================================
// RENOVAÇÃO AUTOMÁTICA
// ==========================================

/**
 * Renova automaticamente clientes que pagaram.
 * Chamado quando uma invoice é marcada como "paid".
 */
export async function autoRenewPaidClients(
  invoiceIds?: string[]
): Promise<AutoRenewResult> {
  const result: AutoRenewResult = {
    success: false,
    renewed: 0,
    failed: 0,
    errors: [],
    details: [],
  };

  try {
    // 1. Buscar configuração do Sigma
    const config = await getSigmaConfig();
    if (!config) {
      result.errors.push("Configure o painel Sigma primeiro");
      return result;
    }

    if (!config.auto_renew_on_payment) {
      result.errors.push("Renovação automática desativada nas configurações");
      return result;
    }

    // 2. Buscar invoices pagas
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      result.errors.push("Usuário não autenticado");
      return result;
    }

    let query = supabase
      .from("invoices")
      .select("*, clients(*)")
      .eq("user_id", auth.user.id)
      .eq("status", "paid");

    if (invoiceIds && invoiceIds.length > 0) {
      query = query.in("id", invoiceIds);
    }

    const { data: paidInvoices, error: invoiceError } = await query;

    if (invoiceError) {
      result.errors.push(`Erro ao buscar invoices: ${invoiceError.message}`);
      return result;
    }

    if (!paidInvoices || paidInvoices.length === 0) {
      result.success = true;
      result.renewed = 0;
      return result;
    }

    // 3. Importar função de renovação do Sigma API
    const { renewSigmaClient, setSigmaClientExpiration } = await import("./sigma.api");

    // 4. Processar cada invoice paga
    for (const invoice of paidInvoices) {
      const client = invoice.clients as any;
      
      if (!client?.iptv_username) {
        result.details.push({
          clientName: client?.name || "Desconhecido",
          username: "N/A",
          status: "failed",
          message: "Cliente não tem username IPTV configurado",
        });
        result.failed++;
        continue;
      }

      try {
        // Calcular nova data de expiração (adicionar 30 dias ou conforme days_to_renew)
        const daysToAdd = invoice.days_to_renew || 30;
        const currentExpiration = client.next_due_date 
          ? new Date(client.next_due_date)
          : new Date();
        
        // Se a data atual já passou, usa a data de hoje
        const baseDate = currentExpiration > new Date() ? currentExpiration : new Date();
        const newExpiration = new Date(baseDate);
        newExpiration.setDate(newExpiration.getDate() + daysToAdd);

        // Tentar renovar via API do Sigma
        const renewResult = await renewSigmaClient(config, client.iptv_username, daysToAdd);

        if (renewResult.success) {
          result.renewed++;
          result.details.push({
            clientName: client.name,
            username: client.iptv_username,
            status: "renewed",
            message: `Renovado por ${daysToAdd} dias até ${newExpiration.toLocaleDateString("pt-BR")}`,
          });

          // Atualizar status do cliente para active
          await supabase
            .from("clients")
            .update({
              status: "active",
              next_due_date: newExpiration.toISOString().split("T")[0],
            })
            .eq("id", client.id);
        } else {
          result.failed++;
          result.details.push({
            clientName: client.name,
            username: client.iptv_username,
            status: "failed",
            message: renewResult.message || "Erro ao renovar no Sigma",
          });
          result.errors.push(`${client.iptv_username}: ${renewResult.message}`);
        }
      } catch (err) {
        result.failed++;
        result.details.push({
          clientName: client?.name || "Desconhecido",
          username: client?.iptv_username || "N/A",
          status: "failed",
          message: err instanceof Error ? err.message : "Erro desconhecido",
        });
        result.errors.push(err instanceof Error ? err.message : "Unknown error");
      }
    }

    result.success = true;

  } catch (error) {
    console.error("[Sigma Sync] Erro na renovação automática:", error);
    result.errors.push(error instanceof Error ? error.message : "Erro desconhecido");
  }

  return result;
}

/**
 * Renova um cliente específico pelo ID
 */
export async function renewSingleClient(
  clientId: string,
  daysToRenew: number = 30
): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getSigmaConfig();
    if (!config) {
      return { success: false, message: "Configure o painel Sigma primeiro" };
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return { success: false, message: "Usuário não autenticado" };
    }

    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("user_id", auth.user.id)
      .single();

    if (error || !client) {
      return { success: false, message: "Cliente não encontrado" };
    }

    if (!client.iptv_username) {
      return { success: false, message: "Cliente não tem username IPTV configurado" };
    }

    const { renewSigmaClient, setSigmaClientExpiration } = await import("./sigma.api");

    // Calcular nova data
    const currentDate = client.next_due_date 
      ? new Date(client.next_due_date) 
      : new Date();
    
    const newExpiration = new Date(currentDate);
    newExpiration.setDate(newExpiration.getDate() + daysToRenew);

    // Tentar renovar
    const result = await renewSigmaClient(config, client.iptv_username, daysToRenew);

    if (result.success) {
      // Atualizar no banco local
      await supabase
        .from("clients")
        .update({
          status: "active",
          next_due_date: newExpiration.toISOString().split("T")[0],
        })
        .eq("id", clientId);

      return {
        success: true,
        message: `Cliente ${client.name} renovado até ${newExpiration.toLocaleDateString("pt-BR")}`,
      };
    }

    // Se falhou, tentar definir data de expiração diretamente
    const setResult = await setSigmaClientExpiration(config, client.iptv_username, newExpiration);

    if (setResult.success) {
      await supabase
        .from("clients")
        .update({
          status: "active",
          next_due_date: newExpiration.toISOString().split("T")[0],
        })
        .eq("id", clientId);

      return {
        success: true,
        message: `Cliente ${client.name} renovado até ${newExpiration.toLocaleDateString("pt-BR")}`,
      };
    }

    return {
      success: false,
      message: result.message || "Não foi possível renovar o cliente no Sigma",
    };

  } catch (error) {
    console.error("[Sigma Sync] Erro ao renovar cliente:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

// ==========================================
// UTILITÁRIOS
// ==========================================

/**
 * Calcula a próxima data de vencimento baseada na data de expiração do Sigma
 */
function calculateNextDueDate(sigmaExpirationDate: string): string | null {
  if (!sigmaExpirationDate) return null;

  try {
    const expDate = new Date(sigmaExpirationDate);
    
    // Se a data já passou, usa a data de hoje + 30 dias
    if (expDate < new Date()) {
      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);
      return nextMonth.toISOString().split("T")[0];
    }

    return expDate.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

/**
 * Sincroniza status de um cliente específico (verifica se ainda está ativo no Sigma)
 */
export async function syncClientStatus(
  clientId: string
): Promise<{ success: boolean; status: string; message: string }> {
  try {
    const config = await getSigmaConfig();
    if (!config) {
      return { success: false, status: "", message: "Sigma não configurado" };
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return { success: false, status: "", message: "Usuário não autenticado" };
    }

    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("user_id", auth.user.id)
      .single();

    if (error || !client) {
      return { success: false, status: "", message: "Cliente não encontrado" };
    }

    if (!client.iptv_username) {
      return { success: false, status: client.status, message: "Cliente não tem username IPTV" };
    }

    const { fetchSigmaClientByUsername } = await import("./sigma.api");
    
    const result = await fetchSigmaClientByUsername(config, client.iptv_username);

    if (!result.success || !result.data) {
      return { success: false, status: client.status, message: result.message || "Cliente não encontrado no Sigma" };
    }

    const sigmaClient = result.data;
    const isExpired = sigmaClient.expiration_date
      ? new Date(sigmaClient.expiration_date) < new Date()
      : false;

    const newStatus = isExpired ? "expired" : (sigmaClient.status === "active" ? "active" : "inactive");

    // Atualizar se mudou
    if (newStatus !== client.status) {
      await supabase
        .from("clients")
        .update({
          status: newStatus,
          next_due_date: sigmaClient.expiration_date || client.next_due_date,
        })
        .eq("id", clientId);
    }

    return {
      success: true,
      status: newStatus,
      message: `Status sincronizado: ${newStatus}`,
    };

  } catch (error) {
    return {
      success: false,
      status: "",
      message: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
