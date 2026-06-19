import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PriceEntry {
  price: number;
  updatedAt: string;
}
export type PriceMap = Map<number, PriceEntry>;

const PRICES_KEY = "ec-manufacturing:priceOverrides:v1";
const META_KEY = "ec-manufacturing:priceOverridesMeta:v1";
const TABLE = "prices";

function url(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL as string | undefined;
}
function anon(): string | undefined {
  return import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
}

export function pricesConfigured(): boolean {
  return Boolean(url() && anon());
}

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!client) client = createClient(url()!, anon()!);
  return client;
}

function readCache(): PriceMap {
  const map: PriceMap = new Map();
  try {
    const prices = JSON.parse(localStorage.getItem(PRICES_KEY) ?? "{}") as Record<string, number>;
    const meta = JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Record<string, string>;
    for (const [k, v] of Object.entries(prices)) {
      map.set(Number(k), {
        price: Number(v),
        // немає мета-таймстемпу (старий localStorage-override до фічі шаред-цін) —
        // ставимо "зараз", щоб не показувати хибну тривожно-червону позначку "оновлено N днів тому"
        updatedAt: meta[k] ?? new Date().toISOString(),
      });
    }
  } catch {
    // пошкоджений кеш — повертаємо порожньо
  }
  return map;
}

function writeCache(map: PriceMap): void {
  try {
    const prices: Record<string, number> = {};
    const meta: Record<string, string> = {};
    for (const [id, e] of map) {
      prices[id] = e.price;
      meta[id] = e.updatedAt;
    }
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // localStorage недоступний — ігноруємо
  }
}

export async function fetchPrices(): Promise<PriceMap> {
  if (!pricesConfigured()) return readCache();
  try {
    const { data, error } = await getClient().from(TABLE).select("item_id, price, updated_at");
    if (error) throw new Error(error.message);
    const map: PriceMap = new Map();
    for (const row of (data ?? []) as Array<{ item_id: number; price: number; updated_at: string }>) {
      map.set(Number(row.item_id), { price: Number(row.price), updatedAt: row.updated_at });
    }
    writeCache(map);
    return map;
  } catch {
    return readCache();
  }
}

export async function upsertPrice(itemId: number, price: number): Promise<PriceEntry> {
  const entry: PriceEntry = { price, updatedAt: new Date().toISOString() };
  if (pricesConfigured()) {
    const { error } = await getClient()
      .from(TABLE)
      .upsert(
        { item_id: itemId, price, updated_at: entry.updatedAt },
        { onConflict: "item_id" },
      );
    if (error) throw new Error(error.message);
  }
  const cache = readCache();
  cache.set(itemId, entry);
  writeCache(cache);
  return entry;
}
