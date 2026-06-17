import type { GameData, RecipeKind } from "../api/types";
import { iconUrl } from "../api/types";
import { effectiveTime, materialFactor, type SkillLevels } from "./skills";

export interface CraftProfit {
  itemId: number;
  name: string;
  categoryName: string;
  groupName: string;
  kind: RecipeKind;
  iconUrl?: string;
  sellPrice: number; // ринкова ціна предмета (або override)
  craftCost: number; // повна вартість крафту до сировини, за одиницю
  profit: number; // sellPrice − craftCost
  margin: number; // profit / craftCost (частка; craftCost>0)
  craftTime: number; // секунди, рекурсивно весь ланцюг, за одиницю
  profitPerHour: number; // profit / (craftTime/3600); craftTime>0
}

export interface RatingParams {
  data: GameData;
  priceOverrides: Map<number, number>;
  levels: SkillLevels; // базис скілів (порожня мапа = макс рівні)
  limit?: number; // скільки повернути (default 50)
}

interface UnitCT {
  cost: number; // вартість за одиницю
  time: number; // секунди за одиницю
  known: boolean; // чи відомі всі ціни в ланцюгу
}

/**
 * Ранжує craftable-предмети за вигідністю крафту «до сировини».
 *
 * Вартість/час рахуються рекурсивно: будь-який craftable-матеріал завжди
 * будується, купується лише сировина без рецепту. Формула на одиницю дзеркалить
 * domain/optimize.ts: (manufactureCost + Σ child×qty) / (outputNumber × passRate).
 * Базис скілів — максимальні рівні (materialFactor=1), тож кількості/час блюпрінта.
 */
export function rankCraftProfits(params: RatingParams): CraftProfit[] {
  const { data, priceOverrides, levels, limit = 50 } = params;
  const memo = new Map<number, UnitCT>();
  const inProgress = new Set<number>();

  const buyPrice = (itemId: number): number | undefined => {
    if (priceOverrides.has(itemId)) return priceOverrides.get(itemId)!;
    return data.priceByItemId.get(itemId);
  };

  const unit = (itemId: number): UnitCT => {
    const cached = memo.get(itemId);
    if (cached) return cached;
    const recipe = data.recipeByItemId.get(itemId);
    // Лист (нема рецепту) або цикл — купуємо.
    if (!recipe || inProgress.has(itemId)) {
      const p = buyPrice(itemId);
      return { cost: p ?? 0, time: 0, known: p != null };
    }
    inProgress.add(itemId);
    let materialsCost = 0;
    let materialsTime = 0;
    let known = true;
    for (const m of recipe.materials) {
      const child = unit(m.id);
      if (!child.known) known = false;
      const perUnit =
        recipe.kind === "manufacture"
          ? m.quantity * materialFactor(recipe, levels, data.skillByName, null)
          : m.quantity;
      materialsCost += child.cost * perUnit;
      materialsTime += child.time * perUnit;
    }
    inProgress.delete(itemId);
    const denom = recipe.outputNumber * recipe.passRate;
    const cost = (recipe.manufactureCost + materialsCost) / denom;
    const time = (effectiveTime(recipe, levels, data.skillByName) + materialsTime) / denom;
    const result: UnitCT = { cost, time, known };
    memo.set(itemId, result);
    return result;
  };

  const out: CraftProfit[] = [];
  for (const [itemId, recipe] of data.recipeByItemId) {
    const sell = buyPrice(itemId);
    if (sell == null) continue;
    const { cost, time, known } = unit(itemId);
    if (!known) continue;
    const profit = sell - cost;
    out.push({
      itemId,
      name: recipe.name,
      categoryName: recipe.categoryName,
      groupName: recipe.groupName,
      kind: recipe.kind,
      iconUrl: iconUrl(data.iconByItemId.get(itemId)),
      sellPrice: sell,
      craftCost: cost,
      profit,
      margin: cost > 0 ? profit / cost : 0,
      craftTime: time,
      profitPerHour: time > 0 ? profit / (time / 3600) : 0,
    });
  }
  out.sort((a, b) => b.profitPerHour - a.profitPerHour);
  return out.slice(0, limit);
}
