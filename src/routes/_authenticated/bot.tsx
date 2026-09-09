import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  getBotSettings,
  saveBotSettings,
  simulateBotMessage,
} from "@/lib/bot.functions";
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
  RotateCcw,
  Clock,
  Package,
  Layers,
  MessageSquare,
  Smartphone,
  Server,
  Zap,
  Wallet,
  Lock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  DollarSign,
  Tv,
  RefreshCw,
  ExternalLink,
  Download,
  Laptop,
  Monitor,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/bot")({
  head: () => ({
    meta: [
      { title: "Robô WhatsApp — Auto-Atendimento & PIX Automático" },
      {
        name: "description",
        content:
          "Configure o bot do WhatsApp para auto-atendimento 24h, geração de testes, renovação automática no PIX do Mercado Pago e entrega de lista M3U.",
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

function formatPlansText(prices: {
  monthly: number;
  quarterly: number;
  semiannual: number;
  annual: number;
  serverName: string;
}): string {
  const m = Number(prices.monthly || 35).toFixed(2).replace(".", ",");
  const q = Number(prices.quarterly || 90).toFixed(2).replace(".", ",");
  const s = Number(prices.semiannual || 160).toFixed(2).replace(".", ",");
  const a = Number(prices.annual || 280).toFixed(2).replace(".", ",");
  const srv = prices.serverName || "Alpha IPTV";

  return (
    `🛒 *PLANOS E ASSINATURAS ${srv.toUpperCase()}* 🍿\n\n` +
    `📺 *1 Mês (Mensal):* R$ ${m}\n` +
    `📺 *3 Meses (Trimestral):* R$ ${q} (Econômico!)\n` +
    `📺 *6 Meses (Semestral):* R$ ${s} (Mais Vendido! 🔥)\n` +
    `📺 *12 Meses (Anual):* R$ ${a} (Melhor Desconto ⭐)\n\n` +
    `⭐ *Todos os planos incluem:*\n` +
    `• Mais de 80.000 conteúdos (Canais 4K/FHD, Filmes e Séries atualizados)\n` +
    `• Guia de Canais completo (EPG)\n` +
    `• Compatível com TV Box, Smart TV, Celular, Computador e Tablet\n` +
    `• Liberação Imediata com PIX Automático!`
  );
}

function BotPage() {
  const queryClient = useQueryClient();
  const getSettings = useServerFn(getBotSettings);
  const saveSettings = useServerFn(saveBotSettings);
  const simulate = useServerFn(simulateBotMessage);

  const [saving, setSaving] = useState(false);
  const [showMpToken, setShowMpToken] = useState(false);

  // Form State
  const [form, setForm] = useState({
    enabled: true,
    businessName: "Alpha IPTV",
    serverName: "Alpha server IPTV",
    streamingDns: "http://karen256.top",
    testEnabled: true,
    testDurationHours: 4,
    testPackageName: "TESTE LISTA IPTV ALPHA COM TODOS CONTEUDOS COM ADULTOS 🔞",
    blockRepeatDays: 7,
    planMonthlyPrice: 35.0,
    planQuarterlyPrice: 90.0,
    planSemiannualPrice: 160.0,
    planAnnualPrice: 290.0,
    renewalPrice: 35.0,
    menuGreeting: "",
    plansText: "",
    supportMessage: "",
    pixKey: "",
    pixHolder: "Alpha IPTV",
    mercadopago_token: "APP_USR-3160859496295692-031614-d4b7df3cf7507800baabef77d641c0f2-1487021055",
    payment_provider: "mercadopago",
    appAndroidApk: "https://bit.ly/app-xciptv-oficial",
    appAndroidDownloaderCode: "389471",
    appIosLink: "https://apps.apple.com/app/smarters-player-lite/id1628995509",
    appWindowsLink: "https://www.iptvsmarters.com/download?download=windows",
    appWebPlayerLink: "http://webtv.iptvsmarters.com",
    appSmartTvText: "• Smart TV Samsung / LG: Baixe o app IBO Player, SmartOne IPTV ou Bob Player na loja da sua TV e nos envie o Mac / Device ID.",
    appsCustomText: "",
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
        "4️⃣ *Baixar Aplicativos* (Celular, TV Box, PC, iOS) 📲\n" +
        "5️⃣ *Reenviar Meus Dados de Acesso / Lista M3U*\n" +
        "6️⃣ *Falar com Atendente Humano*\n\n" +
        "_Responda com 1, 2, 3, 4, 5 ou 6._",
      time: "Agora",
    },
  ]);

  const { data: botData, isLoading } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: async () => {
      try {
        const res = await getSettings({});
        return res;
      } catch (err) {
        console.warn("Aviso ao carregar bot settings:", err);
        return { ok: true as const, config: null };
      }
    },
  });

  useEffect(() => {
    if (botData?.config) {
      const c = botData.config;
      setForm({
        enabled: c.enabled ?? true,
        businessName: c.businessName || "Alpha IPTV",
        serverName: c.serverName || "Alpha server IPTV",
        streamingDns: c.streamingDns || "http://karen256.top",
        testEnabled: c.testEnabled ?? true,
        testDurationHours: Number(c.testDurationHours ?? 4),
        testPackageName:
          c.testPackageName || "TESTE LISTA IPTV ALPHA COM TODOS CONTEUDOS COM ADULTOS 🔞",
        blockRepeatDays: Number(c.blockRepeatDays ?? 7),
        planMonthlyPrice: Number(c.planMonthlyPrice ?? 35.0),
        planQuarterlyPrice: Number(c.planQuarterlyPrice ?? 90.0),
        planSemiannualPrice: Number(c.planSemiannualPrice ?? 160.0),
        planAnnualPrice: Number(c.planAnnualPrice ?? 290.0),
        renewalPrice: Number(c.renewalPrice ?? 35.0),
        menuGreeting: c.menuGreeting || "",
        plansText: c.plansText || "",
        supportMessage: c.supportMessage || "",
        pixKey: c.pixKey || "",
        pixHolder: c.pixHolder || "Alpha IPTV",
        mercadopago_token:
          c.mercadopago_token || "APP_USR-3160859496295692-031614-d4b7df3cf7507800baabef77d641c0f2-1487021055",
        payment_provider: c.payment_provider || "mercadopago",
        appAndroidApk: c.appAndroidApk || "https://bit.ly/app-xciptv-oficial",
        appAndroidDownloaderCode: c.appAndroidDownloaderCode || "389471",
        appIosLink: c.appIosLink || "https://apps.apple.com/app/smarters-player-lite/id1628995509",
        appWindowsLink: c.appWindowsLink || "https://www.iptvsmarters.com/download?download=windows",
        appWebPlayerLink: c.appWebPlayerLink || "http://webtv.iptvsmarters.com",
        appSmartTvText: c.appSmartTvText || "• Smart TV Samsung / LG: Baixe o app IBO Player, SmartOne IPTV ou Bob Player na loja da sua TV e nos envie o Mac / Device ID.",
        appsCustomText: c.appsCustomText || "",
      });
    }
  }, [botData]);

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await saveSettings({ data: form });
      if (res?.ok) {
        toast.success("Configurações do Robô salvas com sucesso! 🤖⚡");
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

  async function handleToggleEnabled(val: boolean) {
    setForm((prev) => ({ ...prev, enabled: val }));
    try {
      const res = await saveSettings({ data: { ...form, enabled: val } });
      if (res?.ok) {
        queryClient.invalidateQueries({ queryKey: ["bot-settings"] });
        if (val) {
          toast.success("Robô WhatsApp ATIVADO! 🤖 Respondendo 24h.");
        } else {
          toast.warning("Robô WhatsApp DESLIGADO! 🛑 Respostas pausadas.");
        }
      } else {
        setForm((prev) => ({ ...prev, enabled: !val }));
        toast.error("Erro ao alterar status do robô.");
      }
    } catch {
      setForm((prev) => ({ ...prev, enabled: !val }));
      toast.error("Falha ao alterar status.");
    }
  }

  function handleRegeneratePlansText() {
    const formatted = formatPlansText({
      monthly: form.planMonthlyPrice,
      quarterly: form.planQuarterlyPrice,
      semiannual: form.planSemiannualPrice,
      annual: form.planAnnualPrice,
      serverName: form.serverName || form.businessName,
    });
    setForm((prev) => ({ ...prev, plansText: formatted }));
    toast.success("Texto dos planos atualizado com os novos preços! ✨");
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

  function handleRestoreDefaultAppLinks() {
    setForm((prev) => ({
      ...prev,
      appAndroidApk: "https://bit.ly/app-xciptv-oficial",
      appAndroidDownloaderCode: "389471",
      appIosLink: "https://apps.apple.com/app/smarters-player-lite/id1628995509",
      appWindowsLink: "https://www.iptvsmarters.com/download?download=windows",
      appWebPlayerLink: "http://webtv.iptvsmarters.com",
      appSmartTvText: "• Smart TV Samsung / LG: Baixe o app IBO Player, SmartOne IPTV ou Bob Player na loja da sua TV e nos envie o Mac / Device ID.",
      appsCustomText: "",
    }));
    toast.success("Links recomendados dos aplicativos restaurados com sucesso! 📲");
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
                .replace(/{servidor}/g, form.serverName)
            : "👋 Olá! Seja muito bem-vindo(a) à *Alpha IPTV*! 🍿\n" +
              "Eu sou o assistente virtual do *Alpha server IPTV* e estou aqui para te atender 24h por dia.\n\n" +
              "Como posso te ajudar hoje? Digite o *número* da opção desejada:\n\n" +
              "1️⃣ *Gerar Teste Grátis* (Acesso Imediato)\n" +
              "2️⃣ *Renovar Minha Assinatura* (PIX Automático)\n" +
              "3️⃣ *Comprar Novo Acesso / Planos*\n" +
              "4️⃣ *Baixar Aplicativos* (Celular, TV Box, PC, iOS) 📲\n" +
              "5️⃣ *Reenviar Meus Dados de Acesso / Lista M3U*\n" +
              "6️⃣ *Falar com Atendente Humano*\n\n" +
              "_Responda com 1, 2, 3, 4, 5 ou 6._",
        time: "Agora",
      },
    ]);
  }

  const isMpActive = Boolean(form.mercadopago_token?.trim());

  return (
    <div className="space-y-6 max-w-7xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Bot className="size-6 text-primary" /> Robô WhatsApp & Auto-Atendimento
            </h1>
            <Badge
              variant={form.enabled ? "success" : "secondary"}
              className="text-xs py-0.5 px-2.5 gap-1.5"
            >
              <span className={`size-1.5 rounded-full ${form.enabled ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
              {form.enabled ? "Robô 24h Ativo" : "Robô Pausado"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Personalize os preços dos planos, configure o servidor IPTV e ative o PIX Copia e Cola automático do Mercado Pago para renovação e compras.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-muted/40 p-2.5 rounded-xl border border-border/60">
            <span className="text-xs font-semibold text-foreground">Status do Robô:</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.enabled}
                onCheckedChange={handleToggleEnabled}
                id="bot-toggle"
              />
              <Label htmlFor="bot-toggle" className="text-xs cursor-pointer font-medium">
                {form.enabled ? "Ligado" : "Desligado"}
              </Label>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="rounded-xl gap-2 font-semibold px-6 shadow-sm"
          >
            <Sparkles className="size-4" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </div>

      {/* Grid Principal */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Coluna Esquerda: Configurações do Robô (7 colunas) */}
        <div className="lg:col-span-7 space-y-5">
          <form onSubmit={handleSave} className="space-y-5">
            {/* CARD 1: MERCADO PAGO (PIX COPIA E COLA) */}
            <Card className="surface-card border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 text-foreground font-bold">
                    <Wallet className="size-5 text-emerald-500" /> Mercado Pago (PIX Automático)
                  </CardTitle>
                  <Badge
                    variant={isMpActive ? "success" : "warning"}
                    className="text-xs"
                  >
                    {isMpActive ? "⚡ PIX Dinâmico Ativo" : "📋 Chave PIX Manual"}
                  </Badge>
                </div>
                <CardDescription>
                  Com o Mercado Pago ativado, o robô envia na hora o código <strong>PIX Copia e Cola</strong> e o link de pagamento para renovações e planos!
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {isMpActive ? (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-2.5 text-xs text-foreground">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-400">PIX Automático Ativado!</p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        As opções 2 (Renovar) e 3 (Comprar Planos) geram códigos PIX Copia e Cola dinâmicos do Mercado Pago com baixa automática no Sigma.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-foreground">
                    <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-400">Modo Manual Ativo</p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        Cole seu <strong>Access Token</strong> abaixo para o robô gerar PIX Copia e Cola na hora. Caso não tenha, o robô enviará sua chave PIX estática.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Lock className="size-3.5 text-primary" /> Access Token do Mercado Pago
                    </Label>
                    <a
                      href="https://www.mercadopago.com.br/developers/panel/app"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      Onde pegar meu Token? <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <div className="relative flex items-center">
                    <Input
                      type={showMpToken ? "text" : "password"}
                      placeholder="APP_USR-0000000000000000-000000-..."
                      value={form.mercadopago_token}
                      onChange={(e) => setForm({ ...form, mercadopago_token: e.target.value })}
                      className="rounded-xl font-mono text-xs pr-20"
                    />
                    <div className="absolute right-1 flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMpToken(!showMpToken)}
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      >
                        {showMpToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/40 pt-3">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2">
                    🔑 Chave PIX Manual (Fallback de contingência):
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">Chave PIX</Label>
                      <Input
                        type="text"
                        placeholder="Ex: seu-pix@email.com"
                        value={form.pixKey}
                        onChange={(e) => setForm({ ...form, pixKey: e.target.value })}
                        className="rounded-xl text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">Titular da Chave</Label>
                      <Input
                        type="text"
                        placeholder="Ex: Alpha IPTV"
                        value={form.pixHolder}
                        onChange={(e) => setForm({ ...form, pixHolder: e.target.value })}
                        className="rounded-xl text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CARD 2: PREÇOS DOS PLANOS & RENOVAÇÃO */}
            <Card className="surface-card border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 text-foreground font-bold">
                    <DollarSign className="size-5 text-emerald-500" /> Tabela de Preços do Bot & Renovação
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRegeneratePlansText}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    <Sparkles className="size-3 text-primary" /> Atualizar Texto com esses Preços
                  </Button>
                </div>
                <CardDescription>
                  Defina os valores cobrados nos pedidos do WhatsApp. O robô usará esses preços exatos ao gerar os pagamentos PIX.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {/* Renovação Mensal */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-primary/5 border border-primary/20 sm:col-span-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <RefreshCw className="size-3.5 text-primary" /> Valor da Renovação Mensal (Opção 2)
                      </Label>
                      <Badge variant="outline" className="border-primary/30 text-primary font-semibold text-[10px]">
                        Cobrado na Opção 2
                      </Badge>
                    </div>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        step="0.50"
                        min="1"
                        value={form.renewalPrice}
                        onChange={(e) => setForm({ ...form, renewalPrice: Number(e.target.value) || 0 })}
                        className="rounded-xl text-sm font-mono pl-9 font-bold"
                      />
                    </div>
                  </div>

                  {/* 1 Mês */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <Label className="text-xs font-semibold">1 Mês (Mensal)</Label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        step="0.50"
                        min="1"
                        value={form.planMonthlyPrice}
                        onChange={(e) => setForm({ ...form, planMonthlyPrice: Number(e.target.value) || 0 })}
                        className="rounded-xl text-xs font-mono pl-8"
                      />
                    </div>
                  </div>

                  {/* 3 Meses */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <Label className="text-xs font-semibold">3 Meses (Trimestral)</Label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        step="0.50"
                        min="1"
                        value={form.planQuarterlyPrice}
                        onChange={(e) => setForm({ ...form, planQuarterlyPrice: Number(e.target.value) || 0 })}
                        className="rounded-xl text-xs font-mono pl-8"
                      />
                    </div>
                  </div>

                  {/* 6 Meses */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <Label className="text-xs font-semibold">6 Meses (Semestral)</Label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        step="0.50"
                        min="1"
                        value={form.planSemiannualPrice}
                        onChange={(e) => setForm({ ...form, planSemiannualPrice: Number(e.target.value) || 0 })}
                        className="rounded-xl text-xs font-mono pl-8"
                      />
                    </div>
                  </div>

                  {/* 12 Meses (Anual) */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50 sm:col-span-3">
                    <Label className="text-xs font-semibold">12 Meses (Anual - Melhor Custo-Benefício)</Label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        step="0.50"
                        min="1"
                        value={form.planAnnualPrice}
                        onChange={(e) => setForm({ ...form, planAnnualPrice: Number(e.target.value) || 0 })}
                        className="rounded-xl text-xs font-mono pl-8"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CARD 3: SERVIDOR IPTV & TESTE AUTOMÁTICO SIGMA */}
            <Card className="surface-card border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base flex items-center gap-2">
                  <Tv className="size-4 text-primary" /> Servidor IPTV & Testes no Sigma
                </CardTitle>
                <CardDescription>
                  Configure qual servidor e DNS de streaming o bot usará para gerar os testes e as listas M3U.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Server className="size-3.5 text-primary" /> Nome do Servidor IPTV
                    </Label>
                    <Input
                      type="text"
                      placeholder="Ex: Alpha IPTV ou Alpha server IPTV"
                      value={form.serverName}
                      onChange={(e) => setForm({ ...form, serverName: e.target.value })}
                      className="rounded-xl text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Zap className="size-3.5 text-primary" /> DNS / Host de Streaming
                    </Label>
                    <Input
                      type="text"
                      placeholder="Ex: http://alpha-stream.net"
                      value={form.streamingDns}
                      onChange={(e) => setForm({ ...form, streamingDns: e.target.value })}
                      className="rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>

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
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-primary" /> Bloqueio Anti-Fraude (Dias)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={form.blockRepeatDays}
                      onChange={(e) => setForm({ ...form, blockRepeatDays: Number(e.target.value) || 7 })}
                      className="rounded-xl text-sm font-mono"
                    />
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
                </div>
              </CardContent>
            </Card>

            {/* CARD 4: LINKS DE DOWNLOAD DOS APLICATIVOS (OPÇÃO 4) */}
            <Card className="surface-card border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2 text-foreground font-bold">
                      <Download className="size-5 text-sky-400" /> Links dos Aplicativos para Baixar (Opção 4)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Enviado automaticamente quando o cliente digita <strong>4</strong>, clica em "Baixar Apps" ou pergunta sobre aplicativos.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRestoreDefaultAppLinks}
                    className="rounded-xl text-xs gap-1.5 self-start sm:self-auto"
                  >
                    <Sparkles className="size-3 text-sky-400" /> Restaurar Links Recomendados
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Código Downloader */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                        <Tv className="size-3.5 text-sky-400" /> Código no App Downloader
                      </Label>
                      <Badge variant="outline" className="text-[10px] text-sky-400 border-sky-400/30">
                        TV Box / Firestick
                      </Badge>
                    </div>
                    <Input
                      type="text"
                      placeholder="Ex: 389471"
                      value={form.appAndroidDownloaderCode}
                      onChange={(e) => setForm({ ...form, appAndroidDownloaderCode: e.target.value })}
                      className="rounded-xl font-mono text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Código numérico de 5 ou 6 dígitos para digitar diretamente no aplicativo Downloader da TV.
                    </p>
                  </div>

                  {/* APK Android Direto */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                        <Smartphone className="size-3.5 text-emerald-400" /> Link APK Android (Celular & TV)
                      </Label>
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">
                        APK Direto
                      </Badge>
                    </div>
                    <Input
                      type="text"
                      placeholder="Ex: https://bit.ly/seu-app-iptv"
                      value={form.appAndroidApk}
                      onChange={(e) => setForm({ ...form, appAndroidApk: e.target.value })}
                      className="rounded-xl font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Link direto encurtado para download do arquivo instalador (.apk).
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* iPhone / iOS */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Smartphone className="size-3.5 text-primary" /> Link App Store (iPhone / iPad / Apple TV)
                    </Label>
                    <Input
                      type="text"
                      placeholder="Ex: https://apps.apple.com/app/..."
                      value={form.appIosLink}
                      onChange={(e) => setForm({ ...form, appIosLink: e.target.value })}
                      className="rounded-xl font-mono text-xs"
                    />
                  </div>

                  {/* Windows / PC */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <Laptop className="size-3.5 text-primary" /> Aplicativo Computador / Windows (.exe)
                    </Label>
                    <Input
                      type="text"
                      placeholder="Ex: https://www.iptvsmarters.com/download?download=windows"
                      value={form.appWindowsLink}
                      onChange={(e) => setForm({ ...form, appWindowsLink: e.target.value })}
                      className="rounded-xl font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Web Player */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                    <Monitor className="size-3.5 text-primary" /> Web Player (Assistir direto no Navegador sem instalar)
                  </Label>
                  <Input
                    type="text"
                    placeholder="Ex: http://webtv.iptvsmarters.com"
                    value={form.appWebPlayerLink}
                    onChange={(e) => setForm({ ...form, appWebPlayerLink: e.target.value })}
                    className="rounded-xl font-mono text-xs"
                  />
                </div>

                {/* Instruções Smart TV */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Tv className="size-3.5 text-sky-400" /> Instruções para Smart TV (Samsung, LG e Roku)
                  </Label>
                  <Textarea
                    rows={2}
                    value={form.appSmartTvText}
                    onChange={(e) => setForm({ ...form, appSmartTvText: e.target.value })}
                    className="rounded-xl font-mono text-xs leading-relaxed resize-none"
                    placeholder="Orientações de quais apps baixar na loja da Smart TV..."
                  />
                </div>

                {/* Custom Override (Opcional) */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Texto 100% Personalizado da Opção 4 (Opcional)
                    </Label>
                    <span className="text-[11px] text-muted-foreground">Deixe em branco para usar o modelo automático</span>
                  </div>
                  <Textarea
                    rows={3}
                    value={form.appsCustomText}
                    onChange={(e) => setForm({ ...form, appsCustomText: e.target.value })}
                    className="rounded-xl font-mono text-xs leading-relaxed resize-none"
                    placeholder="Deixe em branco para o sistema gerar automaticamente a mensagem estruturada acima."
                  />
                </div>
              </CardContent>
            </Card>

            {/* CARD 5: MENSAGENS PERSONALIZADAS */}
            <Card className="surface-card border-border/60 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="size-4 text-primary" /> Textos do Menu & Suporte
                </CardTitle>
                <CardDescription>
                  Personalize os textos do menu principal e atendimento humano.
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
                    rows={6}
                    value={form.menuGreeting}
                    onChange={(e) => setForm({ ...form, menuGreeting: e.target.value })}
                    className="rounded-xl font-mono text-xs leading-relaxed resize-none"
                    placeholder="Cole aqui o texto do menu principal..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Texto dos Planos (Opção 3)</Label>
                  <Textarea
                    rows={5}
                    value={form.plansText}
                    onChange={(e) => setForm({ ...form, plansText: e.target.value })}
                    className="rounded-xl font-mono text-xs leading-relaxed resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Mensagem de Atendente Humano (Opção 6)</Label>
                  <Textarea
                    rows={3}
                    value={form.supportMessage}
                    onChange={(e) => setForm({ ...form, supportMessage: e.target.value })}
                    className="rounded-xl font-mono text-xs leading-relaxed resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Botão Inferior de Salvar */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="submit"
                disabled={saving}
                className="rounded-xl gap-2 font-bold px-7 py-6 text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/25"
              >
                <Sparkles className="size-4" />
                {saving ? "Salvando..." : "Salvar Configurações do Robô"}
              </Button>
            </div>
          </form>
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
          <div className="rounded-xl border-2 border-border/80 bg-background/95 p-3 shadow-lg overflow-hidden flex flex-col h-[760px]">
            {/* Header do WhatsApp */}
            <div className="bg-card text-foreground p-3 rounded-lg flex items-center gap-3 border border-border/60 shadow-sm shrink-0">
              <div className="size-9 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm shadow-inner">
                🤖
              </div>
              <div className="leading-tight flex-1">
                <p className="text-xs font-bold truncate text-foreground">{form.businessName || "Alpha IPTV"}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" /> online 24h
                </p>
              </div>
              <Badge variant="outline" className={isMpActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]" : "border-border bg-muted/40 text-muted-foreground text-[10px]"}>
                {isMpActive ? "PIX MP Ativo" : "Robô Ativo"}
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
                    className={`max-w-[90%] p-3 rounded-lg whitespace-pre-wrap leading-relaxed shadow-sm text-xs ${
                      msg.sender === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-xs font-medium"
                        : "bg-card text-foreground border border-border/60 rounded-tl-xs"
                    }`}
                  >
                    {msg.text}
                    <div
                      className={`text-[9px] mt-1 text-right ${
                        msg.sender === "user" ? "text-primary-foreground/75" : "text-muted-foreground"
                      }`}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              {simLoading && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs p-2">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" /> Digitando resposta...
                </div>
              )}
            </div>

            {/* Atalhos Rápidos */}
            <div className="p-2 border-t border-border/60 bg-muted/20 rounded-xl space-y-1.5 shrink-0">
              <p className="text-[10px] text-muted-foreground font-semibold px-1">Testar Opções com 1 Clique:</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("1")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2"
                >
                  1 - Teste Grátis
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("2")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2"
                >
                  2 - Renovar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("2 114818587")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                  2 114818587 (PIX)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("3")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2"
                >
                  3 - Planos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("1")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2 border-primary/30 text-primary hover:bg-primary/10"
                >
                  Plano 1 (Mensal)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("4")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2 border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                >
                  4 - Baixar Apps 📲
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("5")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2"
                >
                  5 - Reenviar Dados
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendSim("6")}
                  disabled={simLoading}
                  className="h-6 text-[10px] rounded-lg px-2"
                >
                  6 - Suporte
                </Button>
              </div>

              {/* Input de Envio do Simulador */}
              <div className="flex items-center gap-1.5 pt-1">
                <Input
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendSim()}
                  placeholder="Digite uma mensagem ou número (1 a 6)..."
                  className="h-8 text-xs rounded-xl"
                  disabled={simLoading}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleSendSim()}
                  disabled={simLoading || !simText.trim()}
                  className="h-8 w-8 p-0 rounded-xl shrink-0"
                >
                  <Send className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
