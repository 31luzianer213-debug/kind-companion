/**
 * Mapeamento e resolução de WhatsApp LIDs (@lid) para números de telefone reais (@s.whatsapp.net)
 */

const lidCache = new Map<string, { phone: string; expiresAt: number }>();

export function registerLidPhone(lid: string, phone: string) {
  const cleanLid = lid.replace(/@.*$/, "").replace(/\D/g, "");
  const cleanPhone = phone.replace(/@.*$/, "").replace(/\D/g, "");
  if (cleanLid && cleanPhone) {
    lidCache.set(cleanLid, { phone: cleanPhone, expiresAt: Date.now() + 3600000 });
  }
}

export async function resolvePhoneFromLid(_instance: string, lidOrJid: string): Promise<string | null> {
  const cleanLid = lidOrJid.replace(/@.*$/, "").replace(/\D/g, "");
  if (!cleanLid || cleanLid.length < 13) return null;

  const cached = lidCache.get(cleanLid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.phone;
  }

  return null;
}
