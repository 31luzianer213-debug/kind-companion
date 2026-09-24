import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getAdminResellerDetails } from "@/lib/admin.functions";

const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function AdminResellerDetails({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const fn = useServerFn(getAdminResellerDetails);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reseller-details", userId],
    queryFn: () => fn({ data: { userId: userId! } }),
    enabled: Boolean(userId),
    retry: false,
  });
  const d = data && data.ok ? data : null;

  return (
    <Dialog open={Boolean(userId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d?.account.email || "Dados do revendedor"}</DialogTitle>
          <DialogDescription>Tudo o que essa conta tem salvo no sistema.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="grid min-h-[20vh] place-items-center"><Loader2 className="size-5 animate-spin text-primary" /></div>
        ) : !d ? (
          <p className="text-sm text-destructive">{(data as any)?.error || "Não foi possível carregar os dados."}</p>
        ) : (
          <div className="space-y-5">
            <Section title="Conta">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Info label="Nome" value={d.account.name || "—"} />
                <Info label="Criada em" value={dt(d.account.created_at)} />
                <Info label="Último acesso" value={dt(d.account.last_sign_in_at)} />
                <Info label="Login" value={d.account.banned_until && new Date(d.account.banned_until) > new Date() ? "Suspenso" : "Liberado"} />
                <Info label="Assinatura" value={d.subscription?.status ?? "sem assinatura"} />
                <Info label="Plano" value={d.subscription?.plan_id ?? "—"} />
                <Info label="Válida até" value={dt(d.subscription?.current_period_end || d.subscription?.trial_ends_at)} />
                <Info label="Pedidos" value={d.orders} />
              </div>
            </Section>
            <Section title="Dinheiro dos clientes dele">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Info label="Cobranças" value={d.invoices.total} />
                <Info label="Recebido" value={brl(d.invoices.paid)} />
                <Info label="A receber" value={brl(d.invoices.pending)} />
                <Info label="Atrasado" value={brl(d.invoices.overdue)} />
              </div>
            </Section>
            <Section title="WhatsApp e pagamentos">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Info label="Empresa" value={d.whatsapp?.business_name || "—"} />
                <Info label="WhatsApp" value={d.whatsapp?.connection_status === "connected" ? d.whatsapp?.connected_number || "Conectado" : "Desconectado"} />
                <Info label="Cobrança automática" value={d.whatsapp?.auto_send_enabled ? "Ligada" : "Desligada"} />
                <Info label="Recebe por" value={d.whatsapp?.payment_provider || (d.whatsapp?.pix_key ? "Pix" : "—")} />
              </div>
            </Section>
            <Section title={`Servidores Sigma (${d.panels.length})`}>
              {d.panels.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum servidor cadastrado.</p> : (
                <ul className="divide-y divide-border/60 rounded-md border border-border/60 text-sm">
                  {d.panels.map((p: any) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.enabled ? "ativo" : "desligado"} · sincronizado {dt(p.last_sync_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title={`Clientes (${d.clients.length})`}>
              {d.clients.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado.</p> : (
                <div className="max-h-64 overflow-y-auto rounded-md border border-border/60">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card text-left text-[11px] uppercase text-muted-foreground">
                      <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">WhatsApp</th><th className="px-3 py-2">Usuário</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2">Valor</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {d.clients.map((c: any) => (
                        <tr key={c.id}>
                          <td className="px-3 py-1.5">{c.name} {c.status !== "active" && <Badge variant="secondary" className="ml-1 text-[10px]">{c.status}</Badge>}</td>
                          <td className="px-3 py-1.5 tabular-nums">{c.phone || "—"}</td>
                          <td className="px-3 py-1.5">{c.iptv_username || "—"}</td>
                          <td className="px-3 py-1.5">{dt(c.next_due_date)}</td>
                          <td className="px-3 py-1.5 tabular-nums">{brl(c.monthly_fee)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <Section title="Pagamentos da assinatura">
              {d.payments.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento.</p> : (
                <ul className="divide-y divide-border/60 rounded-md border border-border/60 text-sm">
                  {d.payments.map((p: any, i: number) => (
                    <li key={i} className="flex justify-between px-3 py-2"><span>{dt(p.created_at)} · {p.months} mês(es)</span><span>{brl(p.amount)} · {p.status}</span></li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Últimas mensagens enviadas">
              {d.messages.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma mensagem.</p> : (
                <ul className="divide-y divide-border/60 rounded-md border border-border/60 text-sm">
                  {d.messages.map((m: any, i: number) => (
                    <li key={i} className="px-3 py-2">
                      <div className="flex justify-between text-xs text-muted-foreground"><span>{m.phone}</span><span>{new Date(m.created_at).toLocaleString("pt-BR")} · {m.status === "sent" ? "enviada" : "falhou"}</span></div>
                      <p className="line-clamp-2 text-foreground">{m.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
