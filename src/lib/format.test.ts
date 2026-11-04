import { describe, expect, test } from "bun:test";
import {
  buildTemplateVars,
  currentMonthKey,
  extractCleanIptvDns,
  extractM3uFromNotes,
  formatBRL,
  formatCredentialsMessage,
  formatDate,
  formatDateTime,
  friendlyDbError,
  generateEpgUrl,
  generateM3uUrl,
  renderTemplate,
  todayISO,
} from "./format";

describe("format helpers", () => {
  test("formats Brazilian currency", () => {
    const result = formatBRL(1234.56);
    expect(result).toContain("R$");
    expect(result).toContain("1.234,56");
  });

  test("formats ISO dates without timezone shifts", () => {
    expect(formatDate("2026-11-04T00:00:00.000Z")).toBe("04/11/2026");
    expect(formatDate(null)).toBe("—");
  });

  test("returns a placeholder for an invalid datetime", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });

  test("uses the local calendar date for todayISO", () => {
    expect(todayISO(new Date(2026, 10, 4, 23, 59))).toBe("2026-11-04");
  });

  test("derives the month key from the local calendar date", () => {
    expect(currentMonthKey(new Date(2026, 0, 2, 23, 59))).toBe("2026-01");
  });

  test("replaces known template variables and preserves unknown ones", () => {
    expect(renderTemplate("Olá {nome}, total {valor}; {desconhecida}", {
      nome: "Ana",
      valor: "R$ 20,00",
    })).toBe("Olá Ana, total R$ 20,00; {desconhecida}");
  });
});

describe("IPTV URL helpers", () => {
  test("removes login paths, query strings and hashes from the server URL", () => {
    expect(extractCleanIptvDns("https://painel.example.test/login?next=/home#/signin"))
      .toBe("https://painel.example.test");
  });

  test("adds http when the server URL has no protocol", () => {
    expect(extractCleanIptvDns("stream.example.test:8080/player"))
      .toBe("http://stream.example.test:8080");
  });

  test("extracts M3U links from customer notes", () => {
    expect(extractM3uFromNotes("Acesso\nM3U: https://stream.example.test/get.php?u=demo&p=demo"))
      .toBe("https://stream.example.test/get.php?u=demo&p=demo");
    expect(extractM3uFromNotes("sem link salvo")).toBeNull();
  });

  test("generates M3U URLs and safely encodes credentials", () => {
    expect(generateM3uUrl("https://panel.example.test/admin", "user+demo", "p&ss"))
      .toBe("https://panel.example.test/get.php?username=user%2Bdemo&password=p%26ss&type=m3u_plus&output=ts");
    expect(generateM3uUrl("https://panel.example.test", "", "secret")).toBe("");
  });

  test("generates EPG URLs and rejects incomplete credentials", () => {
    expect(generateEpgUrl("https://panel.example.test/path", "demo", "secret"))
      .toBe("https://panel.example.test/xmltv.php?username=demo&password=secret");
    expect(generateEpgUrl("https://panel.example.test", "", "secret")).toBe("");
  });

  test("formats access instructions with clean server details", () => {
    const message = formatCredentialsMessage({
      name: "Cliente de Teste",
      serverDns: "https://panel.example.test/admin/login",
      username: "demo-user",
      password: "demo-pass",
      dueDate: "2026-11-15",
      screens: 2,
    });

    expect(message).toContain("Cliente de Teste");
    expect(message).toContain("https://panel.example.test");
    expect(message).toContain("demo-user");
    expect(message).toContain("demo-pass");
    expect(message).not.toContain("/admin/login");
  });

  test("prefers the M3U host over a configured panel URL in template variables", () => {
    const vars = buildTemplateVars({
      client: {
        name: "Ana",
        phone: "93999990000",
        iptv_username: "ana",
        iptv_password: "senha",
        notes: "M3U: https://stream.example.test/get.php?u=ana",
      },
      list: { name: "Lista principal", server_url: "https://old.example.test" },
      settings: { sigma_streaming_dns: "https://configured.example.test" },
      amount: 35,
      dueDate: "2026-11-10",
      days: -2,
    });

    expect(vars.nome).toBe("Ana");
    expect(vars.dns).toBe("https://stream.example.test");
    expect(vars.usuario).toBe("ana");
    expect(vars.senha).toBe("senha");
    expect(vars.dias).toBe("2");
  });
});

describe("database error messages", () => {
  test("translates plan-limit errors", () => {
    expect(friendlyDbError("LIMITE_PLANO: Limite atingido")).toBe("Limite atingido");
  });

  test("translates inactive-subscription errors", () => {
    expect(friendlyDbError("ASSINATURA_INATIVA: Regularize sua assinatura"))
      .toBe("Regularize sua assinatura");
  });

  test("translates duplicate-key errors and preserves unknown messages", () => {
    expect(friendlyDbError("duplicate key value violates unique constraint"))
      .toBe("Já existe um cliente com esses dados.");
    expect(friendlyDbError("Falha temporária")).toBe("Falha temporária");
  });
});
