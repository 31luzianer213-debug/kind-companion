import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ensureAndConnectEvolution,
  getEvolutionConfigStatus,
  getEvolutionConnectionState,
  logoutEvolutionInstance,
  restartEvolutionInstance,
  sendEvolutionTestMessage,
} from "@/lib/evolution.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import {
  MessageCircle,
  QrCode,
  LogOut,
  RefreshCw,
  Send,
  Smartphone,
  Sparkles,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";

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
      tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      desc: "Pronto para enviar cobranças, faturas e dados de acesso",
    };
  }
  if (s === "connecting") {
    return {
      label: "Aguardando leitura",
      color: "bg-amber-500",
      tone: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      desc: "Escaneie o QR Code no seu celular em Aparelhos Conectados",
    };
  }
  return {
    label: "Desconectado",
    color: "bg-rose-500",
    tone: "bg-rose-500/15 text-rose-400 border-rose-500/30",
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
  const [testText, setTestText] = useState(
    "🚀 *Mensagem de Teste do IPTV Manager!*\n\nSeu WhatsApp está 100% conectado e integrado ao Painel Sigma e Cobranças automáticas. ✅",
  );
  const [sendingTest, setSendingTest] = useState(false);

  // Carrega status da configuração da Evolution
  const config = useQuery({
    queryKey: ["evolution", "config"],
    queryFn: () => getEvolutionConfigStatus(),
  });
  const instance = config.data?.defaultInstance ?? "";

  // Consulta o estado da conexão em tempo real (2.5s se tiver QR aberto, 6s em repouso)
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

  // Fecha o QR automaticamente quando o WhatsApp conecta
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
    refetchInterval: 15000,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["evolution"] });
    qc.invalidateQueries({ queryKey: ["layout-whatsapp-status"] });
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
      toast.success("WhatsApp desconectado.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao desconectar");
    }
  }

  async function handleRestart() {
    if (!instance) return;
    setQrError(null);
    try {
      await restartEvolutionInstance({ data: { instance } });
      toast.success("Reiniciando instância... aguarde 5s e clique em Gerar QR Code.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reiniciar");
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    if (!instance) return;
    const cleanNumber = testNumber.replace(/\D/g, "");
    if (cleanNumber.length < 10) {
      toast.error("Informe o número com DDD (ex: 55 11 99999-8888).");
      return;
    }

    setSendingTest(true);
    try {
      await sendEvolutionTestMessage({ data: { instance, number: testNumber, text: testText } });
      toast.success("Mensagem de teste enviada! Confira o WhatsApp.");
      qc.invalidateQueries({ queryKey: ["whatsapp-recent-logs"] });
      setTestNumber("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar mensagem de teste");
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <MessageCircle className="size-6 text-emerald-500" /> WhatsApp Conexão & Disparos
            </h1>
            <Badge variant="outline" className={`text-xs gap-1.5 ${info.tone}`}>
              <span className={`size-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
              {info.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Pareie seu WhatsApp para envio automático de cobranças, lembretes pré-vencimento e entrega de acessos com servidor Sigma.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 shadow-sm">
            <Link to="/mensagens">
              <Sparkles className="size-3.5 text-primary" />
              Editar Modelos de Mensagem
            </Link>
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5 shadow-sm" onClick={refresh}>
            <RefreshCw className="size-3.5" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Grid Principal: Conexão e Teste */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 1: Pareamento & QR Code */}
        <Card className="surface-card border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="size-4 text-primary" /> Conexão do Aparelho
              </CardTitle>
              {connState.isFetching && <span className="text-[11px] text-muted-foreground animate-pulse">sincronizando...</span>}
            </div>
            <CardDescription>
              Conexão única e estável do sistema: <span className="font-mono font-semibold text-foreground">{instance || "Carregando..."}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3.5">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${connected ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}>
                  <Smartphone className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Status da Sessão</p>
                  <p className="text-xs text-muted-foreground">{info.desc}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={handleConnect} disabled={qrLoading} className="rounded-xl font-semibold gap-1.5">
                {qrLoading ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                {qrLoading ? "Gerando..." : connected ? "Gerar Novo QR Code" : "Gerar QR Code"}
              </Button>
              <Button variant="secondary" onClick={handleRestart} className="rounded-xl font-semibold gap-1.5">
                <RefreshCw className="size-4" /> Reiniciar
              </Button>
              <Button variant="outline" onClick={handleLogout} className="rounded-xl font-semibold text-destructive hover:bg-destructive/10 gap-1.5">
                <LogOut className="size-4" /> Desconectar
              </Button>
            </div>

            {qrError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span className="break-words">{qrError}</span>
              </div>
            )}

            {/* Visualizador do QR Code */}
            {(qr || qrLoading) && !connected && (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/60 bg-card p-6 text-center space-y-3">
                {qrLoading ? (
                  <div className="py-10 text-center space-y-2">
                    <Loader2 className="size-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Gerando QR Code limpo...</p>
                  </div>
                ) : qr?.base64 ? (
                  <div className="space-y-3 text-center">
                    <div className="p-3 bg-white rounded-lg shadow-lg inline-block">
                      <img
                        src={qr.base64}
                        alt="QR Code do WhatsApp"
                        className="size-56 object-contain"
                      />
                    </div>
                    <div className="space-y-1 max-w-xs">
                      <p className="text-xs font-semibold text-foreground">Abra o WhatsApp no celular:</p>
                      <p className="text-[11px] text-muted-foreground">
                        Configurações &gt; Aparelhos Conectados &gt; Conectar Aparelho (expira em ~45s)
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" className="rounded-lg" onClick={handleConnect}>
                      <RefreshCw className="size-3.5" /> Novo QR Code
                    </Button>
                  </div>
                ) : qr?.code ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Código de pareamento:</p>
                    <p className="font-mono text-base font-bold bg-muted p-2 rounded-lg">{qr.code}</p>
                  </div>
                ) : null}
              </div>
            )}

            {connected && !qr && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-8 text-center space-y-2">
                <div className="size-12 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <CheckCircle2 className="size-6 text-emerald-400" />
                </div>
                <p className="text-sm font-bold text-foreground">WhatsApp Conectado e Operando!</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Seu número está pronto para disparos automáticos de cobranças PIX, renovações e suporte via Robô.
                </p>
              </div>
            )}

            {!connected && !qr && !qrLoading && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-8 text-center space-y-2 text-muted-foreground">
                <Smartphone className="size-8 opacity-40" />
                <p className="text-xs font-medium">Nenhum QR Code ativo no momento.</p>
                <p className="text-[11px]">Clique no botão "Gerar QR Code" acima para conectar seu WhatsApp.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* DICA DE CRIPTOGRAFIA & "AGUARDANDO MENSAGEM" */}
        <Card className="surface-card border-border/60 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-foreground font-bold">
              <ShieldCheck className="size-4 text-primary" /> Como resolver: "Aguardando mensagem. Essa ação pode levar alguns instantes"
            </CardTitle>
            <CardDescription className="text-xs">
              Este aviso é emitido pelo WhatsApp oficial quando as chaves de criptografia ponta-a-ponta (E2E) entre o seu aparelho e o destinatário precisam sincronizar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="font-bold text-primary">1.</span>
              <p>
                <strong>Abra o WhatsApp no celular conectado:</strong> mantenha o app do WhatsApp aberto na tela inicial por cerca de 30 segundos conectado à internet (Wi-Fi ou 4G). Isso força a Meta a trocar as chaves de segurança pendentes com o cliente.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-primary">2.</span>
              <p>
                <strong>Se persistir para novos clientes:</strong> clique no botão <strong>"Desconectar"</strong> acima e leia o QR Code novamente. Ao reconectar, a Evolution API gera um par de chaves Signal novo e limpo.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-primary">3.</span>
              <p>
                <strong>Envio para o número oficial (@s.whatsapp.net):</strong> o sistema já foi otimizado para responder diretamente ao telefone real do cliente, evitando conflitos de privacidade do WhatsApp (@lid).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Envio de Mensagem de Teste */}
        <Card className="surface-card border-border/60 flex flex-col">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="size-4 text-primary" /> Disparo de Teste
            </CardTitle>
            <CardDescription>
              Valide o envio instantâneo para qualquer número de WhatsApp cadastrado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
            <form onSubmit={handleTest} className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">Número do WhatsApp (com DDD)</p>
                <Input
                  type="text"
                  placeholder="55 11 99999-8888"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  className="rounded-xl font-mono text-sm"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Insira 55 + DDD + 8 ou 9 dígitos. Exemplo: 5593991614242.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold">Mensagem do Teste</p>
                <Textarea
                  rows={4}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  className="rounded-xl text-xs font-sans resize-none"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={sendingTest || !connected}
                className="w-full gap-1.5 font-semibold bg-primary text-primary-foreground shadow-sm rounded-xl"
              >
                {sendingTest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {connected ? "Enviar Mensagem de Teste" : "Conecte o WhatsApp para Enviar Teste"}
              </Button>
            </form>

            <div className="pt-4 border-t border-border/60">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Quer alterar o texto das mensagens automáticas?</span>
                <Link to="/mensagens" className="text-primary font-semibold hover:underline flex items-center gap-1">
                  Modelos de Mensagem <ExternalLink className="size-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dicas e Soluções de Problemas */}
      <Card className="surface-card border-border/60 bg-gradient-to-br from-card via-card to-primary/5">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-400" />
            Diagnóstico & Estabilidade da Conexão
          </CardTitle>
          <CardDescription>
            Informações importantes para manter sua entrega de mensagens 100% ativa e estável.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3.5 text-xs text-muted-foreground leading-relaxed">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1.5">
            <p className="font-semibold text-foreground flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              Robô Automático 24h Ativo
            </p>
            <p>
              O sistema monitora continuamente as mensagens recebidas pela Evolution API.
              Clientes que enviarem mensagens receberão respostas instantâneas de opções de menu,
              geração de teste grátis, renovações PIX e links de aplicativos.
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-1.5">
            <p className="font-semibold text-amber-400 flex items-center gap-2">
              <AlertCircle className="size-4" />
              Mensagem diz "Aguardando mensagem. Essa ação pode levar alguns instantes. Saiba mais"?
            </p>
            <p className="text-foreground/80">
              Isso é um comportamento padrão do WhatsApp quando as chaves de criptografia de ponta a ponta
              precisam ser sincronizadas entre o servidor e o seu aparelho.
            </p>
            <ul className="list-disc list-inside space-y-1 pt-1 text-muted-foreground">
              <li>
                Abra o aplicativo WhatsApp no seu celular conectado e deixe-o aberto na tela por 30 a 60 segundos com conexão à internet ativa.
              </li>
              <li>
                Isso faz o WhatsApp sincronizar automaticamente as chaves criptográficas da sessão com o WhatsApp Web.
              </li>
              <li>
                O sistema já prioriza o envio direto para o número primário (@s.whatsapp.net) para acelerar a descriptografia imediata.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>


      {/* Histórico dos Últimos Disparos de WhatsApp */}
      <Card className="surface-card border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4 text-primary" /> Registro Recente de Disparos
            </CardTitle>
            <CardDescription>
              Histórico das últimas mensagens enviadas pelo robô, cobranças automáticas e testes.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            {logsData?.length ?? 0} registros
          </Badge>
        </CardHeader>
        <CardContent>
          {!logsData || logsData.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground text-xs">
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
