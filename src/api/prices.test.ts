import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ select: selectMock, upsert: upsertMock }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}));

// localStorage-шим для node-середовища vitest
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

import { fetchPrices, upsertPrice, pricesConfigured } from "./prices";

beforeEach(() => {
  store.clear();
  upsertMock.mockReset();
  selectMock.mockReset();
  fromMock.mockClear();
  vi.unstubAllEnvs();
});

describe("pricesConfigured", () => {
  it("true лише коли задані обидві env-змінні", () => {
    expect(pricesConfigured()).toBe(false);
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    expect(pricesConfigured()).toBe(true);
  });
});

describe("fetchPrices", () => {
  it("мапить рядки з Supabase і пише кеш", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    selectMock.mockResolvedValue({
      data: [{ item_id: 34, price: 5.5, updated_at: "2026-06-18T00:00:00.000Z" }],
      error: null,
    });
    const map = await fetchPrices();
    expect(map.get(34)).toEqual({ price: 5.5, updatedAt: "2026-06-18T00:00:00.000Z" });
    expect(localStorage.getItem("ec-manufacturing:priceOverrides:v1")).toContain("34");
  });

  it("без env читає localStorage-кеш", async () => {
    localStorage.setItem("ec-manufacturing:priceOverrides:v1", JSON.stringify({ "34": 7 }));
    localStorage.setItem(
      "ec-manufacturing:priceOverridesMeta:v1",
      JSON.stringify({ "34": "2026-06-10T00:00:00.000Z" }),
    );
    const map = await fetchPrices();
    expect(map.get(34)).toEqual({ price: 7, updatedAt: "2026-06-10T00:00:00.000Z" });
  });

  it("при помилці запиту відкочується на кеш", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    localStorage.setItem("ec-manufacturing:priceOverrides:v1", JSON.stringify({ "9": 3 }));
    selectMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const map = await fetchPrices();
    expect(map.get(9)?.price).toBe(3);
  });
});

describe("upsertPrice", () => {
  it("пише в Supabase з updated_at і повертає entry", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    upsertMock.mockResolvedValue({ error: null });
    const entry = await upsertPrice(34, 12);
    expect(entry.price).toBe(12);
    expect(typeof entry.updatedAt).toBe("string");
    const arg = upsertMock.mock.calls[0][0];
    expect(arg).toMatchObject({ item_id: 34, price: 12 });
    expect(arg.updated_at).toBe(entry.updatedAt);
  });
});
