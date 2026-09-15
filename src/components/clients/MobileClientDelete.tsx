import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteSigmaClient } from "@/lib/sigma.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

export function MobileClientDelete() {
  const queryClient = useQueryClient();
  const deleteClient = useServerFn(deleteSigmaClient);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<any | null>(null);
  const [deleteFromSigma, setDeleteFromSigma] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const { data } = useQuery({
    queryKey: ["clients", "mobile-delete-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id,name,phone,iptv_username,sigma_customer_id,status")
        .order("name", { ascending: true });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    enabled: open,
    staleTime: 15_000,
  });

  const clients = Array.isArray(data) ? data : [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client: any) =>
      String(client.name || "").toLowerCase().includes(term) ||
      String(client.phone || "").includes(term) ||
      String(client.iptv_username || "").toLowerCase().includes(term),
    );
  }, [clients, search]);

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      const result = await deleteClient({
        data: {
          clientId: target.id,
          deleteFromSigma: Boolean(target.sigma_customer_id) && deleteFromSigma,
        },
      });

      if (!result.ok) {
        toast.error(result.error ?? "Falha ao excluir cliente.");
        return;
      }

      toast.success(`${target.name} removido com sucesso.`);
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
    } catch {
      toast.error("Erro inesperado ao excluir cliente.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="fixed bottom-[5.6rem] right-3 z-30 h-11 gap-2 rounded-full border-destructive/35 bg-background/95 px-4 text-xs font-bold text-destructive shadow-xl backdrop-blur md:hidden"
        aria-label="Excluir cliente"
      >
        <Trash2 className="size-4" />
        Excluir cliente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[86dvh] w-[calc(100vw-1rem)] max-w-md overflow-hidden p-0 md:hidden">
          <div className="border-b border-border/60 p-4 pb-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Trash2 className="size-4 text-destructive" />
                Excluir cliente
              </DialogTitle>
              <DialogDescription>
                Escolha o cliente que deseja remover. A exclusão sempre pede confirmação.
              </DialogDescription>
            </DialogHeader>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome, WhatsApp ou usuário..."
                className="pl-9 pr-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[62dvh] overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((client: any) => (
                  <div key={client.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{client.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client.iptv_username || client.phone || "Sem usuário cadastrado"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDeleteFromSigma(true);
                        setTarget(client);
                      }}
                      className="shrink-0 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      Excluir
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(target)} onOpenChange={(value) => !value && setTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-1rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação remove o cliente do painel e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {target?.sigma_customer_id && (
            <label className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
              <Checkbox
                checked={deleteFromSigma}
                onCheckedChange={(checked) => setDeleteFromSigma(Boolean(checked))}
              />
              <span className="text-sm leading-5">
                <strong className="block text-foreground">Remover também do Sigma</strong>
                <span className="text-xs text-muted-foreground">Também exclui o acesso vinculado no servidor.</span>
              </span>
            </label>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
