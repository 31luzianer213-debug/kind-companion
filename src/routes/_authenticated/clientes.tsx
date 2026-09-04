import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { sendAccessDetails, sendWhatsAppMessage } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { KeyRound, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — IPTV Manager" },
      { name: "description", content: "Cadastre e organize seus clientes de IPTV com valor e vencimento." },
      { property: "og:title", content: "Clientes — IPTV Manager" },
      { property: "og:description", content: "Cadastro completo de clientes de IPTV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Clientes,
});

type ClientForm = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  monthly_fee: string;
  due_day: string;
  next_due_date: string;
  status: string;
  list_id: string;
  notes: string;
  iptv_username: string;
  iptv_password: string;
  screens: string;
  activated_at: string;
};

const empty: ClientForm = {
  name: "",
  phone: "",
  email: "",
  monthly_fee: "",
  due_day: "10",
  next_due_date: "",
  status: "active",
  list_id: "none",
  notes: "",
  iptv_username: "",
  iptv_password: "",
  screens: "1",
  activated_at: "",
};

function Clientes() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendWhatsAppMessage);
  const sendAccess = useServerFn(sendAccessDetails);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(empty);

  const { data } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const [clients, lists] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("iptv_lists").select("id, name").order("name"),
      ]);
      return { clients: clients.data ?? [], lists: lists.data ?? [] };
    },
  });

  const save = useMutation({
    mutationFn: async (values: ClientForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        user_id: auth.user!.id,
        name: values.name,
        phone: values.phone,
        email: values.email || null,
        monthly_fee: Number(values.monthly_fee || 0),
        due_day: Number(values.due_day || 10),
        next_due_date: values.next_due_date || null,
        status: values.status,
        list_id: values.list_id === "none" ? null : values.list_id,
        notes: values.notes || null,
        iptv_username: values.iptv_username || null,
        iptv_password: values.iptv_password || null,
        screens: Number(values.screens || 1),
        activated_at: values.activated_at || null,
      };
      const query = values.id
        ? supabase.from("clients").update(payload).eq("id", values.id)
        : supabase.from("clients").insert(payload);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cliente salvo.");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cliente removido.");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function cobrar(client: { id: string; name: string; phone: string; monthly_fee: number; next_due_date: string | null }) {
    const body = `Olá ${client.name}! Sua mensalidade de ${formatBRL(client.monthly_fee)} ${
      client.next_due_date ? `vence em ${formatDate(client.next_due_date)}` : "está em aberto"
    }. Qualquer dúvida é só chamar aqui.`;
    const result = await send({ data: { phone: client.phone, body, clientId: client.id } });
    if (result.ok) toast.success("Mensagem enviada.");
    else toast.error(result.error ?? "Falha no envio.");
    queryClient.invalidateQueries();
  }

  async function enviarAcesso(clientId: string) {
    const result = await sendAccess({ data: { clientId } });
    if (result.ok) toast.success("Dados de acesso enviados.");
    else toast.error(result.error ?? "Falha no envio.");
    queryClient.invalidateQueries();
  }

  function edit(client: Tables<"clients">) {
    setForm({
      id: client["id"],
      name: client["name"] ?? "",
      phone: client["phone"] ?? "",
      email: client["email"] ?? "",
      monthly_fee: String(client["monthly_fee"] ?? ""),
      due_day: String(client["due_day"] ?? 10),
      next_due_date: client["next_due_date"] ?? "",
      status: client["status"] ?? "active",
      list_id: client["list_id"] ?? "none",
      notes: client["notes"] ?? "",
      iptv_username: client["iptv_username"] ?? "",
      iptv_password: client["iptv_password"] ?? "",
      screens: String(client["screens"] ?? 1),
      activated_at: client["activated_at"] ?? "",
    });
    setOpen(true);
  }

  const lists = data?.lists ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-gradient text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Quem paga, quanto e quando vence.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) setForm(empty);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>WhatsApp (com DDD)</Label>
                  <Input required placeholder="85999998888" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor mensal (R$)</Label>
                  <Input type="number" step="0.01" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Dia do vencimento</Label>
                  <Input type="number" min={1} max={28} value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Próximo vencimento</Label>
                  <Input type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Situação</Label>
                  <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="paused">Pausado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Lista usada</Label>
                <Select value={form.list_id} onValueChange={(value) => setForm({ ...form, list_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Sem lista" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem lista</SelectItem>
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Usuário do acesso IPTV</Label>
                  <Input value={form.iptv_username} onChange={(e) => setForm({ ...form, iptv_username: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Senha do acesso IPTV</Label>
                  <Input value={form.iptv_password} onChange={(e) => setForm({ ...form, iptv_password: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telas contratadas</Label>
                  <Input type="number" min={1} max={10} value={form.screens} onChange={(e) => setForm({ ...form, screens: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Ativado em</Label>
                  <Input type="date" value={form.activated_at} onChange={(e) => setForm({ ...form, activated_at: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="surface-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Lista</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.clients ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nenhum cliente cadastrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {(data?.clients ?? []).map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.phone}</TableCell>
                  <TableCell>{formatBRL(client.monthly_fee)}</TableCell>
                  <TableCell>{client.next_due_date ? formatDate(client.next_due_date) : `dia ${client.due_day}`}</TableCell>
                  <TableCell>{lists.find((l) => l.id === client.list_id)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={client.status === "active" ? "secondary" : "outline"}>
                      {client.status === "active" ? "Ativo" : client.status === "paused" ? "Pausado" : "Cancelado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Cobrar no WhatsApp" onClick={() => cobrar(client)}>
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Enviar dados de acesso" onClick={() => enviarAcesso(client.id)}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Editar" onClick={() => edit(client)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Remover" onClick={() => remove.mutate(client.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
