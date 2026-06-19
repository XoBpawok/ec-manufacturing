import { describe, it, expect } from "vitest";
import { ageInDays, freshnessColor, freshnessLabel } from "./freshness";

const NOW = new Date("2026-06-19T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("ageInDays", () => {
  it("рахує вік у днях", () => {
    expect(ageInDays(daysAgo(5), NOW)).toBeCloseTo(5, 6);
    expect(ageInDays(daysAgo(0), NOW)).toBeCloseTo(0, 6);
  });
});

describe("freshnessColor", () => {
  it("зелений до 3 днів включно", () => {
    expect(freshnessColor(daysAgo(0), NOW)).toBe("rgb(82, 196, 26)");
    expect(freshnessColor(daysAgo(3), NOW)).toBe("rgb(82, 196, 26)");
  });
  it("червоний від 15 днів і далі", () => {
    expect(freshnessColor(daysAgo(15), NOW)).toBe("rgb(255, 77, 79)");
    expect(freshnessColor(daysAgo(30), NOW)).toBe("rgb(255, 77, 79)");
  });
  it("проміжний колір на 9 днів (середина)", () => {
    expect(freshnessColor(daysAgo(9), NOW)).toBe("rgb(169, 137, 53)");
  });
});

describe("freshnessLabel", () => {
  it("форматує вік", () => {
    expect(freshnessLabel(daysAgo(0), NOW)).toBe("оновлено сьогодні");
    expect(freshnessLabel(daysAgo(1), NOW)).toBe("оновлено вчора");
    expect(freshnessLabel(daysAgo(7), NOW)).toBe("оновлено 7 дн. тому");
  });
});
