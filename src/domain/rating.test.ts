import { describe, expect, it } from "vitest";
import type { GameData, Recipe } from "../api/types";
import { rankCraftProfits } from "./rating";

function gameData(recipes: Recipe[], prices: [number, number][]): GameData {
  return {
    craftables: [],
    recipeByItemId: new Map(recipes.map((r) => [r.itemId, r])),
    priceByItemId: new Map(prices),
    iconByItemId: new Map(),
    skillByName: new Map(),
    fetchedAt: 0,
  };
}

const noOverrides = new Map<number, number>();
const noLevels = new Map<string, number>();

const mk = (over: Partial<Recipe> & Pick<Recipe, "itemId" | "materials">): Recipe => ({
  name: `Item ${over.itemId}`, categoryName: "Cat", groupName: "G", kind: "manufacture",
  outputNumber: 1, manufactureCost: 0, manufactureTime: 0, passRate: 1, blueprintId: 0, skills: [],
  ...over,
});

describe("rankCraftProfits", () => {
  it("рахує вартість, прибуток, маржу й ISK/год для простого рецепту", () => {
    const widget = mk({
      itemId: 1, manufactureCost: 1000, manufactureTime: 100,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 2 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100]]);
    const [row] = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    // craftCost = (1000 + 100×2)/1 = 1200
    expect(row.craftCost).toBe(1200);
    expect(row.sellPrice).toBe(5000);
    expect(row.profit).toBe(3800);
    expect(row.margin).toBeCloseTo(3800 / 1200);
    expect(row.craftTime).toBe(100);
    expect(row.profitPerHour).toBeCloseTo(3800 / (100 / 3600));
  });

  it("рекурсивно будує компоненти до сировини (вартість і час)", () => {
    const ship = mk({
      itemId: 1, manufactureCost: 1000, manufactureTime: 100,
      materials: [{ id: 2, name: "Comp", type: "Component", quantity: 2 }],
    });
    const comp = mk({
      itemId: 2, manufactureCost: 50, manufactureTime: 10,
      materials: [{ id: 3, name: "Min", type: "Mineral", quantity: 10 }],
    });
    const data = gameData([ship, comp], [[1, 99999], [2, 777], [3, 5]]);
    const row = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels })
      .find((r) => r.itemId === 1)!;
    // comp = (50 + 5×10)/1 = 100; ship = (1000 + 100×2)/1 = 1200
    expect(row.craftCost).toBe(1200);
    // comp time = (10 + 0×10)/1 = 10; ship time = (100 + 10×2)/1 = 120
    expect(row.craftTime).toBe(120);
  });

  it("враховує pass_rate реверсу (вартість і час діляться на passRate)", () => {
    const re = mk({
      itemId: 5, kind: "reverse", manufactureCost: 100, manufactureTime: 60, passRate: 0.5,
      materials: [{ id: 6, name: "Base", type: "Base", quantity: 1 }],
    });
    const data = gameData([re], [[5, 5000], [6, 100]]);
    const [row] = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    // cost = (100 + 100×1)/(1×0.5) = 400; time = (60 + 0)/0.5 = 120
    expect(row.craftCost).toBe(400);
    expect(row.craftTime).toBe(120);
  });

  it("виключає предмет, якщо в ланцюгу є матеріал без ціни", () => {
    const widget = mk({
      itemId: 1, manufactureCost: 1000,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 2 }],
    });
    // id2 не має ні рецепту, ні ціни → known=false
    const data = gameData([widget], [[1, 5000]]);
    const rows = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    expect(rows.find((r) => r.itemId === 1)).toBeUndefined();
  });

  it("сортує за ISK/год спадання й обрізає до limit", () => {
    const lo = mk({
      itemId: 1, manufactureCost: 0, manufactureTime: 3600,
      materials: [{ id: 9, name: "R", type: "Mineral", quantity: 1 }],
    });
    const hi = mk({
      itemId: 2, manufactureCost: 0, manufactureTime: 3600,
      materials: [{ id: 9, name: "R", type: "Mineral", quantity: 1 }],
    });
    // обидва: cost=10, time=3600(1год); profit lo=90, hi=990 → hi вище
    const data = gameData([lo, hi], [[1, 100], [2, 1000], [9, 10]]);
    const rows = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels, limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].itemId).toBe(2);
  });

  it("override ціни перекриває ринкову для матеріалів і предмета", () => {
    const widget = mk({
      itemId: 1, manufactureCost: 0, manufactureTime: 100,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 1 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100]]);
    const overrides = new Map<number, number>([[2, 1]]); // здешевлюємо сировину
    const [row] = rankCraftProfits({ data, priceOverrides: overrides, levels: noLevels });
    expect(row.craftCost).toBe(1); // (0 + 1×1)/1
  });

  it("додає ціну блюпрінта до вартості крафту (manufacture)", () => {
    const widget = mk({
      itemId: 1, blueprintId: 901, manufactureCost: 1000, manufactureTime: 100,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 2 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100], [901, 300]]);
    const [row] = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    // craftCost = (1000 + 300 + 100×2)/1 = 1500
    expect(row.craftCost).toBe(1500);
  });

  it("ділить ціну блюпрінта реверсу на passRate", () => {
    const re = mk({
      itemId: 5, blueprintId: 905, kind: "reverse", manufactureCost: 100, manufactureTime: 60, passRate: 0.5,
      materials: [{ id: 6, name: "Base", type: "Base", quantity: 1 }],
    });
    const data = gameData([re], [[5, 5000], [6, 100], [905, 50]]);
    const [row] = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    // cost = (100 + 50 + 100×1)/(1×0.5) = 500
    expect(row.craftCost).toBe(500);
  });

  it("невідома ціна блюпрінта = 0, предмет лишається в рейтингу", () => {
    const widget = mk({
      itemId: 1, blueprintId: 901, manufactureCost: 1000,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 2 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100]]); // 901 без ціни
    const [row] = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    expect(row.craftCost).toBe(1200); // блюпрінт = 0
  });

  it("override ціни блюпрінта застосовується; craftCostMarket лишається ринковим", () => {
    const widget = mk({
      itemId: 1, blueprintId: 901, manufactureCost: 0, manufactureTime: 100,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 1 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100], [901, 300]]);
    const overrides = new Map<number, number>([[901, 50]]);
    const [row] = rankCraftProfits({ data, priceOverrides: overrides, levels: noLevels });
    expect(row.craftCost).toBe(150); // (0 + 50 + 100)/1
    expect(row.craftCostMarket).toBe(400); // (0 + 300 + 100)/1 за ринком
  });

  it("sellPriceMarket і sellIsOverride відображають override продукту", () => {
    const widget = mk({
      itemId: 1, manufactureCost: 0,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 1 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100]]);
    const overrides = new Map<number, number>([[1, 8000]]);
    const [row] = rankCraftProfits({ data, priceOverrides: overrides, levels: noLevels });
    expect(row.sellPrice).toBe(8000);
    expect(row.sellPriceMarket).toBe(5000);
    expect(row.sellIsOverride).toBe(true);
  });
});
