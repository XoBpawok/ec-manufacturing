import type { CraftableItem, GameData, Recipe, RecipeKind, Skill } from "./types";

// echoes.mobi більше не віддає CORS-заголовки, тож браузер не може тягнути API
// напряму. Дані знімаються серверним снапшотом (scripts/fetch-data.mjs → CI) у
// public/data/*.json і вантажаться звідси same-origin. BASE_URL враховує підшлях
// GitHub Pages (напр. /ec-manufacturing/).
const DATA_BASE = `${import.meta.env.BASE_URL}data`;

const CACHE_KEY = "ec-manufacturing:gamedata:v3";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 години

// ---- Сирі форми відповідей API (поля приходять рядками) ----

interface RawMaterial {
  id: number;
  name: string;
  type: string;
  quantity: number;
}

interface RawRecipe {
  id: string;
  item_id: string;
  name: string;
  category_name: string;
  group_name: string;
  output_number: string;
  manufacture_cost: string;
  manufacture_time: string;
  pass_rate?: number;
  skills: string;
  materials: RawMaterial[];
}

interface RawPrice {
  id: string;
  estimated_price: string | null;
  icon_id: string | null;
}

interface RawSkill {
  name: string;
  efficiency: string;
  time: string;
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}/${file}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`data ${file} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function parseNumberList(s: string): number[] {
  return s
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => !Number.isNaN(x));
}

function toRecipe(r: RawRecipe, kind: RecipeKind): Recipe {
  return {
    itemId: Number(r.item_id),
    blueprintId: Number(r.id),
    name: r.name,
    categoryName: r.category_name,
    groupName: r.group_name,
    kind,
    outputNumber: Number(r.output_number) || 1,
    manufactureCost: Number(r.manufacture_cost) || 0,
    manufactureTime: Number(r.manufacture_time) || 0,
    passRate: kind === "reverse" ? Number(r.pass_rate) || 1 : 1,
    skills: r.skills ? r.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
    materials: (r.materials ?? []).map((m) => ({
      id: Number(m.id),
      name: m.name,
      type: m.type,
      quantity: Number(m.quantity),
    })),
  };
}

function normalize(
  rawBlueprints: RawRecipe[],
  rawReverse: RawRecipe[],
  rawPrices: RawPrice[],
  rawSkills: RawSkill[],
): GameData {
  const recipeByItemId = new Map<number, Recipe>();
  const craftables: CraftableItem[] = [];
  const addRecipe = (r: RawRecipe, kind: RecipeKind) => {
    const recipe = toRecipe(r, kind);
    // Множини рецептів не перетинаються; на випадок дубля — не перезаписуємо.
    if (recipeByItemId.has(recipe.itemId)) return;
    recipeByItemId.set(recipe.itemId, recipe);
    craftables.push({
      id: recipe.itemId,
      name: recipe.name,
      groupName: recipe.groupName,
      categoryName: recipe.categoryName,
    });
  };
  rawBlueprints.forEach((r) => addRecipe(r, "manufacture"));
  rawReverse.forEach((r) => addRecipe(r, "reverse"));
  craftables.sort((a, b) => a.name.localeCompare(b.name));

  const priceByItemId = new Map<number, number>();
  const iconByItemId = new Map<number, number>();
  for (const r of rawPrices) {
    const id = Number(r.id);
    if (r.estimated_price != null) priceByItemId.set(id, Number(r.estimated_price));
    if (r.icon_id != null) iconByItemId.set(id, Number(r.icon_id));
  }

  const skillByName = new Map<string, Skill>();
  for (const r of rawSkills) {
    skillByName.set(r.name, {
      name: r.name,
      efficiency: parseNumberList(r.efficiency),
      time: parseNumberList(r.time),
    });
  }

  return {
    craftables,
    recipeByItemId,
    priceByItemId,
    iconByItemId,
    skillByName,
    fetchedAt: Date.now(),
  };
}

// ---- Кеш у localStorage ----

interface CachedRaw {
  fetchedAt: number;
  blueprints: RawRecipe[];
  reverse: RawRecipe[];
  prices: RawPrice[];
  skills: RawSkill[];
}

function readCache(): CachedRaw | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRaw;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(c: CachedRaw): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // кеш необовʼязковий (напр. перевищено квоту) — ігноруємо
  }
}

async function fetchRaw(): Promise<CachedRaw> {
  const [blueprints, reverse, prices, skills] = await Promise.all([
    getJson<RawRecipe[]>("item_blueprints.json"),
    getJson<RawRecipe[]>("item_reverse_engineering.json"),
    getJson<RawPrice[]>("item_prices.json"),
    getJson<RawSkill[]>("industry_skills.json"),
  ]);
  return { fetchedAt: Date.now(), blueprints, reverse, prices, skills };
}

/**
 * Завантажує всі дані гри. Використовує кеш localStorage, якщо він свіжий
 * і не передано forceRefresh.
 */
export async function loadGameData(forceRefresh = false): Promise<GameData> {
  let raw = forceRefresh ? null : readCache();
  if (!raw) {
    raw = await fetchRaw();
    writeCache(raw);
  }
  return normalize(raw.blueprints, raw.reverse, raw.prices, raw.skills);
}
