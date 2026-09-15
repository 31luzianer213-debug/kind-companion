import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listBillingRules, saveBillingRule } from "@/lib/billing-rules.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/cobranca-automatica")({
  head: () => ({
    meta: [
      { title: "Cobrança automática — Sigma Control" },
      { name: "description", content: "Configure lembretes automáticos de vencimento para seus clientes." },
    ],
  }),
  component: AutomaticBillingPage,
});

type EditableRule = {
  id?: string;
  offset_days: number;
  enabled: boolean;
  message_template: string;
};

function ruleLabel(days: number) {
  if (days === 0) return "No dia do vencimento";
  if (days < 0) return `${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"} antes`;
  return `${days} dia${days === 1 ? "" : "s"} depois`;
}

function RuleCard({ rule, onSaved }: { rule: EditableRule; onSaved: () => void }) {
  const saveRule = useServerFn(saveBillingRule);
  const [draft, setDraft] = useState(rule);

  useEffect(() => setDraft(rule), [rule]);

  const mutation = useMutation({
    mutationFn: async () => saveRule({
      data: {
        id: draft.id,
        offsetDays: draft.offset_days,
        enabled: draft.enabled,
        messageTemplate: draft.message_template,
      },
    }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Regra de cobrança salva.");
        onSaved();
      } else {
        toast.error(result.error || "Não foi possível salvar a regra.");
      }
    },
    onError: () => toast.error("Não foi possível salvar a regra."),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{ruleLabel(draft.offset_days)}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Use {"{nome}"} e {"{vencimento}"} na mensagem.</p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))}
            aria-label={`Ativar regra ${ruleLabel(draft.offset_days)}`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea
            value={draft.message_template}
            onChange={(event) => setDraft((current) => ({ ...current, message_template: event.target.value }))}
            rows={4}
          />
        </div>
        <Button className="w-full sm:w-auto" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar regra
        </Button>
      </CardContent>
    </Card>
  );
}

function AutomaticBillingPage() {
  const queryClient = useQueryClient();
  const loadRules = useServerFn(listBillingRules);
  const query = useQuery({
    queryKey: ["billing-rules"],
    queryFn: async () => {
      const result = await loadRules({});
      return Array.isArray(result?.rules) ? result.rules : [];
    },
    retry: 1,
  });

  const rules = Array.isArray(query.data) ? query.data : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Automação</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
          <BellRing className="size-6 text-primary" />
          Cobrança automática
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Configure quando o painel deve lembrar seus clientes. O controle de duplicidade impede a mesma regra de ser enviada duas vezes para o mesmo vencimento.
        </p>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-52 animate-pulse rounded-xl bg-muted/60" />)}
        </div>
      ) : rules.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Não foi possível carregar as regras agora.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rules.map((rule: any) => (
            <RuleCard
              key={rule.id || rule.offset_days}
              rule={rule}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["billing-rules"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
