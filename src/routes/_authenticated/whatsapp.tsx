import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Zap,
  Copy,
  Check,
  List,
  Layers,
  KeyRound,
} from "lucide-react";
import {
  getBaileysConnectionStatus,
  startBaileysConnection,
  disconnectBaileysSession,
  sendBaileysTest,
} from "@/lib/baileys.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — Baileys Nativo & Botões Interativos" },
      {
        name: "description",
        content: "Conecte seu WhatsApp via Baileys nativo por QR Code ou Código de Pareamento, com suporte a botões e listas interativas.",
      },
    ],
  }),
  component: WhatsAppPage,
});

function statusBadge(status: string) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") {
    return {
      label: "Conectado (Baileys)",
      color: "bg-emerald-500",
      variant: "default" as const,
      desc: "WhatsApp conectado nativamente! Respostas 24h, botões e listas ativas.",
    };
  }
  if (s === "connecting") {
    return {
      label: "Conectando / Aguardando Leitura",
      color: "bg-amber-500",
      variant: "secondary" as const,
      desc: "Escaneie o QR Code ou insira o Código de Pareamento no seu WhatsApp.",
    };
  }
  return {
    label: "Desconectado",
    color: "bg-red-500",
    variant: "destructive" as const,
    desc: "Gere o QR Code ou solicite o Código de Pareamento para conectar.",
  };
}

function WhatsAppPage() {
  const qc = useQueryClient();
  const [connectTab, setConnectTab] = useState<"qr" | "pairing">("qr");
  const [pairingPhone, setPairingPhone] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Testes
  const [testNumber, setTestNumber] = useState("");
  const [testText, setTestText] = useState("Teste IPTV Manager — WhatsApp conectado com Baileys nativo!");
  const [sendingTest, setSendingTest] = useState(false);

  // Query do Status da Conexão Baileys
  const baileysQuery = useQuery({
    queryKey: ["baileys", "status"],
    queryFn: () => getBaileysConnectionStatus(),
    refetchInterval: (query) => {
      const s = query.state.data?.state?.status;
      return s === "connecting" ? 2000 : 8000;
    },
    retry: 0,
  });

  const state = baileysQuery.data?.state;
  const status = state?.status || "close";
  const isConnected = status === "open";
  const info = statusBadge(status);

  // Toast quando conecta
  useEffect(() => {
    if (isConnected && state?.phoneNumber) {
      toast.success(`WhatsApp conectado com sucesso no número +${state.phoneNumber}!`, {
        id: "baileys-connected-toast",
      });
    }
  }, [isConnected, state?.phoneNumber]);

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

  async function handleStartQr(force = false) {
    setLoadingAction(true);
    try {
      await startBaileysConnection({ data: { mode: "qr", forceRestart: force } });
      toast.success("Solicitando QR Code... Aguarde alguns segundos.");
      qc.invalidateQueries({ queryKey: ["baileys"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar QR Code");
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleStartPairing() {
    const clean = pairingPhone.replace(/\D/g, "");
    if (clean.length < 10) {
      toast.error("Informe o número completo com DDD (ex: 5593991614242)");
      return;
    }
    setLoadingAction(true);
    try {
      await startBaileysConnection({ data: { mode: "pairing", phone: clean, forceRestart: true } });
      toast.success("Código de pareamento solicitado! Aguarde ~5 segundos.");
      qc.invalidateQueries({ queryKey: ["baileys"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao solicitar código de pareamento");
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleLogout() {
    if (!confirm("Deseja realmente desconectar o WhatsApp? Será necessário escanear o QR Code novamente.")) return;
    setLoadingAction(true);
    try {
      await disconnectBaileysSession();
      toast.success("WhatsApp desconectado.");
      qc.invalidateQueries({ queryKey: ["baileys"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao desconectar");
    } finally {
      setLoadingAction(false);
    }
  }

  function handleCopyPairingCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success("Código copiado!");
    setTimeout(() => setCopiedCode(false), 2000);
  }

  async function handleSendTest(type: "text" | "buttons" | "list" | "pix_copy") {
    const cleanNum = testNumber.replace(/\D/g, "");
    if (cleanNum.length < 10) {
      toast.error("Informe o número de teste com DDD (ex: 5593991614242)");
      return;
    }
    setSendingTest(true);
    try {
      await sendBaileysTest({
        data: {
          to: cleanNum,
          text: testText,
          testType: type,
        },
      });
      const typeLabels = {
        text: "Texto simples",
        buttons: "Botões rápidos",
        list: "Lista interativa",
        pix_copy: "Botão Copiar PIX",
      };
      toast.success(`Teste (${typeLabels[type]}) enviado! Confira seu WhatsApp.`);
      qc.invalidateQueries({ queryKey: ["whatsapp-recent-logs"] });
    } catch (err: any) {
      toast.error(err.message || "Falha ao enviar mensagem de teste");
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl animate-in fade-in duration-300">
      {/* Banner de Destaque: Baileys Nativo */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Zap className="size-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-foreground flex items-center gap-2">
                WhatsApp Baileys Nativo
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/40 text-[10px]">
                  24h Ativo
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                Conexão direta integrada ao servidor. Suporta <strong>botões clicáveis</strong>, <strong>listas interativas</strong> e <strong>botão de copiar PIX</strong>.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["baileys"] })}
            className="rounded-full text-xs font-bold gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className="size-3.5" /> Atualizar Status
          </Button>
        </div>
      </div>

      {/* Card Principal: Status da Conexão e Métodos de Pareamento */}
      <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-md space-y-4">
        <div className="flex items-center gap-3">
          <span className={`size-3 shrink-0 rounded-full ${info.color} ${status === "connecting" ? "animate-pulse" : ""}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-extrabold text-foreground">Conexão WhatsApp</p>
              <Badge variant={info.variant}>{info.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{info.desc}</p>
          </div>
          {state?.phoneNumber && (
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground block">Número Conectado:</span>
              <span className="font-mono font-bold text-sm text-primary">+{state.phoneNumber}</span>
            </div>
          )}
        </div>

        {/* Se já está conectado */}
        {isConnected && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-emerald-400">
              <CheckCircle2 className="size-5 shrink-0" />
              <div className="text-xs font-semibold">
                WhatsApp conectado com sucesso! O robô de auto-atendimento e os disparos de cobrança estão 100% operacionais 24 horas por dia.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full font-bold text-xs gap-1.5"
                onClick={() => handleStartQr(true)}
                disabled={loadingAction}
              >
                <RefreshCw className="size-3.5" /> Reconectar / Novo QR Code
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-full font-bold text-xs gap-1.5"
                onClick={handleLogout}
                disabled={loadingAction}
              >
                <LogOut className="size-3.5" /> Desconectar WhatsApp
              </Button>
            </div>
          </div>
        )}

        {/* Se NÃO está conectado, exibe Abas de Conexão: QR Code ou Pairing Code */}
        {!isConnected && (
          <div className="space-y-4 pt-2">
            <Tabs value={connectTab} onValueChange={(v) => setConnectTab(v as "qr" | "pairing")}>
              <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
                <TabsTrigger value="qr" className="font-bold text-xs gap-1.5">
                  <QrCode className="size-3.5" /> 1. Escanear QR Code
                </TabsTrigger>
                <TabsTrigger value="pairing" className="font-bold text-xs gap-1.5">
                  <KeyRound className="size-3.5" /> 2. Código de Pareamento
                </TabsTrigger>
              </TabsList>

              {/* Aba QR Code */}
              <TabsContent value="qr" className="space-y-3 pt-3">
                <div className="text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Clique em <strong>Gerar QR Code</strong> e aponte a câmera do WhatsApp (Aparelhos Conectados &rarr; Conectar Aparelho).
                  </p>
                  <Button
                    onClick={() => handleStartQr(false)}
                    disabled={loadingAction}
                    className="rounded-full font-bold gap-1.5 shadow-sm"
                  >
                    {loadingAction ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                    {state?.qrCodeBase64 ? "Gerar Novo QR Code" : "Gerar QR Code Agora"}
                  </Button>
                </div>

                {state?.qrCodeBase64 && (
                  <div className="grid place-items-center rounded-2xl border bg-card/60 p-4 space-y-3">
                    <img
                      src={state.qrCodeBase64}
                      alt="QR Code WhatsApp"
                      className="size-64 rounded-xl bg-white object-contain p-2 shadow-md"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      📱 WhatsApp &rarr; <strong>Aparelhos conectados</strong> &rarr; <strong>Conectar aparelho</strong> (Expira em ~45s)
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Aba Pairing Code */}
              <TabsContent value="pairing" className="space-y-3 pt-3">
                <div className="max-w-md mx-auto space-y-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    Conecte digitando o número do seu chip. Você receberá um código de 8 dígitos para digitar no WhatsApp.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="55 + DDD + número (ex: 5593991614242)"
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      className="font-mono text-xs rounded-xl flex-1 text-center sm:text-left"
                    />
                    <Button
                      onClick={handleStartPairing}
                      disabled={loadingAction}
                      className="rounded-full font-bold gap-1.5 shadow-sm shrink-0"
                    >
                      {loadingAction ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                      Gerar Código
                    </Button>
                  </div>

                  {state?.pairingCode && (
                    <div className="rounded-2xl border-2 border-primary/50 bg-primary/10 p-5 text-center space-y-3 animate-in zoom-in-95">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        Seu Código de Pareamento:
                      </p>
                      <div className="flex items-center justify-center gap-3">
                        <span className="font-mono font-extrabold text-3xl tracking-widest text-primary bg-background/80 px-4 py-2 rounded-xl border border-primary/30 shadow-inner">
                          {state.pairingCode}
                        </span>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="rounded-xl size-11"
                          onClick={() => handleCopyPairingCode(state.pairingCode!)}
                        >
                          {copiedCode ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                        </Button>
                      </div>
                      <div className="text-[11px] text-muted-foreground text-left bg-background/50 p-3 rounded-xl space-y-1">
                        <p className="font-bold text-foreground">Como conectar:</p>
                        <p>1. No celular, abra o <strong>WhatsApp</strong>.</p>
                        <p>2. Toque nos 3 pontinhos &rarr; <strong>Aparelhos Conectados</strong> &rarr; <strong>Conectar Aparelho</strong>.</p>
                        <p>3. Na tela da câmera, toque em <strong>"Conectar com número de telefone"</strong>.</p>
                        <p>4. Digite o código de 8 dígitos exibido acima.</p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Testador Interativo de Envio */}
        <div className="mt-4 rounded-xl border bg-secondary/30 p-3.5 space-y-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Send className="size-3.5 text-primary" /> Testar Envio de Mensagens & Recursos Interativos
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="baileys-test-number"
              placeholder="Número com DDD (ex: 5593991614242)"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="font-mono text-xs rounded-xl flex-1"
            />
          </div>
          <Textarea
            id="baileys-test-message"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={2}
            className="rounded-xl text-xs font-sans resize-none"
            placeholder="Texto da mensagem de teste..."
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              id="test-send-text-btn"
              variant="outline"
              size="sm"
              disabled={sendingTest || !isConnected}
              onClick={() => handleSendTest("text")}
              className="rounded-full text-xs font-bold gap-1.5"
            >
              {sendingTest ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
              Texto Simples
            </Button>
            <Button
              id="test-send-buttons-btn"
              variant="secondary"
              size="sm"
              disabled={sendingTest || !isConnected}
              onClick={() => handleSendTest("buttons")}
              className="rounded-full text-xs font-bold gap-1.5 shadow-sm"
            >
              {sendingTest ? <Loader2 className="size-3 animate-spin" /> : <Layers className="size-3 text-primary" />}
              🔘 Testar Botões Clicáveis
            </Button>
            <Button
              id="test-send-list-btn"
              variant="secondary"
              size="sm"
              disabled={sendingTest || !isConnected}
              onClick={() => handleSendTest("list")}
              className="rounded-full text-xs font-bold gap-1.5 shadow-sm"
            >
              {sendingTest ? <Loader2 className="size-3 animate-spin" /> : <List className="size-3 text-primary" />}
              📋 Testar Lista Interativa
            </Button>
            <Button
              id="test-send-pix-btn"
              variant="secondary"
              size="sm"
              disabled={sendingTest || !isConnected}
              onClick={() => handleSendTest("pix_copy")}
              className="rounded-full text-xs font-bold gap-1.5 shadow-sm"
            >
              {sendingTest ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3 text-amber-400" />}
              💳 Testar Botão Copiar PIX
            </Button>
          </div>
        </div>
      </div>

      {/* Card: Histórico Recente de Disparos */}
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
