import { describe, expect, it } from "vitest";
import type { Blueprint, Skill } from "../api/types";
import {
  combineEfficiency,
  effectiveQuantity,
  effectiveTime,
  MAX_SKILL_LEVEL,
  type SkillLevels,
} from "./skills";

const skillByName = new Map<string, Skill>([
  ["A", { name: "A", efficiency: [4, 8, 12, 16, 20], time: [0, -0.05, -0.1, -0.15, -0.2] }],
  ["B", { name: "B", efficiency: [3, 6, 9, 12, 15], time: [0, -0.05, -0.1, -0.15, -0.2] }],
]);

const bp: Blueprint = {
  itemId: 1,
  name: "Test",
  categoryName: "Ship",
  groupName: "G",
  outputNumber: 1,
  manufactureCost: 1000,
  manufactureTime: 100,
  skills: ["A", "B"],
  materials: [{ id: 10, name: "Mineral", type: "Mineral", quantity: 100 }],
};

const levelsAll = (lvl: number): SkillLevels => new Map([["A", lvl], ["B", lvl]]);

describe("combineEfficiency", () => {
  it("додає % обох скілів на максимумі", () => {
    expect(combineEfficiency(["A", "B"], levelsAll(5), skillByName)).toBe(35);
  });
  it("рівень 0 не дає внеску", () => {
    expect(combineEfficiency(["A", "B"], levelsAll(0), skillByName)).toBe(0);
  });
  it("ігнорує невідомі скіли", () => {
    expect(combineEfficiency(["A", "X"], levelsAll(5), skillByName)).toBe(20);
  });
  it("дефолт (немає в мапі) = макс рівень", () => {
    expect(combineEfficiency(["A", "B"], new Map(), skillByName)).toBe(35);
  });
});

describe("effectiveQuantity", () => {
  it("на макс рівні повертає рівно кількість блюпрінта", () => {
    expect(effectiveQuantity(100, bp, levelsAll(MAX_SKILL_LEVEL), skillByName)).toBe(100);
  });
  it("на рівні 0 збільшує кількість (зворотно до -35%)", () => {
    // base = 100 / (1 - 0.35) = 153.84 → ceil 154
    expect(effectiveQuantity(100, bp, levelsAll(0), skillByName)).toBe(154);
  });
  it("проміжний рівень дає значення між мін і макс", () => {
    const q = effectiveQuantity(100, bp, levelsAll(3), skillByName);
    expect(q).toBeGreaterThan(100);
    expect(q).toBeLessThan(154);
  });
});

describe("effectiveTime", () => {
  it("на макс рівні повертає час блюпрінта", () => {
    expect(effectiveTime(bp, levelsAll(MAX_SKILL_LEVEL), skillByName)).toBeCloseTo(100);
  });
  it("на рівні 0 час більший (немає знижок)", () => {
    expect(effectiveTime(bp, levelsAll(0), skillByName)).toBeGreaterThan(100);
  });
});
