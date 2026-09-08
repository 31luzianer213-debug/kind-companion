import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
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
import { formatBRL, formatDate } from "@/lib/format";
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
  ExternalLink,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MoreVertical,
  X,
  Tv,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Check,
  Server,
  Calendar,
  Layers,
  Smartphone,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Gestão de Clientes & Sigma — IPTV Manager" },
      { name: "description", content: "Controle completo de clientes: renovação rápida, faturas, envio de acesso e histórico." },
      { property: "og:title", content: "Clientes — IPTV Manager" },
      { property: "og:description", content: "Cadastro inteligente e automação de clientes IPTV e painel Sigma." },
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
  list_id: "none",
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

  // Search and filter state
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState("all");

  // Deletion Modal state
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string; hasSigma: boolean } | null>(null);
  const [deleteFromSigma, setDeleteFromSigma] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Quick Action Loading states
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
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
  const sigmaServerName =
    sigmaConfigQuery.data?.sigma_server_name?.trim() ||
    sigmaConfigQuery.data?.sigma_server_display_name ||
    "Servidor Sigma";
  const sigmaServerUrl = sigmaConfigQuery.data?.sigma_url || "";

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0] ?? "", []);

  // KPIs
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

  // Filtered clients list
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        (c.iptv_username && c.iptv_username.toLowerCase().includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        (c.notes && c.notes.toLowerCase().includes(term));

      if (!matchesSearch) return false;

      // Status Tabs
      if (filterTab === "all") return true;
      if (filterTab === "active") return c.status === "active";
      if (filterTab === "inactive") return c.status === "inactive" || c.status === "blocked";
      if (filterTab === "overdue") {
        return c.status === "active" && c.next_due_date && c.next_due_date < todayStr;
      }
      if (filterTab === "today") {
        return c.next_due_date === todayStr;
      }
      if (filterTab === "sigma") {
        return Boolean(c.sigma_customer_id);
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
        list_id: values.list_id === "none" ? null : values.list_id,
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

        // Se o cliente ainda não tem linha no Sigma, mas o usuário marcou para provisionar
        if (values.create_in_sigma && !savedRow?.sigma_customer_id && isSigmaConfigured && values.iptv_username) {
          try {
            const sigmaRes = await createSigma({
              data: {
                clientId: values.id,
                name: values.name.trim(),
                username: values.iptv_username.trim(),
                password: values.iptv_password?.trim(),
                phone: cleanPhoneDigits(values.phone),
                email: values.email?.trim() || undefined,
                screens: Number(values.screens || 1),
                dueDate: values.next_due_date || undefined,
                notes: values.notes?.trim() || undefined,
              },
            });
            if (sigmaRes.ok) {
              toast.success("Linha criada e sincronizada no Painel Sigma!");
            } else {
              toast.warning(`Cliente salvo, mas Sigma retornou: ${sigmaRes.error}`);
            }
          } catch (err) {
            console.error("Erro Sigma ao criar linha:", err);
          }
        } else if (isSigmaConfigured && (values.iptv_username || savedRow?.sigma_customer_id)) {
          // Se o cliente possui vínculo com o Sigma ou usuário IPTV, sincroniza a alteração no painel Sigma
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

        // Busca a versão mais recente após eventuais atualizações de sync/tokens
        const { data: finalRow } = await supabase
          .from("clients")
          .select("*")
          .eq("id", values.id)
          .single();
        if (finalRow) savedRow = finalRow;
      } else {
        const { data: inserted, error } = await supabase
          .from("clients")
          .insert(payload)
          .select()
          .single();
        if (error) throw new Error(error.message);
        savedRow = inserted;

        // Se solicitado criar no painel Sigma
        if (values.create_in_sigma && isSigmaConfigured && savedRow?.id && values.iptv_username) {
          try {
            const sigmaRes = await createSigma({
              data: {
                clientId: savedRow.id,
                name: values.name.trim(),
                username: values.iptv_username.trim(),
                password: values.iptv_password.trim(),
                phone: cleanPhoneDigits(values.phone),
                email: values.email?.trim() || undefined,
                screens: Number(values.screens || 1),
                dueDate: values.next_due_date || undefined,
                notes: values.notes?.trim() || undefined,
              },
            });
            if (sigmaRes.ok) {
              toast.success("Linha criada e sincronizada no Painel Sigma!");
            } else {
              toast.warning(`Cliente salvo, mas Sigma retornou: ${sigmaRes.error}`);
            }
          } catch (err) {
            console.error("Erro Sigma:", err);
          }

          const { data: finalRow } = await supabase
            .from("clients")
            .select("*")
            .eq("id", savedRow.id)
            .single();
          if (finalRow) savedRow = finalRow;
        }
      }

      return savedRow;
    },
    onSuccess: (savedRow) => {
      toast.success("Cliente salvo com sucesso.");
      setOpen(false);
      setForm(empty);

      // Atualiza o cache local imediatamente para refletir na tela sem necessidade de recarregar
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
      queryClient.invalidateQueries({ queryKey: ["sigma-clients-list"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Exclusão com confirmação e opção de remover do Sigma
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
        if (res.sigmaRemoved) {
          toast.success("Cliente e linha no Painel Sigma removidos com sucesso!");
        } else if (res.sigmaWarning) {
          toast.warning(`Cliente removido do sistema (Aviso Sigma: ${res.sigmaWarning})`);
        } else {
          toast.success("Cliente removido com sucesso.");
        }
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      } else {
        toast.error(res.error ?? "Falha ao remover cliente.");
      }
    } catch (err) {
      toast.error("Erro inesperado ao excluir cliente.");
    } finally {
      setDeleting(false);
      setClientToDelete(null);
    }
  }

  // Renovação rápida +30 dias (local + Sigma)
  async function renovar30Dias(client: Tables<"clients">) {
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
        const currentDue = client.next_due_date ? new Date(client.next_due_date) : new Date();
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
        toast.success(`Renovado localmente até ${formatDate(newDueStr)}!`);
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch {
      toast.error("Erro ao renovar cliente.");
    } finally {
      setActionBusyId(null);
    }
  }

  // Alternar Bloqueio / Desbloqueio no Sigma
  async function alternarBloqueio(client: Tables<"clients">) {
    setActionBusyId(client.id);
    const novoStatusBloqueio = client.status !== "blocked";
    try {
      const res = await toggleBlock({
        data: {
          clientId: client.id,
          block: novoStatusBloqueio,
        },
      });
      if (res.ok) {
        toast.success(novoStatusBloqueio ? "Cliente bloqueado no painel Sigma." : "Cliente reativado no painel Sigma.");
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      } else {
        toast.error(res.error ?? "Falha ao alterar status no painel.");
      }
    } catch {
      toast.error("Erro ao alterar status do cliente.");
    } finally {
      setActionBusyId(null);
    }
  }

  // Criar no painel Sigma para cliente existente
  async function provisionarNoSigma(client: Tables<"clients">) {
    if (!client.iptv_username) {
      toast.error("Preencha o usuário e senha IPTV do cliente antes de enviar ao Sigma.");
      edit(client);
      return;
    }
    setActionBusyId(client.id);
    try {
      const res = await createSigma({
        data: {
          clientId: client.id,
          name: client.name,
          username: client.iptv_username,
          password: client.iptv_password ?? undefined,
          phone: client.phone,
          email: client.email ?? undefined,
          screens: client.screens ?? 1,
          dueDate: client.next_due_date ?? undefined,
          notes: client.notes ?? undefined,
        },
      });
      if (res.ok) {
        toast.success("Cliente vinculado e criado com sucesso no Painel Sigma!");
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      } else {
        toast.error(res.error ?? "Falha ao criar cliente no Sigma.");
      }
    } catch (err) {
      toast.error("Erro ao comunicar com o painel Sigma.");
    } finally {
      setActionBusyId(null);
    }
  }

  // Gerador de credenciais aleatórias seguras
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
    toast.info("Credenciais IPTV geradas!");
  }

  // Copiar dados de acesso
  function copiarDadosAcesso(client: Tables<"clients">) {
    const texto = `📡 *DADOS DE ACESSO IPTV* 📡\n\n` +
      `👤 *Cliente:* ${client.name}\n` +
      `📺 *Servidor:* ${sigmaServerName}\n` +
      (sigmaServerUrl ? `🌐 *Endereço/URL:* ${sigmaServerUrl}\n` : "") +
      (client.iptv_username ? `🔑 *Usuário:* ${client.iptv_username}\n` : "") +
      (client.iptv_password ? `🔒 *Senha:* ${client.iptv_password}\n` : "") +
      `🖥️ *Telas:* ${client.screens ?? 1}\n` +
      `📅 *Vencimento:* ${client.next_due_date ? formatDate(client.next_due_date) : "A combinar"}\n\n` +
      `Bom divertimento! 🍿 Qualquer dúvida, estamos à disposição.`;

    navigator.clipboard.writeText(texto);
    setCopiedId(client.id);
    setTimeout(() => setCopiedId(null), 2500);
    toast.success("Dados de acesso copiados para a área de transferência!");
  }

  async function cobrar(client: Tables<"clients">) {
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

  function edit(client: Tables<"clients">) {
    setForm({
      id: client.id,
      name: client.name,
      phone: formatPhoneInput(client.phone),
      email: client.email ?? "",
      monthly_fee: String(client.monthly_fee ?? "35.00"),
      due_day: String(client.due_day ?? 10),
      next_due_date: client.next_due_date ?? "",
      status: client.status ?? "active",
      list_id: client.list_id ?? "none",
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
        const names = result.createdNames?.slice(0, 3).join(", ") || "";
        toast.success(
          result.created === 1
            ? `🎉 Novo cliente importado do Sigma: ${names}`
            : `🎉 ${result.created} novos clientes importados do Sigma! (${names})`,
        );
      } else if (result.updated > 0) {
        toast.success(`${result.updated} cliente(s) atualizados com o painel Sigma.`);
      } else {
        toast.info("Tudo em dia! Nenhum cliente novo pendente no Painel Sigma.");
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["sigma-settings"] });
      queryClient.invalidateQueries({ queryKey: ["sigma-clients-list"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
    } else {
      toast.error(result.error ?? "Falha ao sincronizar com o painel.");
    }
  }

  function exportarCSV() {
    if (filteredClients.length === 0) {
      toast.info("Nenhum cliente para exportar.");
      return;
    }

    const headers = ["Nome", "Telefone", "E-mail", "Mensalidade", "Dia Venc", "Próximo Venc", "Status", "Servidor Sigma", "Telas", "Sigma ID"];
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
      `"${c.sigma_customer_id ?? ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `clientes_iptv_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Planilha CSV exportada com sucesso!");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Gestão de Clientes
            </h1>
            <Badge variant="secondary" className="font-mono text-xs">
              {stats.total} total
            </Badge>
            {isSigmaConfigured ? (
              <Badge
                className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-1 text-[11px]"
                title="Sincronização em tempo real ativa: clientes adicionados no Sigma aparecem automaticamente"
              >
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Auto-Sync Sigma Ativo
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Cadastro completo de assinantes, controle de telas, renovações e automação do Painel Sigma.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSigmaConfigured ? (
            <Button
              variant="outline"
              size="sm"
              onClick={sincronizar}
              disabled={syncing}
              className="gap-1.5 shadow-sm hover-lift"
            >
              {syncing ? <Loader2 className="size-4 animate-spin text-primary" /> : <RefreshCw className="size-4 text-primary" />}
              Sincronizar Sigma
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={exportarCSV}
            className="gap-1.5 shadow-sm hover-lift"
          >
            <Download className="size-4" />
            CSV
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setForm({
                ...empty,
                create_in_sigma: isSigmaConfigured,
              });
              setOpen(true);
            }}
            className="gap-1.5 shadow-md hover-lift bg-primary text-primary-foreground font-medium"
          >
            <Plus className="size-4" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="surface-card hover-lift overflow-hidden relative border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Clientes</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{stats.total}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stats.inSigma} no Sigma
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-blue-500/10 text-blue-400">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card hover-lift overflow-hidden relative border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ativos</p>
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

        <Card className="surface-card hover-lift overflow-hidden relative border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-rose-500 to-red-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Em Atraso</p>
              <p className="text-2xl font-bold mt-1 text-rose-400">{stats.overdue}</p>
              <p className="text-[11px] text-rose-300/80 mt-0.5">
                Requer cobrança
              </p>
            </div>
            <div className="rounded-xl p-2.5 bg-rose-500/10 text-rose-400">
              <AlertTriangle className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card hover-lift overflow-hidden relative border-border/60">
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-amber-500 to-yellow-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vence Hoje</p>
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

      {/* Filter and Search Bar */}
      <Card className="surface-card border-border/60">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, usuário IPTV..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 rounded-xl bg-background/60"
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
                <TabsTrigger value="active" className="text-xs">
                  Ativos ({stats.active})
                </TabsTrigger>
                <TabsTrigger value="overdue" className="text-xs">
                  Atraso ({stats.overdue})
                </TabsTrigger>
                <TabsTrigger value="today" className="text-xs">
                  Hoje ({stats.todayDue})
                </TabsTrigger>
                <TabsTrigger value="sigma" className="text-xs">
                  Sigma ({stats.inSigma})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Main Client Table / List */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Carregando clientes...</p>
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
                  setForm({ ...empty, create_in_sigma: isSigmaConfigured });
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
          {/* Desktop Table View */}
          <div className="hidden md:block rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone / WhatsApp</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Plano & Telas</TableHead>
                  <TableHead>Painel Sigma</TableHead>
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
                      {/* Avatar Initials */}
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

                      {/* Nome e Usuário IPTV */}
                      <TableCell>
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          {client.name}
                        </div>
                        {client.iptv_username ? (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 font-mono">
                            <KeyRound className="size-3 text-primary/70" />
                            {client.iptv_username}
                          </div>
                        ) : null}
                      </TableCell>

                      {/* Telefone */}
                      <TableCell>
                        <a
                          href={`https://wa.me/55${cleanPhoneDigits(client.phone)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-400 transition-colors font-mono"
                        >
                          <MessageCircle className="size-3 text-emerald-400" />
                          {formatPhoneInput(client.phone)}
                        </a>
                      </TableCell>

                      {/* Vencimento */}
                      <TableCell>
                        <Badge variant="outline" className={`text-xs gap-1 ${relativeDue.badge}`}>
                          <Calendar className="size-3" />
                          {relativeDue.text}
                        </Badge>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Dia {client.due_day || 10} de cada mês
                        </div>
                      </TableCell>

                      {/* Valor & Telas */}
                      <TableCell>
                        <div className="font-semibold text-xs text-foreground">
                          {formatBRL(client.monthly_fee)}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Tv className="size-3" />
                          {client.screens || 1} tela{(client.screens || 1) > 1 ? "s" : ""}
                          <span className="text-primary font-medium">• {sigmaServerName}</span>
                        </div>
                      </TableCell>

                      {/* Status Sigma */}
                      <TableCell>
                        {client.sigma_customer_id ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge className="bg-primary/15 text-primary border-primary/30 text-[11px] w-fit gap-1 font-mono">
                              <ShieldCheck className="size-3" />
                              ID: {client.sigma_customer_id.slice(0, 10)}
                            </Badge>
                            {client.sigma_synced_at ? (
                              <span className="text-[10px] text-muted-foreground">
                                Sync: {new Date(client.sigma_synced_at).toLocaleDateString("pt-BR")}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!isSigmaConfigured || isBusy}
                            onClick={() => provisionarNoSigma(client)}
                            className="h-7 text-[11px] text-muted-foreground hover:text-primary gap-1 px-2 border border-dashed border-border"
                          >
                            <Server className="size-3" />
                            Criar no Sigma
                          </Button>
                        )}
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
                          {client.status === "active"
                            ? "Ativo"
                            : client.status === "blocked"
                            ? "Bloqueado"
                            : "Inativo"}
                        </Badge>
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Copiar Acesso */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            title="Copiar dados de acesso"
                            onClick={() => copiarDadosAcesso(client as any)}
                          >
                            {isCopied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                          </Button>

                          {/* Renovar Rápido (+30d) */}
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isBusy}
                            className="size-8 text-muted-foreground hover:text-emerald-400"
                            title="Renovar 30 dias (local e Sigma)"
                            onClick={() => renovar30Dias(client)}
                          >
                            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
                          </Button>

                          {/* Enviar WhatsApp */}
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isBusy}
                            className="size-8 text-muted-foreground hover:text-emerald-400"
                            title="Cobrar via WhatsApp"
                            onClick={() => cobrar(client)}
                          >
                            <MessageCircle className="size-4" />
                          </Button>

                          {/* Dropdown com mais opções */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel className="text-xs">Opções do Cliente</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => edit(client)} className="gap-2">
                                <Pencil className="size-4" />
                                Editar dados
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => enviarAcesso(client.id)} className="gap-2">
                                <Smartphone className="size-4" />
                                Enviar dados de acesso
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => renovar30Dias(client)} className="gap-2 text-emerald-400">
                                <CalendarPlus className="size-4" />
                                Renovar +30 dias
                              </DropdownMenuItem>

                              {isSigmaConfigured ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-xs">Painel Sigma</DropdownMenuLabel>
                                  {!client.sigma_customer_id ? (
                                    <DropdownMenuItem onClick={() => provisionarNoSigma(client)} className="gap-2">
                                      <Server className="size-4" />
                                      Criar no Sigma
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onClick={() => alternarBloqueio(client)}
                                      className="gap-2 text-amber-400"
                                    >
                                      <Ban className="size-4" />
                                      {client.status === "blocked" ? "Desbloquear no Sigma" : "Bloquear no Sigma"}
                                    </DropdownMenuItem>
                                  )}
                                </>
                              ) : null}

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

          {/* Mobile Cards View */}
          <div className="grid gap-3 md:hidden">
            {filteredClients.map((client) => {
              const relativeDue = getRelativeDueInfo(client.next_due_date);
              const isBusy = actionBusyId === client.id;
              const isCopied = copiedId === client.id;

              return (
                <Card key={client.id} className="surface-card hover-lift border-border/60 p-4 space-y-3">
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

                  {client.iptv_username || client.sigma_customer_id ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono text-muted-foreground">
                      {client.iptv_username ? (
                        <span className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded-md">
                          <KeyRound className="size-3 text-primary" /> {client.iptv_username}
                        </span>
                      ) : null}
                      {client.sigma_customer_id ? (
                        <span className="flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded-md text-[11px]">
                          <ShieldCheck className="size-3" /> Sigma
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Ações Mobile */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 flex-1"
                      onClick={() => copiarDadosAcesso(client as any)}
                    >
                      {isCopied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                      Acesso
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      className="h-8 text-xs gap-1.5 flex-1 text-emerald-400"
                      onClick={() => renovar30Dias(client)}
                    >
                      {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarPlus className="size-3.5" />}
                      +30 dias
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => cobrar(client)}
                    >
                      <MessageCircle className="size-3.5" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => edit(client)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Dialog Cadastro / Edição de Cliente */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Users className="size-5 text-primary" />
              {form.id ? "Editar Cliente" : "Novo Cliente"}
            </DialogTitle>
            <DialogDescription>
              {form.id
                ? "Atualize as informações do cliente e suas credenciais de acesso."
                : "Preencha os dados abaixo para cadastrar e provisionar o acesso IPTV."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim() || !form.phone.trim()) {
                toast.error("Preencha pelo menos o nome e o telefone do cliente.");
                return;
              }
              save.mutate(form);
            }}
            className="space-y-4 pt-2"
          >
            {/* Seção 1: Dados Pessoais */}
            <div className="space-y-3 p-3.5 rounded-xl bg-muted/20 border border-border/60">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="size-3.5 text-primary" /> Dados Pessoais & Contato
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nome Completo *</Label>
                  <Input
                    placeholder="Ex: Carlos Silva"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">WhatsApp / Telefone *</Label>
                  <Input
                    placeholder="(11) 98765-4321"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
                    className="rounded-xl font-mono"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">E-mail (opcional)</Label>
                <Input
                  type="email"
                  placeholder="carlos@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* Seção 2: Plano & Vencimento */}
            <div className="space-y-3 p-3.5 rounded-xl bg-muted/20 border border-border/60">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" /> Assinatura & Vencimento
              </h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Valor Mensal (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.monthly_fee}
                    onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
                    className="rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Dia de Vencimento</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={form.due_day}
                    onChange={(e) => setForm({ ...form, due_day: e.target.value })}
                    className="rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Próximo Vencimento</Label>
                  <Input
                    type="date"
                    value={form.next_due_date}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      const dayFromDate = newDate ? String(parseInt(newDate.split("-")[2] || "", 10) || "") : "";
                      setForm({
                        ...form,
                        next_due_date: newDate,
                        ...(dayFromDate ? { due_day: dayFromDate } : {}),
                      });
                    }}
                    className="rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Server className="size-3 text-primary" /> Servidor Painel Sigma
                  </Label>
                  <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs">
                    <span className="size-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="font-semibold text-foreground truncate">{sigmaServerName}</span>
                    {sigmaServerUrl && (
                      <span className="text-muted-foreground font-mono truncate text-[11px]">
                        ({sigmaServerUrl})
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Quantidade de Telas</Label>
                  <Select value={form.screens} onValueChange={(val) => setForm({ ...form, screens: val })}>
                    <SelectTrigger className="rounded-xl font-mono">
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
              </div>
            </div>

            {/* Seção 3: Credenciais IPTV & Painel Sigma */}
            <div className="space-y-3 p-3.5 rounded-xl bg-muted/20 border border-border/60">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <KeyRound className="size-3.5 text-primary" /> Credenciais & Painel Sigma
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={gerarCredenciais}
                  className="h-7 text-xs gap-1 shadow-sm"
                >
                  <Sparkles className="size-3 text-amber-400" />
                  Gerar Usuário e Senha
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Usuário no Servidor</Label>
                  <Input
                    placeholder="Ex: carlos123"
                    value={form.iptv_username}
                    onChange={(e) => setForm({ ...form, iptv_username: e.target.value })}
                    className="rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Senha no Servidor</Label>
                  <Input
                    placeholder="Ex: aB3$9zK1"
                    value={form.iptv_password}
                    onChange={(e) => setForm({ ...form, iptv_password: e.target.value })}
                    className="rounded-xl font-mono"
                  />
                </div>
              </div>

              {isSigmaConfigured ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Server className="size-3.5 text-primary" />
                      {form.id ? "Sincronizar no Painel Sigma" : "Criar linha no Painel Sigma"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {form.id
                        ? "Envia as alterações de usuário, senha, telas, vencimento e status diretamente para o painel Sigma."
                        : "Cria e ativa automaticamente a conta do cliente no painel Sigma."}
                    </p>
                  </div>
                  <Switch
                    checked={form.create_in_sigma}
                    onCheckedChange={(checked) => setForm({ ...form, create_in_sigma: checked })}
                  />
                </div>
              ) : null}
            </div>

            {/* Seção 4: Status e Observações */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Status</Label>
                <Select value={form.status} onValueChange={(val) => setForm({ ...form, status: val })}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">🟢 Ativo</SelectItem>
                    <SelectItem value="inactive">⚪ Inativo</SelectItem>
                    <SelectItem value="blocked">🔴 Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Observações / Notas</Label>
                <Input
                  placeholder="Ex: smart TV sala, indicou amigo..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending} className="bg-primary text-primary-foreground">
                {save.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                {form.id ? "Salvar Alterações" : "Cadastrar Cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão com Opção Sigma */}
      <AlertDialog open={Boolean(clientToDelete)} onOpenChange={(open) => !open && setClientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-400">
              <Trash2 className="size-5" />
              Excluir Cliente
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <span>
                Tem certeza que deseja excluir o cliente <strong>{clientToDelete?.name}</strong>? Esta ação removerá o histórico local e cobranças vinculadas.
              </span>

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
