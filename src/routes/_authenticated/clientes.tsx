import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { sendAccessDetails, sendWhatsAppMessage } from "@/lib/whatsapp.functions";
import {
  syncSigmaClients,
  createSigmaClient,
  updateSigmaClient,
  deleteSigmaClient,
  renewSigmaClient,
  toggleSigmaClientBlock,
  getSigmaSettings,
} from "@/lib/sigma.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatBRL,
  formatDate,
  formatIptvAccessMessage,
  extractCleanIptvDns,
  generateM3uUrl,
  generateEpgUrl,
} from "@/lib/format";
import {
  KeyRound,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Search,
  Download,
  Copy,
  CalendarPlus,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MoreVertical,
  X,
  Tv,
  Sparkles,
  ShieldCheck,
  Ban,
  Check,
  Server,
  Calendar,
  Smartphone,
  Send,
  Eye,
  EyeOff,
  Globe,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes & Linhas Sigma — IPTV Manager" },
      { name: "description", content: "Gerencie assinantes, credenciais de acesso, renovações e status no servidor Sigma." },
    ],
  }),
  component: Clientes,
});

type ClientRow = Tables<"clients">;

type ClientForm = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  monthly_fee: string;
  due_day: string;
  next_due_date: string;
  status: string;
  notes: string;
  iptv_username: string;
  iptv_password: string;
  screens: string;
  activated_at: string;
  create_in_sigma: boolean;
};

const empty: ClientForm = {
  name: "",
  phone: "",
  email: "",
  monthly_fee: "35.00",
  due_day: "10",
  next_due_date: "",
  status: "active",
  notes: "",
  iptv_username: "",
  iptv_password: "",
  screens: "1",
  activated_at: "",
  create_in_sigma: true,
};

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function cleanPhoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "CL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function getRelativeDueInfo(dueDateStr: string | null) {
  if (!dueDateStr) return { text: "Sem vencimento", tone: "text-muted-foreground", badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr + "T00:00:00");
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      text: `Vencido há ${days} dia${days > 1 ? "s" : ""}`,
      tone: "text-rose-400 font-semibold",
      badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    };
  }
  if (diffDays === 0) {
    return {
      text: "Vence hoje!",
      tone: "text-amber-400 font-bold",
      badge: "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse",
    };
  }
  if (diffDays === 1) {
    return {
      text: "Vence amanhã",
      tone: "text-amber-300",
      badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    };
  }
  if (diffDays <= 5) {
    return {
      text: `Vence em ${diffDays} dias`,
      tone: "text-sky-300",
      badge: "bg-sky-500/10 text-sky-300 border-sky-500/20",
    };
  }
  return {
    text: formatDate(dueDateStr),
    tone: "text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  };
}

function Clientes() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendWhatsAppMessage);
  const sendAccess = useServerFn(sendAccessDetails);
  const syncSigma = useServerFn(syncSigmaClients);
  const createSigma = useServerFn(createSigmaClient);
  const updateSigma = useServerFn(updateSigmaClient);
  const deleteSigma = useServerFn(deleteSigmaClient);
  const renewSigma = useServerFn(renewSigmaClient);
  const toggleBlock = useServerFn(toggleSigmaClientBlock);
  const getSigma = useServerFn(getSigmaSettings);

  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<ClientForm>(empty);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modais de confirmação
  const [confirmRenewClient, setConfirmRenewClient] = useState<ClientRow | null>(null);
  const [confirmRemindClient, setConfirmRemindClient] = useState<ClientRow | null>(null);

  // Modal de Detalhes de Acesso IPTV & M3U
  const [viewAccessClient, setViewAccessClient] = useState<ClientRow | null>(null);
  const [showModalPass, setShowModalPass] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyText(text?: string | null, fieldName: string = "Item") {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2200);
    toast.success(`${fieldName} copiado!`);
  }

  // Filtros
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState("all");

  // Exclusão
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string; hasSigma: boolean } | null>(null);
  const [deleteFromSigma, setDeleteFromSigma] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Estado de ação rápida
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sigmaConfigQuery = useQuery({
    queryKey: ["sigma-settings"],
    queryFn: async () => {
      const res = await getSigma({});
      return res.ok ? res.settings : null;
    },
  });

  const clients = data ?? [];
  const isSigmaConfigured = Boolean(sigmaConfigQuery.data?.isConfigured);
  const isRawDomain = (name?: string | null) =>
    !name ||
    name.trim().startsWith("http") ||
    /\.(click|com|net|org|xyz|st|top|io|tv|online|site|app|live)\b/i.test(name);

  const rawConfigServerName =
    sigmaConfigQuery.data?.sigma_server_name?.trim() ||
    sigmaConfigQuery.data?.sigma_server_display_name;

  const sigmaServerName =
    rawConfigServerName && !isRawDomain(rawConfigServerName)
      ? rawConfigServerName
      : "Servidor Principal";

  const sigmaServerUrl =
    sigmaConfigQuery.data?.sigma_streaming_dns?.trim() ||
    sigmaConfigQuery.data?.sigma_url ||
    "";

  function getClientServerLabel(client: ClientRow): string {
    if (client.notes) {
      const matchServer = client.notes.match(/(?:Servidor|Server):\s*([^|\n,]+)/i);
      if (matchServer?.[1]?.trim() && !isRawDomain(matchServer[1].trim())) {
        return matchServer[1].trim();
      }
      const matchPack = client.notes.match(/(?:Pacote|Plano|Package):\s*([^|\n,]+)/i);
      if (matchPack?.[1]?.trim()) return matchPack[1].trim();
    }
    return sigmaServerName;
  }

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0] ?? "", []);

  // Estatísticas
  const stats = useMemo(() => {
    let total = clients.length;
    let active = 0;
    let overdue = 0;
    let todayDue = 0;
    let inSigma = 0;

    for (const c of clients) {
      if (c.status === "active") active++;
      if (c.sigma_customer_id) inSigma++;
      if (c.status === "active" && c.next_due_date) {
        if (c.next_due_date < todayStr) overdue++;
        else if (c.next_due_date === todayStr) todayDue++;
      }
    }

    return { total, active, overdue, todayDue, inSigma };
  }, [clients, todayStr]);

  // Lista filtrada
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        (c.iptv_username && c.iptv_username.toLowerCase().includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term));

      if (!matchesSearch) return false;

      if (filterTab === "all") return true;
      if (filterTab === "active") return c.status === "active";
      if (filterTab === "blocked") return c.status === "blocked" || c.status === "inactive";
      if (filterTab === "overdue") {
        return c.status === "active" && c.next_due_date && c.next_due_date < todayStr;
      }
      if (filterTab === "today") {
        return c.next_due_date === todayStr;
      }
      return true;
    });
  }, [clients, search, filterTab, todayStr]);

  const save = useMutation({
    mutationFn: async (values: ClientForm) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        user_id: auth.user!.id,
        name: values.name.trim(),
        phone: cleanPhoneDigits(values.phone),
        email: values.email?.trim() || null,
        monthly_fee: Number(values.monthly_fee || 0),
        due_day: Number(values.due_day || 10),
        next_due_date: values.next_due_date || null,
        status: values.status,
        notes: values.notes?.trim() || null,
        iptv_username: values.iptv_username?.trim() || null,
        iptv_password: values.iptv_password?.trim() || null,
        screens: Number(values.screens || 1),
        activated_at: values.activated_at || null,
        sigma_username: values.iptv_username?.trim() || null,
      };

      let savedRow: any = null;

      if (values.id) {
        const { data: updated, error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", values.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        savedRow = updated;

        // Se ainda não tem linha no Sigma, cria
        if (!savedRow?.sigma_customer_id && isSigmaConfigured && values.iptv_username) {
          try {
            const sigmaRes = await createSigma({
              data: {
                clientId: values.id,
                name: values.name.trim(),
                username: values.iptv_username.trim(),
                password: values.iptv_password?.trim() || "",
                phone: cleanPhoneDigits(values.phone),
                email: values.email?.trim() || undefined,
                screens: Number(values.screens || 1),
                dueDate: values.next_due_date || undefined,
                notes: values.notes?.trim() || undefined,
              },
            });
            if (sigmaRes.ok) {
              toast.success("Linha criada e sincronizada no Painel Sigma!");
            }
          } catch (err) {
            console.error("Erro Sigma ao criar:", err);
          }
        } else if (isSigmaConfigured && (values.iptv_username || savedRow?.sigma_customer_id)) {
          // Atualiza dados no Sigma
          try {
            const updateRes = await updateSigma({
              data: {
                clientId: values.id,
                name: values.name.trim(),
                username: values.iptv_username?.trim(),
                password: values.iptv_password?.trim(),
                phone: cleanPhoneDigits(values.phone),
                email: values.email?.trim() || undefined,
                screens: Number(values.screens || 1),
                dueDate: values.next_due_date || undefined,
                status: values.status,
                notes: values.notes?.trim() || undefined,
              },
            });
            if (updateRes.ok) {
              toast.info("Linha atualizada no Painel Sigma!");
            }
          } catch (err) {
            console.warn("Aviso Sigma ao atualizar:", err);
          }
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("clients")
          .insert(payload)
          .select()
          .single();
        if (error) throw new Error(error.message);
        savedRow = inserted;

        if (isSigmaConfigured && savedRow?.id && values.iptv_username) {
          try {
            const sigmaRes = await createSigma({
              data: {
                clientId: savedRow.id,
                name: values.name.trim(),
                username: values.iptv_username.trim(),
                password: values.iptv_password?.trim() || "",
                phone: cleanPhoneDigits(values.phone),
                email: values.email?.trim() || undefined,
                screens: Number(values.screens || 1),
                dueDate: values.next_due_date || undefined,
                notes: values.notes?.trim() || undefined,
              },
            });
            if (sigmaRes.ok) {
              toast.success("Linha criada e sincronizada no Painel Sigma!");
            }
          } catch (err) {
            console.error("Erro Sigma ao criar:", err);
          }
        }
      }

      return savedRow;
    },
    onSuccess: (savedRow) => {
      toast.success("Cliente salvo com sucesso!");
      setOpen(false);
      setForm(empty);

      if (savedRow) {
        queryClient.setQueryData(["clients"], (old: any[] | undefined) => {
          if (!old) return [savedRow];
          const exists = old.some((c) => c.id === savedRow.id);
          if (exists) {
            return old.map((c) => (c.id === savedRow.id ? { ...c, ...savedRow } : c));
          }
          return [...old, savedRow].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        });
      }

      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function executarExclusao() {
    if (!clientToDelete) return;
    setDeleting(true);
    try {
      const res = await deleteSigma({
        data: {
          clientId: clientToDelete.id,
          deleteFromSigma: clientToDelete.hasSigma && deleteFromSigma,
        },
      });
      if (res.ok) {
        toast.success("Cliente removido com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      } else {
        toast.error(res.error ?? "Falha ao remover cliente.");
      }
    } catch {
      toast.error("Erro inesperado ao excluir cliente.");
    } finally {
      setDeleting(false);
      setClientToDelete(null);
    }
  }

  // Renovação rápida +30 dias (local + Sigma)
  async function renovar30Dias(client: ClientRow) {
    setActionBusyId(client.id);
    try {
      if (client.sigma_customer_id) {
        const res = await renewSigma({ data: { clientId: client.id, months: 1 } });
        if (res.ok) {
          toast.success(`Renovado com sucesso no Sigma até ${formatDate(res.nextDueDate!)}!`);
        } else {
          toast.error(res.error ?? "Falha ao renovar no painel Sigma.");
        }
      } else {
        const currentDue = client.next_due_date ? new Date(`${client.next_due_date}T12:00:00`) : new Date();
        const newDue = new Date(currentDue);
        newDue.setDate(newDue.getDate() + 30);
        const newDueStr = newDue.toISOString().split("T")[0] ?? "";

        const { error } = await supabase
          .from("clients")
          .update({
            next_due_date: newDueStr,
            status: "active",
          })
          .eq("id", client.id);

        if (error) throw error;
        toast.success(`Renovado com sucesso até ${formatDate(newDueStr)}!`);
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch {
      toast.error("Erro ao renovar cliente.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function alternarBloqueio(client: ClientRow) {
    setActionBusyId(client.id);
    const newStatus = client.status === "blocked" ? "active" : "blocked";
    try {
      if (client.sigma_customer_id) {
        const res = await toggleBlock({
          data: {
            clientId: client.id,
            action: newStatus === "blocked" ? "block" : "unblock",
          },
        });
        if (res.ok) {
          toast.success(newStatus === "blocked" ? "Linha bloqueada no Sigma!" : "Linha desbloqueada no Sigma!");
        } else {
          toast.error(res.error ?? "Falha ao alterar status no Sigma.");
        }
      } else {
        const { error } = await supabase
          .from("clients")
          .update({ status: newStatus })
          .eq("id", client.id);
        if (error) throw error;
        toast.success(newStatus === "blocked" ? "Cliente bloqueado localmente." : "Cliente reativado!");
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch {
      toast.error("Erro ao alterar status do cliente.");
    } finally {
      setActionBusyId(null);
    }
  }

  function gerarCredenciais() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let pass = "";
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const cleanName = (form.name || "user")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5);

    setForm({
      ...form,
      iptv_username: `${cleanName || "usr"}${randomNum}`,
      iptv_password: pass,
    });
    toast.info("Credenciais geradas!");
  }

  function copiarDadosAcesso(client: ClientRow) {
    const serverLabel = getClientServerLabel(client);
    const texto = formatIptvAccessMessage({
      name: client.name,
      serverName: serverLabel,
      serverUrl: sigmaServerUrl,
      username: client.iptv_username,
      password: client.iptv_password,
      screens: client.screens,
      dueDate: client.next_due_date,
    });

    navigator.clipboard.writeText(texto);
    setCopiedId(client.id);
    setTimeout(() => setCopiedId(null), 2500);
    toast.success("Dados de acesso IPTV copiados!");
  }

  async function cobrar(client: ClientRow) {
    setActionBusyId(client.id);
    const body = `Olá ${client.name}! Sua mensalidade de ${formatBRL(client.monthly_fee)} ${
      client.next_due_date ? `vence em ${formatDate(client.next_due_date)}` : "está em aberto"
    }. Qualquer dúvida é só me chamar aqui! 😊`;
    const result = await send({ data: { phone: client.phone, body, clientId: client.id } });
    setActionBusyId(null);
    if (result.ok) toast.success(`Mensagem de cobrança enviada para ${client.name}!`);
    else toast.error(result.error ?? "Falha no envio.");
    queryClient.invalidateQueries({ queryKey: ["clients"] });
  }

  async function enviarAcesso(clientId: string) {
    setActionBusyId(clientId);
    const result = await sendAccess({ data: { clientId } });
    setActionBusyId(null);
    if (result.ok) toast.success("Dados de acesso enviados via WhatsApp!");
    else toast.error(result.error ?? "Falha no envio.");
    queryClient.invalidateQueries({ queryKey: ["clients"] });
  }

  function edit(client: ClientRow) {
    setForm({
      id: client.id,
      name: client.name,
      phone: formatPhoneInput(client.phone),
      email: client.email ?? "",
      monthly_fee: String(client.monthly_fee ?? "35.00"),
      due_day: String(client.due_day ?? 10),
      next_due_date: client.next_due_date ?? "",
      status: client.status ?? "active",
      notes: client.notes ?? "",
      iptv_username: client.iptv_username ?? "",
      iptv_password: client.iptv_password ?? "",
      screens: String(client.screens ?? 1),
      activated_at: client.activated_at ?? "",
      create_in_sigma: Boolean(client.sigma_customer_id || isSigmaConfigured),
    });
    setOpen(true);
  }

  async function sincronizar() {
    setSyncing(true);
    const result = await syncSigma({ data: {} });
    setSyncing(false);
    if (result.ok) {
      if (result.created > 0) {
        toast.success(`🎉 ${result.created} nova(s) linha(s) importada(s) do Painel Sigma!`);
      } else if (result.updated > 0) {
        toast.success(`${result.updated} linha(s) atualizadas com o servidor.`);
      } else {
        toast.info("Tudo sincronizado! Nenhuma alteração pendente no servidor.");
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
    } else {
      toast.error(result.error ?? "Falha ao sincronizar.");
    }
  }

  function exportarCSV() {
    if (filteredClients.length === 0) {
      toast.info("Nenhum cliente para exportar.");
      return;
    }

    const headers = ["Nome", "Telefone", "E-mail", "Mensalidade", "Dia Venc", "Próximo Venc", "Status", "Servidor", "Telas", "Sigma ID"];
    const rows = filteredClients.map((c) => [
      `"${c.name}"`,
      `"${c.phone}"`,
      `"${c.email ?? ""}"`,
      `"${c.monthly_fee}"`,
      `"${c.due_day}"`,
      `"${c.next_due_date ?? ""}"`,
      `"${c.status}"`,
      `"${sigmaServerName}"`,
      `"${c.screens ?? 1}"`,
      `"${String(c.sigma_customer_id ?? "")}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `clientes_sigma_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Planilha CSV exportada com sucesso!");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Users className="size-6 text-primary" /> Clientes & Linhas Sigma
            </h1>
            <Badge variant="secondary" className="font-mono text-xs">
              {stats.total} clientes
            </Badge>
            {isSigmaConfigured ? (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs gap-1 font-normal">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {sigmaServerName}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Gerenciamento unificado de assinantes, acessos IPTV, renovações e status no servidor Sigma.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSigmaConfigured ? (
            <Button
              variant="outline"
              size="sm"
              onClick={sincronizar}
              disabled={syncing}
              className="gap-1.5 shadow-sm text-xs"
            >
              {syncing ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <RefreshCw className="size-3.5 text-primary" />}
              Sincronizar Servidor
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            className="gap-1.5 shadow-sm text-xs"
          >
            <Download className="size-3.5" />
            CSV
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setForm(empty);
              setOpen(true);
            }}
            className="gap-1.5 shadow-sm bg-primary text-primary-foreground font-semibold text-xs hover-lift"
          >
            <Plus className="size-3.5" />
            Novo Cliente / Linha
          </Button>
        </div>
      </div>

      {/* 4 Cards de Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="surface-card border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total de Clientes</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{stats.total}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stats.inSigma} no servidor Sigma
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-blue-500/10 text-blue-400">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Linhas Ativas</p>
              <p className="text-2xl font-bold mt-1 text-emerald-400">{stats.active}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}% da base
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Em Atraso</p>
              <p className="text-2xl font-bold mt-1 text-rose-400">{stats.overdue}</p>
              <p className="text-[11px] text-rose-300/80 mt-0.5">
                Requerem cobrança
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-rose-500/10 text-rose-400">
              <AlertTriangle className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vencem Hoje</p>
              <p className="text-2xl font-bold mt-1 text-amber-400">{stats.todayDue}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Vencimento do dia
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-amber-500/10 text-amber-400">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Busca e Filtros */}
      <Card className="surface-card border-border/60">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, WhatsApp ou usuário IPTV..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 rounded-xl bg-background/60 text-sm"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            <Tabs value={filterTab} onValueChange={setFilterTab} className="w-full sm:w-auto">
              <TabsList className="grid grid-cols-5 w-full sm:w-auto h-9 p-1 bg-muted/60">
                <TabsTrigger value="all" className="text-xs">
                  Todos ({stats.total})
                </TabsTrigger>
                <TabsTrigger value="active" className="text-xs text-emerald-400">
                  Ativos ({stats.active})
                </TabsTrigger>
                <TabsTrigger value="overdue" className="text-xs text-rose-400">
                  Atraso ({stats.overdue})
                </TabsTrigger>
                <TabsTrigger value="today" className="text-xs text-amber-400">
                  Hoje ({stats.todayDue})
                </TabsTrigger>
                <TabsTrigger value="blocked" className="text-xs">
                  Bloqueados
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Lista Principal de Clientes */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Carregando clientes do servidor...</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <Card className="surface-card border-dashed p-12 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground mb-3">
            <Users className="size-6" />
          </div>
          <h3 className="font-semibold text-lg text-foreground">Nenhum cliente encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {search
              ? "Nenhum resultado corresponde à sua pesquisa. Tente buscar por outro termo."
              : "Você ainda não tem clientes cadastrados nesta categoria."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {search ? (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Limpar busca
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setForm(empty);
                  setOpen(true);
                }}
              >
                Cadastrar primeiro cliente
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Tabela Desktop */}
          <div className="hidden md:block rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Acesso no Servidor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Mensalidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const relativeDue = getRelativeDueInfo(client.next_due_date);
                  const isBusy = actionBusyId === client.id;
                  const isCopied = copiedId === client.id;

                  return (
                    <TableRow key={client.id} className="hover:bg-muted/30 transition-colors">
                      {/* Avatar */}
                      <TableCell className="pl-4">
                        <div
                          className={`size-9 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border ${
                            client.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : client.status === "blocked"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                          }`}
                        >
                          {getInitials(client.name)}
                        </div>
                      </TableCell>

                      {/* Nome e WhatsApp */}
                      <TableCell>
                        <div className="font-semibold text-foreground text-sm">
                          {client.name}
                        </div>
                        {client.phone ? (
                          <a
                            href={`https://wa.me/55${cleanPhoneDigits(client.phone)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-400 transition-colors font-mono mt-0.5"
                          >
                            <MessageCircle className="size-3 text-emerald-400" />
                            {formatPhoneInput(client.phone)}
                          </a>
                        ) : null}
                      </TableCell>

                      {/* Acesso no Servidor Sigma */}
                      <TableCell>
                        {client.iptv_username ? (
                          <div className="font-mono text-xs text-foreground flex items-center gap-1.5">
                            <KeyRound className="size-3.5 text-primary shrink-0" />
                            <span>{client.iptv_username}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Tv className="size-3" />
                          <span>{client.screens || 1} tela{(client.screens || 1) > 1 ? "s" : ""}</span>
                          {client.sigma_customer_id ? (
                            <span className="text-emerald-400 font-mono text-[10px]">
                              • ID: {String(client.sigma_customer_id).slice(0, 10)}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>

                      {/* Vencimento */}
                      <TableCell>
                        <Badge variant="outline" className={`text-xs gap-1 ${relativeDue.badge}`}>
                          <Calendar className="size-3" />
                          {relativeDue.text}
                        </Badge>
                        <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                          {client.next_due_date ? formatDate(client.next_due_date) : "Sem data"}
                        </div>
                      </TableCell>

                      {/* Mensalidade */}
                      <TableCell>
                        <div className="font-semibold text-xs text-foreground font-mono">
                          {formatBRL(client.monthly_fee)}
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            client.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                              : client.status === "blocked"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30 text-xs"
                              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30 text-xs"
                          }
                        >
                          {client.status === "active" ? "Ativo" : client.status === "blocked" ? "Bloqueado" : "Inativo"}
                        </Badge>
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Copiar Acesso */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-medium gap-1 text-muted-foreground hover:text-foreground"
                            title="Copiar dados de acesso"
                            onClick={() => copiarDadosAcesso(client)}
                          >
                            {isCopied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                            Copiar
                          </Button>

                          {/* Renovar Rápido (+30d) com modal */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            className="h-8 px-2.5 text-xs font-medium gap-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/20"
                            title="Renovar 30 dias no painel Sigma"
                            onClick={() => setConfirmRenewClient(client)}
                          >
                            {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarPlus className="size-3.5" />}
                            +30d
                          </Button>

                          {/* Enviar WhatsApp com modal */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            className="h-8 px-2.5 text-xs font-medium gap-1 text-primary hover:bg-primary/10 border-primary/20"
                            title="Cobrar via WhatsApp"
                            onClick={() => setConfirmRemindClient(client)}
                          >
                            <MessageCircle className="size-3.5" />
                            Cobrar
                          </Button>

                          {/* Dropdown com mais opções */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel className="text-xs">Opções do Cliente</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => edit(client)} className="gap-2">
                                <Pencil className="size-4" />
                                Editar dados
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setViewAccessClient(client)} className="gap-2 text-cyan-400 font-medium">
                                <Tv className="size-4" />
                                Ver Acesso & Listas M3U
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => enviarAcesso(client.id)} className="gap-2">
                                <Smartphone className="size-4" />
                                Enviar dados de acesso
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConfirmRenewClient(client)} className="gap-2 text-emerald-400">
                                <CalendarPlus className="size-4" />
                                Renovar +30 dias
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => alternarBloqueio(client)}
                                className={`gap-2 ${client.status === "blocked" ? "text-emerald-400" : "text-amber-400"}`}
                              >
                                <Ban className="size-4" />
                                {client.status === "blocked" ? "Desbloquear no Servidor" : "Bloquear no Servidor"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  setClientToDelete({
                                    id: client.id,
                                    name: client.name,
                                    hasSigma: Boolean(client.sigma_customer_id),
                                  })
                                }
                                className="gap-2 text-rose-400 focus:text-rose-400"
                              >
                                <Trash2 className="size-4" />
                                Excluir cliente
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Cards Mobile */}
          <div className="grid gap-3 md:hidden">
            {filteredClients.map((client) => {
              const relativeDue = getRelativeDueInfo(client.next_due_date);
              const isBusy = actionBusyId === client.id;
              const isCopied = copiedId === client.id;

              return (
                <Card key={client.id} className="surface-card border-border/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`size-10 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border ${
                          client.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : client.status === "blocked"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                        }`}
                      >
                        {getInitials(client.name)}
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground text-sm leading-tight">{client.name}</h4>
                        <a
                          href={`https://wa.me/55${cleanPhoneDigits(client.phone)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:text-emerald-400 font-mono inline-flex items-center gap-1 mt-0.5"
                        >
                          <MessageCircle className="size-3 text-emerald-400" />
                          {formatPhoneInput(client.phone)}
                        </a>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={
                        client.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[11px]"
                          : client.status === "blocked"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30 text-[11px]"
                          : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30 text-[11px]"
                      }
                    >
                      {client.status === "active" ? "Ativo" : client.status === "blocked" ? "Bloqueado" : "Inativo"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Vencimento:</span>
                      <Badge variant="outline" className={`mt-0.5 text-[11px] gap-1 ${relativeDue.badge}`}>
                        <Calendar className="size-3" />
                        {relativeDue.text}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Mensalidade:</span>
                      <span className="font-semibold text-foreground">{formatBRL(client.monthly_fee)}</span>
                      <span className="text-muted-foreground text-[11px]"> ({client.screens || 1} tela)</span>
                    </div>
                  </div>

                  {client.iptv_username ? (
                    <div className="flex items-center justify-between pt-1 text-xs font-mono text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => setViewAccessClient(client)}
                        className="flex items-center gap-1 bg-muted/40 hover:bg-cyan-500/10 hover:text-cyan-400 px-2 py-0.5 rounded-md transition-colors text-left"
                        title="Ver credenciais IPTV e links M3U"
                      >
                        <KeyRound className="size-3 text-primary" />
                        <span>{client.iptv_username}</span>
                        <Tv className="size-2.5 ml-0.5 text-cyan-400" />
                      </button>
                      {client.sigma_customer_id ? (
                        <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md text-[11px]">
                          Sigma ID: {String(client.sigma_customer_id).slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Ações Mobile com rótulos explícitos */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 px-1 text-muted-foreground"
                      onClick={() => copiarDadosAcesso(client)}
                    >
                      {isCopied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      Acesso
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      className="h-8 text-xs gap-1 px-1 text-emerald-400 border-emerald-500/30"
                      onClick={() => setConfirmRenewClient(client)}
                    >
                      {isBusy ? <Loader2 className="size-3 animate-spin" /> : <CalendarPlus className="size-3" />}
                      +30d
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 px-1 text-primary border-primary/30"
                      onClick={() => setConfirmRemindClient(client)}
                    >
                      <MessageCircle className="size-3" />
                      Cobrar
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 px-1"
                      onClick={() => edit(client)}
                    >
                      <Pencil className="size-3" />
                      Editar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Modal de Cadastro & Edição de Cliente */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-foreground">
              {form.id ? <Pencil className="size-4 text-primary" /> : <Plus className="size-4 text-primary" />}
              {form.id ? "Editar Cliente & Linha" : "Novo Cliente & Linha Sigma"}
            </DialogTitle>
            <DialogDescription>
              Cadastre ou atualize os dados do assinante. O acesso é sincronizado diretamente no Painel Sigma.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-4 pt-2">
            {/* Seção 1: Dados Pessoais */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                1. Dados do Cliente
              </h4>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome Completo *</Label>
                <Input
                  type="text"
                  placeholder="Ex: Carlos Silva"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="rounded-xl text-sm"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">WhatsApp / Telefone *</Label>
                  <Input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
                    required
                    className="rounded-xl text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">E-mail (Opcional)</Label>
                  <Input
                    type="email"
                    placeholder="cliente@email.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Valor da Mensalidade (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="35.00"
                    value={form.monthly_fee}
                    onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
                    required
                    className="rounded-xl text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Data de Vencimento *</Label>
                  <Input
                    type="date"
                    value={form.next_due_date}
                    onChange={(e) => {
                      const val = e.target.value;
                      const day = val ? String(parseInt(val.split("-")[2] || "10", 10)) : form.due_day;
                      setForm({ ...form, next_due_date: val, due_day: day });
                    }}
                    required
                    className="rounded-xl text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Seção 2: Linha no Servidor Sigma */}
            <div className="space-y-3 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Server className="size-3.5 text-primary" />
                  2. Linha no Servidor Sigma
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={gerarCredenciais}
                  className="h-7 text-[11px] gap-1 text-primary border-primary/30"
                >
                  <Sparkles className="size-3" />
                  Gerar Usuário & Senha
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Usuário IPTV *</Label>
                  <Input
                    type="text"
                    placeholder="usuario123"
                    value={form.iptv_username}
                    onChange={(e) => setForm({ ...form, iptv_username: e.target.value })}
                    required
                    className="rounded-xl text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Senha IPTV *</Label>
                  <Input
                    type="text"
                    placeholder="senha123"
                    value={form.iptv_password}
                    onChange={(e) => setForm({ ...form, iptv_password: e.target.value })}
                    required
                    className="rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Quantidade de Telas</Label>
                  <Select
                    value={form.screens}
                    onValueChange={(val) => setForm({ ...form, screens: val })}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Tela</SelectItem>
                      <SelectItem value="2">2 Telas</SelectItem>
                      <SelectItem value="3">3 Telas</SelectItem>
                      <SelectItem value="4">4 Telas</SelectItem>
                      <SelectItem value="5">5 Telas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Status Inicial</Label>
                  <Select
                    value={form.status}
                    onValueChange={(val) => setForm({ ...form, status: val })}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo (Liberado)</SelectItem>
                      <SelectItem value="blocked">Bloqueado</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Observações Internas (Opcional)</Label>
                <Textarea
                  placeholder="Anotações sobre preferências, aplicativo utilizado, etc."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="rounded-xl text-xs resize-none"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t border-border/50 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={save.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={save.isPending}
                className="bg-primary text-primary-foreground font-semibold gap-1.5"
              >
                {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {form.id ? "Salvar Alterações" : "Cadastrar Cliente & Linha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação: Renovar 30 Dias no Sigma */}
      <Dialog open={Boolean(confirmRenewClient)} onOpenChange={(open) => !open && setConfirmRenewClient(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-foreground">
              <CalendarPlus className="size-5 text-emerald-400" />
              Confirmar Renovação de Assinatura
            </DialogTitle>
            <DialogDescription>
              Deseja renovar a assinatura deste cliente por mais 30 dias?
            </DialogDescription>
          </DialogHeader>

          {confirmRenewClient && (
            <div className="space-y-3 py-2 text-sm">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Cliente:</span>
                  <strong className="text-foreground">{confirmRenewClient.name}</strong>
                </div>
                {confirmRenewClient.iptv_username && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Usuário IPTV / Sigma:</span>
                    <span className="font-mono text-xs text-primary">{confirmRenewClient.iptv_username}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Mensalidade:</span>
                  <span className="font-bold text-foreground font-mono">{formatBRL(confirmRenewClient.monthly_fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Vencimento Atual:</span>
                  <span className="font-mono text-xs">{formatDate(confirmRenewClient.next_due_date)}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-400" /> O que acontecerá:
                </p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-muted-foreground">
                  <li>O vencimento avançará <strong>+30 dias</strong> no sistema.</li>
                  <li>Se vinculado, a conta será <strong>renovada diretamente no Painel Sigma</strong>.</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmRenewClient(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
              disabled={!confirmRenewClient}
              onClick={() => {
                if (confirmRenewClient) {
                  const cli = confirmRenewClient;
                  setConfirmRenewClient(null);
                  renovar30Dias(cli);
                }
              }}
            >
              <CalendarPlus className="size-3.5" />
              Confirmar Renovação (+30d)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação: Cobrança via WhatsApp */}
      <Dialog open={Boolean(confirmRemindClient)} onOpenChange={(open) => !open && setConfirmRemindClient(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-foreground">
              <MessageCircle className="size-5 text-emerald-400" />
              Enviar Cobrança via WhatsApp
            </DialogTitle>
            <DialogDescription>
              Deseja disparar agora a mensagem de cobrança para este cliente?
            </DialogDescription>
          </DialogHeader>

          {confirmRemindClient && (
            <div className="space-y-3 py-2 text-sm">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Destinatário:</span>
                  <strong className="text-foreground">{confirmRemindClient.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">WhatsApp:</span>
                  <span className="font-mono text-xs text-emerald-400">{confirmRemindClient.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Mensalidade:</span>
                  <span className="font-bold font-mono">{formatBRL(confirmRemindClient.monthly_fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Vencimento:</span>
                  <span className="font-mono text-xs">{formatDate(confirmRemindClient.next_due_date)}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                O cliente receberá o texto formatado no WhatsApp com os dados de vencimento e chave de pagamento.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmRemindClient(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
              disabled={!confirmRemindClient}
              onClick={() => {
                if (confirmRemindClient) {
                  const cli = confirmRemindClient;
                  setConfirmRemindClient(null);
                  cobrar(cli);
                }
              }}
            >
              <Send className="size-3.5" />
              Disparar Cobrança Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Detalhes de Acesso IPTV & Listas M3U */}
      <Dialog
        open={Boolean(viewAccessClient)}
        onOpenChange={(open) => {
          if (!open) {
            setViewAccessClient(null);
            setShowModalPass(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-foreground">
              <Tv className="size-5 text-cyan-400" />
              Dados de Acesso IPTV & Listas M3U
            </DialogTitle>
            <DialogDescription className="text-xs">
              Credenciais de transmissão e links de streaming para o cliente{" "}
              <strong className="text-foreground">{viewAccessClient?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          {viewAccessClient && (() => {
            const cleanDns = extractCleanIptvDns(sigmaServerUrl);
            const serverLabel = getClientServerLabel(viewAccessClient);
            const user = viewAccessClient.iptv_username || "";
            const pass = viewAccessClient.iptv_password || "";
            const m3uTs = generateM3uUrl(cleanDns, user, pass, "ts");
            const m3uHls = generateM3uUrl(cleanDns, user, pass, "m3u8");
            const epg = generateEpgUrl(cleanDns, user, pass);

            return (
              <div className="space-y-4 py-1 text-xs">
                {/* Dica de Segurança e Controle */}
                <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-[11px] text-cyan-200">
                  <p className="font-semibold text-cyan-100 flex items-center gap-1.5 mb-0.5">
                    <ShieldCheck className="size-3.5 text-cyan-400" /> Transmissão Direta & Sem Links Externos
                  </p>
                  O link do painel administrativo não é exposto. Nenhum link de renovação do painel externo é enviado ao cliente — o controle financeiro e as renovações são gerenciadas 100% pelo seu sistema.
                </div>

                {/* Bloco 1: Conexão Xtream Codes API (IPTV Smarters, XCIPTV, TiviMate) */}
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-2.5">
                  <p className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Server className="size-3.5 text-primary" /> Conexão Xtream Codes (Apps IPTV)
                  </p>

                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold">Nome do Servidor:</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex-1 rounded-lg bg-background border px-2.5 py-1.5 text-xs text-foreground font-semibold truncate flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-emerald-400 inline-block" />
                          {serverLabel}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => copyText(serverLabel, "Nome do Servidor")}
                        >
                          {copiedField === "Nome do Servidor" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          Copiar
                        </Button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold">URL / DNS (Xtream Codes API):</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="flex-1 rounded-lg bg-background border px-2.5 py-1.5 font-mono text-xs text-foreground truncate">
                          {cleanDns || "Servidor não configurado"}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => copyText(cleanDns, "Servidor/DNS")}
                        >
                          {copiedField === "Servidor/DNS" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          Copiar
                        </Button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold">Usuário:</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="flex-1 rounded-lg bg-background border px-2.5 py-1.5 font-mono text-xs text-foreground truncate">
                          {user || "—"}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => copyText(user, "Usuário")}
                        >
                          {copiedField === "Usuário" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          Copiar
                        </Button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold">Senha:</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="flex-1 rounded-lg bg-background border px-2.5 py-1.5 font-mono text-xs text-foreground truncate">
                          {showModalPass ? pass || "—" : "••••••••"}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setShowModalPass(!showModalPass)}
                          title={showModalPass ? "Ocultar senha" : "Ver senha"}
                        >
                          {showModalPass ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => copyText(pass, "Senha")}
                        >
                          {copiedField === "Senha" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          Copiar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bloco 2: Listas M3U & EPG */}
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-2.5">
                  <p className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="size-3.5 text-cyan-400" /> Links de Streaming (M3U & EPG)
                  </p>

                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold">Lista M3U Plus (TS - Padrão):</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="flex-1 rounded-lg bg-background border px-2.5 py-1.5 font-mono text-[11px] text-foreground truncate">
                          {m3uTs || "Requer servidor e usuário preenchidos"}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!m3uTs}
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => copyText(m3uTs, "Lista M3U TS")}
                        >
                          {copiedField === "Lista M3U TS" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          Copiar
                        </Button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold">Lista M3U Plus (HLS / m3u8):</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="flex-1 rounded-lg bg-background border px-2.5 py-1.5 font-mono text-[11px] text-foreground truncate">
                          {m3uHls || "Requer servidor e usuário preenchidos"}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!m3uHls}
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => copyText(m3uHls, "Lista M3U HLS")}
                        >
                          {copiedField === "Lista M3U HLS" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          Copiar
                        </Button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground font-semibold">Guia de Canais (EPG / XMLTV):</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="flex-1 rounded-lg bg-background border px-2.5 py-1.5 font-mono text-[11px] text-foreground truncate">
                          {epg || "Requer servidor e usuário preenchidos"}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!epg}
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => copyText(epg, "Link EPG")}
                        >
                          {copiedField === "Link EPG" ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          Copiar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detalhes da Conta */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-muted/40 border p-2.5">
                    <span className="text-[10px] text-muted-foreground block">Telas Simultâneas:</span>
                    <strong className="text-foreground">{viewAccessClient.screens ?? 1} Tela(s)</strong>
                  </div>
                  <div className="rounded-xl bg-muted/40 border p-2.5">
                    <span className="text-[10px] text-muted-foreground block">Vencimento:</span>
                    <strong className="text-foreground">{formatDate(viewAccessClient.next_due_date)}</strong>
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (viewAccessClient) copiarDadosAcesso(viewAccessClient);
              }}
              className="gap-1.5 text-xs font-semibold"
            >
              <Copy className="size-3.5" />
              Copiar Mensagem WhatsApp Completa
            </Button>
            <Button
              type="button"
              disabled={Boolean(actionBusyId)}
              onClick={() => {
                if (viewAccessClient) {
                  enviarAcesso(viewAccessClient.id);
                  setViewAccessClient(null);
                }
              }}
              className="gap-1.5 text-xs font-semibold bg-primary text-primary-foreground"
            >
              {actionBusyId ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Enviar no WhatsApp do Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Exclusão de Cliente */}
      <AlertDialog open={Boolean(clientToDelete)} onOpenChange={(open) => !open && setClientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Tem certeza que deseja remover o cliente <strong>{clientToDelete?.name}</strong> do sistema?
              </p>
              {clientToDelete?.hasSigma ? (
                <div className="flex items-start space-x-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 mt-2">
                  <Checkbox
                    id="deleteSigma"
                    checked={deleteFromSigma}
                    onCheckedChange={(checked) => setDeleteFromSigma(Boolean(checked))}
                  />
                  <div className="grid gap-1 leading-none">
                    <label
                      htmlFor="deleteSigma"
                      className="text-sm font-semibold text-foreground cursor-pointer"
                    >
                      Remover também a linha no Painel Sigma
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Cancela e exclui o acesso do assinante na fonte transmissora do Sigma.
                    </p>
                  </div>
                </div>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                executarExclusao();
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white font-medium"
            >
              {deleting ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
