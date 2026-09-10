import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { pollWhatsAppBot } from "./bot.functions";

/**
 * Hook global que mantém o Robô do WhatsApp ativo em tempo real
 * enquanto qualquer aba do painel estiver aberta no navegador.
 *
 * Funciona de forma inteligente e contínua:
 * 1. Consulta e responde novos clientes a cada 3 segundos.
 * 2. Aciona imediatamente ao focar na janela/aba.
 * 3. Atualiza os históricos de mensagens e notificações automaticamente.
 */
export function useBotAutoPolling() {
  const queryClient = useQueryClient();
  const pollBot = useServerFn(pollWhatsAppBot);
  const isPollingRef = useRef(false);

  async function runPoll() {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const res = await pollBot();
      if (res && res.ok && res.processed > 0) {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-recent-logs"] });
        queryClient.invalidateQueries({ queryKey: ["message-logs"] });
      }
    } catch {
      // Falha silenciosa para não atrapalhar navegação
    } finally {
      isPollingRef.current = false;
    }
  }

  // 1. Inicia polling após 2 segundos da carga inicial
  useEffect(() => {
    const timer = setTimeout(() => {
      runPoll();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // 2. Dispara imediatamente ao focar na aba
  useEffect(() => {
    const onFocus = () => runPoll();
    const onVisibility = () => {
      if (document.visibilityState === "visible") runPoll();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // 3. Loop periódico a cada 3 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      runPoll();
    }, 3000);

    return () => clearInterval(interval);
  }, []);
}
