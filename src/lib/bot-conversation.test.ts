import { describe, expect, test } from "bun:test";
import { botConversationKey } from "./bot-conversation";

describe("Bot conversation tenant isolation", () => {
  test("normalizes phone numbers in the key", () => {
    expect(botConversationKey("tenant-a", "+55 (93) 99177-1170")).toBe("tenant-a:5593991771170");
  });
  test("does not share one phone's conversation state between resellers", () => {
    expect(botConversationKey("tenant-a", "5593991771170")).not.toBe(botConversationKey("tenant-b", "5593991771170"));
  });
});
