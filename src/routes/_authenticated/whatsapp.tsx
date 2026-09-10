import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import {
  LogOut,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  CheckCircle2,
  Clock,
  Loader2,
  Trash2,
  Zap,
} from "lucide-react";
import {
  ensureAndConnectEvolution,
  getEvolutionConfigStatus,
  getEvolutionConnectionState,
  getEvolutionWebhookState,
  setEvolutionWebhookUrl,
  logoutEvolutionInstance,
  deleteEvolutionInstance,
  restartEvolutionInstance,
  sendEvolutionTestMessage,
} from "@/lib/evolution.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — Conexão & Disparador" },
      {
        name: "description",
        content: "Conecte seu WhatsApp pelo QR Code, teste envios e acompanhe o status da conexão da sua revenda.",
      },
    ],
  }),
  component: WhatsAppPage,
});

function statusInfo(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") {
    return {
      label: "Conectado",
      color: "bg-emerald-500",
      variant: "default" as const,
      desc: "Pronto para enviar cobranças, faturas e dados de acesso",
    };
  }
  if (s === "connecting") {
    return {
      label: "Conectando",
      color: "bg-amber-500",
      variant: "secondary" as const,
      desc: "Escaneie o QR Code no seu celular em Aparelhos Conectados",
    };
  }
  return {
    label: "Desconectado",
    color: "bg-red-500",
    variant: "destructive" as const,
    desc: "Gere o QR Code para conectar seu número de atendimento",
  };
}

function normalizeBase64(b64: string | null): string | null {
  if (!b64) return null;
  const s = b64.trim();
  if (!s) return null;
  return s.startsWith("data:") ? s : `data:image/png;base64,${s}`;
}

function WhatsAppPage() {
  const qc = useQueryClient();
  const [qr, setQr] = useState<{ base64: string | null; code: string | null } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [testNumber, setTestNumber] = useState("");
  const [testText, setTestText] = useState("Teste IPTV Manager — WhatsApp conectado com sucesso!");
  const [sendingTest, setSendingTest] = useState(false);

  const config = useQuery({
    queryKey: ["evolution", "config"],
    queryFn: () => getEvolutionConfigStatus(),
  });
  const instance = config.data?.defaultInstance ?? "";

  const connState = useQuery({
    queryKey: ["evolution", "connState", instance],
    queryFn: () => getEvolutionConnectionState({ data: { instance } }),
    enabled: !!instance,
    refetchInterval: qr ? 2500 : 6000,
    retry: 0,
  });

  const raw = connState.data as
    | ({ state?: string; status?: string; instance?: { state?: string } } & Record<string, unknown>)
    | undefined;
  const status = raw?.state ?? raw?.status ?? raw?.instance?.state ?? "unknown";
  const info = statusInfo(status);
  const connected = String(status).toLowerCase() === "open";

  // Fecha o QR Code automaticamente assim que o WhatsApp conecta
  useEffect(() => {
    if (connected && qr) {
      setQr(null);
      setQrError(null);
      toast.success("WhatsApp conectado com sucesso!");
    }
  }, [connected, qr]);

  // Histórico Recente de Disparos do Supabase
  const { data: logsData } = useQuery({
    queryKey: ["whatsapp-recent-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("message_logs")
        .select("id, phone, body, status, created_at, clients(name)")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const [webhookUrlInput, setWebhookUrlInput] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);

  const webhookState = useQuery({
    queryKey: ["evolution", "webhook", instance],
    queryFn: () => getEvolutionWebhookState({ data: { instance } }),
    enabled: !!instance,
    retry: 0,
  });

  useEffect(() => {
    if (webhookState.data?.url) {
      setWebhookUrlInput(webhookState.data.url);
    } else if (typeof window !== "undefined" && window.location.origin && !webhookUrlInput) {
      setWebhookUrlInput(`${window.location.origin}/api/public/hooks/whatsapp-bot`);
    }
  }, [webhookState.data?.url]);

  async function handleSaveWebhook(customUrl?: string) {
    const targetUrl = (customUrl || webhookUrlInput || "").trim();
    if (!targetUrl || !targetUrl.startsWith("http")) {
      toast.error("Informe uma URL válida com http:// ou https://");
      return;
    }
    setSavingWebhook(true);
    try {
      await setEvolutionWebhookUrl({ data: { instance, webhookUrl: targetUrl } });
      toast.success("Webhook 24 horas configurado com sucesso!");
      qc.invalidateQueries({ queryKey: ["evolution", "webhook"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar webhook");
    } finally {
      setSavingWebhook(false);
    }
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["evolution"] });
    qc.invalidateQueries({ queryKey: ["whatsapp-recent-logs"] });
  }

  async function handleConnect() {
    setQrLoading(true);
    setQr(null);
    setQrError(null);
    try {
      const res = await ensureAndConnectEvolution();
      const b64 = normalizeBase64(res.base64 ?? null);
      if (b64 || res.code) {
        setQr({ base64: b64, code: res.code ?? null });
        toast.success(res.created ? "Conexão criada! Escaneie o QR Code." : "QR Code gerado! Escaneie em até 45s.");
      } else if (String(res.status).toLowerCase() === "open") {
        toast.message("Já está conectado — não precisa de QR Code.");
      } else {
        setQrError("A Evolution não devolveu QR Code. Clique em Reiniciar e tente de novo.");
        toast.message("Sem QR Code agora. Tente Reiniciar.");
      }

      // Auto-configura o Webhook na Evolution API para responder 24h
      if (typeof window !== "undefined" && window.location.origin && !webhookState.data?.url) {
        const autoUrl = `${window.location.origin}/api/public/hooks/whatsapp-bot`;
        setEvolutionWebhookUrl({ data: { instance, webhookUrl: autoUrl } })
          .then(() => qc.invalidateQueries({ queryKey: ["evolution", "webhook"] }))
          .catch(() => {});
      }

      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao gerar QR Code";
      setQrError(msg);
      toast.error(msg);
    } finally {
      setQrLoading(false);
    }
  }

  async function handleLogout() {
    if (!instance || !confirm("Desconectar o WhatsApp? Será preciso escanear o QR Code novamente.")) return;
    try {
      await logoutEvolutionInstance({ data: { instance } });
      setQr(null);
      setQrError(null);
      toast.success("Desconectado.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao desconectar");
    }
  }

  async function handleDeleteInstance() {
    if (
      !instance ||
      !confirm(
        "Tem certeza que deseja APAGAR A INSTÂNCIA da VPS? Isso excluirá completamente o registro e arquivos da sessão na Evolution API. Ao clicar em 'Gerar QR Code', uma nova instância limpa será criada do zero."
      )
    )
      return;
    try {
      await deleteEvolutionInstance({ data: { instance } });
      setQr(null);
      setQrError(null);
      toast.success("Instância apagada da VPS com sucesso! Clique em 'Gerar QR Code' para recriar.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao apagar instância da VPS");
    }
  }

  async function handleRestart() {
    if (!instance) return;
    setQrError(null);
    try {
      await restartEvolutionInstance({ data: { instance } });
      toast.success("Reiniciando... aguarde 5s e clique em Gerar QR Code.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reiniciar");
    }
  }

  async function handleTest(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!instance) return;
    if (testNumber.replace(/\D/g, "").length < 10) {
      toast.error("Informe o número com DDD (ex: 55 93 99161-4242).");
      return;
    }
    setSendingTest(true);
    try {
      await sendEvolutionTestMessage({ data: { instance, number: testNumber, text: testText } });
      toast.success("Teste enviado! Confira o WhatsApp.");
      qc.invalidateQueries({ queryKey: ["whatsapp-recent-logs"] });
      setTestNumber("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar mensagem de teste");
    } finally {
      setSendingTest(false);
    }
  }

  if (config.isPending) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" /> Carregando conexão...
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl animate-in fade-in duration-300">
      {/* Card 1: Informações da Instância */}
      <div className="rounded-2xl border border-white/10 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <Smartphone className="size-3.5 text-primary" /> WhatsApp do Sistema
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">
              Conexão única: <span className="font-mono text-primary">{instance}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Se ela ainda não existir, é criada automaticamente ao gerar o QR Code.
            </p>
          </div>
          <Button
            id="whatsapp-refresh-btn"
            variant="secondary"
            size="sm"
            className="rounded-full font-bold shadow-sm"
            onClick={refresh}
          >
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Card 2: Status, Ações, QR Code e Envio de Teste */}
      <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-md">
        <div className="flex items-center gap-3">
          <span className={`size-2.5 shrink-0 rounded-full ${info.color} animate-pulse`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-extrabold text-foreground">WhatsApp</p>
              <Badge variant={info.variant}>{info.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{info.desc}</p>
          </div>
          {connState.isFetching && (
            <span className="text-xs text-muted-foreground animate-pulse">atualizando...</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            id="whatsapp-connect-btn"
            onClick={handleConnect}
            disabled={qrLoading}
            className="rounded-full font-bold gap-1.5 shadow-sm"
          >
            {qrLoading ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
            {qrLoading ? "Gerando..." : connected ? "Gerar novo QR Code" : "Gerar QR Code"}
          </Button>
          <Button
            id="whatsapp-restart-btn"
            variant="secondary"
            onClick={handleRestart}
            className="rounded-full font-bold gap-1.5"
          >
            <RefreshCw className="size-4" /> Reiniciar
          </Button>
          <Button
            id="whatsapp-logout-btn"
            variant="outline"
            onClick={handleLogout}
            className="rounded-full font-bold gap-1.5"
          >
            <LogOut className="size-4" /> Desconectar
          </Button>
          <Button
            id="whatsapp-delete-btn"
            variant="destructive"
            onClick={handleDeleteInstance}
            className="rounded-full font-bold gap-1.5 shadow-sm"
          >
            <Trash2 className="size-4" /> Apagar Instância
          </Button>
        </div>

        {qrError && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400 break-words">
            {qrError}
          </p>
        )}

        {(qr || qrLoading) && (
          <div className="mt-4 grid place-items-center rounded-2xl border bg-card p-4">
            {qrLoading ? (
              <div className="py-10 text-center space-y-2">
                <Loader2 className="size-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </div>
            ) : qr?.base64 ? (
              <div className="space-y-3 text-center">
                <img
                  src={qr.base64}
                  alt="QR Code do WhatsApp"
                  className="mx-auto size-64 rounded-xl bg-white object-contain p-2 shadow-md"
                />
                <p className="text-xs text-muted-foreground">
                  WhatsApp &rarr; Aparelhos conectados &rarr; Conectar (expira em ~45s)
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full font-bold"
                  onClick={handleConnect}
                >
                  <RefreshCw className="size-4" /> Novo QR Code
                </Button>
              </div>
            ) : qr?.code ? (
              <div className="space-y-2 text-center">
                <p className="text-xs text-muted-foreground">Código de pareamento:</p>
                <p className="font-mono font-bold text-base bg-muted p-2 rounded-lg">{qr.code}</p>
              </div>
            ) : null}
          </div>
        )}

        {connected && !qr && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-emerald-400">
            <CheckCircle2 className="size-5 shrink-0" />
            <p className="text-xs font-semibold">
              WhatsApp conectado e pronto! Robô e disparos de cobrança 100% operacionais.
            </p>
          </div>
        )}

        {/* Testar Envio */}
        <div className="mt-4 rounded-xl border bg-secondary/50 p-3">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Send className="size-4 text-primary" /> Testar envio
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="whatsapp-test-number-input"
              placeholder="55 + DDD + número (ex: 5593991614242)"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="flex-1 font-mono text-xs rounded-xl"
            />
            <Button
              id="whatsapp-test-send-btn"
              onClick={() => handleTest()}
              disabled={sendingTest || !connected}
              variant="secondary"
              className="rounded-full font-bold gap-1.5"
            >
              {sendingTest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sendingTest ? "Enviando..." : "Enviar"}
            </Button>
          </div>
          <Textarea
            id="whatsapp-test-message-input"
            className="mt-2 rounded-xl text-xs font-sans resize-none"
            rows={2}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
        </div>
      </div>

      {/* Card: Atendimento Automático 24 Horas & Webhook na VPS */}
      <div className="rounded-2xl border border-white/10 bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <Zap className="size-3.5 text-amber-400" /> Atendimento Automático 24 Horas (Mesmo com site fechado)
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {webhookState.data?.url ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  Robô ativo 24h — O WhatsApp responde mesmo com o site fechado ou deslogado!
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                  Webhook não ativado. Clique em "Ativar 24h" para o robô responder sem precisar abrir o site.
                </span>
              )}
            </p>
          </div>
          {webhookState.data?.url && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[11px] self-start sm:self-auto">
              24h Ativo
            </Badge>
          )}
        </div>

        <div className="rounded-xl border bg-secondary/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Endereço do Webhook no servidor (Evolution API entrega as mensagens diretamente aqui):
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="whatsapp-webhook-url-input"
              value={webhookUrlInput}
              onChange={(e) => setWebhookUrlInput(e.target.value)}
              placeholder="https://seusite.com/api/public/hooks/whatsapp-bot"
              className="font-mono text-xs rounded-xl flex-1"
            />
            <Button
              id="whatsapp-save-webhook-btn"
              onClick={() => handleSaveWebhook()}
              disabled={savingWebhook || !instance}
              className="rounded-full font-bold gap-1.5 shadow-sm shrink-0"
              size="sm"
            >
              {savingWebhook ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5 text-amber-400" />}
              {savingWebhook ? "Salvando..." : "Ativar 24h Agora"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            💡 Dica: Se estiver na VPS, aponte para o domínio ou IP público da VPS. A Evolution API fará o envio das mensagens diretamente para o robô 24 horas por dia, 7 dias por semana.
          </p>
        </div>
      </div>

      {/* Card 3: Histórico Recente de Disparos */}
      <Card className="surface-card border-border/60 rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4 text-primary" /> Registro Recente de Disparos
            </CardTitle>
            <CardDescription className="text-xs">
              Últimas mensagens enviadas pelo robô, cobranças automáticas e testes.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            {logsData?.length ?? 0} registros
          </Badge>
        </CardHeader>
        <CardContent>
          {!logsData || logsData.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-muted-foreground text-xs">
              Nenhuma mensagem disparada recentemente.
            </div>
          ) : (
            <div className="space-y-2.5">
              {logsData.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground">
                        {(log as any).clients?.name || log.phone}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {log.created_at ? formatDateTime(log.created_at) : ""}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground font-sans">
                      {log.body}
                    </p>
                  </div>
                  <Badge
                    variant={log.status === "sent" ? "default" : "destructive"}
                    className="shrink-0 text-[10px] font-bold"
                  >
                    {log.status === "sent" ? "Enviado" : "Falhou"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
