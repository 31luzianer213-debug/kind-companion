import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TEMPLATE_VARS, renderTemplate, extractCleanIptvDns, generateM3uUrl, generateEpgUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  MessageCircle,
  CheckCircle2,
  Loader2,
  Tv,
  Server,
  KeyRound,
  Eye,
  Send,
  HelpCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/mensagens")({
  head: () => ({
    meta: [
      { title: "Modelos de Mensagem — Textos do WhatsApp" },
      { name: "description", content: "Personalize os modelos de cobrança, faturas e boas-vindas com dados do servidor Sigma e teste no simulador." },
    ],
  }),
  component: MensagensPage,
});

type MessageTemplates = {
  message_template: string;
  overdue_template: string;
  welcome_template: string;
};

const defaults: MessageTemplates = {
  message_template:
    "Olá {nome}! Sua mensalidade de {valor} vence em {vencimento}. Para manter seu acesso ativo na {lista}, chave PIX: {pix} ({titular}). Qualquer dúvida estamos à disposição! 😊",
  overdue_template:
    "Oi {nome}, sua mensalidade de {valor} venceu em {vencimento} ({dias} dias atrás). Para não perder o acesso à sua conta no {servidor}, pague pelo PIX {pix}. 🙏",
  welcome_template:
    "📡 *DADOS DE ACESSO IPTV* 📡\n\n👤 *Cliente:* {nome}\n📺 *Servidor:* {servidor}\n🌐 *URL / DNS:* {dns}\n🔑 *Usuário:* {usuario}\n🔒 *Senha:* {senha}\n🖥️ *Telas:* {telas}\n📅 *Vencimento:* {vencimento}\n\n🔗 *Lista M3U Plus:*\n{m3u}\n\n📺 *Guia de Canais (EPG):*\n{epg}\n\n📱 *Como Conectar:*\n• No IPTV Smarters Pro, XCIPTV ou TiviMate: use a opção *Xtream Codes API* com Servidor (ou URL), Usuário e Senha acima.\n• Em Smart TVs ou SS IPTV: use a *Lista M3U Plus* completa acima.\n\nBom divertimento! 🍿 Qualquer dúvida, estamos à disposição.",
};

function WhatsAppSimulator({
  template,
  businessName,
  serverName,
  serverUrl,
  pixKey,
}: {
  template: string;
  businessName: string;
  serverName: string;
  serverUrl: string;
  pixKey: string;
}) {
  const cleanDns = extractCleanIptvDns(serverUrl) || "http://stream.iptvserver.net:8080";
  const m3u = generateM3uUrl(cleanDns, "carlos_silva", "px876543", "ts");
  const m3uHls = generateM3uUrl(cleanDns, "carlos_silva", "px876543", "m3u8");
  const epg = generateEpgUrl(cleanDns, "carlos_silva", "px876543");

  const rendered = renderTemplate(template, {
    nome: "Carlos Silva",
    telefone: "(11) 98765-4321",
    valor: "R$ 35,00",
    vencimento: "15/10/2026",
    dias: "2",
    lista: serverName || "Servidor Sigma Pro",
    servidor: serverName || "Servidor Principal",
    dns: cleanDns,
    usuario: "carlos_silva",
    senha: "px876543",
    m3u: m3u,
    m3u_hls: m3uHls,
    epg: epg,
    telas: "2",
    empresa: businessName || "IPTV Manager Pro",
    pix: pixKey || "12345678900",
    titular: "Revendedor Oficial",
    link: "https://pagamento.com/fatura/123",
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 text-foreground shadow-xl">
      <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400 border border-emerald-500/30 shadow-sm">
            {businessName ? businessName[0]?.toUpperCase() : "R"}
          </div>
          <div>
            <div className="flex items-center gap-1">
              <p className="text-xs font-bold text-foreground">{businessName || "Minha Revenda"}</p>
              <CheckCircle2 className="size-3 text-emerald-500" />
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">online no WhatsApp</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          Prévia em Tempo Real
        </Badge>
      </div>

      <div className="rounded-2xl bg-muted/40 border border-border/60 p-3.5 text-xs text-foreground shadow-md relative max-w-[95%] ml-auto rounded-tr-none">
        <p className="whitespace-pre-wrap leading-relaxed font-sans">{rendered}</p>
        <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-muted-foreground">
          <span>12:45</span>
          <span className="text-primary font-bold">✓✓</span>
        </div>
      </div>
    </div>
  );
}

function MensagensPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MessageTemplates>(defaults);
  const [activeTab, setActiveTab] = useState<"message" | "overdue" | "welcome">("message");

  const { data } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      const rawWelcome = data.welcome_template?.trim() || defaults.welcome_template;
      const effectiveWelcome =
        rawWelcome.includes("{m3u}")
          ? rawWelcome
          : `${rawWelcome}\n\n🔗 *Lista M3U Plus:*\n{m3u}\n\n📺 *Guia de Canais (EPG):*\n{epg}`;

      setForm({
        message_template: data.message_template || defaults.message_template,
        overdue_template: data.overdue_template || defaults.overdue_template,
        welcome_template: effectiveWelcome,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (values: MessageTemplates) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        user_id: auth.user!.id,
        message_template: values.message_template.trim(),
        overdue_template: values.overdue_template.trim(),
        welcome_template: values.welcome_template.trim(),
      };
      const { error } = await supabase
        .from("whatsapp_settings")
        .upsert(payload as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modelos de mensagem salvos com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar modelos: ${err.message}`);
    },
  });

  function insertVariable(key: string) {
    const token = `{${key}}`;
    if (activeTab === "message") {
      setForm((f) => ({ ...f, message_template: (f.message_template ? f.message_template + " " : "") + token }));
    } else if (activeTab === "overdue") {
      setForm((f) => ({ ...f, overdue_template: (f.overdue_template ? f.overdue_template + " " : "") + token }));
    } else {
      setForm((f) => ({ ...f, welcome_template: (f.welcome_template ? f.welcome_template + " " : "") + token }));
    }
    toast.info(`Variável {${key}} inserida no texto.`);
  }

  const currentTemplate =
    activeTab === "message"
      ? form.message_template
      : activeTab === "overdue"
      ? form.overdue_template
      : form.welcome_template;

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="size-6 text-primary" /> Modelos de Mensagem WhatsApp
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Personalize as mensagens de cobrança preventiva, aviso de atraso e entrega de acesso com o Servidor Sigma.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="gap-1.5 font-semibold bg-primary text-primary-foreground shadow-sm hover-lift"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Salvar Modelos
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Editor de Mensagens (Ocupa 3 colunas) */}
        <div className="lg:col-span-3 space-y-4">
          <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="message" className="text-xs">
                Cobrança Preventiva
              </TabsTrigger>
              <TabsTrigger value="overdue" className="text-xs">
                Aviso de Atraso
              </TabsTrigger>
              <TabsTrigger value="welcome" className="text-xs">
                Boas-Vindas & Acesso
              </TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <Card className="surface-card border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    {activeTab === "message"
                      ? "Mensagem de Vencimento Próximo"
                      : activeTab === "overdue"
                      ? "Mensagem de Cobrança em Atraso"
                      : "Mensagem de Entrega de Acesso (Sigma)"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {activeTab === "message"
                      ? "Enviada automaticamente X dias antes ou no dia do vencimento do plano."
                      : activeTab === "overdue"
                      ? "Enviada após o vencimento caso a fatura continue pendente."
                      : "Enviada ao cadastrar um novo cliente ou pelo botão 'Enviar dados de acesso'."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeTab === "message" && (
                    <Textarea
                      rows={6}
                      value={form.message_template}
                      onChange={(e) => setForm({ ...form, message_template: e.target.value })}
                      className="rounded-xl text-sm leading-relaxed"
                    />
                  )}

                  {activeTab === "overdue" && (
                    <Textarea
                      rows={6}
                      value={form.overdue_template}
                      onChange={(e) => setForm({ ...form, overdue_template: e.target.value })}
                      className="rounded-xl text-sm leading-relaxed"
                    />
                  )}

                  {activeTab === "welcome" && (
                    <Textarea
                      rows={8}
                      value={form.welcome_template}
                      onChange={(e) => setForm({ ...form, welcome_template: e.target.value })}
                      className="rounded-xl text-sm leading-relaxed"
                    />
                  )}

                  {/* Chips de Variáveis Dinâmicas */}
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Sparkles className="size-3 text-primary" /> Clique em uma tag para inserir no texto:
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARS.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => insertVariable(v.key)}
                          className="rounded-lg border border-border/80 bg-muted/40 px-2 py-1 text-[11px] font-mono text-foreground hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors"
                          title={v.label}
                        >
                          &#123;{v.key}&#125;
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </Tabs>
        </div>

        {/* Simulador Visual do WhatsApp (Ocupa 2 colunas) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="sticky top-6">
            <WhatsAppSimulator
              template={currentTemplate}
              businessName={data?.business_name || ""}
              serverName={(data as any)?.sigma_server_name || ""}
              serverUrl={data?.sigma_url || ""}
              pixKey={data?.pix_key || ""}
            />

            <div className="mt-4 p-4 rounded-2xl border border-border/60 bg-muted/20 text-xs space-y-2 text-muted-foreground">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Server className="size-3.5 text-primary" /> Integração IPTV & Listas:
              </p>
              <p>
                A tag <strong>&#123;servidor&#125;</strong> ou <strong>&#123;dns&#125;</strong> exibirá automaticamente o DNS limpo de transmissão (<code>{extractCleanIptvDns(data?.sigma_url) || "Não configurado"}</code>), removendo qualquer rota administrativa.
              </p>
              <p>
                As tags <strong>&#123;m3u&#125;</strong> e <strong>&#123;epg&#125;</strong> constroem os links diretos para reprodução M3U Plus e guia de canais XMLTV.
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                🔒 Links de renovação do painel externo não são incluídos nas mensagens para preservar o controle financeiro na sua própria plataforma.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
