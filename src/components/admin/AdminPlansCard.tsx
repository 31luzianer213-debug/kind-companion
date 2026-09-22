import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Crown, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  deleteAdminPlan,
  listAdminPlans,
  toggleAdminPlan,
  upsertAdminPlan,
  type AdminPlanFull,
} from "@/lib/admin.functions";
import { formatBRL } from "@/lib/format";

type FormState = {
  id: string;
  isNew: boolean;
  name: string;
  description: string;
  price: string;
  maxClients: string;
  features: string;
  active: boolean;
  highlighted: boolean;
  sortOrder: string;
};

function toForm(plan: AdminPlanFull): FormState {
  return {
    id: plan.id,
    isNew: false,
    name: plan.name,
    description: plan.description,
    price: String(plan.price_monthly),
    maxClients: plan.max_clients === null ? "" : String(plan.max_clients),
    features: plan.features.join("\n"),
    active: plan.active,
    highlighted: plan.highlighted,
    sortOrder: String(plan.sort_order),
  };
}

const EMPTY_FORM: FormState = {
  id: "",
  isNew: true,
  name: "",
  description: "",
  price: "",
  maxClients: "",
  features: "",
  active: true,
  highlighted: false,
  sortOrder: "1",
};

export function AdminPlansCard() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminPlans);
  const saveFn = useServerFn(upsertAdminPlan);
  const toggleFn = useServerFn(toggleAdminPlan);
  const removeFn = useServerFn(deleteAdminPlan);
  const [form, setForm] = useState<FormState | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["admin-plans"], queryFn: () => listFn({}), retry: false });
  const plans: AdminPlanFull[] = (data as any)?.plans ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    queryClient.invalidateQueries({ queryKey: ["admin-plan"] });
    queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
  };

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      const res: any = await saveFn({
        data: {
          id: state.isNew ? "" : state.id,
          name: state.name,
          description: state.description,
          price_monthly: Number(state.price.replace(",", ".")),
          max_clients: state.maxClients.trim() ? Number(state.maxClients) : null,
          features: state.features.split("\n").map((f) => f.trim()).filter(Boolean),
          active: state.active,
          highlighted: state.highlighted,
          sort_order: Number(state.sortOrder) || 1,
        },
      });
      if (!res?.ok) throw new Error(res?.error || "Não foi possível salvar o plano.");
    },
    onSuccess: () => {
      toast.success("Plano salvo. O valor já aparece no site e na tela de Assinatura.");
      setForm(null);
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const res: any = await toggleFn({ data: input });
      if (!res?.ok) throw new Error(res?.error || "Não foi possível mudar o plano.");
    },
    onSuccess: () => refresh(),
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await removeFn({ data: { id } });
      if (!res?.ok) throw new Error(res?.error || "Não foi possível excluir o plano.");
    },
    onSuccess: () => {
      toast.success("Plano excluído.");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="grid h-40 place-items-center rounded-md border border-border bg-card">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-plans">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="size-4 text-primary" /> Planos vendidos
            </CardTitle>
            <CardDescription>Crie, edite, ative ou tire de venda os planos dos revendedores.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setForm({ ...EMPTY_FORM, sortOrder: String(plans.length + 1) })}>
            <Plus className="size-4" /> Novo plano
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {plans.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum plano cadastrado ainda.</p>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {plan.name}
                    {plan.highlighted ? (
                      <Badge variant="secondary" className="gap-1 text-[11px]">
                        <Star className="size-3" /> Destaque
                      </Badge>
                    ) : null}
                    <Badge variant={plan.active ? "success" : "secondary"} className="text-[11px]">
                      {plan.active ? "À venda" : "Fora de venda"}
                    </Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBRL(plan.price_monthly)}/mês ·{" "}
                    {plan.max_clients === null ? "clientes ilimitados" : `até ${plan.max_clients} clientes`} ·{" "}
                    {plan.features.length} benefícios
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 pr-1">
                    <Switch
                      checked={plan.active}
                      onCheckedChange={(checked) => toggle.mutate({ id: plan.id, active: checked })}
                      aria-label="Colocar plano à venda"
                    />
                    <span className="text-xs text-muted-foreground">À venda</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setForm(toForm(plan))}>
                    <Pencil className="size-4" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-500 hover:text-rose-600"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`Excluir o plano "${plan.name}"?`)) remove.mutate(plan.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {form ? (
        <Card data-testid="admin-plan-form">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <CardTitle className="text-base">{form.isNew ? "Novo plano" : `Editando: ${form.name || form.id}`}</CardTitle>
              <CardDescription>Nome, valor mensal, limite de clientes e benefícios.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setForm(null)}>
              <X className="size-4" /> Fechar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome do plano</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Valor mensal (R$)</Label>
                <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Descrição</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Limite de clientes (vazio = ilimitado)</Label>
                <Input
                  inputMode="numeric"
                  placeholder="ilimitado"
                  value={form.maxClients}
                  onChange={(e) => setForm({ ...form, maxClients: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Ordem de exibição</Label>
                <Input
                  inputMode="numeric"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Benefícios (um por linha)</Label>
              <Textarea rows={6} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
            </div>

            <div className="flex flex-wrap items-center gap-6 rounded-md border border-border bg-muted/30 p-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                À venda no site
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.highlighted} onCheckedChange={(v) => setForm({ ...form, highlighted: v })} />
                Mostrar como plano principal
              </label>
            </div>

            <div className="flex justify-end border-t border-border/60 pt-3">
              <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-1.5 px-6 font-semibold">
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Salvar plano
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
