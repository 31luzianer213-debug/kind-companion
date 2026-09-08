import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Copy,
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  Server,
  Tv,
  Users,
  Check,
  X,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/listas")({
  head: () => ({
    meta: [
      { title: "Listas IPTV — IPTV Manager Pro" },
      { name: "description", content: "Monitore lotação de servidores, importe arquivos M3U e gere links de acesso." },
      { property: "og:title", content: "Listas IPTV — IPTV Manager Pro" },
      { property: "og:description", content: "Gestão completa das suas listas e servidores IPTV." },
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
  capacity: "50",
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
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: lists, isLoading } = useQuery({
    queryKey: ["lists"],
    queryFn: async () => {
      const [listsRes, clientsRes] = await Promise.all([
        supabase.from("iptv_lists").select("*").order("sort_order").order("created_at"),
        supabase.from("clients").select("id, list_id, screens").eq("status", "active"),
      ]);

      const counts = new Map<string, number>();
      for (const c of clientsRes.data ?? []) {
        if (c.list_id) {
          const screens = Number(c.screens || 1);
          counts.set(c.list_id, (counts.get(c.list_id) ?? 0) + screens);
        }
      }

      return (listsRes.data ?? []).map((list) => ({
        ...list,
        used: counts.get(list.id) ?? 0,
      }));
    },
  });

  // Global Capacity Metrics
  const metrics = useMemo(() => {
    const all = lists ?? [];
    const totalLists = all.length;
    const activeLists = all.filter((l) => l.status === "active").length;
    const totalCapacity = all.reduce((sum, l) => sum + Number(l.capacity || 0), 0);
    const totalUsed = all.reduce((sum, l) => sum + Number(l.used || 0), 0);
    const availableSlots = Math.max(0, totalCapacity - totalUsed);
    const globalRate = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;

    return {
      totalLists,
      activeLists,
      totalCapacity,
      totalUsed,
      availableSlots,
      globalRate,
    };
  }, [lists]);

  // Filtered lists
  const filteredLists = useMemo(() => {
    return (lists ?? []).filter((l) => {
      const term = search.toLowerCase().trim();
      return (
        !term ||
        l.name.toLowerCase().includes(term) ||
        (l.server_url && l.server_url.toLowerCase().includes(term)) ||
        (l.notes && l.notes.toLowerCase().includes(term))
      );
    });
  }, [lists, search]);

  const save = useMutation({
    mutationFn: async (values: ListForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        user_id: auth.user!.id,
        name: values.name.trim(),
        server_url: values.server_url?.trim() || null,
        username: values.username?.trim() || null,
        password: values.password?.trim() || null,
        capacity: Number(values.capacity || 0),
        notes: values.notes?.trim() || null,
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
      toast.success("Lista IPTV salva com sucesso.");
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TablesUpdate<"iptv_lists"> }) => {
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
    const channels = countChannels(text);
    setForm((prev) => ({
      ...prev,
      content: text,
      channel_count: channels,
      name: prev.name || file.name.replace(/\.[^.]+$/, ""),
    }));
    toast.success(`Arquivo lido com sucesso: ${channels} canais identificados.`);
  }

  function move(index: number, direction: -1 | 1) {
    const items = lists ?? [];
    const target = items[index + direction];
    const current = items[index];
    if (!target || !current) return;
    update.mutate({ id: current.id, values: { sort_order: index + direction } });
    update.mutate({ id: target.id, values: { sort_order: index } });
  }

  function copiarLinkM3u(list: { server_url: string | null; username: string | null; password: string | null; name: string }) {
    if (!list.server_url) {
      toast.error("Esta lista não possui Servidor / URL cadastrada.");
      return;
    }
    const cleanUrl = list.server_url.replace(/\/+$/, "");
    const user = list.username || "usuario";
    const pass = list.password || "senha";
    const m3u = `${cleanUrl}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=ts`;

    navigator.clipboard.writeText(m3u);
    toast.success("URL M3U copiada para a área de transferência!");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
            Infraestrutura de Conteúdo
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Listas & Servidores IPTV
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe a lotação de clientes em tempo real, ative/desative listas e gere links M3U.
          </p>
        </div>

        <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) setForm(empty);
          }}
        >
          <DialogTrigger asChild>
            <Button className="rounded-xl font-bold gap-2 shadow-lg shadow-primary/25">
              <Plus className="h-4 w-4" /> Nova Lista IPTV
            </Button>
          </DialogTrigger>

          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {form.id ? "Editar Lista IPTV" : "Cadastrar Nova Lista IPTV"}
              </DialogTitle>
            </DialogHeader>

            <form
              className="space-y-4 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome de Identificação da Lista *</Label>
                <Input
                  required
                  placeholder="Ex: Servidor Ouro (Canais + Filmes 4K)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Servidor / URL base (DNS)</Label>
                <Input
                  placeholder="Ex: http://servidor-iptv.com:8080"
                  value={form.server_url}
                  onChange={(e) => setForm({ ...form, server_url: e.target.value })}
                  className="rounded-xl font-mono"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Usuário Master (opcional)</Label>
                  <Input
                    placeholder="master_user"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="rounded-xl font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Senha Master (opcional)</Label>
                  <Input
                    placeholder="master_pass"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Capacidade Máxima (Telas/Clientes)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="50"
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    className="rounded-xl font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">0 = sem limite de lotação</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Canais Detectados</Label>
                  <Input
                    value={form.channel_count}
                    readOnly
                    className="rounded-xl font-mono bg-muted/40 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Upload de Arquivo M3U */}
              <div className="rounded-2xl border border-dashed border-border/80 p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Importar Arquivo .M3U / .TXT</p>
                    <p className="text-[11px] text-muted-foreground">
                      Carregue a lista para contar canais e salvar o conteúdo.
                    </p>
                  </div>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Selecionar
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Observações Internas</Label>
                <Textarea
                  placeholder="Ex: Servidor de backup com foco em esportes..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="rounded-xl resize-none h-20"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={save.isPending} className="rounded-xl font-bold">
                  {save.isPending ? "Salvando..." : "Salvar Lista"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 4 Cards de Métricas de Infraestrutura */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase">Servidores Ativos</p>
            <p className="text-2xl font-black text-foreground">
              {metrics.activeLists} / {metrics.totalLists}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-chart-2/10 text-chart-2">
            <Tv className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase">Telas Ocupadas</p>
            <p className="text-2xl font-black text-foreground">{metrics.totalUsed}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase">Vagas Livres</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {metrics.availableSlots}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-chart-4/10 text-chart-4">
            <Layers className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="flex justify-between items-baseline">
              <p className="text-[11px] font-bold text-muted-foreground uppercase">Ocupação Geral</p>
              <span className="text-xs font-bold font-mono">{metrics.globalRate}%</span>
            </div>
            <Progress value={metrics.globalRate} className="h-2 mt-1.5" />
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar lista por nome ou URL do servidor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl pl-10 pr-9 h-11"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Grid de Cards de Listas */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredLists.length === 0 && (
          <div className="md:col-span-2 rounded-2xl border border-dashed border-border/60 p-12 text-center">
            <p className="font-semibold text-foreground">Nenhuma lista encontrada</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Tente buscar com outro termo." : "Clique em 'Nova Lista IPTV' para cadastrar sua primeira lista."}
            </p>
          </div>
        )}

        {filteredLists.map((list, index) => {
          const cap = Number(list.capacity || 0);
          const used = Number(list.used || 0);
          const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
          const isFull = cap > 0 && used >= cap;
          const isWarning = cap > 0 && pct >= 80;

          return (
            <Card key={list.id} className="surface-card hover-lift overflow-hidden flex flex-col justify-between">
              <div>
                <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-bold truncate">{list.name}</CardTitle>
                      <Badge
                        variant={list.status === "active" ? "secondary" : "outline"}
                        className="rounded-full text-[10px] font-bold shrink-0"
                      >
                        {list.status === "active" ? "🟢 Ativa" : "⚪ Inativa"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground truncate font-mono">
                      {list.server_url ?? "Sem URL configurada"}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 text-sm pb-4">
                  {/* Barra de Lotação */}
                  <div className="space-y-1.5 rounded-xl bg-muted/40 p-3 border border-border/40">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary" /> Lotação de Clientes
                      </span>
                      <span className={`font-mono font-bold ${isFull ? "text-destructive" : isWarning ? "text-amber-500" : "text-foreground"}`}>
                        {used} / {cap > 0 ? cap : "∞"} telas ({cap > 0 ? `${pct}%` : "Livre"})
                      </span>
                    </div>
                    {cap > 0 && (
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isFull ? "bg-destructive" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    {isFull && (
                      <p className="text-[10px] font-bold text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Capacidade esgotada! Aloque novos clientes em outro servidor.
                      </p>
                    )}
                  </div>

                  {/* Informações Rápidas */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
                      📺 {list.channel_count} canais
                    </span>
                    {list.username && (
                      <span className="rounded-md bg-muted px-2 py-0.5 font-mono">
                        👤 {list.username}
                      </span>
                    )}
                    {list.notes && (
                      <span className="line-clamp-1 italic text-[11px]">
                        "{list.notes}"
                      </span>
                    )}
                  </div>
                </CardContent>
              </div>

              {/* Ações do Card */}
              <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={list.status === "active"}
                    onCheckedChange={(checked) =>
                      update.mutate({ id: list.id, values: { status: checked ? "active" : "inactive" } })
                    }
                  />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {list.status === "active" ? "Ligada" : "Desligada"}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Copiar Link M3U */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg px-2.5 text-xs font-semibold gap-1"
                    onClick={() => copiarLinkM3u(list)}
                    title="Copiar URL de reprodução M3U"
                  >
                    <Copy className="h-3.5 w-3.5" /> M3U
                  </Button>

                  {/* Reordenar */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Subir ordem"
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Descer ordem"
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>

                  {/* Editar */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-primary"
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
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>

                  {/* Remover */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    title="Remover"
                    onClick={() => {
                      if (confirm(`Remover a lista "${list.name}"?`)) {
                        remove.mutate(list.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
