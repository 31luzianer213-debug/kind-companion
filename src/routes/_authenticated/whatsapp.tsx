import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  sendWhatsAppMessage,
} from "@/lib/whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import {
  MessageCircle,
  QrCode,
  Plug,
  Unplug,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Sparkles,
  ExternalLink,
  Loader2,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — Conexão & Disparador" },
      { name: "description", content: "Conecte seu WhatsApp pelo QR Code, teste envios e acompanhe o status da conexão da sua revenda." },
    ],
  }),
  component: WhatsAppPage,
});

const stateLabels: Record<string, { label: string; tone: string }> = {
  open: { label: "Conectado", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  connecting: { label: "Aguardando leitura", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  close: { label: "Desconectado", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  none: { label: "Sem sessão iniciada", tone: "bg-muted text-muted-foreground border-border" },
};

function WhatsAppPage() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendWhatsAppMessage);
  const status = useServerFn(getWhatsAppStatus);
  const connect = useServerFn(connectWhatsApp);
  const disconnect = useServerFn(disconnectWhatsApp);

  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const session = useQuery({
    queryKey: ["whatsapp-session"],
    queryFn: () => status({ data: { origin: typeof window !== "undefined" ? window.location.origin : undefined } }),
    refetchInterval: qr ? 4000 : 20000,
  });

  const { data: logsData } = useQuery({
    queryKey: ["whatsapp-recent-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_logs")
        .select("*, clients(name)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  const state = session.data?.state ?? "none";
  const badge = stateLabels[state] ?? stateLabels["none"]!;
  const isConnected = state === "open";

  useEffect(() => {
    if (isConnected) setQr(null);
  }, [isConnected]);

  async function gerarQr() {
    setBusy(true);
    try {
      const result = await connect({
        data: { origin: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível gerar o QR Code.");
        return;
      }
      if (result.state === "open") {
        toast.success("Seu WhatsApp já está conectado!");
        setQr(null);
      } else if (result.qr) {
        setQr(result.qr);
        toast.info("Escaneie o QR Code no seu WhatsApp.");
      } else {
        toast.error("A sessão não devolveu um QR Code. Tente novamente.");
      }
      session.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function desconectar() {
    setBusy(true);
    try {
      const result = await disconnect({});
      if (result.ok) {
        toast.success("WhatsApp desconectado com sucesso.");
        setQr(null);
      } else {
        toast.error(result.error ?? "Não foi possível desconectar.");
      }
      session.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function enviarTeste(e: React.FormEvent) {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error("Informe um número de WhatsApp para o teste.");
      return;
    }
    const cleanPhone = testPhone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Digite um telefone válido com DDD (ex: 11999998888).");
      return;
    }

    setSendingTest(true);
    try {
      const result = await send({
        data: {
          phone: cleanPhone,
          body: "🚀 *Mensagem de Teste do IPTV Manager!*\n\nSeu WhatsApp está 100% conectado e integrado ao Painel Sigma e Cobranças automáticas. ✅",
        },
      });
      if (result.ok) {
        toast.success("Mensagem de teste enviada com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["whatsapp-recent-logs"] });
      } else {
        toast.error(result.error ?? "Falha no envio da mensagem.");
      }
    } catch {
      toast.error("Erro inesperado ao enviar mensagem de teste.");
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
              <MessageCircle className="size-6 text-emerald-400" /> WhatsApp Conexão & Disparos
            </h1>
            <Badge variant="outline" className={`text-xs gap-1.5 ${badge.tone}`}>
              <span className={`size-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
              {badge.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Pareie seu WhatsApp para envio automático de cobranças, lembretes pré-vencimento e entrega de acessos com servidor Sigma.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 shadow-sm"
          >
            <Link to="/mensagens">
              <Sparkles className="size-3.5 text-primary" />
              Editar Modelos de Mensagem
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 1: Pareamento & QR Code */}
        <Card className="surface-card border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="size-4 text-primary" /> Conexão do Aparelho
            </CardTitle>
            <CardDescription>
              Escaneie o QR Code com seu WhatsApp para conectar a conta ao sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3.5">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isConnected ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                  <Smartphone className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Status do WhatsApp</p>
                  <p className="text-xs text-muted-foreground">{badge.label}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={desconectar}
                    disabled={busy}
                    className="text-rose-400 hover:text-rose-300 gap-1.5"
                  >
                    <Unplug className="size-3.5" />
                    Desconectar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={gerarQr}
                    disabled={busy}
                    className="gap-1.5 bg-primary text-primary-foreground font-medium"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                    {qr ? "Atualizar QR Code" : "Conectar WhatsApp"}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <Sparkles className="size-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <strong className="text-emerald-200">Conexão Inteligente:</strong> Ao escanear o QR Code, sua conta é conectada e o Robô de Atendimento já é ativado de forma 100% automática.
              </div>
            </div>

            {/* Visualizador do QR Code */}
            {qr && !isConnected ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-card p-6 text-center space-y-3">
                <div className="p-3 bg-white rounded-2xl shadow-lg">
                  <img
                    src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                    alt="QR Code WhatsApp"
                    className="size-56 object-contain"
                  />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="text-xs font-semibold text-foreground">Abra o WhatsApp no seu celular:</p>
                  <p className="text-[11px] text-muted-foreground">
                    Menu ou Configurações &gt; Aparelhos Conectados &gt; Conectar Aparelho.
                  </p>
                </div>
              </div>
            ) : isConnected ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-2">
                <div className="size-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="size-6" />
                </div>
                <p className="text-sm font-bold text-foreground">WhatsApp Conectado e Pronto!</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Seu número está pareado. Todas as cobranças, faturas e dados de acesso serão enviados automaticamente por este canal.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 p-8 text-center space-y-2 text-muted-foreground">
                <Smartphone className="size-8 opacity-40" />
                <p className="text-xs font-medium">Nenhum QR Code ativo no momento.</p>
                <p className="text-[11px]">Clique em "Conectar WhatsApp" acima para gerar o código.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Envio de Mensagem de Teste */}
        <Card className="surface-card border-border/60 flex flex-col">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="size-4 text-emerald-400" /> Disparo de Teste
            </CardTitle>
            <CardDescription>
              Envie uma mensagem instantânea para o seu próprio número e valide a entrega imediata.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
            <form onSubmit={enviarTeste} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Número de WhatsApp de Teste</Label>
                <Input
                  type="text"
                  placeholder="(11) 99999-8888"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="rounded-xl font-mono text-sm"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Insira com DDD. Se for internacional, inclua o código do país.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs space-y-1 text-muted-foreground">
                <p className="font-semibold text-foreground flex items-center gap-1">
                  <Sparkles className="size-3.5 text-primary" /> Mensagem padrão de validação:
                </p>
                <p className="italic">
                  "🚀 Mensagem de Teste do IPTV Manager! Seu WhatsApp está 100% conectado e integrado ao Painel Sigma..."
                </p>
              </div>

              <Button
                type="submit"
                disabled={sendingTest || !isConnected}
                className="w-full gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sendingTest ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {isConnected ? "Enviar Mensagem de Teste" : "Conecte o WhatsApp para Testar"}
              </Button>
            </form>

            <div className="pt-4 border-t border-border/60">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Quer mudar o texto das cobranças?</span>
                <Link to="/mensagens" className="text-primary font-semibold hover:underline flex items-center gap-1">
                  Configurar modelos <ExternalLink className="size-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Histórico dos Últimos Disparos de WhatsApp */}
      <Card className="surface-card border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="size-4 text-primary" /> Registro Recente de Disparos
            </CardTitle>
            <CardDescription>
              Histórico das últimas mensagens enviadas pelo robô e cobranças manuais.
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
