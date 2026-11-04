import { describe, expect, test } from "bun:test";
import { isDuplicateMessage, processedMessageKey, releaseDuplicateMessage } from "./whatsapp-message-dedupe";

describe("WhatsApp message deduplication", () => {
  test("scopes the key by instance", () => {
    expect(processedMessageKey("abc", "5593991771170", "tenant-a")).toBe("tenant-a:abc");
    expect(processedMessageKey("abc", "5593991771170", "tenant-b")).toBe("tenant-b:abc");
  });

  test("blocks repeated delivery in the same instance", () => {
    expect(isDuplicateMessage("same-id", "5593991771170", "tenant-test", 1000)).toBe(false);
    expect(isDuplicateMessage("same-id", "5593991771170", "tenant-test", 1001)).toBe(true);
  });

  test("does not suppress another reseller's message id", () => {
    expect(isDuplicateMessage("shared-id", "5593991771170", "tenant-a", 2000)).toBe(false);
    expect(isDuplicateMessage("shared-id", "5593991771170", "tenant-b", 2000)).toBe(false);
  });

  test("does not deduplicate separate messages when the provider omitted message ids", () => {
    expect(processedMessageKey("", "5593991771170", "tenant-test")).toBe("");
    expect(isDuplicateMessage("", "5593991771170", "tenant-test", 4000)).toBe(false);
    expect(isDuplicateMessage("", "5593991771170", "tenant-test", 4001)).toBe(false);
  });

  test("allows retry after releasing a failed attempt", () => {
    expect(isDuplicateMessage("retry-id", "5593991771170", "tenant-retry", 3000)).toBe(false);
    releaseDuplicateMessage("retry-id", "5593991771170", "tenant-retry");
    expect(isDuplicateMessage("retry-id", "5593991771170", "tenant-retry", 3001)).toBe(false);
  });
});
