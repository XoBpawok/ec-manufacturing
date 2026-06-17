import { useCallback, useEffect, useMemo, useState } from "react";
import { loadGameData } from "../api/client";
import type { GameData } from "../api/types";
import { buildTree, summarizeTree, type BuildNode, type TreeSummary } from "../domain/tree";
import { computeOptimalBuildSet } from "../domain/optimize";

export const NAGLFAR_ITEM_ID = 10701000201;

const PRICE_OVERRIDES_KEY = "ec-manufacturing:priceOverrides:v1";
const CAP_COST_KEY = "ec-manufacturing:capCostReduction:v1";

export function loadPriceOverrides(): Map<number, number> {
  try {
    const raw = localStorage.getItem(PRICE_OVERRIDES_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj).map(([k, v]) => [Number(k), Number(v)]));
  } catch {
    return new Map();
  }
}

export function savePriceOverrides(m: Map<number, number>): void {
  try {
    localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(Object.fromEntries(m)));
  } catch {
    // localStorage недоступний / перевищено квоту — ігноруємо
  }
}

function loadCapCostReduction(): number {
  try {
    const raw = localStorage.getItem(CAP_COST_KEY);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  } catch {
    return 0;
  }
}

function saveCapCostReduction(n: number): void {
  try {
    localStorage.setItem(CAP_COST_KEY, String(n));
  } catch {
    // ігноруємо
  }
}

interface LoadState {
  data: GameData | null;
  loading: boolean;
  error: string | null;
}

export interface Calculator {
  data: GameData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;

  rootItemId: number;
  setRootItemId: (id: number) => void;
  desiredQty: number;
  setDesiredQty: (q: number) => void;

  skillLevels: Map<string, number>;
  setSkillLevel: (name: string, level: number) => void;
  resetSkills: () => void;

  materialEfficiency: number | null;
  setMaterialEfficiency: (value: number | null) => void;

  buildSet: Set<number>;
  toggleBuild: (itemId: number) => void;

  auto: boolean;
  setAuto: (on: boolean) => void;

  priceOverrides: Map<number, number>;
  setPriceOverride: (itemId: number, price: number | null) => void;
  resetPriceOverrides: () => void;

  capComponentCostReduction: number;
  setCapComponentCostReduction: (pct: number) => void;

  tree: BuildNode | null;
  summary: TreeSummary | null;
}

export function useCalculator(): Calculator {
  const [{ data, loading, error }, setLoad] = useState<LoadState>({
    data: null,
    loading: true,
    error: null,
  });

  const [rootItemId, setRootItemId] = useState(NAGLFAR_ITEM_ID);
  const [desiredQty, setDesiredQty] = useState(1);
  const [skillLevels, setSkillLevels] = useState<Map<string, number>>(new Map());
  const [materialEfficiency, setMaterialEfficiency] = useState<number | null>(null);
  const [manualBuildSet, setManualBuildSet] = useState<Set<number>>(new Set());
  const [auto, setAuto] = useState(false);
  const [priceOverrides, setPriceOverrides] = useState<Map<number, number>>(loadPriceOverrides);
  const [capComponentCostReduction, setCapCostReductionState] =
    useState<number>(loadCapCostReduction);

  const doLoad = useCallback((force: boolean) => {
    setLoad({ data: null, loading: true, error: null });
    loadGameData(force)
      .then((d) => setLoad({ data: d, loading: false, error: null }))
      .catch((e: unknown) =>
        setLoad({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) }),
      );
  }, []);

  useEffect(() => {
    doLoad(false);
  }, [doLoad]);

  const refresh = useCallback(() => doLoad(true), [doLoad]);

  useEffect(() => {
    savePriceOverrides(priceOverrides);
  }, [priceOverrides]);

  useEffect(() => {
    saveCapCostReduction(capComponentCostReduction);
  }, [capComponentCostReduction]);

  const setCapComponentCostReduction = useCallback((pct: number) => {
    setCapCostReductionState(Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0)));
  }, []);

  const setSkillLevel = useCallback((name: string, level: number) => {
    setSkillLevels((prev) => {
      const next = new Map(prev);
      next.set(name, level);
      return next;
    });
  }, []);

  const resetSkills = useCallback(() => setSkillLevels(new Map()), []);

  const toggleBuild = useCallback((itemId: number) => {
    setManualBuildSet((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const setPriceOverride = useCallback((itemId: number, price: number | null) => {
    setPriceOverrides((prev) => {
      const next = new Map(prev);
      if (price == null) next.delete(itemId);
      else next.set(itemId, price);
      return next;
    });
  }, []);

  const resetPriceOverrides = useCallback(() => setPriceOverrides(new Map()), []);

  const handleSetRoot = useCallback((id: number) => {
    setRootItemId(id);
    setManualBuildSet(new Set()); // скидаємо розкриття при зміні предмета
  }, []);

  // Коли увімкнено авто — buildSet обчислюється оптимізатором (найдешевше
  // джерело для кожного предмета); інакше використовується ручний набір.
  const buildSet = useMemo(() => {
    if (!data || !data.recipeByItemId.has(rootItemId)) return manualBuildSet;
    if (!auto) return manualBuildSet;
    return computeOptimalBuildSet({
      data,
      rootItemId,
      levels: skillLevels,
      materialEfficiency,
      priceOverrides,
    });
  }, [data, auto, rootItemId, skillLevels, materialEfficiency, priceOverrides, manualBuildSet]);

  const { tree, summary } = useMemo(() => {
    if (!data || !data.recipeByItemId.has(rootItemId)) {
      return { tree: null, summary: null };
    }
    const params = {
      data,
      rootItemId,
      desiredQty,
      levels: skillLevels,
      materialEfficiency,
      buildSet,
      priceOverrides,
      capComponentCostReduction,
    };
    const t = buildTree(params);
    return { tree: t, summary: summarizeTree(t, params) };
  }, [data, rootItemId, desiredQty, skillLevels, materialEfficiency, buildSet, priceOverrides, capComponentCostReduction]);

  return {
    data,
    loading,
    error,
    refresh,
    rootItemId,
    setRootItemId: handleSetRoot,
    desiredQty,
    setDesiredQty,
    skillLevels,
    setSkillLevel,
    resetSkills,
    materialEfficiency,
    setMaterialEfficiency,
    buildSet,
    toggleBuild,
    auto,
    setAuto,
    priceOverrides,
    setPriceOverride,
    resetPriceOverrides,
    capComponentCostReduction,
    setCapComponentCostReduction,
    tree,
    summary,
  };
}
