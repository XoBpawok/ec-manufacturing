import { describe, expect, it } from "vitest";
import type { Blueprint, GameData, Skill } from "../api/types";
import { buildTree, summarizeTree, type TreeParams } from "./tree";

// Дерево: Ship(1) ← 2× Component(2) ← 10× Mineral(3, не craftable)
function makeData(): GameData {
  const skillByName = new Map<string, Skill>([
    ["S", { name: "S", efficiency: [0, 0, 0, 0, 0], time: [0, 0, 0, 0, 0] }],
  ]);
  const shipBp: Blueprint = {
    itemId: 1, name: "Ship", categoryName: "Ship", groupName: "Dread",
    outputNumber: 1, manufactureCost: 1000, manufactureTime: 100, skills: ["S"],
    materials: [{ id: 2, name: "Component", type: "Component", quantity: 2 }],
  };
  const compBp: Blueprint = {
    itemId: 2, name: "Component", categoryName: "Component", groupName: "Cap",
    outputNumber: 1, manufactureCost: 50, manufactureTime: 10, skills: ["S"],
    materials: [{ id: 3, name: "Mineral", type: "Mineral", quantity: 10 }],
  };
  return {
    craftables: [
      { id: 1, name: "Ship", groupName: "Dread", categoryName: "Ship" },
      { id: 2, name: "Component", groupName: "Cap", categoryName: "Component" },
    ],
    blueprintByItemId: new Map([[1, shipBp], [2, compBp]]),
    priceByItemId: new Map([[2, 500], [3, 5], [1, 99999]]),
    skillByName,
    fetchedAt: 0,
  };
}

function baseParams(data: GameData, buildSet: Set<number>): TreeParams {
  return {
    data,
    rootItemId: 1,
    desiredQty: 1,
    levels: new Map(),
    buildSet,
    priceOverrides: new Map(),
  };
}

describe("buildTree + summarizeTree", () => {
  it("дефолт: компонент купується, не розкривається", () => {
    const params = baseParams(makeData(), new Set());
    const tree = buildTree(params);
    expect(tree.mode).toBe("build");
    expect(tree.children).toHaveLength(1);
    const comp = tree.children[0];
    expect(comp.mode).toBe("buy");
    expect(comp.quantity).toBe(2);
    expect(comp.buyCost).toBe(2 * 500);

    const sum = summarizeTree(tree, params);
    expect(sum.totalJobCost).toBe(1000); // лише job корабля
    expect(sum.totalBuyCost).toBe(1000); // 2 компоненти × 500
    expect(sum.grandTotal).toBe(2000);
    expect(sum.buyFinishedCost).toBe(99999);
  });

  it("build компонента розкриває мінерали", () => {
    const params = baseParams(makeData(), new Set([2]));
    const tree = buildTree(params);
    const comp = tree.children[0];
    expect(comp.mode).toBe("build");
    expect(comp.runs).toBe(2); // 2 компоненти, output 1
    expect(comp.children).toHaveLength(1);
    const mineral = comp.children[0];
    expect(mineral.mode).toBe("buy");
    expect(mineral.craftable).toBe(false);
    expect(mineral.quantity).toBe(20); // 10 × 2 runs

    const sum = summarizeTree(tree, params);
    expect(sum.totalBuyCost).toBe(20 * 5); // лише мінерали
    expect(sum.totalJobCost).toBe(1000 + 50 * 2); // корабель + 2 job компонента
    expect(sum.shoppingList).toHaveLength(1);
    expect(sum.shoppingList[0].name).toBe("Mineral");
  });

  it("desiredQty масштабує дерево", () => {
    const params = { ...baseParams(makeData(), new Set([2])), desiredQty: 3 };
    const tree = buildTree(params);
    expect(tree.runs).toBe(3);
    expect(tree.children[0].quantity).toBe(6); // 2 × 3
    const sum = summarizeTree(tree, params);
    expect(sum.buyFinishedCost).toBe(99999 * 3);
  });

  it("relevantSkills збирає скіли лише з build-вузлів", () => {
    const buy = summarizeTree(buildTree(baseParams(makeData(), new Set())), baseParams(makeData(), new Set()));
    expect(buy.relevantSkills).toEqual(["S"]);
  });
});
