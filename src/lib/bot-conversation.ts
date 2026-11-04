export function botConversationKey(userId: string, phone: string): string {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  return `${String(userId || "default")}:${cleanPhone}`;
}
