# GitHub Pages + спільні ціни (Supabase) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Захостити SPA на GitHub Pages і перенести введені ціни з localStorage у спільну глобальну базу Supabase з індикатором свіжості, прибравши будь-яке скидання цін.

**Architecture:** Чисті модулі `freshness.ts` (колір/лейбл за віком) і `prices.ts` (Supabase-клієнт + localStorage-fallback) тестуються ізольовано. Спільний хук `usePrices` тримає `priceOverrides`/`priceMeta` і вживається і калькулятором, і рейтингом. Доменний інтерфейс `priceOverrides: Map<number, number>` не змінюється. Деплой — статичний білд Vite через GitHub Actions, роутинг через `HashRouter`.

**Tech Stack:** Vite + React + TS, Ant Design, `@supabase/supabase-js`, Vitest, GitHub Actions / Pages.

## Global Constraints

- Доменний інтерфейс `priceOverrides: Map<number, number>` зберігається незмінним — `domain/tree.ts`, `domain/optimize.ts`, `domain/rating.ts` НЕ чіпати.
- Скидання цін прибрано повністю: немає reset-кнопок, немає поштучного «повернути ринкову», `setPriceOverride` приймає лише `(itemId: number, price: number)` (без `null`).
- Усюди, де показано кастомну ціну, поряд показувати ринкову ціну + індикатор свіжості.
- Свіжість: ≤3 дні зелений `#52c41a` (rgb 82,196,26) → ≥15 днів червоний `#ff4d4f` (rgb 255,77,79), лінійна RGB-інтерполяція між ними.
- localStorage ключі: `ec-manufacturing:priceOverrides:v1` (ціни) і `ec-manufacturing:priceOverridesMeta:v1` (мітки часу).
- Anon-ключ Supabase — публічний (передається через GitHub repository Variables), захист лише через RLS.
- Коментарі та UI-тексти українською (відповідно до наявного коду).

---

### Task 1: Чистий модуль свіжості `freshness.ts`

**Files:**
- Create: `src/domain/freshness.ts`
- Test: `src/domain/freshness.test.ts`

**Interfaces:**
- Produces:
  - `ageInDays(updatedAt: string, now?: Date): number`
  - `freshnessColor(updatedAt: string, now?: Date): string` — `"rgb(r, g, b)"`
  - `freshnessLabel(updatedAt: string, now?: Date): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/freshness.test.ts
import { describe, it, expect } from "vitest";
import { ageInDays, freshnessColor, freshnessLabel } from "./freshness";

const NOW = new Date("2026-06-19T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("ageInDays", () => {
  it("рахує вік у днях", () => {
    expect(ageInDays(daysAgo(5), NOW)).toBeCloseTo(5, 6);
    expect(ageInDays(daysAgo(0), NOW)).toBeCloseTo(0, 6);
  });
});

describe("freshnessColor", () => {
  it("зелений до 3 днів включно", () => {
    expect(freshnessColor(daysAgo(0), NOW)).toBe("rgb(82, 196, 26)");
    expect(freshnessColor(daysAgo(3), NOW)).toBe("rgb(82, 196, 26)");
  });
  it("червоний від 15 днів і далі", () => {
    expect(freshnessColor(daysAgo(15), NOW)).toBe("rgb(255, 77, 79)");
    expect(freshnessColor(daysAgo(30), NOW)).toBe("rgb(255, 77, 79)");
  });
  it("проміжний колір на 9 днів (середина)", () => {
    expect(freshnessColor(daysAgo(9), NOW)).toBe("rgb(169, 137, 53)");
  });
});

describe("freshnessLabel", () => {
  it("форматує вік", () => {
    expect(freshnessLabel(daysAgo(0), NOW)).toBe("оновлено сьогодні");
    expect(freshnessLabel(daysAgo(1), NOW)).toBe("оновлено вчора");
    expect(freshnessLabel(daysAgo(7), NOW)).toBe("оновлено 7 дн. тому");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/freshness.test.ts`
Expected: FAIL — модуль `./freshness` не існує.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/freshness.ts
const DAY_MS = 86_400_000;
const GREEN = { r: 0x52, g: 0xc4, b: 0x1a }; // #52c41a
const RED = { r: 0xff, g: 0x4d, b: 0x4f }; // #ff4d4f
const FRESH_DAYS = 3;
const STALE_DAYS = 15;

export function ageInDays(updatedAt: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(updatedAt).getTime()) / DAY_MS;
}

export function freshnessColor(updatedAt: string, now: Date = new Date()): string {
  const days = ageInDays(updatedAt, now);
  const t = Math.min(1, Math.max(0, (days - FRESH_DAYS) / (STALE_DAYS - FRESH_DAYS)));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(GREEN.r, RED.r)}, ${lerp(GREEN.g, RED.g)}, ${lerp(GREEN.b, RED.b)})`;
}

export function freshnessLabel(updatedAt: string, now: Date = new Date()): string {
  const days = Math.floor(ageInDays(updatedAt, now));
  if (days <= 0) return "оновлено сьогодні";
  if (days === 1) return "оновлено вчора";
  return `оновлено ${days} дн. тому`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/freshness.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/freshness.ts src/domain/freshness.test.ts
git commit -m "feat: freshness color/label helpers for price age"
```

---

### Task 2: Шар даних `prices.ts` (Supabase + localStorage fallback)

**Files:**
- Modify: `package.json` (додати залежність)
- Create: `src/api/prices.ts`
- Test: `src/api/prices.test.ts`

**Interfaces:**
- Produces:
  - `interface PriceEntry { price: number; updatedAt: string }`
  - `type PriceMap = Map<number, PriceEntry>`
  - `pricesConfigured(): boolean`
  - `fetchPrices(): Promise<PriceMap>`
  - `upsertPrice(itemId: number, price: number): Promise<PriceEntry>`

- [ ] **Step 1: Add dependency**

Run: `npm install @supabase/supabase-js`
Expected: `@supabase/supabase-js` з'являється у `dependencies` package.json.

- [ ] **Step 2: Write the failing test**

```ts
// src/api/prices.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/api/prices.test.ts`
Expected: FAIL — модуль `./prices` не існує.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/api/prices.ts
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
        updatedAt: meta[k] ?? new Date(0).toISOString(),
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/api/prices.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/api/prices.ts src/api/prices.test.ts
git commit -m "feat: prices data layer over Supabase with localStorage fallback"
```

---

### Task 3: Спільний хук `usePrices`

**Files:**
- Create: `src/store/usePrices.ts`

**Interfaces:**
- Consumes: `fetchPrices`, `upsertPrice`, `PriceEntry` з `../api/prices`.
- Produces:
  - `interface PricesState { priceOverrides: Map<number, number>; priceMeta: Map<number, PriceEntry>; pricesLoading: boolean; setPriceOverride: (itemId: number, price: number) => void }`
  - `usePrices(): PricesState`

Цей хук — інтеграційний клей (без юніт-тесту, бо в репо немає React-test-runner). Верифікація: `npm run typecheck` і фінальний білд у Task 8.

- [ ] **Step 1: Write the hook**

```ts
// src/store/usePrices.ts
import { useCallback, useEffect, useState } from "react";
import { message } from "antd";
import { fetchPrices, upsertPrice, type PriceEntry } from "../api/prices";

export interface PricesState {
  priceOverrides: Map<number, number>;
  priceMeta: Map<number, PriceEntry>;
  pricesLoading: boolean;
  setPriceOverride: (itemId: number, price: number) => void;
}

export function usePrices(): PricesState {
  const [priceMeta, setPriceMeta] = useState<Map<number, PriceEntry>>(new Map());
  const [pricesLoading, setPricesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchPrices()
      .then((map) => {
        if (active) setPriceMeta(map);
      })
      .finally(() => {
        if (active) setPricesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setPriceOverride = useCallback((itemId: number, price: number) => {
    // оптимістичне оновлення
    const optimistic: PriceEntry = { price, updatedAt: new Date().toISOString() };
    setPriceMeta((prev) => new Map(prev).set(itemId, optimistic));
    upsertPrice(itemId, price)
      .then((entry) => setPriceMeta((prev) => new Map(prev).set(itemId, entry)))
      .catch(() => {
        void message.warning("Не вдалося зберегти ціну в базі — лишилась локально");
      });
  }, []);

  const priceOverrides = new Map<number, number>();
  for (const [id, e] of priceMeta) priceOverrides.set(id, e.price);

  return { priceOverrides, priceMeta, pricesLoading, setPriceOverride };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (без помилок типів у новому файлі).

- [ ] **Step 3: Commit**

```bash
git add src/store/usePrices.ts
git commit -m "feat: usePrices shared hook backed by Supabase prices"
```

---

### Task 4: Інтеграція `usePrices` у `useCalculator`, видалення reset

**Files:**
- Modify: `src/store/useCalculator.ts`

**Interfaces:**
- Consumes: `usePrices` з `./usePrices`, `PriceEntry` з `../api/prices`.
- Produces (зміни в `Calculator`):
  - додано `priceMeta: Map<number, PriceEntry>`
  - `setPriceOverride: (itemId: number, price: number) => void` (без `null`)
  - видалено `resetPriceOverrides`

- [ ] **Step 1: Remove localStorage price helpers**

У `src/store/useCalculator.ts` видалити функції `loadPriceOverrides` і `savePriceOverrides` (рядки з їх визначеннями) та константу `PRICE_OVERRIDES_KEY`. Залишити `CAP_COST_KEY`, `RATING_DISABLED_CATEGORIES_KEY` та `load/saveDisabledCategories`, `load/saveCapCostReduction` без змін.

- [ ] **Step 2: Wire usePrices into the hook**

Додати імпорти зверху файлу:

```ts
import { usePrices } from "./usePrices";
import type { PriceEntry } from "../api/prices";
```

Замінити рядок стану цін:

```ts
const [priceOverrides, setPriceOverrides] = useState<Map<number, number>>(loadPriceOverrides);
```

на:

```ts
const { priceOverrides, priceMeta, setPriceOverride } = usePrices();
```

Видалити блок:

```ts
useEffect(() => {
  savePriceOverrides(priceOverrides);
}, [priceOverrides]);
```

Видалити локальні `setPriceOverride` (через `setPriceOverrides`) і `resetPriceOverrides`:

```ts
const setPriceOverride = useCallback((itemId: number, price: number | null) => {
  setPriceOverrides((prev) => {
    const next = new Map(prev);
    if (price == null) next.delete(itemId);
    else next.set(itemId, price);
    return next;
  });
}, []);

const resetPriceOverrides = useCallback(() => setPriceOverrides(new Map()), []);
```

- [ ] **Step 3: Update the Calculator interface and return**

У `interface Calculator` замінити:

```ts
  priceOverrides: Map<number, number>;
  setPriceOverride: (itemId: number, price: number | null) => void;
  resetPriceOverrides: () => void;
```

на:

```ts
  priceOverrides: Map<number, number>;
  priceMeta: Map<number, PriceEntry>;
  setPriceOverride: (itemId: number, price: number) => void;
```

У `return { ... }` прибрати `resetPriceOverrides` і додати `priceMeta`:

```ts
    priceOverrides,
    priceMeta,
    setPriceOverride,
```

- [ ] **Step 4: Typecheck (expected to surface caller breakages)**

Run: `npm run typecheck`
Expected: помилки лише у `CalculatorPage.tsx` (через `resetPriceOverrides`) — їх лагодимо в Task 5. Помилок у самому `useCalculator.ts` бути не повинно.

- [ ] **Step 5: Commit**

```bash
git add src/store/useCalculator.ts
git commit -m "refactor: back useCalculator prices with usePrices, drop reset"
```

---

### Task 5: `FreshnessDot` + чистка `SummaryPanel` (market + dot, без reset)

**Files:**
- Create: `src/components/FreshnessDot.tsx`
- Modify: `src/components/SummaryPanel.tsx`
- Modify: `src/pages/CalculatorPage.tsx`

**Interfaces:**
- Consumes: `freshnessColor`, `freshnessLabel` з `../domain/freshness`; `PriceEntry` з `../api/prices`.
- Produces: `FreshnessDot({ updatedAt }: { updatedAt?: string })`; `SummaryPanel` отримує проп `priceMeta: Map<number, PriceEntry>` і більше НЕ приймає `onResetPrices`.

- [ ] **Step 1: Create FreshnessDot**

```tsx
// src/components/FreshnessDot.tsx
import { Tooltip } from "antd";
import { freshnessColor, freshnessLabel } from "../domain/freshness";

export function FreshnessDot({ updatedAt }: { updatedAt?: string }) {
  if (!updatedAt) return null;
  return (
    <Tooltip title={freshnessLabel(updatedAt)}>
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: freshnessColor(updatedAt),
          marginLeft: 6,
          verticalAlign: "middle",
        }}
      />
    </Tooltip>
  );
}
```

- [ ] **Step 2: Update SummaryPanel props**

У `src/components/SummaryPanel.tsx` в інтерфейсі пропсів (біля `priceOverrides`/`marketPrices`) прибрати `onResetPrices` і додати `priceMeta`:

```ts
  priceOverrides: Map<number, number>;
  priceMeta: Map<number, PriceEntry>;
  marketPrices: Map<number, number>;
```

Оновити деструктуризацію пропсів: прибрати `onResetPrices`, додати `priceMeta`. Додати імпорти:

```ts
import { FreshnessDot } from "./FreshnessDot";
import type { PriceEntry } from "../api/prices";
```

Прибрати тепер невживані імпорти, якщо лишаться лише для reset (перевірити `UndoOutlined`, `priceOverrideCount`).

- [ ] **Step 3: Replace per-item undo with market + dot**

У колонці «Ціна/од.» (render) замінити блок `{overridden && (<Tooltip ...>ринок...<UndoOutlined/></Tooltip>)}` на не-клікабельний показ ринкової ціни зі свіжістю:

```tsx
            {overridden && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                ринок: {market != null ? formatISKExact(market) : "—"}
                <FreshnessDot updatedAt={priceMeta.get(m.itemId)?.updatedAt} />
              </Text>
            )}
```

Змінити обробник `onChange` поля, щоб не передавав `null`:

```tsx
              onChange={(v) => v != null && onPriceChange(m.itemId, Number(v))}
```

- [ ] **Step 4: Remove the reset button**

Видалити блок `extra: (<Button ... onResetPrices()>Скинути ціни...</Button>)` з `Collapse` items (залишити `extra` відсутнім або прибрати ключ). Видалити `const priceOverrideCount = priceOverrides.size;`, якщо він більше ніде не вживається.

- [ ] **Step 5: Update CalculatorPage callers**

У `src/pages/CalculatorPage.tsx` у `<SummaryPanel ...>` прибрати `onResetPrices={calc.resetPriceOverrides}` і додати `priceMeta={calc.priceMeta}`:

```tsx
                  <SummaryPanel
                    summary={calc.summary}
                    onPriceChange={calc.setPriceOverride}
                    priceOverrides={calc.priceOverrides}
                    priceMeta={calc.priceMeta}
                    marketPrices={calc.data.priceByItemId}
                  />
```

- [ ] **Step 6: Typecheck + tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (RatingPage ще не чіпали — вона має власний стан і поки компілюється; якщо typecheck лається на RatingPage через SummaryPanel-пропси, це лагодиться в Task 6).

> Примітка: оскільки `RatingPriceDrawer` теж рендерить `SummaryPanel` з `onResetPrices`, typecheck покаже помилки в `RatingPriceDrawer.tsx` — вони усуваються в Task 6. Допускається перейти до Task 6 до коміту, або закомітити з відомою тимчасовою помилкою типів. Рекомендація: комітити після Task 6, якщо typecheck червоний лише через drawer.

- [ ] **Step 7: Commit**

```bash
git add src/components/FreshnessDot.tsx src/components/SummaryPanel.tsx src/pages/CalculatorPage.tsx
git commit -m "feat: show market price + freshness dot in summary, remove reset button"
```

---

### Task 6: Свіжість у `CraftTree` + рейтинг на спільному `usePrices`

**Files:**
- Modify: `src/components/CraftTree.tsx`
- Modify: `src/components/RatingPriceDrawer.tsx`
- Modify: `src/pages/RatingPage.tsx`

**Interfaces:**
- Consumes: `usePrices`, `FreshnessDot`, `PriceEntry`.
- Produces: `CraftTree` і `RatingPriceDrawer` приймають `priceMeta`; `RatingPriceDrawer` без `onResetPrices`.

- [ ] **Step 1: CraftTree — market + dot for buy nodes with override**

У `src/components/CraftTree.tsx`:
- у `Props` змінити `onPriceChange: (itemId: number, price: number | null)` на `(itemId: number, price: number)` і додати `priceMeta: Map<number, PriceEntry>`;
- додати імпорти `FreshnessDot`, `formatISKExact` (з `../domain/format`), `type PriceEntry`;
- у деструктуризації додати `priceMeta`;
- у колонці «Ціна/од.» для `node.mode === "buy"` під `InputNumber` показувати ринкову ціну зі свіжістю, коли є override:

```tsx
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
            <InputNumber
              size="small"
              value={node.unitPrice}
              min={0}
              style={{ width: 140 }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
              parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
              onChange={(v) => v != null && onPriceChange(node.itemId, Number(v))}
            />
            {priceOverrides.has(node.itemId) && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                ринок: {marketPrices.get(node.itemId) != null ? formatISKExact(marketPrices.get(node.itemId)!) : "—"}
                <FreshnessDot updatedAt={priceMeta.get(node.itemId)?.updatedAt} />
              </Text>
            )}
          </div>
```

> `CraftTree` наразі не приймає `priceOverrides`/`marketPrices`. Додати їх у `Props` (`priceOverrides: Map<number, number>`, `marketPrices: Map<number, number>`) і в деструктуризацію; передати з `CalculatorPage` (Step 2). Дані для overridden-перевірки беруться з цих мап.

- [ ] **Step 2: Pass new props to CraftTree in CalculatorPage**

У `src/pages/CalculatorPage.tsx` в `<CraftTree ...>` додати:

```tsx
                            onPriceChange={calc.setPriceOverride}
                            priceOverrides={calc.priceOverrides}
                            priceMeta={calc.priceMeta}
                            marketPrices={calc.data.priceByItemId}
```

- [ ] **Step 3: RatingPriceDrawer — drop reset, narrow onPriceChange, add priceMeta + dot**

У `src/components/RatingPriceDrawer.tsx`:
- у `Props` прибрати `onResetPrices`; змінити `onPriceChange` на `(itemId: number, price: number) => void`; додати `priceMeta: Map<number, PriceEntry>`;
- прибрати імпорт `UndoOutlined`; додати `FreshnessDot`, `type PriceEntry`;
- замінити блок `{sellOverride != null && (<Tooltip ...><UndoOutlined/></Tooltip>)}` на:

```tsx
                {sellOverride != null && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    ринок: {market != null ? formatISKExact(market) : "—"}
                    <FreshnessDot updatedAt={priceMeta.get(itemId)?.updatedAt} />
                  </Text>
                )}
```

- змінити `onChange` поля продажу: `onChange={(v) => v != null && onPriceChange(itemId, Number(v))}`;
- у вкладеному `<SummaryPanel ...>` прибрати `onResetPrices={onResetPrices}` і додати `priceMeta={priceMeta}`.

- [ ] **Step 4: RatingPage — use shared usePrices**

У `src/pages/RatingPage.tsx`:
- прибрати імпорти `loadPriceOverrides`, `savePriceOverrides` з `../store/useCalculator`; додати `import { usePrices } from "../store/usePrices";`
- видалити стан і ефект цін:

```ts
const [priceOverrides, setPriceOverrides] = useState<Map<number, number>>(loadPriceOverrides);
// ...
useEffect(() => {
  savePriceOverrides(priceOverrides);
}, [priceOverrides]);
// ...
const setPriceOverride = useCallback((itemId: number, price: number | null) => { ... }, []);
const resetPriceOverrides = useCallback(() => setPriceOverrides(new Map()), []);
```

- замість них:

```ts
const { priceOverrides, priceMeta, setPriceOverride } = usePrices();
```

- у `<RatingPriceDrawer ...>` прибрати `onResetPrices={resetPriceOverrides}` і додати `priceMeta={priceMeta}`:

```tsx
        <RatingPriceDrawer
          open={drawerItemId != null}
          data={data}
          itemId={drawerItemId}
          priceOverrides={priceOverrides}
          priceMeta={priceMeta}
          onPriceChange={setPriceOverride}
          onClose={() => setDrawerItemId(null)}
        />
```

- [ ] **Step 5: Typecheck + full tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (усі типи зведені, доменні тести зелені).

- [ ] **Step 6: Commit**

```bash
git add src/components/CraftTree.tsx src/components/RatingPriceDrawer.tsx src/pages/RatingPage.tsx src/pages/CalculatorPage.tsx
git commit -m "feat: freshness dots in tree/rating, rating uses shared prices, drop resets"
```

---

### Task 7: SQL Supabase + документація налаштування

**Files:**
- Create: `supabase/schema.sql`
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Create schema.sql**

```sql
-- supabase/schema.sql
create table if not exists public.prices (
  item_id    bigint primary key,
  price      double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.prices enable row level security;

create policy "anon read prices"   on public.prices for select to anon using (true);
create policy "anon insert prices" on public.prices for insert to anon with check (true);
create policy "anon update prices" on public.prices for update to anon using (true) with check (true);
```

- [ ] **Step 2: Create .env.example**

```bash
# .env.example
# Скопіюйте у .env.local для локальної розробки зі спільною базою.
# Без цих змінних застосунок працює на localStorage (fallback).
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 3: Document in README**

Додати в `README.md` розділ:

```markdown
## Спільні ціни (Supabase)

Введені ціни зберігаються у спільній таблиці `prices` Supabase (без логіну).
Без env-змінних застосунок працює на localStorage.

1. Створіть безкоштовний проєкт на supabase.com.
2. SQL Editor → виконайте `supabase/schema.sql`.
3. Project Settings → API: скопіюйте `Project URL` та `anon public` ключ.
4. Локально: `.env.local` зі `VITE_SUPABASE_URL` і `VITE_SUPABASE_ANON_KEY`.
5. Для деплою: GitHub repo → Settings → Secrets and variables → Actions →
   Variables: додайте `VITE_SUPABASE_URL` і `VITE_SUPABASE_ANON_KEY`.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql .env.example README.md
git commit -m "docs: Supabase schema, env example, setup instructions"
```

---

### Task 8: Деплой на GitHub Pages (HashRouter, vite base, workflow)

**Files:**
- Modify: `src/main.tsx`
- Modify: `vite.config.ts`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Switch to HashRouter**

У `src/main.tsx` замінити імпорт і використання:

```tsx
import { HashRouter, Route, Routes } from "react-router-dom";
```

```tsx
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<CalculatorPage />} />
          <Route path="rating" element={<RatingPage />} />
        </Route>
      </Routes>
    </HashRouter>
```

- [ ] **Step 2: Set relative base in vite.config.ts**

У `vite.config.ts` додати `base: "./"` у `defineConfig`:

```ts
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 3: Create deploy workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Verify local production build**

Run: `npm run build`
Expected: успішний білд, `dist/` згенеровано, шляхи до ассетів відносні (`./assets/...` в `dist/index.html`).

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx vite.config.ts .github/workflows/deploy.yml
git commit -m "build: GitHub Pages deploy via Actions, HashRouter, relative base"
```

- [ ] **Step 6: Manual steps (виконує користувач — вивести інструкцію)**

Не автоматизується агентом. Повідомити користувачу послідовність:
1. `gh repo create ec-manufacturing --public --source=. --remote=origin --push` (або вручну створити репо й `git push -u origin main`).
2. Repo → Settings → Pages → Build and deployment → Source = **GitHub Actions**.
3. Repo → Settings → Secrets and variables → Actions → **Variables** → додати `VITE_SUPABASE_URL` і `VITE_SUPABASE_ANON_KEY`.
4. Дочекатись зеленого workflow; сайт буде на `https://<user>.github.io/ec-manufacturing/`.

---

## Self-Review

**Spec coverage:**
- Supabase таблиця + RLS → Task 7. ✓
- `prices.ts` шар даних + fallback → Task 2. ✓
- `usePrices` централізація (усунення дубляжу в RatingPage) → Tasks 3, 6. ✓
- Збереження `priceOverrides: Map<number,number>` інтерфейсу → доменний код не чіпається в жодному таску. ✓
- Індикатор свіжості (чиста функція + UI у tree/summary/rating) → Tasks 1, 5, 6. ✓
- Ринкова ціна всюди, де кастомна → Tasks 5 (summary), 6 (tree, drawer). ✓
- Прибрати скидання повністю → Tasks 4, 5, 6. ✓
- Деплой: HashRouter, base, workflow, Variables → Task 8. ✓

**Placeholder scan:** Код наведено повністю в усіх кроках; ручні кроки (Supabase-проєкт, GitHub UI) явно позначені як такі, що їх не автоматизує агент.

**Type consistency:** `PriceEntry { price, updatedAt }`, `PriceMap`, `setPriceOverride(itemId, price)` (без null), `priceMeta: Map<number, PriceEntry>`, `FreshnessDot({ updatedAt })`, `freshnessColor/Label(updatedAt, now?)` — узгоджені між Tasks 1–6.
