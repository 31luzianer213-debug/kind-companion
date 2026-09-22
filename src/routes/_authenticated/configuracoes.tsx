import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/format";
import {
  Settings,
  Building,
  CheckCircle2,
  Loader2,
  Database,
  Package,
  Plus,
  Trash2,
  BellRing,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Sigma Control" },
      { name: "description", content: "Nome da revenda, planos de venda e backup dos seus dados." },
      { property: "og:title", content: "Configurações — Sigma Control" },
      { property: "og:description", content: "Nome da revenda, planos de venda e backup dos seus dados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfiguracoesPage,
});

type SalePlan = {
  id: string;
  name: string;
  screens: number;
  months: number;
  price: number;
  active: boolean;
};

const emptyPlan = { name: "", screens: 1, months: 1, price: 0 };

function SalePlansCard() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyPlan);

  const { data, isLoading } = useQuery({
    queryKey: ["sale-plans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sale_plans")
        .select("*")
        .order("price", { ascending: true });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as SalePlan[];
    },
  });

  const plans = Array.isArray(data) ? data : [];

  const createPlan = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("sale_plans").insert({
        user_id: auth.user!.id,
        name: draft.name.trim() || `${draft.screens} tela(s) — ${draft.months} mês(es)`,
        screens: Number(draft.screens) || 1,
        months: Number(draft.months) || 1,
        price: Number(draft.price) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano criado.");
      setDraft(emptyPlan);
      queryClient.invalidateQueries({ queryKey: ["sale-plans"] });
    },
    onError: (error: Error) => toast.error(`Não foi possível criar: ${error.message}`),
  });

  const togglePlan = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase as any).from("sale_plans").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sale-plans"] }),
  });

  const removePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("sale_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano removido.");
      queryClient.invalidateQueries({ queryKey: ["sale-plans"] });
    },
  });

  return (
    <Card className="surface-card border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="size-4 text-primary" /> Planos que você vende
        </CardTitle>
        <CardDescription>
          Cadastre seus combos (telas e duração) para não digitar valor e vencimento em cada cliente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_auto_auto_auto_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nome</Label>
            <Input
              placeholder="Ex: Plano 1 tela mensal"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="rounded-xl text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Telas</Label>
            <Input
              type="number"
              min="1"
              value={draft.screens}
              onChange={(event) => setDraft({ ...draft, screens: Number(event.target.value) })}
              className="w-full rounded-xl text-sm sm:w-20"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Meses</Label>
            <Input
              type="number"
              min="1"
              value={draft.months}
              onChange={(event) => setDraft({ ...draft, months: Number(event.target.value) })}
              className="w-full rounded-xl text-sm sm:w-20"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Preço (R$)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.price}
              onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })}
              className="w-full rounded-xl text-sm sm:w-28"
            />
          </div>
          <Button type="button" onClick={() => createPlan.mutate()} disabled={createPlan.isPending} className="gap-1.5">
            {createPlan.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Adicionar
          </Button>
        </div>

        {isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-muted/60" />
        ) : plans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Nenhum plano cadastrado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {plans.map((plan) => (
              <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-bold">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {plan.screens} tela{plan.screens === 1 ? "" : "s"} • {plan.months} mês{plan.months === 1 ? "" : "es"} • {formatBRL(Number(plan.price || 0))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={plan.active ? "success" : "secondary"} className="text-[10px]">
                    {plan.active ? "À venda" : "Pausado"}
                  </Badge>
                  <Switch
                    checked={plan.active}
                    onCheckedChange={(checked) => togglePlan.mutate({ id: plan.id, active: checked })}
                    aria-label={`Ativar plano ${plan.name}`}
                  />
                  <Button variant="ghost" size="icon" onClick={() => removePlan.mutate(plan.id)} aria-label={`Remover plano ${plan.name}`}>
                    <Trash2 className="size-4 text-rose-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfiguracoesPage() {
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState("");
  const [exportingBackup, setExportingBackup] = useState(false);

  const { data } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (data) setBusinessName(data.business_name ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("whatsapp_settings")
        .upsert({ user_id: auth.user!.id, business_name: businessName.trim() } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas.");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
    },
    onError: (err: Error) => toast.error(`Falha ao salvar: ${err.message}`),
  });

  async function handleExportFullBackup() {
    setExportingBackup(true);
    try {
      const { data: clients } = await supabase.from("clients").select("*");
      const { data: invoices } = await supabase.from("invoices").select("*");
      const { data: authUser } = await supabase.auth.getUser();

      const backupData = {
        version: "2.1",
        timestamp: new Date().toISOString(),
        exported_by: authUser?.user?.email || "",
        system: "Sigma Control",
        data: { clients: clients || [], invoices: invoices || [] },
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_clientes_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Backup exportado com sucesso.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar backup dos dados.");
    } finally {
      setExportingBackup(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Settings className="size-6 text-primary" /> Configurações
          </h1>
          <p className="text-sm text-muted-foreground">
            Nome da sua revenda, planos que você vende e backup dos seus dados.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5 font-semibold">
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Salvar
        </Button>
      </div>

      <Card className="surface-card border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building className="size-4 text-primary" /> Identificação do negócio
          </CardTitle>
          <CardDescription>Nome que aparece nas mensagens e faturas enviadas aos seus clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-1.5">
            <Label className="text-xs font-semibold">Nome da sua revenda</Label>
            <Input
              placeholder="Ex: IPTV Turbo Brasil"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              className="rounded-xl text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <SalePlansCard />

      <Card className="surface-card border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="size-4 text-primary" /> Cobrança dos clientes
          </CardTitle>
          <CardDescription>Os horários, etapas e textos de cobrança agora ficam em uma tela só.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/cobranca-automatica">Abrir cobrança automática</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="surface-card border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-primary" /> Backup dos dados
          </CardTitle>
          <CardDescription>Baixe uma cópia dos seus clientes e cobranças sempre que quiser.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExportFullBackup} disabled={exportingBackup} className="gap-1.5 rounded-xl">
            {exportingBackup ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            Baixar backup
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
