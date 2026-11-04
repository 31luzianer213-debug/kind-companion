import { describe, expect, test } from "bun:test";
import { onlyDigits, phoneVariants, samePhone } from "./phone";

describe("Brazilian phone normalization", () => {
  test("removes formatting characters", () => {
    expect(onlyDigits("+55 (93) 99177-1170")).toBe("5593991771170");
  });

  test("generates local and international variants with and without the ninth digit", () => {
    const variants = phoneVariants("+55 (93) 99177-1170");
    expect(variants).toContain("5593991771170");
    expect(variants).toContain("93991771170");
    expect(variants).toContain("559391771170");
    expect(variants).toContain("9391771170");
  });

  test("matches the same Brazilian phone with different formats", () => {
    expect(samePhone("(93) 99177-1170", "55 93 9177-1170")).toBe(true);
  });

  test("keeps long non-phone identifiers intact", () => {
    expect(phoneVariants("123456789012345")).toEqual(["123456789012345"]);
  });

  test("handles empty and incomplete values safely", () => {
    expect(phoneVariants(null)).toEqual([]);
    expect(phoneVariants("12345")).toEqual(["12345"]);
    expect(samePhone("", "93999990000")).toBe(false);
  });
});
