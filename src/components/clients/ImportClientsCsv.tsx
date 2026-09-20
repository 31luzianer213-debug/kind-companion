import { friendlyDbError } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type ParsedClient = {
  name: string;
  phone: string;
  email: string | null;
  iptv_username: string | null;
  iptv_password: string | null;
  screens: number;
  monthly_fee: number;
  due_day: number;
  next_due_date: string | null;
  notes: string | null;
};

function splitLine(line: string, separator: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toNumber(value: string, fallback: number) {
  const parsed = Number(String(value || "").replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toIsoDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function parseCsv(text: string): ParsedClient[] {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const separator = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitLine(lines[0], separator).map(normalizeHeader);

  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const idx = {
    name: indexOf("nome", "name", "cliente"),
    phone: indexOf("telefone", "phone", "whatsapp", "celular"),
    email: indexOf("email", "e-mail"),
    user: indexOf("usuario", "usuarioiptv", "username", "login"),
    pass: indexOf("senha", "senhaiptv", "password"),
    screens: indexOf("telas", "screens"),
    fee: indexOf("valor", "valormensal", "mensalidade", "monthlyfee"),
    dueDay: indexOf("diavencimento", "dia", "dueday"),
    nextDue: indexOf("proximovencimento", "vencimento", "nextduedate"),
    notes: indexOf("notas", "observacoes", "notes"),
  };

  if (idx.name < 0) return [];

  const rows: ParsedClient[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, separator);
    const pick = (position: number) => (position >= 0 ? (cells[position] ?? "").replace(/^"|"$/g, "").trim() : "");
    const name = pick(idx.name);
    if (!name) continue;
    rows.push({
      name,
      phone: pick(idx.phone).replace(/\D/g, ""),
      email: pick(idx.email) || null,
      iptv_username: pick(idx.user) || null,
      iptv_password: pick(idx.pass) || null,
      screens: Math.max(1, Math.round(toNumber(pick(idx.screens), 1))),
      monthly_fee: toNumber(pick(idx.fee), 0),
      due_day: Math.min(28, Math.max(1, Math.round(toNumber(pick(idx.dueDay), 10)))),
      next_due_date: toIsoDate(pick(idx.nextDue)),
      notes: pick(idx.notes) || null,
    });
  }
  return rows;
}

export function ImportClientsCsv() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) {
        toast.error("Nenhum cliente encontrado. A planilha precisa ter uma coluna Nome.");
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        toast.error("Sessão expirada. Entre novamente para importar.");
        return;
      }

      const { data: existing } = await supabase.from("clients").select("phone, name");
      const knownPhones = new Set((existing ?? []).map((item: any) => String(item.phone || "").replace(/\D/g, "")).filter(Boolean));
      const knownNames = new Set((existing ?? []).map((item: any) => String(item.name || "").toLowerCase()));

      const toInsert = rows.filter((row) => {
        if (row.phone && knownPhones.has(row.phone)) return false;
        if (!row.phone && knownNames.has(row.name.toLowerCase())) return false;
        return true;
      });
      const skipped = rows.length - toInsert.length;

      if (toInsert.length === 0) {
        toast.info(`Todos os ${rows.length} clientes da planilha já estavam cadastrados.`);
        return;
      }

      const { error } = await supabase
        .from("clients")
        .insert(toInsert.map((row) => ({ ...row, user_id: userId, status: "active" })));
      if (error) {
        toast.error(`Falha ao importar: ${friendlyDbError(error.message)}`);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(
        `${toInsert.length} cliente(s) importado(s)${skipped > 0 ? ` · ${skipped} já existiam e foram ignorados` : ""}.`,
      );
    } catch {
      toast.error("Não foi possível ler a planilha. Envie um arquivo CSV.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="gap-1.5 shadow-sm text-xs border-border hover:bg-accent/60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <Upload className="size-3.5 text-muted-foreground" />}
        Importar CSV
      </Button>
    </>
  );
}
