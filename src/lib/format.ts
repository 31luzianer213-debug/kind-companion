export function formatBRL(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

export function onlyDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

export type TemplateVarInput = {
  client?: {
    name?: string | null;
    phone?: string | null;
    iptv_username?: string | null;
    iptv_password?: string | null;
    screens?: number | null;
  } | null;
  list?: {
    name?: string | null;
    server_url?: string | null;
    username?: string | null;
    password?: string | null;
  } | null;
  settings?: {
    business_name?: string | null;
    pix_key?: string | null;
    pix_holder?: string | null;
    payment_link?: string | null;
  } | null;
  amount?: number | string | null;
  dueDate?: string | null;
  days?: number | null;
};

/** Variáveis disponíveis nos modelos de mensagem. */
export function buildTemplateVars(input: TemplateVarInput): Record<string, string> {
  const { client, list, settings } = input;
  return {
    nome: client?.name ?? "",
    telefone: client?.phone ?? "",
    valor: formatBRL(input.amount ?? 0),
    vencimento: formatDate(input.dueDate ?? null),
    dias: String(Math.abs(input.days ?? 0)),
    lista: list?.name ?? "",
    servidor: list?.server_url ?? "",
    usuario: client?.iptv_username || list?.username || "",
    senha: client?.iptv_password || list?.password || "",
    telas: String(client?.screens ?? 1),
    empresa: settings?.business_name ?? "",
    pix: settings?.pix_key ?? "",
    titular: settings?.pix_holder ?? "",
    link: settings?.payment_link ?? "",
  };
}

export const TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: "nome", label: "nome do cliente" },
  { key: "valor", label: "valor da mensalidade" },
  { key: "vencimento", label: "data de vencimento" },
  { key: "dias", label: "dias de antecedência/atraso" },
  { key: "lista", label: "nome da lista" },
  { key: "servidor", label: "endereço do servidor" },
  { key: "usuario", label: "usuário de acesso" },
  { key: "senha", label: "senha de acesso" },
  { key: "telas", label: "quantidade de telas" },
  { key: "empresa", label: "nome do seu negócio" },
  { key: "pix", label: "sua chave PIX" },
  { key: "titular", label: "titular do PIX" },
  { key: "link", label: "link de pagamento" },
];
