import { useCallback, useEffect, useMemo, useState } from "react";
import { loadGameData } from "../api/client";
import type { GameData } from "../api/types";
import { buildTree, summarizeTree, type BuildNode, type TreeSummary } from "../domain/tree";

export const NAGLFAR_ITEM_ID = 10701000201;

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

  buildSet: Set<number>;
  toggleBuild: (itemId: number) => void;

  priceOverrides: Map<number, number>;
  setPriceOverride: (itemId: number, price: number | null) => void;

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
  const [buildSet, setBuildSet] = useState<Set<number>>(new Set());
  const [priceOverrides, setPriceOverrides] = useState<Map<number, number>>(new Map());

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

  const setSkillLevel = useCallback((name: string, level: number) => {
    setSkillLevels((prev) => {
      const next = new Map(prev);
      next.set(name, level);
      return next;
    });
  }, []);

  const resetSkills = useCallback(() => setSkillLevels(new Map()), []);

  const toggleBuild = useCallback((itemId: number) => {
    setBuildSet((prev) => {
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

  const handleSetRoot = useCallback((id: number) => {
    setRootItemId(id);
    setBuildSet(new Set()); // скидаємо розкриття при зміні предмета
    setPriceOverrides(new Map());
  }, []);

  const { tree, summary } = useMemo(() => {
    if (!data || !data.blueprintByItemId.has(rootItemId)) {
      return { tree: null, summary: null };
    }
    const params = { data, rootItemId, desiredQty, levels: skillLevels, buildSet, priceOverrides };
    const t = buildTree(params);
    return { tree: t, summary: summarizeTree(t, params) };
  }, [data, rootItemId, desiredQty, skillLevels, buildSet, priceOverrides]);

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
    buildSet,
    toggleBuild,
    priceOverrides,
    setPriceOverride,
    tree,
    summary,
  };
}
