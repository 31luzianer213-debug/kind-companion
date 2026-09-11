/**
 * Utilitários de número de telefone brasileiro.
 * Gera todas as variações equivalentes de um número (com/sem DDI 55 e com/sem o 9º dígito),
 * para que o bot reconheça o mesmo cliente em qualquer formato salvo no cadastro.
 */

export function onlyDigits(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/**
 * Retorna todas as variações equivalentes do número informado.
 * Ex.: 5593991771170 -> [5593991771170, 559391771170, 93991771170, 9391771170]
 */
export function phoneVariants(raw: string | null | undefined): string[] {
  let digits = onlyDigits(raw).replace(/^0+/, "");
  if (!digits) return [];

  // Números de LID/identificadores longos não são telefones — retorna como veio
  if (digits.length > 13) return [digits];

  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.length < 10) return [onlyDigits(raw)];

  const ddd = digits.slice(0, 2);
  let rest = digits.slice(2);

  const withNine = rest.length === 8 ? `9${rest}` : rest;
  const withoutNine = rest.length === 9 && rest.startsWith("9") ? rest.slice(1) : rest;

  const locals = Array.from(new Set([`${ddd}${withNine}`, `${ddd}${withoutNine}`]));
  const all = new Set<string>();
  for (const local of locals) {
    all.add(local);
    all.add(`55${local}`);
  }
  all.add(onlyDigits(raw));

  return Array.from(all).filter(Boolean);
}

/** Verifica se dois números representam o mesmo telefone (ignorando DDI e 9º dígito) */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const varsA = new Set(phoneVariants(a));
  return phoneVariants(b).some((v) => varsA.has(v));
}
