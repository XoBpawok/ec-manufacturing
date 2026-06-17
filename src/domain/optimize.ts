import type { GameData } from "../api/types";
import { materialFactor, type SkillLevels } from "./skills";

export interface OptimizeParams {
  data: GameData;
  rootItemId: number;
  levels: SkillLevels;
  materialEfficiency: number | null; // ручне ME (%), null = за скілами
  priceOverrides: Map<number, number>;
}

interface UnitCost {
  cost: number; // мінімальна вартість за одиницю
  build: boolean; // чи дешевше крафтити, ніж купувати
}

/**
 * Обчислює для кожного предмета найдешевше джерело (купити vs крафтити),
 * рекурсивно враховуючи вартість під-матеріалів, скіли та pass_rate реверсу.
 * Повертає набір itemId, які вигідніше крафтити (для buildSet).
 *
 * Для рішення використовуються неперервні (без округлення) вартості за одиницю.
 */
export function computeOptimalBuildSet(params: OptimizeParams): Set<number> {
  const { data, rootItemId, levels, materialEfficiency, priceOverrides } = params;
  const memo = new Map<number, UnitCost>();
  const inProgress = new Set<number>();

  const buyUnit = (itemId: number): number => {
    if (priceOverrides.has(itemId)) return priceOverrides.get(itemId)!;
    const est = data.priceByItemId.get(itemId);
    return est != null ? est : Infinity;
  };

  const unit = (itemId: number): UnitCost => {
    const cached = memo.get(itemId);
    if (cached) return cached;
    if (inProgress.has(itemId)) {
      // Цикл — у цій гілці предмет можна лише купити.
      return { cost: buyUnit(itemId), build: false };
    }

    const buy = buyUnit(itemId);
    const recipe = data.recipeByItemId.get(itemId);
    let craft = Infinity;

    if (recipe) {
      inProgress.add(itemId);
      let materials = 0;
      for (const m of recipe.materials) {
        const childUnit = unit(m.id).cost;
        const perUnit =
          recipe.kind === "manufacture"
            ? m.quantity * materialFactor(recipe, levels, data.skillByName, materialEfficiency)
            : m.quantity;
        materials += childUnit * perUnit;
      }
      inProgress.delete(itemId);
      const blueprintCost = priceOverrides.has(recipe.blueprintId)
        ? priceOverrides.get(recipe.blueprintId)!
        : data.priceByItemId.get(recipe.blueprintId) ?? 0;
      // Вартість за одну вироблену одиницю. Для реверсу ділимо на pass_rate
      // (очікувана кількість спроб на успіх) і на output_number.
      craft =
        (recipe.manufactureCost + blueprintCost + materials) / (recipe.outputNumber * recipe.passRate);
    }

    const build = craft < buy;
    const result: UnitCost = { cost: Math.min(buy, craft), build };
    memo.set(itemId, result);
    return result;
  };

  const buildSet = new Set<number>();
  const collect = (itemId: number, visited: Set<number>): void => {
    const recipe = data.recipeByItemId.get(itemId);
    if (!recipe) return;
    for (const m of recipe.materials) {
      if (!data.recipeByItemId.has(m.id)) continue;
      if (unit(m.id).build) {
        buildSet.add(m.id);
        if (!visited.has(m.id)) collect(m.id, new Set(visited).add(itemId));
      }
    }
  };

  // Корінь завжди крафтиться (це цільовий предмет).
  collect(rootItemId, new Set([rootItemId]));
  return buildSet;
}
