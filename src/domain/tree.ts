import type { Blueprint, GameData } from "../api/types";
import { effectiveQuantity, effectiveTime, type SkillLevels } from "./skills";

export type NodeMode = "build" | "buy";

export interface BuildNode {
  key: string; // унікальний шлях у дереві (для таблиці)
  itemId: number;
  name: string;
  type: string; // тип матеріалу або категорія
  mode: NodeMode;
  craftable: boolean; // чи існує блюпрінт (чи можна перемкнути на build)
  quantity: number; // потрібно одиниць цього предмета в цій позиції (з урахуванням скілів)
  runs: number; // кількість job (тільки build)
  unitPrice: number; // ціна за одиницю (тільки buy)
  priceKnown: boolean; // чи відома ринкова ціна
  buyCost: number; // quantity × unitPrice (тільки buy)
  jobCost: number; // manufactureCost × runs (тільки build)
  jobTime: number; // секунди, effectiveTime × runs (тільки build)
  nodeTotal: number; // повна вартість піддерева
  children: BuildNode[];
}

export interface TreeParams {
  data: GameData;
  rootItemId: number;
  desiredQty: number;
  levels: SkillLevels;
  buildSet: Set<number>; // itemId матеріалів у режимі build (корінь завжди build)
  priceOverrides: Map<number, number>;
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
  const { data, levels, buildSet, priceOverrides } = params;
  const bp = data.blueprintByItemId.get(itemId);
  const craftable = bp != null;

  // Будуємо, лише якщо: режим build, блюпрінт існує і немає циклу.
  const canBuild = mode === "build" && bp != null && !visited.has(itemId);

  if (canBuild) {
    const blueprint = bp as Blueprint;
    const runs = Math.ceil(quantity / blueprint.outputNumber);
    const nextVisited = new Set(visited).add(itemId);
    const children = blueprint.materials.map((m, idx) => {
      const childQty = effectiveQuantity(m.quantity, blueprint, levels, data.skillByName) * runs;
      const childCraftable = data.blueprintByItemId.has(m.id);
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
    const jobCost = blueprint.manufactureCost * runs;
    const jobTime = effectiveTime(blueprint, levels, data.skillByName) * runs;
    const childrenTotal = children.reduce((sum, c) => sum + c.nodeTotal, 0);
    return {
      key: keyPath,
      itemId,
      name,
      type,
      mode: "build",
      craftable,
      quantity,
      runs,
      unitPrice: 0,
      priceKnown: true,
      buyCost: 0,
      jobCost,
      jobTime,
      nodeTotal: childrenTotal + jobCost,
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
    mode: "buy",
    craftable,
    quantity,
    runs: 0,
    unitPrice: price,
    priceKnown: known,
    buyCost,
    jobCost: 0,
    jobTime: 0,
    nodeTotal: buyCost,
    children: [],
  };
}

export function buildTree(params: TreeParams): BuildNode {
  const bp = params.data.blueprintByItemId.get(params.rootItemId);
  const name = bp?.name ?? `#${params.rootItemId}`;
  const type = bp?.categoryName ?? "Невідомо";
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
  runs: number;
  jobCost: number;
  jobTime: number;
}

export interface TreeSummary {
  shoppingList: AggregatedMaterial[]; // усе, що купуємо (buy-вузли), агреговано по предмету
  categorySubtotals: CategorySubtotal[];
  jobs: JobRow[]; // усе, що виробляємо (build-вузли), агреговано по предмету
  totalBuyCost: number;
  totalJobCost: number;
  grandTotal: number;
  totalTime: number;
  buyFinishedCost: number | null; // вартість купити готовий предмет
  relevantSkills: string[]; // скіли, задіяні у build-вузлах
}

/** Обходить дерево й агрегує buy-вузли, build-вузли та підсумки. */
export function summarizeTree(root: BuildNode, params: TreeParams): TreeSummary {
  const buyMap = new Map<number, AggregatedMaterial>();
  const jobMap = new Map<number, JobRow>();
  const skills = new Set<string>();
  let totalBuyCost = 0;
  let totalJobCost = 0;
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
          quantity: node.quantity,
          unitPrice: node.unitPrice,
          priceKnown: node.priceKnown,
          total: node.buyCost,
        });
      }
    } else {
      totalJobCost += node.jobCost;
      totalTime += node.jobTime;
      const bp = params.data.blueprintByItemId.get(node.itemId);
      if (bp) bp.skills.forEach((s) => skills.add(s));
      const acc = jobMap.get(node.itemId);
      if (acc) {
        acc.runs += node.runs;
        acc.jobCost += node.jobCost;
        acc.jobTime += node.jobTime;
      } else {
        jobMap.set(node.itemId, {
          itemId: node.itemId,
          name: node.name,
          runs: node.runs,
          jobCost: node.jobCost,
          jobTime: node.jobTime,
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
    grandTotal: totalBuyCost + totalJobCost,
    totalTime,
    buyFinishedCost,
    relevantSkills: [...skills].sort(),
  };
}
