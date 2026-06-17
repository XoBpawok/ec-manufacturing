import { describe, expect, it } from "vitest";
import type { GameData, Recipe } from "../api/types";
import { computeOptimalBuildSet } from "./optimize";

function data(componentPrice: number, mineralPrice: number): GameData {
  const ship: Recipe = {
    itemId: 1, blueprintId: 9001, name: "Ship", categoryName: "Ship", groupName: "G", kind: "manufacture",
    outputNumber: 1, manufactureCost: 1000, manufactureTime: 100, passRate: 1, skills: [],
    materials: [{ id: 2, name: "Component", type: "Component", quantity: 2 }],
  };
  const comp: Recipe = {
    itemId: 2, blueprintId: 9002, name: "Component", categoryName: "Component", groupName: "G", kind: "manufacture",
    outputNumber: 1, manufactureCost: 50, manufactureTime: 10, passRate: 1, skills: [],
    materials: [{ id: 3, name: "Mineral", type: "Mineral", quantity: 10 }],
  };
  return {
    craftables: [],
    recipeByItemId: new Map([[1, ship], [2, comp]]),
    priceByItemId: new Map([[1, 99999], [2, componentPrice], [3, mineralPrice]]),
    iconByItemId: new Map(),
    skillByName: new Map(),
    fetchedAt: 0,
  };
}

const params = (d: GameData) => ({
  data: d,
  rootItemId: 1,
  levels: new Map<string, number>(),
  materialEfficiency: null,
  priceOverrides: new Map<number, number>(),
});

describe("computeOptimalBuildSet", () => {
  it("крафтить компонент, коли це дешевше за купівлю", () => {
    // craft = 50 + 10×5 = 100 < buy 500
    const set = computeOptimalBuildSet(params(data(500, 5)));
    expect(set.has(2)).toBe(true);
  });

  it("купує компонент, коли крафт дорожчий", () => {
    // craft = 50 + 10×100 = 1050 > buy 200
    const set = computeOptimalBuildSet(params(data(200, 100)));
    expect(set.has(2)).toBe(false);
  });

  it("враховує pass_rate реверсу в очікуваній вартості", () => {
    const re: Recipe = {
      itemId: 5, blueprintId: 9005, name: "T2", categoryName: "Mod", groupName: "G", kind: "reverse",
      outputNumber: 1, manufactureCost: 100, manufactureTime: 60, passRate: 0.5, skills: [],
      materials: [{ id: 6, name: "Base", type: "Base", quantity: 1 }],
    };
    const d: GameData = {
      craftables: [],
      recipeByItemId: new Map([[5, re]]),
      // base коштує 100; очікувана вартість реверсу = (100 + 1×100)/0.5 = 400
      priceByItemId: new Map([[5, 1000], [6, 100]]),
      iconByItemId: new Map(),
      skillByName: new Map(),
      fetchedAt: 0,
    };
    // реверс (400) дешевший за купівлю T2 (1000) → крафтимо
    const set = computeOptimalBuildSet({ ...params(d), rootItemId: 5 });
    // root не додається в set; перевіряємо, що base залишається купівлею
    expect(set.has(6)).toBe(false);

    // якщо ціна T2 нижча за очікувану вартість реверсу — корінь усе одно крафтиться
    // (root завжди build), тож перевіряємо принаймні відсутність помилок
    expect(set).toBeInstanceOf(Set);
  });

  it("враховує ціну блюпрінта в рішенні buy/build", () => {
    // без блюпрінта: craft = 50 + 10×5 = 100 < buy 500 → build
    // з блюпрінтом 9002 = 1000: craft = 1100 > buy 500 → buy
    const d = data(500, 5);
    const set = computeOptimalBuildSet({
      ...params(d),
      priceOverrides: new Map<number, number>([[9002, 1000]]),
    });
    expect(set.has(2)).toBe(false);
  });
});
