import type { GameData, Recipe, RecipeKind } from "../api/types";
import { iconUrl } from "../api/types";
import { effectiveQuantity, effectiveTime, type SkillLevels } from "./skills";

/** Тип матеріалу для капітальних компонентів (значення з блюпрінтів echoes.mobi). */
export const CAPITAL_COMPONENT_TYPE = "Capital Construction Components";

export type NodeMode = "build" | "buy";

export interface BuildNode {
  key: string; // унікальний шлях у дереві (для таблиці)
  itemId: number;
  name: string;
  type: string; // тип матеріалу або категорія
  iconUrl?: string;
  mode: NodeMode;
  craftable: boolean; // чи існує рецепт (чи можна перемкнути на build)
  recipeKind: RecipeKind | null; // тип рецепту, коли крафтиться
  passRate: number; // ймовірність успіху рецепту (1 для виробництва)
  quantity: number; // потрібно одиниць цього предмета в цій позиції (з урахуванням скілів)
  runs: number; // кількість успішних job (тільки build)
  attempts: number; // очікувана кількість спроб = runs / passRate (тільки build)
  unitPrice: number; // ціна за одиницю (тільки buy)
  priceKnown: boolean; // чи відома ринкова ціна
  buyCost: number; // quantity × unitPrice (тільки buy)
  jobCost: number; // manufactureCost × attempts × costFactor (Capital Components зі знижкою) (тільки build)
  jobTime: number; // секунди, effectiveTime × attempts (тільки build)
  blueprintUnitPrice: number; // ціна одного блюпрінта (0 для buy-вузла)
  blueprintPriceKnown: boolean; // чи відома ринкова ціна блюпрінта
  blueprintCost: number; // blueprintUnitPrice × attempts (0 для buy-вузла)
  nodeTotal: number; // повна вартість піддерева
  children: BuildNode[];
}

export interface TreeParams {
  data: GameData;
  rootItemId: number;
  desiredQty: number;
  levels: SkillLevels;
  materialEfficiency: number | null; // ручне ME (%, 100 = база блюпрінта), null = за скілами
  buildSet: Set<number>; // itemId предметів у режимі build (корінь завжди build)
  priceOverrides: Map<number, number>;
  capComponentCostReduction: number; // % зниження ISK-вартості job для Capital Components (0–100)
}

function priceFor(
  itemId: number,
  data: GameData,
  overrides: Map<number, number>,
): { price: number; known: boolean } {
  if (overrides.has(itemId)) return { price: overrides.get(itemId)!, known: true };
  const est = data.priceByItemId.get(itemId);
  if (est != null) return { price: est, known: true };
  return { price: 0, known: false };
}

function buildNode(
  itemId: number,
  name: string,
  type: string,
  quantity: number,
  mode: NodeMode,
  keyPath: string,
  params: TreeParams,
  visited: Set<number>,
): BuildNode {
  const { data, levels, materialEfficiency, buildSet, priceOverrides, capComponentCostReduction } =
    params;
  const recipe = data.recipeByItemId.get(itemId);
  const craftable = recipe != null;
  const icon = iconUrl(data.iconByItemId.get(itemId));

  // Будуємо, лише якщо: режим build, рецепт існує і немає циклу.
  const canBuild = mode === "build" && recipe != null && !visited.has(itemId);

  if (canBuild) {
    const r = recipe as Recipe;
    const runs = Math.ceil(quantity / r.outputNumber);
    const attempts = r.kind === "reverse" ? runs / r.passRate : runs;
    const nextVisited = new Set(visited).add(itemId);
    const children = r.materials.map((m, idx) => {
      // Виробництво: скіли efficiency зменшують кількість (на job), × runs.
      // Реверс: матеріали споживаються за кожну спробу → × attempts.
      const childQty =
        r.kind === "manufacture"
          ? effectiveQuantity(m.quantity, r, levels, data.skillByName, materialEfficiency) * runs
          : Math.ceil(m.quantity * attempts);
      const childCraftable = data.recipeByItemId.has(m.id);
      const childMode: NodeMode = buildSet.has(m.id) && childCraftable ? "build" : "buy";
      return buildNode(
        m.id,
        m.name,
        m.type,
        childQty,
        childMode,
        `${keyPath}/${idx}:${m.id}`,
        params,
        nextVisited,
      );
    });
    const pct = Math.min(100, Math.max(0, capComponentCostReduction));
    const costFactor = type === CAPITAL_COMPONENT_TYPE ? 1 - pct / 100 : 1;
    const jobCost = r.manufactureCost * attempts * costFactor;
    const jobTime = effectiveTime(r, levels, data.skillByName) * attempts;
    const bp = priceFor(r.blueprintId, data, priceOverrides);
    const blueprintCost = bp.price * attempts;
    const childrenTotal = children.reduce((sum, c) => sum + c.nodeTotal, 0);
    return {
      key: keyPath,
      itemId,
      name,
      type,
      iconUrl: icon,
      mode: "build",
      craftable,
      recipeKind: r.kind,
      passRate: r.passRate,
      quantity,
      runs,
      attempts,
      unitPrice: 0,
      priceKnown: true,
      buyCost: 0,
      jobCost,
      jobTime,
      blueprintUnitPrice: bp.price,
      blueprintPriceKnown: bp.known,
      blueprintCost,
      nodeTotal: childrenTotal + jobCost + blueprintCost,
      children,
    };
  }

  // Режим buy (або не craftable / цикл).
  const { price, known } = priceFor(itemId, data, priceOverrides);
  const buyCost = quantity * price;
  return {
    key: keyPath,
    itemId,
    name,
    type,
    iconUrl: icon,
    mode: "buy",
    craftable,
    recipeKind: null,
    passRate: 1,
    quantity,
    runs: 0,
    attempts: 0,
    unitPrice: price,
    priceKnown: known,
    buyCost,
    jobCost: 0,
    jobTime: 0,
    blueprintUnitPrice: 0,
    blueprintPriceKnown: true,
    blueprintCost: 0,
    nodeTotal: buyCost,
    children: [],
  };
}

export function buildTree(params: TreeParams): BuildNode {
  const recipe = params.data.recipeByItemId.get(params.rootItemId);
  const name = recipe?.name ?? `#${params.rootItemId}`;
  const type = recipe?.categoryName ?? "Невідомо";
  return buildNode(
    params.rootItemId,
    name,
    type,
    Math.max(1, params.desiredQty),
    "build",
    `${params.rootItemId}`,
    params,
    new Set(),
  );
}

// ---- Агрегації ----

export interface AggregatedMaterial {
  itemId: number;
  name: string;
  type: string;
  iconUrl?: string;
  quantity: number;
  unitPrice: number;
  priceKnown: boolean;
  total: number;
}

export interface CategorySubtotal {
  type: string;
  quantity: number;
  total: number;
}

export interface JobRow {
  itemId: number;
  name: string;
  iconUrl?: string;
  kind: RecipeKind;
  runs: number;
  jobCost: number;
  jobTime: number;
  blueprintId: number;
  blueprintUnitPrice: number;
  blueprintPriceKnown: boolean;
  blueprintCost: number;
}

export interface TreeSummary {
  shoppingList: AggregatedMaterial[]; // усе, що купуємо (buy-вузли), агреговано по предмету
  categorySubtotals: CategorySubtotal[];
  jobs: JobRow[]; // усе, що виробляємо (build-вузли), агреговано по предмету
  totalBuyCost: number;
  totalJobCost: number;
  totalBlueprintCost: number;
  grandTotal: number;
  totalTime: number;
  buyFinishedCost: number | null; // вартість купити готовий предмет
  relevantSkills: string[]; // індустрі-скіли, задіяні у build-вузлах
}

/** Обходить дерево й агрегує buy-вузли, build-вузли та підсумки. */
export function summarizeTree(root: BuildNode, params: TreeParams): TreeSummary {
  const buyMap = new Map<number, AggregatedMaterial>();
  const jobMap = new Map<number, JobRow>();
  const skills = new Set<string>();
  let totalBuyCost = 0;
  let totalJobCost = 0;
  let totalBlueprintCost = 0;
  let totalTime = 0;

  const walk = (node: BuildNode): void => {
    if (node.mode === "buy") {
      totalBuyCost += node.buyCost;
      const acc = buyMap.get(node.itemId);
      if (acc) {
        acc.quantity += node.quantity;
        acc.total += node.buyCost;
      } else {
        buyMap.set(node.itemId, {
          itemId: node.itemId,
          name: node.name,
          type: node.type,
          iconUrl: node.iconUrl,
          quantity: node.quantity,
          unitPrice: node.unitPrice,
          priceKnown: node.priceKnown,
          total: node.buyCost,
        });
      }
    } else {
      totalJobCost += node.jobCost;
      totalBlueprintCost += node.blueprintCost;
      totalTime += node.jobTime;
      const recipe = params.data.recipeByItemId.get(node.itemId);
      if (recipe) recipe.skills.forEach((s) => { if (params.data.skillByName.has(s)) skills.add(s); });
      const acc = jobMap.get(node.itemId);
      if (acc) {
        acc.runs += node.runs;
        acc.jobCost += node.jobCost;
        acc.jobTime += node.jobTime;
        acc.blueprintCost += node.blueprintCost;
      } else {
        jobMap.set(node.itemId, {
          itemId: node.itemId,
          name: node.name,
          iconUrl: node.iconUrl,
          kind: node.recipeKind ?? "manufacture",
          runs: node.runs,
          jobCost: node.jobCost,
          jobTime: node.jobTime,
          blueprintId: params.data.recipeByItemId.get(node.itemId)?.blueprintId ?? 0,
          blueprintUnitPrice: node.blueprintUnitPrice,
          blueprintPriceKnown: node.blueprintPriceKnown,
          blueprintCost: node.blueprintCost,
        });
      }
      node.children.forEach(walk);
    }
  };
  walk(root);

  const shoppingList = [...buyMap.values()].sort((a, b) => b.total - a.total);

  const catMap = new Map<string, CategorySubtotal>();
  for (const m of shoppingList) {
    const acc = catMap.get(m.type);
    if (acc) {
      acc.quantity += m.quantity;
      acc.total += m.total;
    } else {
      catMap.set(m.type, { type: m.type, quantity: m.quantity, total: m.total });
    }
  }
  const categorySubtotals = [...catMap.values()].sort((a, b) => b.total - a.total);

  const jobs = [...jobMap.values()].sort((a, b) => b.jobCost - a.jobCost);

  const est = params.data.priceByItemId.get(params.rootItemId);
  const buyFinishedCost = est != null ? est * Math.max(1, params.desiredQty) : null;

  return {
    shoppingList,
    categorySubtotals,
    jobs,
    totalBuyCost,
    totalJobCost,
    totalBlueprintCost,
    grandTotal: totalBuyCost + totalJobCost + totalBlueprintCost,
    totalTime,
    buyFinishedCost,
    relevantSkills: [...skills].sort(),
  };
}

/** Набір усіх craftable-предметів у піддереві кореня (для «будувати все»). */
export function fullBuildSet(data: GameData, rootItemId: number): Set<number> {
  const set = new Set<number>();
  const walk = (id: number, visited: Set<number>): void => {
    const recipe = data.recipeByItemId.get(id);
    if (!recipe) return;
    for (const m of recipe.materials) {
      if (data.recipeByItemId.has(m.id) && !visited.has(m.id)) {
        set.add(m.id);
        walk(m.id, new Set(visited).add(m.id));
      }
    }
  };
  walk(rootItemId, new Set([rootItemId]));
  return set;
}
