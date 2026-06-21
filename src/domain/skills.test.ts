import { describe, expect, it } from "vitest";
import type { Recipe, Skill } from "../api/types";
import {
  combineEfficiency,
  effectiveQuantity,
  effectiveSkillLevel,
  effectiveTime,
  isSkillUnlocked,
  materialFactor,
  skillEfficiencyFactor,
  skillPrerequisite,
  MAX_SKILL_LEVEL,
  type SkillLevels,
} from "./skills";

const skillByName = new Map<string, Skill>([
  ["A", { name: "A", efficiency: [4, 8, 12, 16, 20], time: [0, -0.05, -0.1, -0.15, -0.2] }],
  ["B", { name: "B", efficiency: [3, 6, 9, 12, 15], time: [0, -0.05, -0.1, -0.15, -0.2] }],
]);

const bp: Recipe = {
  itemId: 1,
  blueprintId: 0,
  name: "Test",
  categoryName: "Ship",
  groupName: "G",
  kind: "manufacture",
  outputNumber: 1,
  manufactureCost: 1000,
  manufactureTime: 100,
  passRate: 1,
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

describe("materialFactor", () => {
  it("без override повертає скіл-фактор", () => {
    expect(materialFactor(bp, levelsAll(0), skillByName, null)).toBe(
      skillEfficiencyFactor(bp, levelsAll(0), skillByName),
    );
  });
  it("override 100 → база блюпрінта (фактор 1)", () => {
    expect(materialFactor(bp, levelsAll(0), skillByName, 100)).toBe(1);
  });
  it("override 50 → половина, ігнорує скіли", () => {
    expect(materialFactor(bp, levelsAll(0), skillByName, 50)).toBe(0.5);
  });
  it("override 150 → півтора", () => {
    expect(materialFactor(bp, levelsAll(5), skillByName, 150)).toBe(1.5);
  });
});

describe("effectiveQuantity з override ефективності", () => {
  it("override 100 = кількість блюпрінта незалежно від скілів", () => {
    expect(effectiveQuantity(100, bp, levelsAll(0), skillByName, 100)).toBe(100);
  });
  it("override 50 = половина (скіли ігноруються)", () => {
    expect(effectiveQuantity(100, bp, levelsAll(0), skillByName, 50)).toBe(50);
  });
  it("override 150 = півтора", () => {
    expect(effectiveQuantity(100, bp, levelsAll(5), skillByName, 150)).toBe(150);
  });
  it("округлює вгору", () => {
    expect(effectiveQuantity(101, bp, levelsAll(5), skillByName, 50)).toBe(51);
  });
});

describe("skillPrerequisite / isSkillUnlocked / effectiveSkillLevel", () => {
  const names = [
    "Dreadnought Manufacture",
    "Advanced Dreadnought Manufacture",
    "Expert Dreadnought Manufacture",
  ];

  it("базовий скіл не має передумов", () => {
    expect(skillPrerequisite(names[0])).toBeNull();
  });
  it("адвансед вимагає базовий ≥4", () => {
    expect(skillPrerequisite(names[1])).toEqual({ name: names[0], minLevel: 4 });
  });
  it("експерт вимагає адвансед ≥5", () => {
    expect(skillPrerequisite(names[2])).toEqual({ name: names[1], minLevel: 5 });
  });

  it("адвансед заблокований, якщо базовий <4", () => {
    const levels: SkillLevels = new Map([[names[0], 3]]);
    expect(isSkillUnlocked(names[1], levels)).toBe(false);
    expect(effectiveSkillLevel(names[1], levels)).toBe(0);
  });
  it("адвансед розблокований, якщо базовий =4", () => {
    const levels: SkillLevels = new Map([[names[0], 4], [names[1], 3]]);
    expect(isSkillUnlocked(names[1], levels)).toBe(true);
    expect(effectiveSkillLevel(names[1], levels)).toBe(3);
  });
  it("експерт заблокований, якщо адвансед <5, навіть якщо явно заданий рівень", () => {
    const levels: SkillLevels = new Map([
      [names[0], 5],
      [names[1], 4],
      [names[2], 5],
    ]);
    expect(isSkillUnlocked(names[2], levels)).toBe(false);
    expect(effectiveSkillLevel(names[2], levels)).toBe(0);
  });
  it("експерт розблокований лише коли адвансед =5", () => {
    const levels: SkillLevels = new Map([
      [names[0], 5],
      [names[1], 5],
      [names[2], 2],
    ]);
    expect(isSkillUnlocked(names[2], levels)).toBe(true);
    expect(effectiveSkillLevel(names[2], levels)).toBe(2);
  });
  it("без записів у мапі (дефолт = макс) усе розблоковано", () => {
    expect(effectiveSkillLevel(names[2], new Map())).toBe(MAX_SKILL_LEVEL);
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
