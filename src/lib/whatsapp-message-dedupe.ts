const processedMessages = new Map<string, number>();
const MESSAGE_TTL_MS = 10 * 60_000;
const MAX_PROCESSED_MESSAGES = 20_000;

function pruneProcessedMessages(now: number) {
  for (const [key, timestamp] of processedMessages) {
    if (now - timestamp > MESSAGE_TTL_MS) processedMessages.delete(key);
  }
}

export function processedMessageKey(messageId: string, _phone: string, instance = ""): string {
  if (!messageId) return "";
  return `${String(instance || "unknown").trim()}:${messageId}`;
}

export function isDuplicateMessage(
  messageId: string,
  phone: string,
  instance = "",
  now = Date.now(),
): boolean {
  if (!messageId) return false;
  const key = processedMessageKey(messageId, phone, instance);
  pruneProcessedMessages(now);
  if (processedMessages.has(key)) return true;
  processedMessages.set(key, now);
  if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
    const oldest = processedMessages.keys().next().value;
    if (oldest) processedMessages.delete(oldest);
  }
  return false;
}

export function releaseDuplicateMessage(messageId: string, phone: string, instance = ""): void {
  if (!messageId) return;
  processedMessages.delete(processedMessageKey(messageId, phone, instance));
}
