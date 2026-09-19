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
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import {
  getBaileysStatus,
  connectBaileys,
  disconnectBaileys,
  resetBaileysSession,
  sendBaileysTest,
} from "@/lib/baileys.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — Conexão e Automação" },
      {
        name: "description",
        content: "Conecte, acompanhe e teste seu robô de atendimento do WhatsApp.",
      },
    ],
  }),
  component: WhatsAppPage,
});

function statusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") {
    return {
      label: "Conectado",
      color: "bg-emerald-500",
      variant: "default" as const,
      desc: "Instância online e pronta para receber e responder mensagens.",
    };
  }
  if (s === "connecting") {
    return {
      label: "Aguardando conexão",
      color: "bg-amber-500",
      variant: "secondary" as const,
      desc: "Escaneie o QR Code no seu WhatsApp para concluir a conexão.",
    };
  }
  return {
    label: "Desconectado",
    color: "bg-red-500",
    variant: "destructive" as const,
    desc: "Conecte lendo o QR Code pelo seu WhatsApp.",
  };
}

function WhatsAppPage() {
  const qc = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [localQr, setLocalQr] = useState<string | null>(null);
  const [isRequestingQr, setIsRequestingQr] = useState(false);

  // Testes
  const [testNumber, setTestNumber] = useState("");
  const [testText, setTestText] = useState("Teste do Sigma Control — WhatsApp conectado e pronto para enviar mensagens!");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUser(data.user);
    });
  }, []);

  const instanceId = currentUser?.id || "default";

  // Query do Status da Conexão Baileys com detecção dupla (servidor + local direto)
  const baileysQuery = useQuery({
    queryKey: ["baileys", "status", instanceId],
    queryFn: async () => {
      let s: any = null;

      // 1. Consulta via Server Function
      try {
        const res = await getBaileysStatus({ data: { instance: instanceId } });
        if (res?.state) s = res.state;
      } catch {}


      // Sincroniza estados locais
      if (s?.qrCode) {
        setLocalQr(s.qrCode);
        setIsRequestingQr(false);
      }
      if (s?.status === "open") {
        setLocalQr(null);
        setIsRequestingQr(false);
      }

      return { ok: true, state: s };
    },
    refetchInterval: (query) => {
      const s = query.state.data?.state?.status;
      return s === "open" ? 10000 : 2000;
    },
    retry: 0,
  });

  const state = baileysQuery.data?.state;
  const status = state?.status || (isRequestingQr ? "connecting" : "close");
  const isConnected = status === "open";
  const info = statusBadge(status);

  // O código vindo da consulta mais recente tem prioridade sobre o cache local.
  const activeQr = state?.qrCode || localQr;

  // Mantém os demais indicadores de status sincronizados, sem exibir aviso ao abrir a página.
  useEffect(() => {
    if (!isConnected) return;
    qc.invalidateQueries({ queryKey: ["layout-whatsapp-status"] });
    qc.invalidateQueries({ queryKey: ["painel-wa-status"] });
  }, [isConnected, qc]);

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
    refetchInterval: 20000,
  });

  async function handleStartQr(force = false) {
    setLoadingAction(true);
    setIsRequestingQr(true);
    toast.loading("Solicitando QR Code do WhatsApp...", { id: "qr-toast" });

    try {
      const res = await connectBaileys({ data: { instance: instanceId, mode: "qr", force, origin: window.location.origin, userId: currentUser?.id } });
      if (res?.state?.qrCode) {
        setLocalQr(res.state.qrCode);
        setIsRequestingQr(false);
        toast.success("QR Code gerado! Aponte a câmera do WhatsApp.", { id: "qr-toast" });
      } else {
        toast.info("Aguardando geração do QR Code... Aparecerá em instantes.", { id: "qr-toast" });
      }
      qc.invalidateQueries({ queryKey: ["baileys"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao solicitar QR Code", { id: "qr-toast" });
    } finally {
      setLoadingAction(false);
      setTimeout(() => setIsRequestingQr(false), 10000);
    }
  }


  async function handleResetSession() {
    if (!confirm("A sessão do WhatsApp parece corrompida. Isso apagará a sessão atual da VPS e exigirá um novo QR Code. Continuar?")) return;
    setLoadingAction(true);
    setLocalQr(null);
    toast.loading("Limpando sessão corrompida e gerando novo QR Code...", { id: "reset-wa-toast" });
    try {
      const res = await resetBaileysSession({ data: { origin: window.location.origin, userId: currentUser?.id } });
      if (res?.state?.qrCode) {
        setLocalQr(res.state.qrCode);
        toast.success("Sessão limpa. Escaneie o novo QR Code.", { id: "reset-wa-toast" });
      } else {
        toast.info("Sessão limpa. Solicite o QR Code novamente.", { id: "reset-wa-toast" });
      }
      qc.invalidateQueries({ queryKey: ["baileys"] });
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível limpar a sessão da VPS.", { id: "reset-wa-toast" });
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleLogout() {
    if (!confirm("Deseja realmente desconectar o WhatsApp? Será necessário escanear o QR Code novamente.")) return;
    setLoadingAction(true);
    setLocalQr(null);
    try {
      await disconnectBaileys({ data: { instance: instanceId } });
      toast.success("WhatsApp desconectado.");
      qc.invalidateQueries({ queryKey: ["baileys"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao desconectar");
    } finally {
      setLoadingAction(false);
    }
  }


  async function handleSendTest() {
    const cleanNum = testNumber.replace(/\D/g, "");
    if (cleanNum.length < 10) {
      toast.error("Informe o número de teste com DDD (ex: 5593991614242)");
      return;
    }
    setSendingTest(true);
    try {
      await sendBaileysTest({
        data: {
          instance: instanceId,
          to: cleanNum,
          text: testText,
          type: "text",
        },
      });

      toast.success("Mensagem de texto enviada! Confira seu WhatsApp.");
      qc.invalidateQueries({ queryKey: ["whatsapp-recent-logs"] });
    } catch (err: any) {
      toast.error(err.message || "Falha ao enviar mensagem de teste");
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-10 animate-in fade-in duration-300">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 via-card to-card p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
              <MessageCircle className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">Central do WhatsApp</h1>
                <Badge variant={info.variant} className="gap-1.5">
                  <span className={`size-1.5 rounded-full ${info.color} ${status === "connecting" ? "animate-pulse" : ""}`} />
                  {info.label}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Conecte sua instância, acompanhe a saúde do robô e faça testes de envio em um só lugar.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["baileys"] })}
            disabled={baileysQuery.isFetching}
            className="w-full gap-2 rounded-xl sm:w-auto"
          >
            <RefreshCw className={`size-4 ${baileysQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar agora
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`flex size-10 items-center justify-center rounded-xl ${isConnected ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
              <Wifi className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Conexão</p>
              <p className="truncate text-sm font-extrabold">{info.label}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Server className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Motor</p>
              <p className="truncate text-sm font-extrabold">{state?.provider === "evolution" ? "Evolution API" : "WhatsApp Web"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
              <Smartphone className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Número conectado</p>
              <p className="truncate text-sm font-extrabold">{state?.phone ? `+${state.phone}` : "Nenhum número"}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,.6fr)]">
        <Card className="overflow-hidden rounded-3xl border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                <QrCode className="size-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Conectar WhatsApp</CardTitle>
                <CardDescription className="mt-1">{info.desc}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {isConnected ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-500" />
                    <div>
                      <p className="font-extrabold">Tudo pronto para atender</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        A instância está conectada. Mensagens recebidas pelo webhook podem ser processadas pelo bot imediatamente.
                      </p>
                    </div>
                  </div>
                </div>
                {state?.lastError && (
                  <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <AlertTriangle className="size-5 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="font-bold">Último aviso da conexão</p>
                      <p className="mt-1 break-words text-muted-foreground">{String(state.lastError)}</p>
                    </div>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" onClick={() => handleStartQr(true)} disabled={loadingAction} className="h-11 justify-start gap-2 rounded-xl">
                    <RefreshCw className="size-4" /> Gerar nova conexão
                  </Button>
                  <Button variant="outline" onClick={handleResetSession} disabled={loadingAction} className="h-11 justify-start gap-2 rounded-xl">
                    <ShieldCheck className="size-4" /> Reparar sessão
                  </Button>
                  <Button variant="destructive" onClick={handleLogout} disabled={loadingAction} className="h-11 justify-start gap-2 rounded-xl sm:col-span-2">
                    <LogOut className="size-4" /> Desconectar este WhatsApp
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-4">
                  <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                    No celular, abra <strong className="text-foreground">WhatsApp → Aparelhos conectados → Conectar aparelho</strong>.
                  </div>
                  {activeQr ? (
                    <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:p-6">
                      <div className="w-full max-w-[280px] rounded-2xl bg-white p-3 shadow-lg">
                        <img src={activeQr} alt="QR Code para conectar o WhatsApp" className="aspect-square w-full object-contain" />
                      </div>
                      <div className="text-center">
                        <p className="flex items-center justify-center gap-2 text-sm font-bold">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Aguardando leitura
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">O código atualiza automaticamente. Leia apenas o mais recente.</p>
                      </div>
                      <Button variant="outline" onClick={() => handleStartQr(true)} disabled={loadingAction} className="w-full gap-2 rounded-xl sm:w-auto">
                        <RefreshCw className="size-4" /> Gerar outro QR
                      </Button>
                    </div>
                  ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-muted/10 p-6 text-center">
                      {loadingAction || isRequestingQr || status === "connecting" ? (
                        <>
                          <Loader2 className="size-10 animate-spin text-emerald-500" />
                          <div>
                            <p className="font-bold">Gerando QR Code seguro...</p>
                            <p className="mt-1 text-xs text-muted-foreground">Aguarde a resposta da instância.</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <QrCode className="size-12 text-muted-foreground/50" />
                          <div>
                            <p className="font-bold">Nenhum QR Code ativo</p>
                            <p className="mt-1 text-xs text-muted-foreground">Gere um novo código para iniciar a conexão.</p>
                          </div>
                        </>
                      )}
                      <Button onClick={() => handleStartQr(true)} disabled={loadingAction} className="w-full gap-2 rounded-xl sm:w-auto">
                        {loadingAction ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                        Gerar QR Code
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-3xl border-border/70 shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-emerald-500" /> Saúde do robô
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5">
              {[
                { label: "Instância", value: isConnected ? "Online" : "Offline", ok: isConnected },
                { label: "Atualização", value: baileysQuery.isFetching ? "Verificando" : "Automática", ok: true },
                { label: "Canal", value: "Webhook oficial", ok: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className={`size-2 rounded-full ${item.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                    {item.value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 shadow-sm">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="size-4 text-primary" /> Antes de testar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5 text-sm text-muted-foreground">
              <p className="leading-relaxed">Envie <strong className="text-foreground">oi</strong> de outro número para abrir o menu. As opções agora aparecem apenas uma vez.</p>
              <p className="leading-relaxed">Se uma resposta ficar indisponível, use <strong className="text-foreground">Reparar sessão</strong> e conecte novamente.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="rounded-3xl border-border/70 shadow-sm">
        <CardHeader className="p-5 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="size-5 text-primary" /> Testar envio
          </CardTitle>
          <CardDescription>Confirme a entrega antes de liberar o robô para seus clientes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,.7fr)_minmax(0,1.3fr)]">
            <Input
              id="baileys-test-number"
              placeholder="55 + DDD + número"
              value={testNumber}
              onChange={(event) => setTestNumber(event.target.value)}
              className="h-11 rounded-xl font-mono"
            />
            <Textarea
              id="baileys-test-message"
              value={testText}
              onChange={(event) => setTestText(event.target.value)}
              rows={3}
              className="min-h-24 resize-none rounded-xl"
              placeholder="Digite a mensagem de teste"
            />
          </div>
          <div className="flex justify-end">
            <Button id="test-send-text-btn" onClick={handleSendTest} disabled={sendingTest || !isConnected} className="h-11 w-full gap-2 rounded-xl sm:w-auto sm:min-w-44">
              {sendingTest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar mensagem
            </Button>
          </div>
          {!isConnected && (
            <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0" /> Conecte o WhatsApp para liberar os testes.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 p-5 sm:p-6">
          <div>
            <CardTitle className="text-lg">Atividade recente</CardTitle>
            <CardDescription className="mt-1">Últimas mensagens registradas pelo sistema.</CardDescription>
          </div>
          <Badge variant="secondary">{logsData?.length ?? 0}</Badge>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
          {!logsData?.length ? (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/10 p-6 text-center">
              <Clock className="mb-2 size-8 text-muted-foreground/50" />
              <p className="text-sm font-bold">Nenhuma mensagem recente</p>
              <p className="mt-1 text-xs text-muted-foreground">Os próximos envios aparecerão aqui.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logsData.map((log: any) => (
                <div key={log.id} className="grid gap-3 rounded-2xl border bg-muted/10 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${log.status === "sent" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                      {log.status === "sent" ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{log.clients?.name || log.phone || "Destinatário"}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{log.body || "Mensagem sem conteúdo"}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-12 text-[11px] text-muted-foreground sm:block sm:pl-0 sm:text-right">
                    <Badge variant={log.status === "sent" ? "default" : "secondary"} className="mb-0 sm:mb-1">
                      {log.status === "sent" ? "Enviada" : log.status || "Pendente"}
                    </Badge>
                    <p>{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
