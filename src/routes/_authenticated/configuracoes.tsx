import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plug, QrCode, RefreshCw, Smartphone, Unplug, CheckCircle2, MessageCircle, Eye, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TEMPLATE_VARS, renderTemplate } from "@/lib/format";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  sendWhatsAppMessage,
} from "@/lib/whatsapp.functions";
import { getSigmaSettings, saveSigmaSettings, syncSigmaClients, testSigmaConnection } from "@/lib/sigma.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "WhatsApp — IPTV Manager" },
      {
        name: "description",
        content: "Conecte seu WhatsApp pelo QR Code e defina a mensagem de cobrança automática.",
      },
      { property: "og:title", content: "WhatsApp — IPTV Manager" },
      { property: "og:description", content: "Conexão do WhatsApp e cobrança automática." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Configuracoes,
});

type Settings = {
  business_name: string;
  message_template: string;
  overdue_template: string;
  welcome_template: string;
  pix_key: string;
  pix_key_type: string;
  pix_holder: string;
  payment_link: string;
  payment_provider: string;
  mercadopago_token: string;
  asaas_token: string;
  asaas_env: string;
  sigma_url: string;
  sigma_username: string;
  sigma_password: string;
  sigma_token: string;
  sigma_enabled: boolean;
  sigma_auto_renew: boolean;
  reminder_days_before: number;
  send_on_due_day: boolean;
  overdue_reminder: boolean;
  auto_send_enabled: boolean;
};

const defaults: Settings = {
  business_name: "",
  overdue_template:
    "Oi {nome}, sua mensalidade de {valor} venceu em {vencimento} ({dias} dias atrás). Para não perder o acesso à lista {lista}, pague pelo PIX {pix}. 🙏",
  welcome_template:
    "Seja bem-vindo(a), {nome}! 🎉\n\nLista: {lista}\nServidor: {servidor}\nUsuário: {usuario}\nSenha: {senha}\nTelas: {telas}\n\nVencimento: {vencimento}. Qualquer dúvida é só chamar!",
  pix_key: "",
  pix_key_type: "aleatoria",
  pix_holder: "",
  payment_link: "",
  payment_provider: "pix",
  mercadopago_token: "",
  asaas_token: "",
  asaas_env: "production",
  message_template:
    "Olá {nome}! Sua mensalidade de {valor} vence em {vencimento}. Qualquer dúvida é só chamar aqui. 😊",
  sigma_url: "",
  sigma_username: "",
  sigma_password: "",
  sigma_token: "",
  sigma_enabled: false,
  sigma_auto_renew: false,
  reminder_days_before: 3,
  send_on_due_day: true,
  overdue_reminder: true,
  auto_send_enabled: false,
};

const stateLabels: Record<string, { label: string; tone: string }> = {
  open: { label: "Conectado", tone: "bg-primary/10 text-primary border-primary/30" },
  connecting: { label: "Aguardando leitura", tone: "bg-amber-100 text-amber-700 border-amber-300" },
  close: { label: "Desconectado", tone: "bg-rose-100 text-rose-700 border-rose-300" },
  none: { label: "Sem sessão", tone: "bg-muted text-muted-foreground border-border" },
};

function WhatsAppSimulator({
  template,
  businessName,
  pixKey,
}: {
  template: string;
  businessName: string;
  pixKey: string;
}) {
  const rendered = renderTemplate(template, {
    nome: "Carlos Silva",
    telefone: "(11) 98765-4321",
    valor: "R$ 35,00",
    vencimento: "15/10/2026",
    dias: "2",
    lista: "Servidor Ouro 4K",
    servidor: "http://iptv-turbo.com:8080",
    usuario: "carlos_silva",
    senha: "px876543",
    telas: "2",
    empresa: businessName || "IPTV Manager",
    pix: pixKey || "12345678900",
    titular: "Revendedor Oficial",
    link: "https://pagamento.com/fatura/123",
  });

  return (
    <div className="rounded-2xl border border-border/80 bg-zinc-950 p-4 text-white shadow-xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            {businessName ? businessName[0]?.toUpperCase() : "R"}
          </div>
          <div>
            <div className="flex items-center gap-1">
              <p className="text-xs font-bold text-white">{businessName || "Minha Revenda"}</p>
              <CheckCircle2 className="h-3 w-3 text-blue-400 fill-blue-400" />
            </div>
            <p className="text-[10px] text-emerald-400 font-mono">online</p>
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300 font-medium">
          Prévia WhatsApp
        </span>
      </div>

      <div className="rounded-2xl bg-[#005c4b] p-3.5 text-xs text-white shadow-md relative max-w-[95%] ml-auto rounded-tr-none">
        <p className="whitespace-pre-wrap leading-relaxed font-sans">{rendered}</p>
        <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-white/70">
          <span>12:45</span>
          <span className="text-blue-300 font-bold">✓✓</span>
        </div>
      </div>
    </div>
  );
}

function Configuracoes() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendWhatsAppMessage);
  const status = useServerFn(getWhatsAppStatus);
  const connect = useServerFn(connectWhatsApp);
  const disconnect = useServerFn(disconnectWhatsApp);

  const [form, setForm] = useState<Settings>(defaults);
  const [testPhone, setTestPhone] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sigmaBusy, setSigmaBusy] = useState(false);
  const [templateTab, setTemplateTab] = useState<"message" | "overdue" | "welcome">("message");
  const testSigma = useServerFn(testSigmaConnection);
  const syncSigma = useServerFn(syncSigmaClients);
  const saveSigma = useServerFn(saveSigmaSettings);
  const getSigma = useServerFn(getSigmaSettings);
  const [savingSigma, setSavingSigma] = useState(false);

  function insertVariable(key: string) {
    const token = `{${key}}`;
    if (templateTab === "message") {
      setForm((f) => ({ ...f, message_template: (f.message_template ? f.message_template + " " : "") + token }));
    } else if (templateTab === "overdue") {
      setForm((f) => ({ ...f, overdue_template: (f.overdue_template ? f.overdue_template + " " : "") + token }));
    } else {
      setForm((f) => ({ ...f, welcome_template: (f.welcome_template ? f.welcome_template + " " : "") + token }));
    }
    toast.info(`Variável {${key}} inserida no modelo.`);
  }

  async function testarPainel() {
    const hasCredentials = Boolean(form.sigma_username?.trim() && form.sigma_password?.trim());
    const hasToken = Boolean(form.sigma_token?.trim());
    if (!form.sigma_url?.trim()) {
      toast.warning("Preencha o endereço do painel IPTV para testar.");
      return;
    }
    if (!hasCredentials && !hasToken) {
      toast.warning("Preencha seu usuário e senha (ou o token da API) do painel para testar.");
      return;
    }
    setSigmaBusy(true);
    const result = await testSigma({
      data: {
        url: form.sigma_url,
        username: form.sigma_username,
        password: form.sigma_password,
        token: form.sigma_token,
      },
    });
    setSigmaBusy(false);
    if (result.ok) {
      toast.success("Conexão com o painel Sigma realizada com sucesso!");
    } else {
      toast.error(result.error ?? "Não foi possível conectar ao painel.");
    }
  }

  async function sincronizarPainel() {
    setSigmaBusy(true);
    const result = await syncSigma({
      data: {
        url: form.sigma_url,
        username: form.sigma_username,
        password: form.sigma_password,
        token: form.sigma_token,
      },
    });
    setSigmaBusy(false);
    if (result.ok) {
      toast.success(`${result.created} novos e ${result.updated} atualizados pelo painel.`);
      queryClient.invalidateQueries();
    } else {
      toast.error(result.error ?? "Falha ao sincronizar.");
    }
  }

  async function salvarPainelSigma() {
    setSavingSigma(true);
    try {
      const res = await saveSigma({
        data: {
          sigma_url: form.sigma_url,
          sigma_username: form.sigma_username,
          sigma_password: form.sigma_password,
          sigma_token: form.sigma_token,
          sigma_enabled: form.sigma_enabled,
          sigma_auto_renew: form.sigma_auto_renew,
        },
      });
      if (res.ok) {
        toast.success("Configurações do Painel Sigma salvas com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
        queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
      }
    } catch {
      toast.error("Erro ao salvar configurações do Sigma.");
    } finally {
      setSavingSigma(false);
    }
  }

  const { data } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
      return data;
    },
  });

  const sigmaQuery = useQuery({
    queryKey: ["sigma-settings"],
    queryFn: async () => {
      const res = await getSigma({});
      return res.ok ? res.settings : null;
    },
  });

  const session = useQuery({
    queryKey: ["whatsapp-session"],
    queryFn: () => status({}),
    refetchInterval: qr ? 4000 : 20000,
  });

  const state = session.data?.state ?? "none";
  const badge = stateLabels[state] ?? stateLabels["none"]!;

  useEffect(() => {
    if (state === "open") setQr(null);
  }, [state]);

  useEffect(() => {
    if (data || sigmaQuery.data) {
      setForm((prev) => ({
        business_name: data?.business_name ?? prev.business_name,
        overdue_template: data?.overdue_template ?? prev.overdue_template,
        welcome_template: data?.welcome_template ?? prev.welcome_template,
        pix_key: data?.pix_key ?? prev.pix_key,
        pix_key_type: data?.pix_key_type ?? prev.pix_key_type,
        pix_holder: data?.pix_holder ?? prev.pix_holder,
        payment_link: data?.payment_link ?? prev.payment_link,
        payment_provider: data?.payment_provider ?? prev.payment_provider,
        mercadopago_token: data?.mercadopago_token ?? prev.mercadopago_token,
        asaas_token: data?.asaas_token ?? prev.asaas_token,
        asaas_env: data?.asaas_env ?? prev.asaas_env,
        message_template: data?.message_template ?? prev.message_template,
        sigma_url: sigmaQuery.data?.sigma_url || data?.sigma_url || prev.sigma_url,
        sigma_username: sigmaQuery.data?.sigma_username || (data as any)?.sigma_username || prev.sigma_username,
        sigma_password: sigmaQuery.data?.sigma_password || (data as any)?.sigma_password || prev.sigma_password,
        sigma_token: sigmaQuery.data?.sigma_token || (data as any)?.sigma_token || prev.sigma_token,
        sigma_enabled: sigmaQuery.data?.sigma_enabled ?? data?.sigma_enabled ?? prev.sigma_enabled,
        sigma_auto_renew: sigmaQuery.data?.sigma_auto_renew ?? data?.sigma_auto_renew ?? prev.sigma_auto_renew,
        reminder_days_before: data?.reminder_days_before ?? prev.reminder_days_before,
        send_on_due_day: data?.send_on_due_day ?? prev.send_on_due_day,
        overdue_reminder: data?.overdue_reminder ?? prev.overdue_reminder,
        auto_send_enabled: data?.auto_send_enabled ?? prev.auto_send_enabled,
      }));
    }
  }, [data, sigmaQuery.data]);

  const save = useMutation({
    mutationFn: async (values: Settings): Promise<{ skipped: string[] }> => {
      const { data: auth } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = { user_id: auth.user!.id, ...values };

      const missingColumnFromMessage = (msg: string): string | null => {
        const m = msg.match(/Could not find the '([^']+)' column/i);
        return m?.[1] ?? null;
      };

      // Salva as credenciais do Sigma de forma blindada (banco + user_metadata)
      try {
        await saveSigma({
          data: {
            sigma_url: values.sigma_url,
            sigma_username: values.sigma_username,
            sigma_password: values.sigma_password,
            sigma_enabled: values.sigma_enabled,
            sigma_auto_renew: values.sigma_auto_renew,
          },
        });
      } catch {
        // segue para salvar o restante
      }

      // 1ª tentativa: salva tudo (inclui sigma_username/sigma_password se a coluna existir).
      const attempt: Record<string, unknown> = { ...payload };
      for (let i = 0; i < 5; i++) {
        const { error } = await supabase
          .from("whatsapp_settings")
          .upsert(attempt as any, { onConflict: "user_id" });
        if (!error) {
          return { skipped: Object.keys(payload).filter((k) => !(k in attempt)) };
        }
        const column = missingColumnFromMessage(error.message ?? "");
        const isSchemaCache =
          /schema cache|PGRST204|Could not find.*column/i.test(error.message ?? "");
        if (!isSchemaCache || !column || !(column in attempt)) {
          throw new Error(error.message);
        }
        delete attempt[column];
      }
      throw new Error("Não foi possível salvar. Tente novamente.");
    },
    onSuccess: (result) => {
      // Ignora aviso de coluna sigma se foi preservado pelo saveSigma
      const nonSigmaSkipped = result.skipped.filter((c) => !c.startsWith("sigma_"));
      if (nonSigmaSkipped.length > 0) {
        toast.warning(`Salvei o restante, mas não gravei (${nonSigmaSkipped.join(", ")}) no banco.`);
      } else {
        toast.success("Configuração salva com sucesso.");
      }
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
      queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function gerarQr() {
    setBusy(true);
    try {
      const result = await connect({});
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível gerar o QR Code.");
        return;
      }
      if (result.state === "open") {
        toast.success("Seu WhatsApp já está conectado.");
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
        toast.success("WhatsApp desconectado.");
        setQr(null);
      } else {
        toast.error(result.error ?? "Não foi possível desconectar.");
      }
      session.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function enviarTeste() {
    if (!testPhone) {
      toast.error("Informe um número para o teste.");
      return;
    }
    const result = await send({
      data: { phone: testPhone, body: "Mensagem de teste do seu painel IPTV. ✅" },
    });
    if (result.ok) toast.success("Mensagem de teste enviada.");
    else toast.error(result.error ?? "Falha no envio.");
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-gradient text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Conexão do WhatsApp, formas de pagamento, mensagens e automação — separados por abas.
        </p>
      </div>

      <Tabs defaultValue="conexao" className="space-y-6">
        <TabsList className="flex w-full gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap p-1 sm:grid sm:grid-cols-5 sm:overflow-visible subtle-scrollbar h-auto min-h-11">
          <TabsTrigger value="conexao" className="shrink-0 sm:shrink">Conexão</TabsTrigger>
          <TabsTrigger value="painel" className="shrink-0 sm:shrink">Painel IPTV</TabsTrigger>
          <TabsTrigger value="pagamentos" className="shrink-0 sm:shrink">Pagamentos</TabsTrigger>
          <TabsTrigger value="mensagens" className="shrink-0 sm:shrink">Mensagens</TabsTrigger>
          <TabsTrigger value="automacao" className="shrink-0 sm:shrink">Automação</TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="space-y-6">
          <Card className="surface-card">
            <CardHeader>
              <CardTitle className="text-base">Painel Sigma</CardTitle>
              <CardDescription>
                Conecte seu painel para importar os clientes e renovar sozinho quando alguém pagar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Usar o painel Sigma</p>
                  <p className="text-xs text-muted-foreground">
                    {data?.sigma_last_sync_at
                      ? `Última sincronização: ${new Date(data.sigma_last_sync_at).toLocaleString("pt-BR")}`
                      : "Ainda não sincronizado."}
                  </p>
                </div>
                <Switch
                  checked={form.sigma_enabled}
                  onCheckedChange={(checked) => setForm({ ...form, sigma_enabled: checked })}
                />
              </div>

              {form.sigma_enabled ? (
                <>
                  <div className="space-y-2">
                    <Label>Endereço do painel</Label>
                    <Input
                      placeholder="https://aplicativoz342.click ou https://painel.sigma.st"
                      value={form.sigma_url}
                      onChange={(e) => {
                        let val = e.target.value;
                        setForm({ ...form, sigma_url: val });
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Pode colar o link completo que usa no navegador (ex.: com <code>/#/sign-in</code>). O sistema normaliza automaticamente.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Usuário do painel</Label>
                      <Input
                        placeholder="Seu usuário de revenda"
                        autoComplete="username"
                        value={form.sigma_username}
                        onChange={(e) => setForm({ ...form, sigma_username: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Senha do painel</Label>
                      <Input
                        type="password"
                        placeholder="Sua senha do painel"
                        autoComplete="current-password"
                        value={form.sigma_password}
                        onChange={(e) => setForm({ ...form, sigma_password: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-3.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Token da API (Opcional / Alternativo)</Label>
                      <span className="text-[10px] text-muted-foreground uppercase font-mono">Reseller API</span>
                    </div>
                    <Input
                      type="password"
                      placeholder="Token gerado em Integrações → Reseller API (se tiver)"
                      value={form.sigma_token}
                      onChange={(e) => setForm({ ...form, sigma_token: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Se preferir autenticar sem salvar sua senha ou se o painel bloquear por tentativas, você pode colar o token da Reseller API gerado no painel Sigma.
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Renovar sozinho quando o cliente pagar</p>
                      <p className="text-xs text-muted-foreground">
                        Ao marcar a cobrança como paga, o acesso é renovado por 1 mês no painel.
                      </p>
                    </div>
                    <Switch
                      checked={form.sigma_auto_renew}
                      onCheckedChange={(checked) => setForm({ ...form, sigma_auto_renew: checked })}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      type="button"
                      disabled={savingSigma}
                      onClick={salvarPainelSigma}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                    >
                      {savingSigma ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <CheckCircle2 className="size-4 mr-1.5" />}
                      Salvar configurações do Sigma
                    </Button>
                    <Button type="button" variant="outline" disabled={sigmaBusy} onClick={testarPainel}>
                      {sigmaBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Plug className="size-4 mr-1.5" />}
                      Testar conexão agora
                    </Button>
                    <Button type="button" variant="secondary" disabled={sigmaBusy} onClick={sincronizarPainel}>
                      {sigmaBusy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <RefreshCw className="size-4 mr-1.5" />}
                      Sincronizar clientes
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Você pode testar a conexão a qualquer momento para verificar o usuário e senha antes ou depois de salvar.
                  </p>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="conexao" className="space-y-6">
      <Card className="surface-card overflow-hidden">

        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="size-4 text-primary" />
              Sessão do WhatsApp
            </CardTitle>
            <CardDescription>
              Tudo automático: é só ler o QR Code com o celular que vai enviar as cobranças.
            </CardDescription>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${badge.tone}`}>
            {badge.label}
          </span>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-background/40 p-4 sm:p-6 sm:flex-row sm:items-start overflow-hidden">
            <div className="flex size-56 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background">
              {state === "open" ? (
                <div className="px-6 text-center text-sm text-primary">
                  <Smartphone className="mx-auto mb-2 size-8" />
                  Número conectado e pronto para cobrar.
                </div>
              ) : qr ? (
                <img
                  src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                  alt="QR Code para conectar o WhatsApp"
                  className="size-52 rounded-lg bg-white p-2"
                />
              ) : (
                <div className="px-6 text-center text-sm text-muted-foreground">
                  <QrCode className="mx-auto mb-2 size-8 opacity-60" />
                  Clique em “Gerar QR Code” para conectar.
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3">
              <ol className="space-y-1 text-sm text-muted-foreground">
                <li>1. Abra o WhatsApp no celular.</li>
                <li>2. Toque em Aparelhos conectados.</li>
                <li>3. Toque em Conectar um aparelho e leia o código.</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={gerarQr} disabled={busy || state === "open"}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <QrCode className="size-4" />
                  )}
                  {qr ? "Gerar novo QR Code" : "Gerar QR Code"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => session.refetch()}
                  disabled={session.isFetching}
                >
                  <RefreshCw className={`size-4 ${session.isFetching ? "animate-spin" : ""}`} />
                  Atualizar status
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={desconectar}
                  disabled={busy || state !== "open"}
                >
                  <Unplug className="size-4" />
                  Desconectar
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Enviar mensagem de teste para</Label>
              <Input
                placeholder="85999998888"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
            </div>
            <Button type="button" variant="secondary" onClick={enviarTeste}>
              Enviar teste
            </Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <TabsContent value="pagamentos" className="space-y-6">
        <Card className="surface-card">

          <CardHeader>
            <CardTitle className="text-base">Pagamentos</CardTitle>
            <CardDescription>
              Esses dados entram automaticamente nas mensagens de cobrança.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do seu negócio</Label>
                <Input
                  placeholder="Minha TV Play"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Forma de cobrança preferida</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.payment_provider}
                  onChange={(e) => setForm({ ...form, payment_provider: e.target.value })}
                >
                  <option value="pix">PIX manual</option>
                  <option value="link">Link de pagamento</option>
                  <option value="mercadopago">Mercado Pago</option>
                  <option value="asaas">Asaas</option>
                </select>
              </div>
            </div>

            {form.payment_provider === "pix" && (
              <div className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
                <p className="text-sm font-medium">Dados do PIX</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Tipo da chave PIX</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.pix_key_type}
                      onChange={(e) => setForm({ ...form, pix_key_type: e.target.value })}
                    >
                      <option value="aleatoria">Aleatória</option>
                      <option value="cpf">CPF/CNPJ</option>
                      <option value="email">E-mail</option>
                      <option value="telefone">Telefone</option>
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Chave PIX</Label>
                    <Input
                      placeholder={
                        form.pix_key_type === "telefone"
                          ? "(85) 99999-9999"
                          : form.pix_key_type === "email"
                            ? "voce@email.com"
                            : form.pix_key_type === "cpf"
                              ? "000.000.000-00"
                              : "chave aleatória"
                      }
                      value={form.pix_key}
                      onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Titular da chave</Label>
                  <Input
                    placeholder="Nome que aparece no comprovante"
                    value={form.pix_holder}
                    onChange={(e) => setForm({ ...form, pix_holder: e.target.value })}
                  />
                </div>
              </div>
            )}

            {form.payment_provider === "link" && (
              <div className="space-y-2 rounded-xl border border-border bg-background/40 p-4">
                <Label>Link de pagamento</Label>
                <Input
                  placeholder="https://..."
                  value={form.payment_link}
                  onChange={(e) => setForm({ ...form, payment_link: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Esse link entra nas mensagens no lugar da chave PIX.
                </p>
              </div>
            )}

            {form.payment_provider === "mercadopago" && (
              <div className="space-y-2 rounded-xl border border-border bg-background/40 p-4">
                <Label>Token do Mercado Pago</Label>
                <Input
                  type="password"
                  placeholder="APP_USR-..."
                  value={form.mercadopago_token}
                  onChange={(e) => setForm({ ...form, mercadopago_token: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Pegue em Mercado Pago → Suas integrações → Credenciais de produção.
                </p>
              </div>
            )}

            {form.payment_provider === "asaas" && (
              <div className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
                <div className="space-y-2">
                  <Label>Token do Asaas</Label>
                  <Input
                    type="password"
                    placeholder="$aact_..."
                    value={form.asaas_token}
                    onChange={(e) => setForm({ ...form, asaas_token: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ambiente</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={form.asaas_env}
                    onChange={(e) => setForm({ ...form, asaas_env: e.target.value })}
                  >
                    <option value="production">Produção</option>
                    <option value="sandbox">Testes (sandbox)</option>
                  </select>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Só aparecem os campos da forma de cobrança escolhida. Seus dados ficam guardados
              apenas na sua conta.
            </p>

          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="mensagens" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Editor de Templates (3 colunas) */}
            <Card className="surface-card lg:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" /> Modelos de Mensagens
                </CardTitle>
                <CardDescription>
                  Personalize as mensagens automáticas. Clique nas tags abaixo para inseri-las no texto.
                </CardDescription>

                {/* Tags Clicáveis */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {TEMPLATE_VARS.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      title={`Clique para inserir: ${v.label}`}
                      onClick={() => insertVariable(v.key)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-card px-2 py-1 font-mono text-[11px] font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      <Sparkles className="h-2.5 w-2.5 text-primary" />
                      {"{" + v.key + "}"}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-1">
                {/* Seletor de Qual Template está Editando */}
                <div className="flex rounded-xl bg-muted p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setTemplateTab("message")}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                      templateTab === "message"
                        ? "bg-card shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Lembrete Pré-Vencimento
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateTab("overdue")}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                      templateTab === "overdue"
                        ? "bg-card shadow-sm text-destructive"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Cobrança Atrasada
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateTab("welcome")}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                      templateTab === "welcome"
                        ? "bg-card shadow-sm text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Boas-Vindas & Acesso
                  </button>
                </div>

                {templateTab === "message" && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <Label className="text-xs font-semibold">Lembrete Antes do Vencimento</Label>
                    <Textarea
                      rows={6}
                      value={form.message_template}
                      onChange={(e) => setForm({ ...form, message_template: e.target.value })}
                      className="rounded-xl resize-none font-sans"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Enviada {form.reminder_days_before} dias antes do vencimento da mensalidade.
                    </p>
                  </div>
                )}

                {templateTab === "overdue" && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <Label className="text-xs font-semibold text-destructive">Mensagem de Cobrança em Atraso</Label>
                    <Textarea
                      rows={6}
                      value={form.overdue_template}
                      onChange={(e) => setForm({ ...form, overdue_template: e.target.value })}
                      className="rounded-xl resize-none font-sans"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Enviada para clientes com pagamento vencido.
                    </p>
                  </div>
                )}

                {templateTab === "welcome" && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <Label className="text-xs font-semibold text-primary">Boas-Vindas com Dados de Acesso</Label>
                    <Textarea
                      rows={8}
                      value={form.welcome_template}
                      onChange={(e) => setForm({ ...form, welcome_template: e.target.value })}
                      className="rounded-xl resize-none font-sans font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Enviada ao clicar em "Enviar Acesso" no cadastro do cliente.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Simulador WhatsApp em Tempo Real (2 colunas) */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Eye className="h-3.5 w-3.5 text-emerald-500" /> WhatsApp Live Simulator
              </div>
              <WhatsAppSimulator
                template={
                  templateTab === "message"
                    ? form.message_template
                    : templateTab === "overdue"
                      ? form.overdue_template
                      : form.welcome_template
                }
                businessName={form.business_name}
                pixKey={form.pix_key}
              />
              <p className="text-[11px] text-muted-foreground text-center">
                Os dados acima são simulados para ilustrar como o cliente visualizará a mensagem real.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="automacao" className="space-y-6">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="text-base">Envio automático</CardTitle>
            <CardDescription>
              Quando ligado, o sistema envia as cobranças sozinho todo dia às 9h.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Cobrança automática ligada</p>
                <p className="text-xs text-muted-foreground">
                  Desligue para enviar tudo manualmente.
                </p>
              </div>
              <Switch
                checked={form.auto_send_enabled}
                onCheckedChange={(checked) => setForm({ ...form, auto_send_enabled: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label>Avisar quantos dias antes do vencimento</Label>
              <Input
                type="number"
                min={0}
                max={30}
                className="max-w-32"
                value={form.reminder_days_before}
                onChange={(e) => setForm({ ...form, reminder_days_before: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">Avisar também no dia do vencimento</span>
              <Switch
                checked={form.send_on_due_day}
                onCheckedChange={(checked) => setForm({ ...form, send_on_due_day: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">Cobrar quem está atrasado</span>
              <Switch
                checked={form.overdue_reminder}
                onCheckedChange={(checked) => setForm({ ...form, overdue_reminder: checked })}
              />
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        <div className="sticky bottom-4 flex justify-end">
          <Button type="submit" disabled={save.isPending} className="shadow-lg">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvar configuração
          </Button>
        </div>
      </form>
      </Tabs>
    </div>
  );
}

