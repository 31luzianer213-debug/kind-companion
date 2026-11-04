import { timingSafeEqual } from "node:crypto";

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function isValidWebhookSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.length >= 32 && value.length <= 255 && !/\s/.test(value);
}

export function timingSafeStringEquals(supplied: string | null | undefined, expected: string | null | undefined): boolean {
  if (!supplied || !expected) return false;
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function consumeWebhookRateLimit(key: string, limit = 30, windowMs = 60_000, now = Date.now()): boolean {
  for (const [bucketKey, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
  }
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    if (rateBuckets.size > 5000) {
      const oldest = rateBuckets.keys().next().value;
      if (oldest) rateBuckets.delete(oldest);
    }
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

export function webhookRateLimitKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const realIp = request.headers.get("x-real-ip")?.trim() || "";
  return `${scope}:${forwarded || realIp || "unknown"}`;
}
