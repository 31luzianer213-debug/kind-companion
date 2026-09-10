/**
 * Hook utilitário - o atendimento do WhatsApp é 100% gerenciado no servidor
 * através do motor Baileys nativo e WebSocket contínuo 24h, prevenindo duplicatas.
 */
export function useBotAutoPolling() {
  // Desativado no cliente para evitar envios duplicados por abas abertas no navegador.
}
