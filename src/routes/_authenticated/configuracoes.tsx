import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, QrCode, RefreshCw, Smartphone, Unplug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TEMPLATE_VARS } from "@/lib/format";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  sendWhatsAppMessage,
} from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  const { data } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
      return data;
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
    if (data) {
      setForm({
        business_name: data.business_name ?? "",
        overdue_template: data.overdue_template ?? defaults.overdue_template,
        welcome_template: data.welcome_template ?? defaults.welcome_template,
        pix_key: data.pix_key ?? "",
        pix_key_type: data.pix_key_type ?? "aleatoria",
        pix_holder: data.pix_holder ?? "",
        payment_link: data.payment_link ?? "",
        payment_provider: data.payment_provider ?? "pix",
        mercadopago_token: data.mercadopago_token ?? "",
        asaas_token: data.asaas_token ?? "",
        asaas_env: data.asaas_env ?? "production",
        message_template: data.message_template,
        reminder_days_before: data.reminder_days_before,
        send_on_due_day: data.send_on_due_day,
        overdue_reminder: data.overdue_reminder,
        auto_send_enabled: data.auto_send_enabled,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (values: Settings) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("whatsapp_settings")
        .upsert({ user_id: auth.user!.id, ...values }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configuração salva.");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-gradient text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Conexão do WhatsApp, formas de pagamento, mensagens e automação — separados por abas.
        </p>
      </div>

      <Tabs defaultValue="conexao" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="conexao">Conexão</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="mensagens">Mensagens</TabsTrigger>
          <TabsTrigger value="automacao">Automação</TabsTrigger>
        </TabsList>

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
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-background/40 p-6 sm:flex-row sm:items-start">
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

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
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

        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="text-base">Mensagens</CardTitle>
            <CardDescription>Clique em uma etiqueta para ver o que ela preenche.</CardDescription>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {TEMPLATE_VARS.map((v) => (
                <span
                  key={v.key}
                  title={v.label}
                  className="rounded-full border border-border bg-background/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  {"{" + v.key + "}"}
                </span>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Aviso antes do vencimento</Label>
              <Textarea
                rows={4}
                value={form.message_template}
                onChange={(e) => setForm({ ...form, message_template: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem para quem está atrasado</Label>
              <Textarea
                rows={4}
                value={form.overdue_template}
                onChange={(e) => setForm({ ...form, overdue_template: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Boas-vindas com os dados de acesso</Label>
              <Textarea
                rows={7}
                value={form.welcome_template}
                onChange={(e) => setForm({ ...form, welcome_template: e.target.value })}
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
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">Cobrança automática ligada</span>
              <Switch
                checked={form.auto_send_enabled}
                onCheckedChange={(checked) => setForm({ ...form, auto_send_enabled: checked })}
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={save.isPending}>
          Salvar configuração
        </Button>
      </form>
    </div>
  );
}
