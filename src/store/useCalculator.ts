import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadGameData } from "../api/client";
import type { GameData } from "../api/types";
import { buildTree, summarizeTree, type BuildNode, type TreeSummary } from "../domain/tree";
import { computeOptimalBuildSet } from "../domain/optimize";
import { usePrices } from "./usePrices";
import type { PriceEntry } from "../api/prices";

export const NAGLFAR_ITEM_ID = 10701000201;

const CAP_COST_KEY = "ec-manufacturing:capCostReduction:v1";
const RATING_DISABLED_CATEGORIES_KEY = "ec-manufacturing:ratingDisabledCategories:v1";
const ROOT_ITEM_ID_KEY = "ec-manufacturing:rootItemId:v1";
const SKILL_LEVELS_KEY = "ec-manufacturing:skillLevels:v1";

function loadRootItemId(): number | null {
  try {
    const raw = localStorage.getItem(ROOT_ITEM_ID_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function saveRootItemId(id: number): void {
  try {
    localStorage.setItem(ROOT_ITEM_ID_KEY, String(id));
  } catch {
    // ignore
  }
}

function loadSkillLevels(): Map<string, number> {
  try {
    const raw = localStorage.getItem(SKILL_LEVELS_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj).filter(([, v]) => Number.isFinite(v)));
  } catch {
    return new Map();
  }
}

function saveSkillLevels(levels: Map<string, number>): void {
  try {
    localStorage.setItem(SKILL_LEVELS_KEY, JSON.stringify(Object.fromEntries(levels)));
  } catch {
    // ignore
  }
}

/** Categories disabled on the rating page. Empty = all enabled. */
export function loadDisabledCategories(): Set<string> {
  try {
    const raw = localStorage.getItem(RATING_DISABLED_CATEGORIES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveDisabledCategories(s: Set<string>): void {
  try {
    localStorage.setItem(RATING_DISABLED_CATEGORIES_KEY, JSON.stringify([...s]));
  } catch {
    // localStorage unavailable / quota exceeded — ignore
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
    // ignore
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
  priceMeta: Map<number, PriceEntry>;
  pricesLoading: boolean;
  setPriceOverride: (itemId: number, price: number) => void;

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

  // Preselect an item passed from the rating page (#/?item=<id>); otherwise restore
  // the last-used item from localStorage so refresh/navigation keeps your place.
  const [searchParams] = useSearchParams();
  const [rootItemId, setRootItemId] = useState(() => {
    const raw = searchParams.get("item");
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    return loadRootItemId() ?? NAGLFAR_ITEM_ID;
  });
  const [desiredQty, setDesiredQty] = useState(1);
  const [skillLevels, setSkillLevels] = useState<Map<string, number>>(loadSkillLevels);
  const [materialEfficiency, setMaterialEfficiency] = useState<number | null>(null);
  const [manualBuildSet, setManualBuildSet] = useState<Set<number>>(new Set());
  const [auto, setAuto] = useState(false);
  const { priceOverrides, priceMeta, pricesLoading, setPriceOverride } = usePrices();
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

  useEffect(() => {
    saveRootItemId(rootItemId);
  }, [rootItemId]);

  const refresh = useCallback(() => doLoad(true), [doLoad]);

  useEffect(() => {
    saveCapCostReduction(capComponentCostReduction);
  }, [capComponentCostReduction]);

  useEffect(() => {
    saveSkillLevels(skillLevels);
  }, [skillLevels]);

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

  const handleSetRoot = useCallback((id: number) => {
    setRootItemId(id);
    setManualBuildSet(new Set()); // reset expansion when the item changes
  }, []);

  // When auto is on, buildSet is computed by the optimizer (cheapest source for
  // each item); otherwise the manual set is used.
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
    priceMeta,
    pricesLoading,
    setPriceOverride,
    capComponentCostReduction,
    setCapComponentCostReduction,
    tree,
    summary,
  };
}
