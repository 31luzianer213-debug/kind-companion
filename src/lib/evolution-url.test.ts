import { describe, expect, test } from "bun:test";
import { evolutionBaseUrl } from "./evolution-url";

describe("Evolution API base URL", () => {
  test("maps IPv4 hosts to sslip.io while preserving the port", () => {
    expect(evolutionBaseUrl("http://203.0.113.10:8080"))
      .toBe("http://203-0-113-10.sslip.io:8080");
  });

  test("preserves URL paths when mapping an IPv4 host", () => {
    expect(evolutionBaseUrl("https://198.51.100.20:9443/api"))
      .toBe("https://198-51-100-20.sslip.io:9443/api");
  });

  test("leaves hostnames unchanged and trims trailing slashes", () => {
    expect(evolutionBaseUrl("https://evolution.example.test///"))
      .toBe("https://evolution.example.test");
  });

  test("returns a trimmed value when the input is not a valid URL", () => {
    expect(evolutionBaseUrl("  not-a-url  ")).toBe("not-a-url");
  });
});
