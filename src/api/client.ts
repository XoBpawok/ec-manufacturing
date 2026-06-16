import type { Blueprint, CraftableItem, GameData, Skill } from "./types";

const BASE = "https://echoes.mobi/api";

const CACHE_KEY = "ec-manufacturing:gamedata:v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 години

// ---- Сирі форми відповідей API (поля приходять рядками) ----

interface RawMaterial {
  id: number;
  name: string;
  type: string;
  quantity: number;
}

interface RawBlueprint {
  item_id: string;
  name: string;
  category_name: string;
  group_name: string;
  output_number: string;
  manufacture_cost: string;
  manufacture_time: string;
  skills: string;
  materials: RawMaterial[];
}

interface RawPrice {
  id: string;
  estimated_price: string | null;
}

interface RawSkill {
  name: string;
  efficiency: string;
  time: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`API ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function parseNumberList(s: string): number[] {
  return s
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => !Number.isNaN(x));
}

function normalize(
  rawBlueprints: RawBlueprint[],
  rawPrices: RawPrice[],
  rawSkills: RawSkill[],
): GameData {
  const blueprintByItemId = new Map<number, Blueprint>();
  const craftables: CraftableItem[] = [];
  for (const r of rawBlueprints) {
    const itemId = Number(r.item_id);
    const bp: Blueprint = {
      itemId,
      name: r.name,
      categoryName: r.category_name,
      groupName: r.group_name,
      outputNumber: Number(r.output_number) || 1,
      manufactureCost: Number(r.manufacture_cost) || 0,
      manufactureTime: Number(r.manufacture_time) || 0,
      skills: r.skills ? r.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
      materials: (r.materials ?? []).map((m) => ({
        id: Number(m.id),
        name: m.name,
        type: m.type,
        quantity: Number(m.quantity),
      })),
    };
    blueprintByItemId.set(itemId, bp);
    craftables.push({
      id: itemId,
      name: bp.name,
      groupName: bp.groupName,
      categoryName: bp.categoryName,
    });
  }
  craftables.sort((a, b) => a.name.localeCompare(b.name));

  const priceByItemId = new Map<number, number>();
  for (const r of rawPrices) {
    if (r.estimated_price != null) {
      priceByItemId.set(Number(r.id), Number(r.estimated_price));
    }
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
    blueprintByItemId,
    priceByItemId,
    skillByName,
    fetchedAt: Date.now(),
  };
}

// ---- Кеш у localStorage ----

interface CachedRaw {
  fetchedAt: number;
  blueprints: RawBlueprint[];
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
  const [blueprints, prices, skills] = await Promise.all([
    getJson<RawBlueprint[]>("/v2/item_blueprints"),
    getJson<RawPrice[]>("/v2/item_prices"),
    getJson<RawSkill[]>("/v2/industry_skills"),
  ]);
  return { fetchedAt: Date.now(), blueprints, prices, skills };
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
  return normalize(raw.blueprints, raw.prices, raw.skills);
}
