import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/listas")({
  head: () => ({
    meta: [
      { title: "Listas IPTV — IPTV Manager" },
      { name: "description", content: "Importe, ative e organize suas listas IPTV e acompanhe a lotação." },
      { property: "og:title", content: "Listas IPTV — IPTV Manager" },
      { property: "og:description", content: "Gestão completa das suas listas IPTV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Listas,
});

type ListForm = {
  id?: string;
  name: string;
  server_url: string;
  username: string;
  password: string;
  capacity: string;
  notes: string;
  content: string;
  channel_count: number;
};

const empty: ListForm = {
  name: "",
  server_url: "",
  username: "",
  password: "",
  capacity: "0",
  notes: "",
  content: "",
  channel_count: 0,
};

function countChannels(content: string) {
  return (content.match(/#EXTINF/gi) ?? []).length;
}

function Listas() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ListForm>(empty);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: lists } = useQuery({
    queryKey: ["lists"],
    queryFn: async () => {
      const [listsRes, clientsRes] = await Promise.all([
        supabase.from("iptv_lists").select("*").order("sort_order").order("created_at"),
        supabase.from("clients").select("id, list_id"),
      ]);
      const counts = new Map<string, number>();
      for (const c of clientsRes.data ?? []) {
        if (c.list_id) counts.set(c.list_id, (counts.get(c.list_id) ?? 0) + 1);
      }
      return (listsRes.data ?? []).map((list) => ({ ...list, used: counts.get(list.id) ?? 0 }));
    },
  });

  const save = useMutation({
    mutationFn: async (values: ListForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        user_id: auth.user!.id,
        name: values.name,
        server_url: values.server_url || null,
        username: values.username || null,
        password: values.password || null,
        capacity: Number(values.capacity || 0),
        notes: values.notes || null,
        content: values.content || null,
        channel_count: values.channel_count,
      };
      const query = values.id
        ? supabase.from("iptv_lists").update(payload).eq("id", values.id)
        : supabase.from("iptv_lists").insert(payload);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lista salva.");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("iptv_lists").update(values).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("iptv_lists").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lista removida.");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function onFile(file: File) {
    const text = await file.text();
    setForm((prev) => ({
      ...prev,
      content: text,
      channel_count: countChannels(text),
      name: prev.name || file.name.replace(/\.[^.]+$/, ""),
    }));
    toast.success(`Arquivo lido: ${countChannels(text)} canais encontrados.`);
  }

  function move(index: number, direction: -1 | 1) {
    const items = lists ?? [];
    const target = items[index + direction];
    const current = items[index];
    if (!target || !current) return;
    update.mutate({ id: current.id, values: { sort_order: index + direction } });
    update.mutate({ id: target.id, values: { sort_order: index } });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Listas IPTV</h1>
          <p className="text-sm text-muted-foreground">Importe, ative e organize suas listas.</p>
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
              <Plus className="h-4 w-4" /> Nova lista
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar lista" : "Nova lista"}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label>Nome da lista</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Servidor / URL</Label>
                <Input value={form.server_url} onChange={(e) => setForm({ ...form, server_url: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Usuário</Label>
                  <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Capacidade (nº de clientes)</Label>
                  <Input type="number" min={0} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Canais detectados</Label>
                  <Input value={form.channel_count} readOnly />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Arquivo da lista (.m3u / .txt)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".m3u,.m3u8,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file);
                  }}
                />
                <Button type="button" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Enviar arquivo
                </Button>
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

      <div className="grid gap-4 md:grid-cols-2">
        {(lists ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma lista cadastrada ainda.</p>
        )}
        {(lists ?? []).map((list, index) => (
          <Card key={list.id}>
            <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">{list.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{list.server_url ?? "Sem servidor informado"}</p>
              </div>
              <Badge variant={list.status === "active" ? "secondary" : "outline"}>
                {list.status === "active" ? "Ativa" : "Inativa"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-4 text-muted-foreground">
                <span>{list.channel_count} canais</span>
                <span>
                  {list.used}/{list.capacity || "∞"} clientes
                </span>
                {list.username && <span>login: {list.username}</span>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={list.status === "active"}
                    onCheckedChange={(checked) =>
                      update.mutate({ id: list.id, values: { status: checked ? "active" : "inactive" } })
                    }
                  />
                  <span className="text-muted-foreground">Ativa</span>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" title="Subir" onClick={() => move(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Descer" onClick={() => move(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Editar"
                    onClick={() => {
                      setForm({
                        id: list.id,
                        name: list.name,
                        server_url: list.server_url ?? "",
                        username: list.username ?? "",
                        password: list.password ?? "",
                        capacity: String(list.capacity ?? 0),
                        notes: list.notes ?? "",
                        content: list.content ?? "",
                        channel_count: list.channel_count ?? 0,
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Remover" onClick={() => remove.mutate(list.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
