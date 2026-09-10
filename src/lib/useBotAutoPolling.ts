/**
 * Hook utilitário - o atendimento do WhatsApp agora é 100% gerenciado no servidor
 * através do webhook da Evolution API e do motor central, prevenindo duplicatas.
 */
export function useBotAutoPolling() {
  // Desativado no cliente para evitar envios duplicados por abas abertas no navegador.
}
