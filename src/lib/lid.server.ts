/**
 * Mapeamento e resolução de WhatsApp LIDs (@lid) para números de telefone reais (@s.whatsapp.net)
 */
import { evolutionConfig } from "./evolution.server";

const lidCache = new Map<string, { phone: string; expiresAt: number }>();

export async function resolvePhoneFromLid(instance: string, lidOrJid: string): Promise<string | null> {
  const cleanLid = lidOrJid.replace(/@.*$/, "").replace(/\D/g, "");
  if (!cleanLid || cleanLid.length < 13) return null;

  // 1. Verifica cache em memória (válido por 1 hora)
  const cached = lidCache.get(cleanLid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.phone;
  }

  // 2. Consulta Evolution API na VPS para cruzar contatos pelo profilePicUrl ou histórico
  try {
    const { base, key } = evolutionConfig("default");
    const res = await fetch(`${base}/chat/findContacts/${instance}`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const contacts: any[] = Array.isArray(data) ? data : data?.records || [];

    // Localiza o contato do LID
    const targetContact = contacts.find(
      (c) => c.remoteJid === `${cleanLid}@lid` || c.remoteJid?.includes(cleanLid),
    );

    if (targetContact?.profilePicUrl) {
      // Encontra contato correspondente com número de telefone real
      const phoneMatch = contacts.find(
        (c) =>
          c.remoteJid?.endsWith("@s.whatsapp.net") &&
          c.profilePicUrl === targetContact.profilePicUrl,
      );

      if (phoneMatch?.remoteJid) {
        const phone = phoneMatch.remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
        if (phone && phone.length >= 10 && phone.length <= 13) {
          lidCache.set(cleanLid, { phone, expiresAt: Date.now() + 3600000 });
          return phone;
        }
      }
    }
  } catch (err) {
    console.warn("[LID Resolver] Erro ao resolver LID:", err);
  }

  return null;
}
