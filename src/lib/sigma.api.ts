// ==========================================
// API do Painel Sigma - Operações com Clientes
// ==========================================

import type { SigmaConfig } from "./sigma.config";

export interface SigmaClient {
  id: number;
  name: string;
  username: string;
  password: string;
  status: "active" | "inactive" | "expired" | "suspended";
  expiration_date: string;
  max_connections: number;
  created_at: string;
  // Campos extras que alguns painéis retornam
  phone?: string;
  email?: string;
  package_name?: string;
  resellers_id?: number;
}

export interface SigmaAPIResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}

// Headers padrão para todas as requisições ao Sigma
function getHeaders(token: string): HeadersInit {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

// ==========================================
// OPERAÇÕES DE CLIENTES
// ==========================================

// Buscar TODOS os clientes do painel Sigma
export async function fetchSigmaClients(config: SigmaConfig): Promise<SigmaAPIResponse<SigmaClient[]>> {
  try {
    const baseUrl = config.sigma_url;
    
    // Tenta diferentes endpoints comuns de listagem de usuários
    const endpoints = [
      "/api/users",
      "/api/clients",
      "/api/subresellers",
      "/api/subscribers",
      "/api/user/list",
      "/api/members",
    ];

    let clients: SigmaClient[] = [];
    let usedEndpoint = "";

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "GET",
          headers: getHeaders(config.sigma_token),
        });

        if (response.ok) {
          const data = await response.json();
          
          // Normaliza o formato da resposta
          if (Array.isArray(data)) {
            clients = data;
          } else if (data.users && Array.isArray(data.users)) {
            clients = data.users;
          } else if (data.clients && Array.isArray(data.clients)) {
            clients = data.clients;
          } else if (data.data && Array.isArray(data.data)) {
            clients = data.data;
          } else if (data.subresellers && Array.isArray(data.subresellers)) {
            clients = data.subresellers;
          }
          
          if (clients.length > 0) {
            usedEndpoint = endpoint;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (clients.length === 0) {
      return {
        success: false,
        message: "Nenhum cliente encontrado ou endpoint não reconhecido. Verifique se sua API retorna um array de usuários.",
      };
    }

    // Normaliza os dados para o formato padrão
    const normalizedClients = clients.map(normalizeSigmaClient);

    return {
      success: true,
      data: normalizedClients,
      message: `Encontrados ${normalizedClients.length} clientes via endpoint ${usedEndpoint}`,
    };
  } catch (error) {
    console.error("[Sigma API] Erro ao buscar clientes:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro ao conectar com o painel Sigma",
    };
  }
}

// Buscar UM cliente específico pelo username
export async function fetchSigmaClientByUsername(
  config: SigmaConfig,
  username: string
): Promise<SigmaAPIResponse<SigmaClient>> {
  try {
    const baseUrl = config.sigma_url;
    
    // Tenta buscar por username
    const endpoints = [
      `/api/user/${username}`,
      `/api/users/${username}`,
      `/api/clients/${username}`,
      `/api/subreseller/${username}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "GET",
          headers: getHeaders(config.sigma_token),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            data: normalizeSigmaClient(data),
          };
        }
      } catch {
        continue;
      }
    }

    return {
      success: false,
      message: "Cliente não encontrado no painel Sigma",
    };
  } catch (error) {
    console.error("[Sigma API] Erro ao buscar cliente:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro ao conectar",
    };
  }
}

// ==========================================
// OPERAÇÕES DE RENOVAÇÃO
// ==========================================

// Renovar/Estender período de um cliente
export async function renewSigmaClient(
  config: SigmaConfig,
  username: string,
  daysToAdd: number
): Promise<SigmaAPIResponse<SigmaClient>> {
  try {
    const baseUrl = config.sigma_url;
    
    // Diferentes formatos de payload usados pelos painéis
    const payloadVariants = [
      { username, days: daysToAdd },
      { username, duration: daysToAdd },
      { username, extend_days: daysToAdd },
      { username, days_to_add: daysToAdd },
      { user: username, days: daysToAdd },
    ];

    const endpoints = [
      "/api/user/renew",
      "/api/users/renew",
      "/api/clients/renew",
      "/api/subreseller/renew",
      "/api/renew",
      "/api/user/extend",
    ];

    for (const endpoint of endpoints) {
      for (const payload of payloadVariants) {
        try {
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: getHeaders(config.sigma_token),
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const data = await response.json();
            return {
              success: true,
              data: normalizeSigmaClient(data),
              message: `Cliente ${username} renovado por ${daysToAdd} dias`,
            };
          }
        } catch {
          continue;
        }
      }
    }

    return {
      success: false,
      message: "Não foi possível renovar o cliente. Endpoint não reconhecido.",
    };
  } catch (error) {
    console.error("[Sigma API] Erro ao renovar cliente:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro ao conectar",
    };
  }
}

// Definir data de expiração específica
export async function setSigmaClientExpiration(
  config: SigmaConfig,
  username: string,
  expirationDate: Date
): Promise<SigmaAPIResponse<SigmaClient>> {
  try {
    const baseUrl = config.sigma_url;
    
    const payloadVariants = [
      { username, expiration: expirationDate.toISOString().split("T")[0] },
      { username, expiry_date: expirationDate.toISOString().split("T")[0] },
      { username, expiration_date: expirationDate.toISOString().split("T")[0] },
      { username, date: expirationDate.toISOString() },
      { user: username, expiration: expirationDate.toISOString().split("T")[0] },
    ];

    const endpoints = [
      "/api/user/expiration",
      "/api/users/expiration",
      "/api/user/setexpiry",
      "/api/clients/expiration",
    ];

    for (const endpoint of endpoints) {
      for (const payload of payloadVariants) {
        try {
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: getHeaders(config.sigma_token),
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const data = await response.json();
            return {
              success: true,
              data: normalizeSigmaClient(data),
              message: `Data de expiração definida para ${expirationDate.toLocaleDateString("pt-BR")}`,
            };
          }
        } catch {
          continue;
        }
      }
    }

    return {
      success: false,
      message: "Não foi possível definir expiração. Endpoint não reconhecido.",
    };
  } catch (error) {
    console.error("[Sigma API] Erro ao definir expiração:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro ao conectar",
    };
  }
}

// ==========================================
// OPERAÇÕES DE STATUS
// ==========================================

// Ativar cliente
export async function activateSigmaClient(
  config: SigmaConfig,
  username: string
): Promise<SigmaAPIResponse<SigmaClient>> {
  try {
    const baseUrl = config.sigma_url;
    
    const payloadVariants = [
      { username, status: "active" },
      { username, action: "activate" },
      { user: username, status: "active" },
      { username, is_active: true },
    ];

    const endpoints = [
      "/api/user/status",
      "/api/users/status",
      "/api/clients/status",
      "/api/user/activate",
    ];

    for (const endpoint of endpoints) {
      for (const payload of payloadVariants) {
        try {
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: getHeaders(config.sigma_token),
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const data = await response.json();
            return {
              success: true,
              data: normalizeSigmaClient(data),
              message: `Cliente ${username} ativado`,
            };
          }
        } catch {
          continue;
        }
      }
    }

    return {
      success: false,
      message: "Não foi possível ativar o cliente.",
    };
  } catch (error) {
    console.error("[Sigma API] Erro ao ativar cliente:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro ao conectar",
    };
  }
}

// Suspender/Bloquear cliente
export async function suspendSigmaClient(
  config: SigmaConfig,
  username: string
): Promise<SigmaAPIResponse<SigmaClient>> {
  try {
    const baseUrl = config.sigma_url;
    
    const payloadVariants = [
      { username, status: "suspended" },
      { username, action: "suspend" },
      { user: username, status: "inactive" },
      { username, is_active: false },
    ];

    const endpoints = [
      "/api/user/status",
      "/api/users/status",
      "/api/clients/status",
      "/api/user/suspend",
      "/api/user/disable",
    ];

    for (const endpoint of endpoints) {
      for (const payload of payloadVariants) {
        try {
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: getHeaders(config.sigma_token),
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const data = await response.json();
            return {
              success: true,
              data: normalizeSigmaClient(data),
              message: `Cliente ${username} suspenso/bloqueado`,
            };
          }
        } catch {
          continue;
        }
      }
    }

    return {
      success: false,
      message: "Não foi possível suspender o cliente.",
    };
  } catch (error) {
    console.error("[Sigma API] Erro ao suspender cliente:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Erro ao conectar",
    };
  }
}

// ==========================================
// UTILITÁRIOS
// ==========================================

// Normaliza os dados de um cliente do Sigma para o formato padrão
function normalizeSigmaClient(raw: any): SigmaClient {
  return {
    id: raw.id || raw.user_id || raw.uid || 0,
    name: raw.name || raw.username || raw.full_name || raw.user_name || "",
    username: raw.username || raw.user || raw.login || raw.uname || "",
    password: raw.password || raw.pass || raw.passwd || "",
    status: normalizeStatus(raw.status || raw.state || raw.is_active),
    expiration_date: raw.expiration_date || raw.expiry_date || raw.expiration || raw.exp_date || raw.expires_at || "",
    max_connections: Number(raw.max_connections || raw.max_connections || raw.screens || raw.devices || 1),
    created_at: raw.created_at || raw.created || raw.join_date || raw.registered || "",
    phone: raw.phone || raw.whatsapp || raw.contact || raw.mobile || undefined,
    email: raw.email || raw.mail || undefined,
    package_name: raw.package_name || raw.package || raw.plan || raw.bouquet || undefined,
    resellers_id: raw.resellers_id || raw.reseller_id || raw.owner_id || undefined,
  };
}

// Normaliza o status para formato consistente
function normalizeStatus(status: any): SigmaClient["status"] {
  if (typeof status === "boolean") {
    return status ? "active" : "inactive";
  }
  
  const statusStr = String(status).toLowerCase();
  
  if (["active", "enabled", "1", "yes", "on"].includes(statusStr)) {
    return "active";
  }
  if (["suspended", "disabled", "blocked"].includes(statusStr)) {
    return "suspended";
  }
  if (["expired", "expirado"].includes(statusStr)) {
    return "expired";
  }
  
  return "inactive";
}

// Verifica se o cliente está ativo no Sigma
export function isSigmaClientActive(client: SigmaClient): boolean {
  return client.status === "active";
}

// Verifica se o cliente está expirado
export function isSigmaClientExpired(client: SigmaClient): boolean {
  if (!client.expiration_date) return false;
  return new Date(client.expiration_date) < new Date();
}

// Calcula dias até expirar
export function daysUntilExpiration(client: SigmaClient): number {
  if (!client.expiration_date) return -1;
  const expDate = new Date(client.expiration_date);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
