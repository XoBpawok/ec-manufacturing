import type { GameData, Recipe, RecipeKind } from "../api/types";
import { iconUrl } from "../api/types";
import { effectiveTime, materialFactor, type SkillLevels } from "./skills";

/** Material type for capital components (value from echoes.mobi blueprints). */
export const CAPITAL_COMPONENT_TYPE = "Capital Construction Components";

export type NodeMode = "build" | "buy";

export interface BuildNode {
  key: string; // unique path in the tree (for the table)
  itemId: number;
  name: string;
  type: string; // material type or category
  iconUrl?: string;
  mode: NodeMode;
  craftable: boolean; // whether a recipe exists (whether it can be switched to build)
  recipeKind: RecipeKind | null; // recipe kind when crafted
  passRate: number; // recipe success probability (1 for manufacturing)
  quantity: number; // units of this item needed at this position (skills applied)
  runs: number; // number of successful jobs (build only)
  attempts: number; // expected number of attempts = runs / passRate (build only)
  unitPrice: number; // price per unit (buy only)
  priceKnown: boolean; // whether the market price is known
  buyCost: number; // quantity × unitPrice (buy only)
  jobCost: number; // manufactureCost × attempts × costFactor (Capital Components discounted) (build only)
  jobTime: number; // seconds, effectiveTime × attempts (build only)
  isBlueprint: boolean; // whether this node is a blueprint consumed by the parent manufacture job
  nodeTotal: number; // full subtree cost
  children: BuildNode[];
}

export interface TreeParams {
  data: GameData;
  rootItemId: number;
  desiredQty: number;
  levels: SkillLevels;
  materialEfficiency: number | null; // manual ME (%, 100 = blueprint base), null = by skills
  buildSet: Set<number>; // itemId of items in build mode (root is always build)
  priceOverrides: Map<number, number>;
  capComponentCostReduction: number; // % reduction of ISK job cost for Capital Components (0–100)
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
  isBlueprint = false,
): BuildNode {
  const { data, levels, materialEfficiency, buildSet, priceOverrides, capComponentCostReduction } =
    params;
  const recipe = data.recipeByItemId.get(itemId);
  const craftable = recipe != null;
  const icon = iconUrl(data.iconByItemId.get(itemId));

  // Build only if: build mode, a recipe exists, and there is no cycle.
  const canBuild = mode === "build" && recipe != null && !visited.has(itemId);

  if (canBuild) {
    const r = recipe as Recipe;
    const runs = Math.ceil(quantity / r.outputNumber);
    const attempts = r.kind === "reverse" ? runs / r.passRate : runs;
    const nextVisited = new Set(visited).add(itemId);
    const children = r.materials.map((m, idx) => {
      // Manufacture: efficiency skills reduce quantity, rounded once over the whole
      // job (runs × baseQuantity × factor), not per run — matches EVE's "per job"
      // rounding, where batching several runs together can save fractional units.
      // Reverse: materials are consumed per attempt → × attempts.
      const childQty =
        r.kind === "manufacture"
          ? Math.ceil(m.quantity * materialFactor(r, levels, data.skillByName, materialEfficiency) * runs)
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

    // A manufacture job consumes a blueprint (one per attempt). Reverse does NOT
    // consume blueprints (it produces them from datacores), so for kind === "reverse"
    // no blueprint node is added — this also fixes the blueprintId self-reference.
    if (r.kind === "manufacture") {
      const bpId = r.blueprintId;
      const bpRecipe = data.recipeByItemId.get(bpId);
      const bpCraftable = bpRecipe != null;
      const bpPrice = priceFor(bpId, data, priceOverrides);
      // Show the blueprint only if it is craftable or has a known price;
      // otherwise (no recipe and no price) the contribution is 0, as before.
      if (bpCraftable || bpPrice.known) {
        const bpName = bpRecipe?.name ?? `${name} Blueprint`;
        const bpType = bpRecipe?.categoryName ?? "Blueprint";
        const bpMode: NodeMode = buildSet.has(bpId) && bpCraftable ? "build" : "buy";
        children.push(
          buildNode(bpId, bpName, bpType, attempts, bpMode, `${keyPath}/bp:${bpId}`, params, nextVisited, true),
        );
      }
    }

    const pct = Math.min(100, Math.max(0, capComponentCostReduction));
    const costFactor = type === CAPITAL_COMPONENT_TYPE ? 1 - pct / 100 : 1;
    const jobCost = r.manufactureCost * attempts * costFactor;
    const jobTime = effectiveTime(r, levels, data.skillByName) * attempts;
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
      isBlueprint,
      nodeTotal: childrenTotal + jobCost,
      children,
    };
  }

  // Buy mode (or not craftable / cycle).
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
    isBlueprint,
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

// ---- Aggregations ----

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
}

export interface TreeSummary {
  shoppingList: AggregatedMaterial[]; // materials we buy (buy nodes, excluding blueprints)
  categorySubtotals: CategorySubtotal[];
  jobs: JobRow[]; // everything we produce (build nodes), aggregated by item
  totalBuyCost: number; // bought materials (excluding blueprints)
  totalJobCost: number; // cost of all jobs (including reverse of crafted blueprints)
  totalBlueprintCost: number; // cost of bought blueprints
  grandTotal: number;
  totalTime: number;
  buyFinishedCost: number | null; // cost to buy the finished item
  relevantSkills: string[]; // industry skills involved in build nodes
}

/** Walks the tree and aggregates buy nodes, build nodes and subtotals. */
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
      // Bought blueprints go into a separate bucket; not added to the material list.
      if (node.isBlueprint) {
        totalBlueprintCost += node.buyCost;
        return;
      }
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
      totalTime += node.jobTime;
      const recipe = params.data.recipeByItemId.get(node.itemId);
      if (recipe) recipe.skills.forEach((s) => { if (params.data.skillByName.has(s)) skills.add(s); });
      const acc = jobMap.get(node.itemId);
      if (acc) {
        acc.runs += node.runs;
        acc.jobCost += node.jobCost;
        acc.jobTime += node.jobTime;
      } else {
        jobMap.set(node.itemId, {
          itemId: node.itemId,
          name: node.name,
          iconUrl: node.iconUrl,
          kind: node.recipeKind ?? "manufacture",
          runs: node.runs,
          jobCost: node.jobCost,
          jobTime: node.jobTime,
        });
      }
      node.children.forEach(walk);
    }
  };
  walk(root);

  const shoppingList = [...buyMap.values()].sort((a, b) => a.itemId - b.itemId);

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

  // Finished-item market price, with a user override taking priority (same as
  // any material). Drives the "market price" card and the craft-vs-buy savings.
  const finished = priceFor(params.rootItemId, params.data, params.priceOverrides);
  const buyFinishedCost = finished.known
    ? finished.price * Math.max(1, params.desiredQty)
    : null;

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

/** Set of all craftable items in the root's subtree (for "build everything"). */
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
