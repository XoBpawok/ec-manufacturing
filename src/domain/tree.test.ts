import { describe, expect, it } from "vitest";
import type { GameData, Recipe, Skill } from "../api/types";
import { buildTree, summarizeTree, fullBuildSet, CAPITAL_COMPONENT_TYPE, type TreeParams } from "./tree";

// Tree: Ship(1) ← 2× Component(2) ← 10× Mineral(3, not craftable)
export function makeData(): GameData {
  const skillByName = new Map<string, Skill>([
    ["S", { name: "S", efficiency: [0, 0, 0, 0, 0], time: [0, 0, 0, 0, 0] }],
  ]);
  const shipBp: Recipe = {
    itemId: 1, blueprintId: 9001, name: "Ship", categoryName: "Ship", groupName: "Dread", kind: "manufacture",
    outputNumber: 1, manufactureCost: 1000, manufactureTime: 100, passRate: 1, skills: ["S"],
    materials: [{ id: 2, name: "Component", type: "Component", quantity: 2 }],
  };
  const compBp: Recipe = {
    itemId: 2, blueprintId: 9002, name: "Component", categoryName: "Component", groupName: "Cap", kind: "manufacture",
    outputNumber: 1, manufactureCost: 50, manufactureTime: 10, passRate: 1, skills: ["S"],
    materials: [{ id: 3, name: "Mineral", type: "Mineral", quantity: 10 }],
  };
  return {
    craftables: [
      { id: 1, name: "Ship", groupName: "Dread", categoryName: "Ship" },
      { id: 2, name: "Component", groupName: "Cap", categoryName: "Component" },
    ],
    recipeByItemId: new Map([[1, shipBp], [2, compBp]]),
    priceByItemId: new Map([[2, 500], [3, 5], [1, 99999]]),
    iconByItemId: new Map(),
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
    materialEfficiency: null,
    buildSet,
    priceOverrides: new Map(),
    capComponentCostReduction: 0,
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
    expect(sum.totalJobCost).toBe(1000); // ship job only
    expect(sum.totalBuyCost).toBe(1000); // 2 components × 500
    expect(sum.grandTotal).toBe(2000);
    expect(sum.buyFinishedCost).toBe(99999);
  });

  it("build компонента розкриває мінерали", () => {
    const params = baseParams(makeData(), new Set([2]));
    const tree = buildTree(params);
    const comp = tree.children[0];
    expect(comp.mode).toBe("build");
    expect(comp.runs).toBe(2); // 2 components, output 1
    expect(comp.children).toHaveLength(1);
    const mineral = comp.children[0];
    expect(mineral.mode).toBe("buy");
    expect(mineral.craftable).toBe(false);
    expect(mineral.quantity).toBe(20); // 10 × 2 runs

    const sum = summarizeTree(tree, params);
    expect(sum.totalBuyCost).toBe(20 * 5); // minerals only
    expect(sum.totalJobCost).toBe(1000 + 50 * 2); // ship + 2 component jobs
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

describe("округлення кількості матеріалів по job, не по прогону", () => {
  // 3 ships ← 1× Part(2). Скіл S дає effMax=60% (макс. рівень), на рівні 0 — 0%,
  // тож factor = 1/(1-0.6) = 2.5. Наївне округлення per-run: ceil(1×2.5)=3 ×3 runs
  // = 9. Правильне (per job, як у EVE Online): ceil(3×1×2.5) = ceil(7.5) = 8 —
  // економія завдяки батчингу кількох прогонів в один job.
  function makeBatchData(): GameData {
    const skillByName = new Map<string, Skill>([
      ["S", { name: "S", efficiency: [60, 60, 60, 60, 60], time: [0, 0, 0, 0, 0] }],
    ]);
    const shipBp: Recipe = {
      itemId: 1, blueprintId: 9001, name: "Ship", categoryName: "Ship", groupName: "Dread", kind: "manufacture",
      outputNumber: 1, manufactureCost: 0, manufactureTime: 0, passRate: 1, skills: ["S"],
      materials: [{ id: 2, name: "Part", type: "Part", quantity: 1 }],
    };
    return {
      craftables: [],
      recipeByItemId: new Map([[1, shipBp]]),
      priceByItemId: new Map([[2, 1]]),
      iconByItemId: new Map(),
      skillByName,
      fetchedAt: 0,
    };
  }

  it("3 прогони з рівнем 0 економлять матеріал порівняно з округленням на кожен окремо", () => {
    const params: TreeParams = {
      data: makeBatchData(),
      rootItemId: 1,
      desiredQty: 3,
      levels: new Map([["S", 0]]),
      materialEfficiency: null,
      buildSet: new Set(),
      priceOverrides: new Map(),
      capComponentCostReduction: 0,
    };
    const tree = buildTree(params);
    expect(tree.runs).toBe(3);
    expect(tree.children[0].quantity).toBe(8); // not 9 (naive per-run ceil)
  });
});

describe("capComponentCostReduction", () => {
  // Ship(1) ← 2× CapComp(2, type=Capital Construction Components) ← 10× Mineral(3)
  function makeCapData(): GameData {
    const skillByName = new Map<string, Skill>([
      ["S", { name: "S", efficiency: [0, 0, 0, 0, 0], time: [0, 0, 0, 0, 0] }],
    ]);
    const shipBp: Recipe = {
      itemId: 1, blueprintId: 9001, name: "Ship", categoryName: "Ship", groupName: "Dread", kind: "manufacture",
      outputNumber: 1, manufactureCost: 1000, manufactureTime: 100, passRate: 1, skills: ["S"],
      materials: [{ id: 2, name: "CapComp", type: CAPITAL_COMPONENT_TYPE, quantity: 2 }],
    };
    const compBp: Recipe = {
      itemId: 2, blueprintId: 9002, name: "CapComp", categoryName: "Material", groupName: "Components", kind: "manufacture",
      outputNumber: 1, manufactureCost: 50, manufactureTime: 10, passRate: 1, skills: ["S"],
      materials: [{ id: 3, name: "Mineral", type: "Mineral", quantity: 10 }],
    };
    return {
      craftables: [],
      recipeByItemId: new Map([[1, shipBp], [2, compBp]]),
      priceByItemId: new Map([[2, 500], [3, 5], [1, 99999]]),
      iconByItemId: new Map(),
      skillByName,
      fetchedAt: 0,
    };
  }

  function capParams(reduction: number): TreeParams {
    return {
      data: makeCapData(),
      rootItemId: 1,
      desiredQty: 1,
      levels: new Map(),
      materialEfficiency: null,
      buildSet: new Set([2]), // build the capital component
      priceOverrides: new Map(),
      capComponentCostReduction: reduction,
    };
  }

  it("знижка 20% зменшує jobCost capital-компонента, не чіпаючи root", () => {
    const tree = buildTree(capParams(20));
    const comp = tree.children[0];
    expect(comp.type).toBe(CAPITAL_COMPONENT_TYPE);
    expect(comp.jobCost).toBe(50 * 2 * 0.8); // 80 (was 100)
    expect(tree.jobCost).toBe(1000); // root (type=Ship) without discount

    const sum = summarizeTree(tree, capParams(20));
    expect(sum.totalJobCost).toBe(1000 + 80);
  });

  it("знижка 0% лишає jobCost без змін", () => {
    const tree = buildTree(capParams(0));
    expect(tree.children[0].jobCost).toBe(50 * 2);
  });

  it("знижка 100% обнуляє jobCost capital-компонента", () => {
    const tree = buildTree(capParams(100));
    const comp = tree.children[0];
    expect(comp.jobCost).toBe(0);
    expect(comp.nodeTotal).toBe(comp.children[0].buyCost); // only the minerals cost remains
  });

  it("клампить значення поза діапазоном 0–100", () => {
    expect(buildTree(capParams(-10)).children[0].jobCost).toBe(50 * 2); // <0 → 0% discount
    expect(buildTree(capParams(150)).children[0].jobCost).toBe(0); // >100 → 100% discount
  });

  it("знижка capComponent не зачіпає вартість блюпрінта", () => {
    const params = { ...capParams(50), priceOverrides: new Map<number, number>([[9002, 100]]) };
    const comp = buildTree(params).children[0];
    expect(comp.jobCost).toBe(50 * 2 * 0.5); // 50 — discounted job
    const compBp = comp.children.find((c) => c.isBlueprint)!;
    expect(compBp.buyCost).toBe(100 * 2); // 200 — blueprint without discount (separate buy node)
  });
});

describe("blueprint cost (некрафтований блюпрінт)", () => {
  it("блюпрінт із відомою ціною → дочірній buy-вузол у totalBlueprintCost", () => {
    const data = makeData();
    const params = {
      ...baseParams(data, new Set([2])),
      priceOverrides: new Map<number, number>([[9001, 1000], [9002, 100]]),
    };
    const tree = buildTree(params);
    const rootBp = tree.children.find((c) => c.isBlueprint)!;
    expect(rootBp.itemId).toBe(9001);
    expect(rootBp.mode).toBe("buy");
    expect(rootBp.craftable).toBe(false);
    expect(rootBp.buyCost).toBe(1000); // attempts = 1
    const comp = tree.children.find((c) => c.itemId === 2)!;
    const compBp = comp.children.find((c) => c.isBlueprint)!;
    expect(compBp.buyCost).toBe(100 * 2); // 2 runs
    // root nodeTotal = all children (including the blueprint) + jobCost
    const childrenTotal = tree.children.reduce((s, c) => s + c.nodeTotal, 0);
    expect(tree.nodeTotal).toBe(childrenTotal + tree.jobCost);

    const sum = summarizeTree(tree, params);
    expect(sum.totalBlueprintCost).toBe(1000 + 200);
    expect(sum.grandTotal).toBe(sum.totalBuyCost + sum.totalJobCost + sum.totalBlueprintCost);
    // bought blueprints do not appear in the material list
    expect(sum.shoppingList.some((m) => m.itemId === 9001 || m.itemId === 9002)).toBe(false);
  });

  it("блюпрінт без ціни й без рецепту не додає дочірній вузол", () => {
    const tree = buildTree(baseParams(makeData(), new Set([2])));
    expect(tree.children.every((c) => !c.isBlueprint)).toBe(true);
    expect(tree.children[0].children.every((c) => !c.isBlueprint)).toBe(true);
  });

  it("fullBuildSet збирає всі craftable у піддереві (без блюпрінтів)", () => {
    const set = fullBuildSet(makeData(), 1);
    expect(set.has(2)).toBe(true); // component is craftable
    expect(set.has(3)).toBe(false); // mineral is not craftable
  });
});

describe("blueprint craft (craftable блюпрінт через реверс)", () => {
  // Ship(1) ← 2× Component(2); Ship consumes Ship Blueprint(60), which is itself
  // produced by reverse from Datacore(4). Component blueprint(9002) is not craftable.
  function makeBpData(): GameData {
    const skillByName = new Map<string, Skill>();
    const shipBp: Recipe = {
      itemId: 1, blueprintId: 60, name: "Ship", categoryName: "Ship", groupName: "Dread", kind: "manufacture",
      outputNumber: 1, manufactureCost: 1000, manufactureTime: 100, passRate: 1, skills: [],
      materials: [{ id: 2, name: "Component", type: "Component", quantity: 2 }],
    };
    const compBp: Recipe = {
      itemId: 2, blueprintId: 9002, name: "Component", categoryName: "Component", groupName: "Cap", kind: "manufacture",
      outputNumber: 1, manufactureCost: 50, manufactureTime: 10, passRate: 1, skills: [],
      materials: [{ id: 3, name: "Mineral", type: "Mineral", quantity: 10 }],
    };
    const shipBpRecipe: Recipe = {
      itemId: 60, blueprintId: 60, name: "Ship Blueprint", categoryName: "Ship blueprint", groupName: "Dread Blueprints", kind: "reverse",
      outputNumber: 1, manufactureCost: 30, manufactureTime: 200, passRate: 0.5, skills: [],
      materials: [{ id: 4, name: "Datacore", type: "Datacores", quantity: 1 }],
    };
    return {
      craftables: [],
      recipeByItemId: new Map([[1, shipBp], [2, compBp], [60, shipBpRecipe]]),
      priceByItemId: new Map([[2, 500], [3, 5], [1, 99999], [60, 2000], [4, 10]]),
      iconByItemId: new Map(),
      skillByName,
      fetchedAt: 0,
    };
  }

  function bpParams(buildSet: Set<number>): TreeParams {
    return { ...baseParams(makeBpData(), buildSet) };
  }

  it("craftable блюпрінт за дефолтом — дочірній buy-вузол", () => {
    const params = bpParams(new Set());
    const tree = buildTree(params);
    const bp = tree.children.find((c) => c.isBlueprint)!;
    expect(bp.itemId).toBe(60);
    expect(bp.craftable).toBe(true);
    expect(bp.mode).toBe("buy");
    expect(bp.quantity).toBe(1); // attempts = runs = 1
    expect(bp.buyCost).toBe(2000);

    const sum = summarizeTree(tree, params);
    expect(sum.totalBlueprintCost).toBe(2000);
    expect(sum.totalBuyCost).toBe(2 * 500); // component only, without the blueprint
    expect(sum.totalJobCost).toBe(1000);
    expect(sum.grandTotal).toBe(1000 + 2000 + 1000);
  });

  it("блюпрінт у режимі build рекурсує в реверс-рецепт", () => {
    const params = bpParams(new Set([60]));
    const tree = buildTree(params);
    const bp = tree.children.find((c) => c.isBlueprint)!;
    expect(bp.mode).toBe("build");
    expect(bp.recipeKind).toBe("reverse");
    expect(bp.runs).toBe(1);
    expect(bp.attempts).toBe(2); // 1 / 0.5
    expect(bp.jobCost).toBe(30 * 2); // 60
    // the blueprint's reverse node has no blueprint child of its own
    expect(bp.children.some((c) => c.isBlueprint)).toBe(false);
    const datacore = bp.children[0];
    expect(datacore.itemId).toBe(4);
    expect(datacore.quantity).toBe(2); // ceil(1 × 2 attempts)
    expect(datacore.buyCost).toBe(20);
    expect(bp.nodeTotal).toBe(20 + 60);

    const sum = summarizeTree(tree, params);
    expect(sum.totalBlueprintCost).toBe(0); // the blueprint is built, not bought
    expect(sum.totalBuyCost).toBe(2 * 500 + 20); // component + datacore
    expect(sum.totalJobCost).toBe(1000 + 60); // ship + blueprint reverse
    expect(sum.grandTotal).toBe(sum.totalBuyCost + sum.totalJobCost + sum.totalBlueprintCost);
  });

  it("реверс-рецепт не нараховує вартість власного блюпрінта", () => {
    const params = { ...bpParams(new Set()), rootItemId: 60 };
    const tree = buildTree(params);
    expect(tree.recipeKind).toBe("reverse");
    expect(tree.children.every((c) => !c.isBlueprint)).toBe(true);
    // nodeTotal = datacore (buy) + jobCost; the blueprint's market price (2000) is NOT added
    expect(tree.nodeTotal).toBe(tree.children[0].buyCost + tree.jobCost);
  });
});
