import { describe, it, expect } from "vitest";
import { detectLanguage } from "./languages";

describe("detectLanguage", () => {
  it("matches an exact supported code", () => {
    expect(detectLanguage(["en"])).toBe("en");
    expect(detectLanguage(["uk"])).toBe("uk");
  });

  it("matches by primary subtag, ignoring region", () => {
    expect(detectLanguage(["en-US"])).toBe("en");
    expect(detectLanguage(["pt-BR"])).toBe("pt");
    expect(detectLanguage(["zh-CN"])).toBe("zh");
    expect(detectLanguage(["ja-JP"])).toBe("ja");
  });

  it("is case-insensitive", () => {
    expect(detectLanguage(["DE-de"])).toBe("de");
  });

  it("uses the first candidate that matches a supported language", () => {
    // First preference unsupported (Russian deliberately excluded), second supported.
    expect(detectLanguage(["ru-RU", "pl-PL", "en"])).toBe("pl");
  });

  it("falls back to Ukrainian when nothing matches", () => {
    expect(detectLanguage(["ru", "ar", "hi"])).toBe("uk");
    expect(detectLanguage([])).toBe("uk");
  });
});
