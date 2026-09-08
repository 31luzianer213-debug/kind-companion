import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  getBotSettings,
  saveBotSettings,
  simulateBotMessage,
} from "@/lib/bot.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bot,
  Send,
  Sparkles,
  ShieldCheck,
  Check,
  Copy,
  RotateCcw,
  Zap,
  Clock,
  Package,
  Layers,
  Phone,
  HelpCircle,
  MessageSquare,
  Smartphone,
  Server,
  KeyRound,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/bot")({
  head: () => ({
    meta: [
      { title: "Robô WhatsApp — Auto-Atendimento & Teste Grátis" },
      {
        name: "description",
        content:
          "Configure o bot do WhatsApp para atendimento 24h, geração de teste grátis no painel Sigma, renovação automática no PIX e entrega de lista M3U.",
      },
    ],
  }),
  component: BotPage,
});

type ChatMessage = {
  id: string;
  sender: "user" | "bot";
  text: string;
  time: string;
};

function BotPage() {
  const queryClient = useQueryClient();
  const getSettings = useServerFn(getBotSettings);
  const saveSettings = useServerFn(saveBotSettings);
  const simulate = useServerFn(simulateBotMessage);

  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  // Form State
  const [form, setForm] = useState({
    enabled: true,
    businessName: "Alpha IPTV",
    testEnabled: true,
    testDurationHours: 4,
    testPackageName: "TESTE LISTA IPTV ALPHA COM TODOS CONTEUDOS COM ADULTOS 🔞",
    blockRepeatDays: 7,
    menuGreeting: "",
    plansText: "",
    supportMessage: "",
    pixKey: "",
    pixHolder: "",
  });

  // Simulator State
  const [simText, setSimText] = useState("");
  const [simLoading, setSimLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "bot",
      text:
        "👋 Olá! Seja muito bem-vindo(a) à *Alpha IPTV*! 🍿\n" +
        "Eu sou o assistente virtual do *Alpha server IPTV* e estou aqui para te atender 24h por dia.\n\n" +
        "Como posso te ajudar hoje? Digite o *número* da opção desejada:\n\n" +
        "1️⃣ *Gerar Teste Grátis* (Acesso Imediato)\n" +
        "2️⃣ *Renovar Minha Assinatura* (PIX Automático)\n" +
        "3️⃣ *Comprar Novo Acesso / Planos*\n" +
        "4️⃣ *Reenviar Meus Dados de Acesso / Lista M3U*\n" +
        "5️⃣ *Falar com Atendente Humano*\n\n" +
        "_Responda com 1, 2, 3, 4 ou 5._",
      time: "Agora",
    },
  ]);

  const { data: botData, isLoading } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => getSettings({}),
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setCurrentUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (botData?.config) {
      setForm({
        enabled: botData.config.enabled ?? true,
        businessName: botData.config.businessName || "Alpha IPTV",
        testEnabled: botData.config.testEnabled ?? true,
        testDurationHours: botData.config.testDurationHours ?? 4,
        testPackageName:
          botData.config.testPackageName || "TESTE LISTA IPTV ALPHA COM TODOS CONTEUDOS COM ADULTOS 🔞",
        blockRepeatDays: botData.config.blockRepeatDays ?? 7,
        menuGreeting: botData.config.menuGreeting || "",
        plansText: botData.config.plansText || "",
        supportMessage: botData.config.supportMessage || "",
        pixKey: botData.config.pixKey || "",
        pixHolder: botData.config.pixHolder || "",
      });
    }
  }, [botData]);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/hooks/whatsapp-bot${currentUserId ? `?userId=${currentUserId}` : ""}`
    : "/api/public/hooks/whatsapp-bot";

  function handleCopyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success("URL do Webhook copiada para a área de transferência!");
    setTimeout(() => setCopiedWebhook(false), 2500);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveSettings({ data: form });
      if (res.ok) {
        toast.success("Configurações do Robô WhatsApp salvas com sucesso! 🤖");
        queryClient.invalidateQueries({ queryKey: ["bot-settings"] });
      } else {
        toast.error("Erro ao salvar configurações.");
      }
    } catch {
      toast.error("Falha ao salvar configurações do robô.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendSim(textToSend?: string) {
    const text = (textToSend ?? simText).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setSimText("");
    setSimLoading(true);

    try {
      const res = await simulate({
        data: {
          text,
          phone: "5511999999999",
          pushName: "Cliente Teste",
        },
      });

      if (res?.reply) {
        const botMsg: ChatMessage = {
          id: Math.random().toString(),
          sender: "bot",
          text: res.reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch {
      toast.error("Erro ao simular resposta do bot.");
    } finally {
      setSimLoading(false);
    }
  }

  function handleResetChat() {
    setMessages([
      {
        id: "1",
        sender: "bot",
        text:
          form.menuGreeting
            ? form.menuGreeting
                .replace(/{empresa}/g, form.businessName)
                .replace(/{servidor}/g, "Alpha server IPTV")
            : "👋 Olá! Seja muito bem-vindo(a) à *Alpha IPTV*! 🍿\n" +
              "Eu sou o assistente virtual do *Alpha server IPTV* e estou aqui para te atender 24h por dia.\n\n" +
              "Como posso te ajudar hoje? Digite o *número* da opção desejada:\n\n" +
              "1️⃣ *Gerar Teste Grátis* (Acesso Imediato)\n" +
              "2️⃣ *Renovar Minha Assinatura* (PIX Automático)\n" +
              "3️⃣ *Comprar Novo Acesso / Planos*\n" +
              "4️⃣ *Reenviar Meus Dados de Acesso / Lista M3U*\n" +
              "5️⃣ *Falar com Atendente Humano*\n\n" +
              "_Responda com 1, 2, 3, 4 ou 5._",
        time: "Agora",
      },
    ]);
  }

  const autoConfigWebhook = useServerFn(autoConfigureEvolutionWebhook);
  const [configuringWebhook, setConfiguringWebhook] = useState(false);

  async function handleAutoConfigureWebhook() {
    setConfiguringWebhook(true);
    try {
      const res = await autoConfigWebhook({ data: { webhookUrl } });
      if (res.ok) {
        toast.success(res.message || "Webhook configurado com sucesso na sua Evolution API!");
      } else {
        toast.error(res.error || "Não foi possível configurar automaticamente. Configure manualmente pelo passo a passo.");
      }
    } catch {
      toast.error("Erro ao enviar comando de configuração para a VPS.");
    } finally {
      setConfiguringWebhook(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Bot className="size-6 text-primary" /> Robô de Auto-Atendimento & Teste WhatsApp
            </h1>
            <Badge
              variant="outline"
              className={
                form.enabled
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                  : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30 text-xs"
              }
            >
              {form.enabled ? "Robô 24h Ativo" : "Robô Pausado"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Atendimento automático no WhatsApp: seus clientes podem gerar testes no Sigma com lista M3U completa, renovar assinaturas e tirar dúvidas sozinhos.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-muted/40 p-2.5 rounded-xl border border-border/60">
          <span className="text-xs font-semibold text-foreground">Status do Robô:</span>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.enabled}
              onCheckedChange={(val) => setForm({ ...form, enabled: val })}
              id="bot-toggle"
            />
            <Label htmlFor="bot-toggle" className="text-xs cursor-pointer font-medium">
              {form.enabled ? "Ligado" : "Desligado"}
            </Label>
          </div>
        </div>
      </div>

      {/* Grid Principal: Configurações + Simulador */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Coluna Esquerda: Configurações do Robô (7 colunas) */}
        <div className="lg:col-span-7 space-y-5">
          <form onSubmit={handleSave} className="space-y-5">
            {/* Card 1: Teste Grátis & Anti-Fraude */}
            <Card className="surface-card border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="size-4 text-amber-400" /> Teste Grátis Automático no Painel Sigma
                </CardTitle>
                <CardDescription>
                  Gera a linha no Sigma, extrai a Lista M3U Plus e o EPG e entrega imediatamente no WhatsApp do cliente.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">Permitir Geração de Teste Grátis (Opção 1)</p>
                    <p className="text-[11px] text-muted-foreground">
                      Quando ativo, qualquer cliente pode digitar 1 no WhatsApp e receber um teste imediato.
                    </p>
                  </div>
                  <Switch
                    checked={form.testEnabled}
                    onCheckedChange={(val) => setForm({ ...form, testEnabled: val })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Clock className="size-3.5 text-primary" /> Duração do Teste (Horas)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={form.testDurationHours}
                      onChange={(e) => setForm({ ...form, testDurationHours: Number(e.target.value) || 4 })}
                      className="rounded-xl text-sm font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">Padrão do Sigma: 2, 4 ou 6 horas.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-emerald-400" /> Bloqueio Anti-Fraude (Dias)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={form.blockRepeatDays}
                      onChange={(e) => setForm({ ...form, blockRepeatDays: Number(e.target.value) || 7 })}
                      className="rounded-xl text-sm font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Impede que o mesmo número gere outro teste antes deste prazo.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Package className="size-3.5 text-primary" /> Pacote Padrão de Teste no Sigma
                  </Label>
                  <Input
                    type="text"
                    value={form.testPackageName}
                    onChange={(e) => setForm({ ...form, testPackageName: e.target.value })}
                    placeholder="Ex: TESTE LISTA IPTV ALPHA COM TODOS CONTEUDOS COM ADULTOS 🔞"
                    className="rounded-xl text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Nome do pacote atribuído no Sigma para as linhas de teste criadas pelo bot.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Personalização do Menu & Boas-Vindas */}
            <Card className="surface-card border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="size-4 text-primary" /> Menu de Boas-Vindas do WhatsApp
                </CardTitle>
                <CardDescription>
                  Texto enviado quando o cliente manda qualquer mensagem de início de conversa.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nome da Sua Revenda / Marca</Label>
                  <Input
                    type="text"
                    value={form.businessName}
                    onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                    placeholder="Ex: Alpha IPTV"
                    className="rounded-xl text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Mensagem do Menu Principal</Label>
                    <span className="text-[11px] text-muted-foreground">Tags: &#123;empresa&#125;, &#123;servidor&#125;</span>
                  </div>
                  <Textarea
                    rows={7}
                    value={form.menuGreeting}
                    onChange={(e) => setForm({ ...form, menuGreeting: e.target.value })}
                    className="rounded-xl font-mono text-xs leading-relaxed resize-none"
                    placeholder="Cole aqui o texto do menu principal..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Planos e Suporte Humano */}
            <Card className="surface-card border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="size-4 text-primary" /> Tabela de Planos & Suporte Humano
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Texto dos Planos (Opção 3 - Comprar/Assinar)</Label>
                  <Textarea
                    rows={5}
                    value={form.plansText}
                    onChange={(e) => setForm({ ...form, plansText: e.target.value })}
                    className="rounded-xl font-mono text-xs leading-relaxed resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Mensagem de Atendente Humano (Opção 5)</Label>
                  <Textarea
                    rows={3}
                    value={form.supportMessage}
                    onChange={(e) => setForm({ ...form, supportMessage: e.target.value })}
                    className="rounded-xl font-mono text-xs leading-relaxed resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Botão de Salvar */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="submit" disabled={saving} className="rounded-xl gap-2 font-bold px-6 shadow-md shadow-primary/20">
                <Sparkles className="size-4" />
                {saving ? "Salvando..." : "Salvar Configurações do Robô"}
              </Button>
            </div>
          </form>

          {/* Card 4: Webhook da Evolution API */}
          <Card className="surface-card border-primary/30 bg-primary/[0.02] shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary">
                  <KeyRound className="size-4" /> Webhook da Evolution API (Na sua VPS)
                </CardTitle>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                  Evento: MESSAGES_UPSERT
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Esta é a URL que a Evolution API na sua VPS chama quando alguém manda mensagem no seu WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-2 bg-muted/60 p-2.5 rounded-xl border border-border/60">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-transparent border-0 text-xs font-mono select-all focus-visible:ring-0"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyWebhook}
                  className="gap-1.5 text-xs font-semibold shrink-0"
                >
                  {copiedWebhook ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  {copiedWebhook ? "Copiado!" : "Copiar URL"}
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-foreground">Configuração Automática em 1 Clique</p>
                  <p className="text-[11px] text-muted-foreground">
                    Envia o comando direto para sua Evolution API registrar o webhook na sua instância sem você precisar acessar a VPS.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleAutoConfigureWebhook}
                  disabled={configuringWebhook}
                  className="rounded-xl gap-1.5 text-xs font-bold shrink-0 bg-primary hover:bg-primary/90 shadow-sm"
                >
                  <Zap className="size-3.5" />
                  {configuringWebhook ? "Configurando na VPS..." : "Ativar na Minha VPS"}
                </Button>
              </div>

              {/* Passo a Passo Manual */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs space-y-2">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <HelpCircle className="size-3.5 text-primary" /> Como configurar manualmente no painel da Evolution:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-[11px] leading-relaxed">
                  <li>Acesse o painel da sua Evolution API no navegador (ex: <code className="text-primary font-mono">http://IP-DA-VPS:8080/manager</code>).</li>
                  <li>Clique na sua instância de WhatsApp conectada.</li>
                  <li>Abra a aba <strong>Webhook</strong>.</li>
                  <li>Marque a opção <strong>Enabled (Ativado)</strong> como Sim/True.</li>
                  <li>No campo <strong>URL do Webhook</strong>, cole o link copiado acima.</li>
                  <li>Em <strong>Eventos (Events)</strong>, selecione: <code className="text-emerald-400 font-mono">MESSAGES_UPSERT</code> (ou <code className="text-emerald-400 font-mono">messages.upsert</code>).</li>
                  <li>Clique em <strong>Salvar (Save)</strong>. Pronto! O bot responderá a todas as mensagens instantaneamente.</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna Direita: Simulador Interativo do WhatsApp (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Smartphone className="size-4 text-primary" /> Simulador do WhatsApp em Tempo Real
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetChat}
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <RotateCcw className="size-3" /> Reiniciar Chat
            </Button>
          </div>

          {/* Smartphone Mockup */}
          <div className="rounded-3xl border-4 border-border/80 bg-zinc-950 p-3 shadow-2xl overflow-hidden flex flex-col h-[650px]">
            {/* Header do WhatsApp */}
            <div className="bg-emerald-800 text-white p-3 rounded-2xl flex items-center gap-3 shadow-sm shrink-0">
              <div className="size-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-sm shadow-inner">
                🤖
              </div>
              <div className="leading-tight flex-1">
                <p className="text-xs font-bold truncate">{form.businessName || "Alpha IPTV"}</p>
                <p className="text-[10px] text-emerald-200 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" /> online 24h
                </p>
              </div>
              <Badge variant="secondary" className="bg-emerald-900/60 text-[10px] text-emerald-200 border-0">
                Robô Ativo
              </Badge>
            </div>

            {/* Balões de Mensagem */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 text-xs font-sans mt-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[88%] p-3 rounded-2xl whitespace-pre-wrap leading-relaxed shadow-sm text-xs ${
                      msg.sender === "user"
                        ? "bg-emerald-600 text-white rounded-tr-xs"
                        : "bg-zinc-800/90 text-zinc-100 border border-zinc-700/50 rounded-tl-xs"
                    }`}
                  >
                    {msg.text}
                    <div
                      className={`text-[9px] mt-1 text-right ${
                        msg.sender === "user" ? "text-emerald-200" : "text-zinc-400"
                      }`}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              {simLoading && (
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs p-2">
                  <span className="size-1.5 rounded-full bg-primary animate-ping" /> Digitando resposta...
                </div>
              )}
            </div>

            {/* Atalhos Rápidos */}
            <div className="p-2 border-t border-zinc-800/80 bg-zinc-900/80 rounded-xl space-y-1.5 shrink-0">
              <p className="text-[10px] text-zinc-400 font-semibold px-1">Testar Opções com 1 Clique:</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("1")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2 bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
                >
                  1 - Teste Grátis
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("2")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2 bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
                >
                  2 - Renovar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("3")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2 bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
                >
                  3 - Planos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("4")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2 bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
                >
                  4 - Reenviar Dados
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("5")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2 bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200"
                >
                  5 - Suporte
                </Button>
              </div>

              {/* Input de Envio do Simulador */}
              <div className="flex items-center gap-1.5 pt-1">
                <Input
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendSim()}
                  placeholder="Digite uma mensagem ou número (1 a 5)..."
                  className="h-8 text-xs bg-zinc-950 border-zinc-700 rounded-xl"
                  disabled={simLoading}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleSendSim()}
                  disabled={simLoading || !simText.trim()}
                  className="h-8 w-8 p-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 shrink-0"
                >
                  <Send className="size-3.5 text-white" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
