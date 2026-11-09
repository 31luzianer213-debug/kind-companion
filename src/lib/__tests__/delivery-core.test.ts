import { describe, expect, it } from "vitest";
import {
  extractCleanIptvDns,
  extractHostOnly,
  extractM3uFromNotes,
  extractServerFromNotes,
  generateM3uUrl,
  generateEpgUrl,
  formatCredentialsMessage,
  formatBRL,
  friendlyDbError,
} from "../format";
import { phoneVariants, samePhone, onlyDigits } from "../phone";
import { evolutionBaseUrl } from "../evolution-url";

/**
 * Testes de massa do núcleo do sistema: gerar e formatar os dados de acesso
 * IPTV que o robô entrega ao cliente pelo WhatsApp (o objetivo principal),
 * além dos utilitários de telefone e URL que sustentam essa entrega.
 */

describe("URLs do servidor (Xtream Codes)", () => {
  const panel = "https://painel.seuservidor.com/#/sign-in?redirect=/dashboard";

  it("limpa hash e query do DNS", () => expect(extractCleanIptvDns(panel)).toBe("https://painel.seuservidor.com"));
  it("normaliza URL sem protocolo", () => expect(extractCleanIptvDns("painel.seuservidor.com")).toBe("http://painel.seuservidor.com"));
  it("mantém porta do host", () => expect(extractCleanIptvDns("https://painel.com:8080/iptv")).toBe("https://painel.com:8080"));
  it("devolve host puro sem protocolo", () => expect(extractHostOnly(panel)).toBe("painel.seuservidor.com"));
  it("valor vazio não quebra", () => expect(extractCleanIptvDns("")).toBe(""));
});

describe("gera lista M3U Plus e guia EPG", () => {
  const dns = "https://painel.seuservidor.com";

  it("monta a URL M3U TS com usuário e senha", () =>
    expect(generateM3uUrl(dns, "abc123", "senha", "ts")).toBe(
      "https://painel.seuservidor.com/get.php?username=abc123&password=senha&type=m3u_plus&output=ts",
    ));
  it("monta a URL M3U8 (HLS)", () =>
    expect(generateM3uUrl(dns, "abc123", "senha", "m3u8")).toContain("output=m3u8"));
  it("monta a URL do EPG", () =>
    expect(generateEpgUrl(dns, "abc123", "senha")).toBe(
      "https://painel.seuservidor.com/xmltv.php?username=abc123&password=senha",
    ));
  it("URL fica vazia sem usuário", () => expect(generateM3uUrl(dns, "", "x")).toBe(""));
  it("URL fica vazia sem DNS", () => expect(generateM3uUrl("", "u", "p")).toBe(""));
});

describe("extração dos dados anotados no cliente", () => {
  it("achar nome do servidor nas observações", () =>
    expect(extractServerFromNotes("Servidor: Xtream VIP\nM3U: http://x")).toBe("Xtream VIP"));
  it("rejeita servidor que é só domínio", () =>
    expect(extractServerFromNotes("Servidor: painel.exemplo.com")).toBe(null));
  it("achar a lista M3U anotada", () =>
    expect(extractM3uFromNotes("m3u: https://painel.com/get.php?x=1")).toBe("https://painel.com/get.php?x=1"));
  it("achar lista M3U solta no texto", () =>
    expect(extractM3uFromNotes("link: https://painel.com/lista.m3u8 ok")).toBe("https://painel.com/lista.m3u8"));
});

describe("mensagem de entrega de acesso (objetivo do sistema)", () => {
  it("monta a mensagem completa com todos os campos", () => {
    const msg = formatCredentialsMessage({
      name: "João",
      serverName: "Xtream VIP",
      serverDns: "https://painel.seuservidor.com/#/sign-in",
      username: "abc123",
      password: "senha",
      screens: 2,
      dueDate: "2025-12-31",
    });
    expect(msg).toContain("DADOS DE ACESSO IPTV");
    expect(msg).toContain("João");
    expect(msg).toContain("Xtream VIP");
    expect(msg).toContain("https://painel.seuservidor.com");
    expect(msg).toContain("abc123");
    expect(msg).toContain("senha");
    expect(msg).toContain("Telas:* 2");
    expect(msg).toContain("31/12/2025");
    expect(msg).toContain("get.php?username=abc123&password=senha&type=m3u_plus&output=ts");
    expect(msg).toContain("xmltv.php?username=abc123&password=senha");
  });

  it("sem dados devolve estrutura válida sem quebrar", () => {
    const msg = formatCredentialsMessage({});
    expect(msg).toContain("DADOS DE ACESSO IPTV");
    expect(msg).toContain("Meu Servidor");
    expect(msg).toContain("A combinar");
  });
});

describe("telefones brasileiros", () => {
  it("só dígitos", () => expect(onlyDigits("(93) 9 9177-1170")).toBe("93991771170"));
  it("gera variações equivalentes (com/sem DDI e 9º dígito)", () => {
    const v = phoneVariants("5593991771170");
    expect(v).toContain("5593991771170");
    expect(v).toContain("93991771170");
    expect(v).toContain("559391771170");
    expect(v).toContain("9391771170");
  });
  it("identificadores longos (LID) não viram telefone", () => {
    expect(phoneVariants("1234567890123456")).toEqual(["1234567890123456"]);
  });
  it("mesmo número em formatos diferentes casa", () => {
    expect(samePhone("5593991771170", "(93) 9 9177-1170")).toBe(true);
    expect(samePhone("5593991771170", "1111111111")).toBe(false);
  });
});

describe("URL da Evolution API (IP direto)", () => {
  it("troca IP por hostname sslip.io", () =>
    expect(evolutionBaseUrl("http://203.0.113.10:8080/")).toBe("http://203-0-113-10.sslip.io:8080"));
  it("mantém hostname comum intacto", () =>
    expect(evolutionBaseUrl("https://api.exemplo.com/")).toBe("https://api.exemplo.com"));
  it("valor inválido volta como veio", () =>
    expect(evolutionBaseUrl("http://ip-invalido")).toBe("http://ip-invalido"));
});

describe("formatação e mensagens de erro", () => {
  it("formata em reais", () => expect(formatBRL(10.5)).toMatch(/R\$/));
  it("traduz limite de plano", () =>
    expect(friendlyDbError("PGR2: LIMITE_PLANO: 5")).toContain("5"));
  it("traduz assinatura inativa", () =>
    expect(friendlyDbError("ASSINATURA_INATIVA: vencida")).toContain("vencida"));
});
