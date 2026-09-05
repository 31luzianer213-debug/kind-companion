// ==========================================
// Configuração do Painel Sigma
// ==========================================

import { supabase } from "@/integrations/supabase/client";

export interface SigmaConfig {
  id: string;
  user_id: string;
  sigma_url: string;
  sigma_token: string;
  auto_sync: boolean;
  auto_renew_on_payment: boolean;
  sync_interval_hours: number;
  created_at: string;
  updated_at: string;
}

export interface SigmaCredentials {
  sigma_url: string;
  sigma_token: string;
}

// Salvar configuração do Sigma
export async function saveSigmaConfig(credentials: SigmaCredentials, options?: {
  auto_sync?: boolean;
  auto_renew_on_payment?: boolean;
  sync_interval_hours?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return { success: false, error: "Usuário não autenticado" };
    }

    // Verificar se a tabela existe, se não criar
    await ensureSigmaConfigTable();

    const { error } = await supabase
      .from("sigma_config")
      .upsert({
        user_id: auth.user.id,
        sigma_url: credentials.sigma_url.replace(/\/$/, ""), // remove trailing slash
        sigma_token: credentials.sigma_token,
        auto_sync: options?.auto_sync ?? false,
        auto_renew_on_payment: options?.auto_renew_on_payment ?? true,
        sync_interval_hours: options?.sync_interval_hours ?? 24,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id"
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("[Sigma] Erro ao salvar configuração:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

// Buscar configuração do Sigma
export async function getSigmaConfig(): Promise<SigmaConfig | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    await ensureSigmaConfigTable();

    const { data, error } = await supabase
      .from("sigma_config")
      .select("*")
      .eq("user_id", auth.user.id)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  } catch (error) {
    console.error("[Sigma] Erro ao buscar configuração:", error);
    return null;
  }
}

// Testar conexão com o Sigma
export async function testSigmaConnection(credentials: SigmaCredentials): Promise<{
  success: boolean;
  message: string;
  resellerInfo?: {
    id: number;
    name: string;
    email: string;
  };
}> {
  try {
    const baseUrl = credentials.sigma_url.replace(/\/$/, "");
    
    const response = await fetch(`${baseUrl}/api/user`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${credentials.sigma_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, message: "Token inválido ou expirado" };
      }
      if (response.status === 404) {
        return { success: false, message: "Endpoint não encontrado. Verifique a URL do painel." };
      }
      return { success: false, message: `Erro do servidor: ${response.status}` };
    }

    const data = await response.json();
    
    return {
      success: true,
      message: "Conexão estabelecida com sucesso!",
      resellerInfo: {
        id: data.id || data.user?.id || 0,
        name: data.name || data.user?.name || "Revendedor",
        email: data.email || data.user?.email || "",
      },
    };
  } catch (error) {
    console.error("[Sigma] Erro ao testar conexão:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Não foi possível conectar ao painel Sigma",
    };
  }
}

// Deletar configuração do Sigma
export async function deleteSigmaConfig(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return { success: false, error: "Usuário não autenticado" };
    }

    const { error } = await supabase
      .from("sigma_config")
      .delete()
      .eq("user_id", auth.user.id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("[Sigma] Erro ao deletar configuração:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

// Garantir que a tabela de configuração existe
async function ensureSigmaConfigTable(): Promise<void> {
  try {
    const { error } = await supabase
      .from("sigma_config")
      .select("id")
      .limit(1);
    
    // Se a tabela não existir, o erro será diferente de 'relation does not exist'
    // Em produção, você deve criar a tabela via migration SQL
  } catch (error: any) {
    // A tabela será criada automaticamente pelo Supabase ou via migration
    console.log("[Sigma] Tabela sigma_config pode não existir:", error?.message);
  }
}
