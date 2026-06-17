# Rating Price Editing + Blueprint Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На `/rating` дати редагування цін (готовий виріб + інгредієнти через drawer) із пріоритетом збережених цін над ринковими, і врахувати ціну блюпрінта в усій доменній логіці вартості крафту.

**Architecture:** Спершу доменний шар (типи → rating.ts → tree.ts → optimize.ts) під TDD; потім UI (SummaryPanel розширюється блюпрінт-колонкою; новий `RatingPriceDrawer` переюзовує `buildTree`+`summarizeTree`+`SummaryPanel`; `RatingPage` стає stateful по цінах). Блюпрінт моделюється як per-job розхідник: `blueprintPrice × attempts`, ділиться на `passRate` для реверсу, аналогічно `manufactureCost`.

**Tech Stack:** Vite + React + TypeScript, Ant Design, Vitest.

---

## File Structure

- `src/api/types.ts` — додати `Recipe.blueprintId`.
- `src/api/client.ts` — парсити `blueprintId` із `RawRecipe.id`.
- `src/domain/rating.ts` — вартість блюпрінта + поля `sellPriceMarket`/`sellIsOverride`/`craftCostMarket`.
- `src/domain/tree.ts` — поля блюпрінта на `BuildNode`/`JobRow`, `TreeSummary.totalBlueprintCost`, хелпер `fullBuildSet`.
- `src/domain/optimize.ts` — вартість блюпрінта в рішенні buy/build.
- `src/components/SummaryPanel.tsx` — редагована колонка ціни блюпрінта в таблиці jobs + стат-картка.
- `src/components/RatingPriceDrawer.tsx` — **новий** drawer (ціна продажу + переюз `SummaryPanel`).
- `src/pages/RatingPage.tsx` — живий стан цін, дворівневі колонки, drawer.
- `src/store/useCalculator.ts` — експортувати `savePriceOverrides`.
- Тести: `rating.test.ts`, `tree.test.ts`, `optimize.test.ts` (+ фікстури отримують `blueprintId`).

---

## Task 1: Додати `blueprintId` у Recipe + парсинг (regression-only)

**Files:**
- Modify: `src/api/types.ts:16-28` (інтерфейс `Recipe`)
- Modify: `src/api/client.ts:17-28` (`RawRecipe`), `src/api/client.ts:59-78` (`toRecipe`)
- Modify (фікстури, щоб компілювалось): `src/domain/rating.test.ts:19-23`, `src/domain/tree.test.ts:10-19,104-113`, `src/domain/optimize.test.ts:6-15`

- [ ] **Step 1: Додати поле в `Recipe`**

У `src/api/types.ts`, в інтерфейс `Recipe` після `itemId: number;` додати:

```ts
  blueprintId: number; // власний id рецепту-блюпрінта (для ціни блюпрінта)
```

- [ ] **Step 2: Парсити `id` блюпрінта в client.ts**

У `src/api/client.ts` в інтерфейс `RawRecipe` (після `item_id: string;`) додати:

```ts
  id: string;
```

У функції `toRecipe`, в об'єкт результату після `itemId: Number(r.item_id),` додати:

```ts
    blueprintId: Number(r.id),
```

- [ ] **Step 3: Оновити фікстури тестів, щоб компілювалось**

У `src/domain/rating.test.ts` в дефолти `mk` (об'єкт після `outputNumber: 1, ...`) додати `blueprintId: 0`:

```ts
const mk = (over: Partial<Recipe> & Pick<Recipe, "itemId" | "materials">): Recipe => ({
  name: `Item ${over.itemId}`, categoryName: "Cat", groupName: "G", kind: "manufacture",
  outputNumber: 1, manufactureCost: 0, manufactureTime: 0, passRate: 1, blueprintId: 0, skills: [],
  ...over,
});
```

У `src/domain/tree.test.ts` додати `blueprintId` у кожен Recipe-літерал:
- `shipBp` (рядок ~10): `blueprintId: 9001,`
- `compBp` (рядок ~15): `blueprintId: 9002,`
- у `makeCapData` `shipBp`: `blueprintId: 9001,`
- у `makeCapData` `compBp`: `blueprintId: 9002,`

(Додати поле поряч з `itemId:` у кожному об'єкті.)

У `src/domain/optimize.test.ts` у функції `data(...)`:
- `ship`: `blueprintId: 9001,`
- `comp`: `blueprintId: 9002,`
- у тесті реверсу (`re`, рядок ~48): `blueprintId: 9005,`

- [ ] **Step 4: Перевірити, що все компілюється і тести зелені (поведінка не змінилась)**

Run: `npm run typecheck && npm test`
Expected: PASS — жоден тест не падає (ціни блюпрінтів ще ніде не використовуються; id блюпрінтів немає в `priceByItemId` фікстур → 0).

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/domain/rating.test.ts src/domain/tree.test.ts src/domain/optimize.test.ts
git commit -m "feat(domain): add Recipe.blueprintId (parse blueprint id)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Вартість блюпрінта + ринкові/override поля в rating.ts

**Files:**
- Test: `src/domain/rating.test.ts`
- Modify: `src/domain/rating.ts`

- [ ] **Step 1: Написати падаючі тести**

У `src/domain/rating.test.ts` додати в кінець `describe("rankCraftProfits", ...)` (перед закриваючою `});`):

```ts
  it("додає ціну блюпрінта до вартості крафту (manufacture)", () => {
    const widget = mk({
      itemId: 1, blueprintId: 901, manufactureCost: 1000, manufactureTime: 100,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 2 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100], [901, 300]]);
    const [row] = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    // craftCost = (1000 + 300 + 100×2)/1 = 1500
    expect(row.craftCost).toBe(1500);
  });

  it("ділить ціну блюпрінта реверсу на passRate", () => {
    const re = mk({
      itemId: 5, blueprintId: 905, kind: "reverse", manufactureCost: 100, manufactureTime: 60, passRate: 0.5,
      materials: [{ id: 6, name: "Base", type: "Base", quantity: 1 }],
    });
    const data = gameData([re], [[5, 5000], [6, 100], [905, 50]]);
    const [row] = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    // cost = (100 + 50 + 100×1)/(1×0.5) = 500
    expect(row.craftCost).toBe(500);
  });

  it("невідома ціна блюпрінта = 0, предмет лишається в рейтингу", () => {
    const widget = mk({
      itemId: 1, blueprintId: 901, manufactureCost: 1000,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 2 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100]]); // 901 без ціни
    const [row] = rankCraftProfits({ data, priceOverrides: noOverrides, levels: noLevels });
    expect(row.craftCost).toBe(1200); // блюпрінт = 0
  });

  it("override ціни блюпрінта застосовується; craftCostMarket лишається ринковим", () => {
    const widget = mk({
      itemId: 1, blueprintId: 901, manufactureCost: 0, manufactureTime: 100,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 1 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100], [901, 300]]);
    const overrides = new Map<number, number>([[901, 50]]);
    const [row] = rankCraftProfits({ data, priceOverrides: overrides, levels: noLevels });
    expect(row.craftCost).toBe(150); // (0 + 50 + 100)/1
    expect(row.craftCostMarket).toBe(400); // (0 + 300 + 100)/1 за ринком
  });

  it("sellPriceMarket і sellIsOverride відображають override продукту", () => {
    const widget = mk({
      itemId: 1, manufactureCost: 0,
      materials: [{ id: 2, name: "Raw", type: "Mineral", quantity: 1 }],
    });
    const data = gameData([widget], [[1, 5000], [2, 100]]);
    const overrides = new Map<number, number>([[1, 8000]]);
    const [row] = rankCraftProfits({ data, priceOverrides: overrides, levels: noLevels });
    expect(row.sellPrice).toBe(8000);
    expect(row.sellPriceMarket).toBe(5000);
    expect(row.sellIsOverride).toBe(true);
  });
```

- [ ] **Step 2: Запустити — переконатись, що падають**

Run: `npm test -- rating`
Expected: FAIL — `row.craftCost` 1200 замість 1500; `craftCostMarket`/`sellPriceMarket`/`sellIsOverride` `undefined`.

- [ ] **Step 3: Реалізувати**

У `src/domain/rating.ts`:

(а) Розширити інтерфейс `CraftProfit` — додати після `sellPrice: number;`:

```ts
  sellPriceMarket: number; // ринкова ціна продукту (estimated_price)
  sellIsOverride: boolean; // чи ціна продажу — це override користувача
```

і після `craftCost: number;`:

```ts
  craftCostMarket: number; // вартість крафту лише за ринковими цінами (без override'ів)
```

(б) Розширити інтерфейс `UnitCT` — додати поле:

```ts
  costMarket: number; // вартість за одиницю лише за ринковими цінами
```

(в) У функції `rankCraftProfits` додати поряд із `buyPrice` ринковий лукап:

```ts
  const marketPrice = (itemId: number): number | undefined => data.priceByItemId.get(itemId);
```

(г) У функції `unit` замінити гілку «лист/цикл»:

```ts
    if (!recipe || inProgress.has(itemId)) {
      const p = buyPrice(itemId);
      const pm = marketPrice(itemId);
      return { cost: p ?? 0, costMarket: pm ?? p ?? 0, time: 0, known: p != null };
    }
```

(ґ) У тілі `unit` (гілка рецепту) вести паралельний `materialsCostMarket` і додати вартість блюпрінта:

```ts
    inProgress.add(itemId);
    let materialsCost = 0;
    let materialsCostMarket = 0;
    let materialsTime = 0;
    let known = true;
    for (const m of recipe.materials) {
      const child = unit(m.id);
      if (!child.known) known = false;
      const perUnit =
        recipe.kind === "manufacture"
          ? m.quantity * materialFactor(recipe, levels, data.skillByName, null)
          : m.quantity;
      materialsCost += child.cost * perUnit;
      materialsCostMarket += child.costMarket * perUnit;
      materialsTime += child.time * perUnit;
    }
    inProgress.delete(itemId);
    const blueprintCost = buyPrice(recipe.blueprintId) ?? 0;
    const blueprintCostMarket = marketPrice(recipe.blueprintId) ?? 0;
    const denom = recipe.outputNumber * recipe.passRate;
    const cost = (recipe.manufactureCost + blueprintCost + materialsCost) / denom;
    const costMarket = (recipe.manufactureCost + blueprintCostMarket + materialsCostMarket) / denom;
    const time = (effectiveTime(recipe, levels, data.skillByName) + materialsTime) / denom;
    const result: UnitCT = { cost, costMarket, time, known };
    memo.set(itemId, result);
    return result;
```

(д) У циклі побудови `out` додати нові поля рядка:

```ts
  for (const [itemId, recipe] of data.recipeByItemId) {
    const sell = buyPrice(itemId);
    if (sell == null) continue;
    const { cost, costMarket, time, known } = unit(itemId);
    if (!known) continue;
    const profit = sell - cost;
    out.push({
      itemId,
      name: recipe.name,
      categoryName: recipe.categoryName,
      groupName: recipe.groupName,
      kind: recipe.kind,
      iconUrl: iconUrl(data.iconByItemId.get(itemId)),
      sellPrice: sell,
      sellPriceMarket: marketPrice(itemId) ?? sell,
      sellIsOverride: priceOverrides.has(itemId),
      craftCost: cost,
      craftCostMarket: costMarket,
      profit,
      margin: cost > 0 ? profit / cost : 0,
      craftTime: time,
      profitPerHour: time > 0 ? profit / (time / 3600) : 0,
    });
  }
```

- [ ] **Step 4: Запустити — зелено**

Run: `npm test -- rating`
Expected: PASS (усі тести rating, включно з новими і старими).

- [ ] **Step 5: Commit**

```bash
git add src/domain/rating.ts src/domain/rating.test.ts
git commit -m "feat(domain): blueprint cost + market/override price fields in rating

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Поля блюпрінта в tree.ts + fullBuildSet + totalBlueprintCost

**Files:**
- Test: `src/domain/tree.test.ts`
- Modify: `src/domain/tree.ts`

- [ ] **Step 1: Написати падаючі тести**

У `src/domain/tree.test.ts` додати імпорт `fullBuildSet`:

```ts
import { buildTree, summarizeTree, fullBuildSet, CAPITAL_COMPONENT_TYPE, type TreeParams } from "./tree";
```

Додати новий блок після `describe("capComponentCostReduction", ...)`:

```ts
describe("blueprint cost", () => {
  it("ціна блюпрінта дає blueprintCost і входить у nodeTotal/grandTotal", () => {
    const data = makeData();
    const params = {
      ...baseParams(data, new Set([2])),
      priceOverrides: new Map<number, number>([[9001, 1000], [9002, 100]]),
    };
    const tree = buildTree(params);
    expect(tree.blueprintUnitPrice).toBe(1000);
    expect(tree.blueprintCost).toBe(1000); // attempts = 1
    const comp = tree.children[0];
    expect(comp.blueprintCost).toBe(100 * 2); // 2 runs
    // root nodeTotal = children + jobCost(1000) + blueprintCost(1000)
    const childrenTotal = tree.children.reduce((s, c) => s + c.nodeTotal, 0);
    expect(tree.nodeTotal).toBe(childrenTotal + tree.jobCost + 1000);

    const sum = summarizeTree(tree, params);
    expect(sum.totalBlueprintCost).toBe(1000 + 200);
    expect(sum.grandTotal).toBe(sum.totalBuyCost + sum.totalJobCost + sum.totalBlueprintCost);
  });

  it("невідома ціна блюпрінта → blueprintCost 0, blueprintPriceKnown false", () => {
    const tree = buildTree(baseParams(makeData(), new Set([2]))); // без цін блюпрінтів
    expect(tree.blueprintCost).toBe(0);
    expect(tree.blueprintPriceKnown).toBe(false);
  });

  it("buy-вузол має нульові поля блюпрінта", () => {
    const comp = buildTree(baseParams(makeData(), new Set())).children[0];
    expect(comp.mode).toBe("buy");
    expect(comp.blueprintCost).toBe(0);
    expect(comp.blueprintUnitPrice).toBe(0);
  });

  it("fullBuildSet збирає всі craftable у піддереві", () => {
    const set = fullBuildSet(makeData(), 1);
    expect(set.has(2)).toBe(true); // компонент craftable
    expect(set.has(3)).toBe(false); // мінерал не craftable
  });
});
```

Додати тест у `describe("capComponentCostReduction", ...)` (перед закриваючою `});`):

```ts
  it("знижка capComponent не зачіпає вартість блюпрінта", () => {
    const params = { ...capParams(50), priceOverrides: new Map<number, number>([[9002, 100]]) };
    const comp = buildTree(params).children[0];
    expect(comp.jobCost).toBe(50 * 2 * 0.5); // 50 — job зі знижкою
    expect(comp.blueprintCost).toBe(100 * 2); // 200 — блюпрінт без знижки
  });
```

- [ ] **Step 2: Запустити — падають**

Run: `npm test -- tree`
Expected: FAIL — `blueprintUnitPrice`/`blueprintCost`/`blueprintPriceKnown`/`totalBlueprintCost` `undefined`; `fullBuildSet` не експортовано.

- [ ] **Step 3: Реалізувати**

У `src/domain/tree.ts`:

(а) В інтерфейс `BuildNode` додати після `jobTime: number;`:

```ts
  blueprintUnitPrice: number; // ціна одного блюпрінта (0 для buy-вузла)
  blueprintPriceKnown: boolean; // чи відома ринкова ціна блюпрінта
  blueprintCost: number; // blueprintUnitPrice × attempts (0 для buy-вузла)
```

(б) У функції `buildNode`, у гілці `canBuild`, після обчислення `jobTime` додати:

```ts
    const bp = priceFor((recipe as Recipe).blueprintId, data, priceOverrides);
    const blueprintCost = bp.price * attempts;
```

і змінити повернутий об'єкт: додати поля та оновити `nodeTotal`:

```ts
      jobCost,
      jobTime,
      blueprintUnitPrice: bp.price,
      blueprintPriceKnown: bp.known,
      blueprintCost,
      nodeTotal: childrenTotal + jobCost + blueprintCost,
      children,
```

(в) У гілці buy (повернутий об'єкт після `jobTime: 0,`) додати:

```ts
    jobCost: 0,
    jobTime: 0,
    blueprintUnitPrice: 0,
    blueprintPriceKnown: true,
    blueprintCost: 0,
    nodeTotal: buyCost,
    children: [],
```

(г) В інтерфейс `JobRow` додати після `jobTime: number;`:

```ts
  blueprintId: number;
  blueprintUnitPrice: number;
  blueprintPriceKnown: boolean;
  blueprintCost: number;
```

(ґ) В інтерфейс `TreeSummary` додати після `totalJobCost: number;`:

```ts
  totalBlueprintCost: number;
```

(д) У `summarizeTree`: додати лічильник і агрегацію. Після `let totalJobCost = 0;` додати:

```ts
  let totalBlueprintCost = 0;
```

У гілці `else` (build-вузол) функції `walk`, після `totalJobCost += node.jobCost;` додати:

```ts
      totalBlueprintCost += node.blueprintCost;
```

У створенні нового запису `jobMap.set(...)` додати поля блюпрінта:

```ts
        jobMap.set(node.itemId, {
          itemId: node.itemId,
          name: node.name,
          iconUrl: node.iconUrl,
          kind: node.recipeKind ?? "manufacture",
          runs: node.runs,
          jobCost: node.jobCost,
          jobTime: node.jobTime,
          blueprintId: params.data.recipeByItemId.get(node.itemId)?.blueprintId ?? 0,
          blueprintUnitPrice: node.blueprintUnitPrice,
          blueprintPriceKnown: node.blueprintPriceKnown,
          blueprintCost: node.blueprintCost,
        });
```

В акумуляторі наявного запису (`if (acc) { acc.runs += ...; }`) додати:

```ts
        acc.blueprintCost += node.blueprintCost;
```

(е) У поверненні `summarizeTree` додати поле й оновити `grandTotal`:

```ts
    totalBuyCost,
    totalJobCost,
    totalBlueprintCost,
    grandTotal: totalBuyCost + totalJobCost + totalBlueprintCost,
```

(є) Додати в кінець файлу експортований хелпер:

```ts
/** Набір усіх craftable-предметів у піддереві кореня (для «будувати все»). */
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
```

- [ ] **Step 4: Запустити — зелено**

Run: `npm test -- tree`
Expected: PASS (нові й старі тести tree).

- [ ] **Step 5: Commit**

```bash
git add src/domain/tree.ts src/domain/tree.test.ts
git commit -m "feat(domain): blueprint cost on build nodes, totalBlueprintCost, fullBuildSet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Вартість блюпрінта в optimize.ts

**Files:**
- Test: `src/domain/optimize.test.ts`
- Modify: `src/domain/optimize.ts`

- [ ] **Step 1: Написати падаючий тест**

У `src/domain/optimize.test.ts` додати в кінець `describe("computeOptimalBuildSet", ...)`:

```ts
  it("враховує ціну блюпрінта в рішенні buy/build", () => {
    // без блюпрінта: craft = 50 + 10×5 = 100 < buy 500 → build
    // з блюпрінтом 9002 = 1000: craft = 1100 > buy 500 → buy
    const d = data(500, 5);
    const set = computeOptimalBuildSet({
      ...params(d),
      priceOverrides: new Map<number, number>([[9002, 1000]]),
    });
    expect(set.has(2)).toBe(false);
  });
```

- [ ] **Step 2: Запустити — падає**

Run: `npm test -- optimize`
Expected: FAIL — `set.has(2)` все ще `true` (блюпрінт не врахований).

- [ ] **Step 3: Реалізувати**

У `src/domain/optimize.ts`, у функції `unit`, у блоці `if (recipe) { ... }` додати лукап ціни блюпрінта (повертає 0, коли невідома — на відміну від `buyUnit`, що дає Infinity) і додати її в `craft`:

```ts
    if (recipe) {
      inProgress.add(itemId);
      let materials = 0;
      for (const m of recipe.materials) {
        const childUnit = unit(m.id).cost;
        const perUnit =
          recipe.kind === "manufacture"
            ? m.quantity * materialFactor(recipe, levels, data.skillByName, materialEfficiency)
            : m.quantity;
        materials += childUnit * perUnit;
      }
      inProgress.delete(itemId);
      const blueprintCost = priceOverrides.has(recipe.blueprintId)
        ? priceOverrides.get(recipe.blueprintId)!
        : data.priceByItemId.get(recipe.blueprintId) ?? 0;
      craft =
        (recipe.manufactureCost + blueprintCost + materials) /
        (recipe.outputNumber * recipe.passRate);
    }
```

- [ ] **Step 4: Запустити — зелено**

Run: `npm test`
Expected: PASS — усі доменні тести (rating, tree, optimize, skills) зелені.

- [ ] **Step 5: Commit**

```bash
git add src/domain/optimize.ts src/domain/optimize.test.ts
git commit -m "feat(domain): include blueprint price in buy/build optimization

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Колонка ціни блюпрінта в SummaryPanel + стат-картка

**Files:**
- Modify: `src/components/SummaryPanel.tsx`

(Юніт-тестів для компонентів у проєкті немає — верифікація через typecheck + build + ручний прогін.)

- [ ] **Step 1: Додати редаговану колонку блюпрінта в таблицю jobs**

У `src/components/SummaryPanel.tsx`, у масив `jobColumns` після колонки `jobCost` (об'єкт із `dataIndex: "jobCost"`) додати дві колонки:

```ts
    {
      title: "Ціна блюпрінта/од.",
      key: "blueprintUnitPrice",
      align: "right",
      render: (_, j) => {
        if (!j.blueprintId) return <Text type="secondary">—</Text>;
        const overridden = priceOverrides.has(j.blueprintId);
        const market = marketPrices.get(j.blueprintId);
        return (
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
            <InputNumber
              size="small"
              value={j.blueprintUnitPrice}
              min={0}
              style={{ width: 130 }}
              status={j.blueprintPriceKnown ? undefined : "warning"}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
              parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
              onChange={(v) => onPriceChange(j.blueprintId, v == null ? null : Number(v))}
            />
            {overridden && (
              <Tooltip title="Натисніть, щоб повернути ринкову ціну">
                <Text
                  type="secondary"
                  style={{ fontSize: 11, cursor: "pointer" }}
                  onClick={() => onPriceChange(j.blueprintId, null)}
                >
                  ринок: {market != null ? formatISKExact(market) : "—"} <UndoOutlined />
                </Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: "Сума блюпрінтів",
      dataIndex: "blueprintCost",
      key: "blueprintCost",
      align: "right",
      render: (v: number) => formatISK(v),
    },
```

- [ ] **Step 2: Додати стат-картку «Блюпрінти»**

У першому `<Row>` зі статистикою (де картки «Разом (крафт)», «Матеріали», «Вартість jobs», «Загальний час») змінити сітку так, щоб додати картку блюпрінтів. Замінити картку «Загальний час» на дві картки і перерозподілити: після картки «Вартість jobs» (`<Col xs={12} md={6}>` з `totalJobCost`) додати:

```tsx
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="Блюпрінти"
              value={Math.round(summary.totalBlueprintCost)}
              suffix="ISK"
            />
          </Card>
        </Col>
```

і перенести картку «Загальний час» у другий `<Row>` (де «Купити готовий» / «Економія»), додавши її там третьою:

```tsx
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Загальний час" value={formatDuration(summary.totalTime)} />
          </Card>
        </Col>
```

(Тобто перший рядок: Разом / Матеріали / Вартість jobs / Блюпрінти; другий рядок: Купити готовий / Економія / Загальний час.)

- [ ] **Step 3: Перевірити компіляцію і збірку**

Run: `npm run typecheck && npm run build`
Expected: PASS — без помилок типів (`JobRow`/`TreeSummary` уже мають нові поля з Task 3).

- [ ] **Step 4: Ручна перевірка на калькуляторі**

Run: `npm run dev`, відкрити `http://localhost:5173/`, обрати Naglfar, увімкнути авто-оптимізацію.
Expected: у блоці «Виробництво (jobs)» є колонки ціни блюпрінта (редаговані) і суми; з'явилась картка «Блюпрінти»; «Разом (крафт)» зросло на суму блюпрінтів.

- [ ] **Step 5: Commit**

```bash
git add src/components/SummaryPanel.tsx
git commit -m "feat(ui): editable blueprint price column and total in SummaryPanel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Drawer редагування цін `RatingPriceDrawer`

**Files:**
- Create: `src/components/RatingPriceDrawer.tsx`

- [ ] **Step 1: Створити компонент drawer**

Створити `src/components/RatingPriceDrawer.tsx`:

```tsx
import { useMemo } from "react";
import { Drawer, Card, Col, InputNumber, Row, Space, Statistic, Tooltip, Typography } from "antd";
import { UndoOutlined } from "@ant-design/icons";
import type { GameData } from "../api/types";
import { buildTree, summarizeTree, fullBuildSet } from "../domain/tree";
import { SummaryPanel } from "./SummaryPanel";
import { formatISK, formatISKExact } from "../domain/format";

const { Text } = Typography;

interface Props {
  open: boolean;
  data: GameData;
  itemId: number | null;
  priceOverrides: Map<number, number>;
  onPriceChange: (itemId: number, price: number | null) => void;
  onResetPrices: () => void;
  onClose: () => void;
}

export function RatingPriceDrawer({
  open,
  data,
  itemId,
  priceOverrides,
  onPriceChange,
  onResetPrices,
  onClose,
}: Props) {
  const recipe = itemId != null ? data.recipeByItemId.get(itemId) : undefined;

  const { tree, summary } = useMemo(() => {
    if (itemId == null || !data.recipeByItemId.has(itemId)) {
      return { tree: null, summary: null };
    }
    const params = {
      data,
      rootItemId: itemId,
      desiredQty: 1,
      levels: new Map<string, number>(),
      materialEfficiency: null,
      buildSet: fullBuildSet(data, itemId),
      priceOverrides,
      capComponentCostReduction: 0,
    };
    const t = buildTree(params);
    return { tree: t, summary: summarizeTree(t, params) };
  }, [data, itemId, priceOverrides]);

  const market = itemId != null ? data.priceByItemId.get(itemId) : undefined;
  const sellOverride = itemId != null ? priceOverrides.get(itemId) : undefined;
  const sell = sellOverride ?? market ?? 0;
  const craftCost = summary?.grandTotal ?? 0;
  const profit = sell - craftCost;

  return (
    <Drawer
      width={760}
      open={open}
      onClose={onClose}
      title={recipe ? `Ціни: ${recipe.name}` : "Ціни"}
    >
      {itemId == null || summary == null ? null : (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card size="small" title="Ціна готового виробу (продаж)">
            <Space align="end" wrap size="large">
              <div style={{ display: "inline-flex", flexDirection: "column" }}>
                <Text type="secondary">Ваша ціна продажу</Text>
                <InputNumber
                  value={sellOverride ?? market ?? 0}
                  min={0}
                  style={{ width: 180 }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
                  parser={(v) => Number((v ?? "").replace(/\s/g, "")) as number}
                  onChange={(v) => onPriceChange(itemId, v == null ? null : Number(v))}
                />
                {sellOverride != null && (
                  <Tooltip title="Натисніть, щоб повернути ринкову ціну">
                    <Text
                      type="secondary"
                      style={{ fontSize: 11, cursor: "pointer" }}
                      onClick={() => onPriceChange(itemId, null)}
                    >
                      ринок: {market != null ? formatISKExact(market) : "—"} <UndoOutlined />
                    </Text>
                  </Tooltip>
                )}
              </div>
            </Space>
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={12} md={8}>
                <Statistic title="Вартість крафту" value={Math.round(craftCost)} suffix="ISK" />
              </Col>
              <Col xs={12} md={8}>
                <Statistic
                  title="Прибуток"
                  value={Math.round(profit)}
                  suffix="ISK"
                  valueStyle={{ color: profit >= 0 ? "#3f8600" : "#cf1322" }}
                />
              </Col>
              <Col xs={12} md={8}>
                <Statistic
                  title="Маржа"
                  value={craftCost > 0 ? (profit / craftCost) * 100 : 0}
                  precision={1}
                  suffix="%"
                />
              </Col>
            </Row>
          </Card>

          <Text type="secondary">
            Ціни інгредієнтів (сировина) і блюпрінтів. Збережені ціни мають пріоритет; під полем —
            ринкова (середньотижнева) ціна. {formatISK(craftCost)} — поточна вартість крафту.
          </Text>

          <SummaryPanel
            summary={summary}
            onPriceChange={onPriceChange}
            onResetPrices={onResetPrices}
            priceOverrides={priceOverrides}
            marketPrices={data.priceByItemId}
          />
        </Space>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 2: Перевірити компіляцію**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/RatingPriceDrawer.tsx
git commit -m "feat(ui): RatingPriceDrawer for editing sell + ingredient + blueprint prices

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: RatingPage — живий стан цін, дворівневі колонки, drawer

**Files:**
- Modify: `src/store/useCalculator.ts` (експорт `savePriceOverrides`)
- Modify: `src/pages/RatingPage.tsx`

- [ ] **Step 1: Експортувати `savePriceOverrides`**

У `src/store/useCalculator.ts` змінити сигнатуру `function savePriceOverrides` на експорт:

```ts
export function savePriceOverrides(m: Map<number, number>): void {
```

- [ ] **Step 2: Зробити ціни живим станом і додати drawer у RatingPage**

Замінити вміст `src/pages/RatingPage.tsx` на:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Space, Spin, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { loadGameData } from "../api/client";
import type { GameData } from "../api/types";
import { rankCraftProfits, type CraftProfit } from "../domain/rating";
import { loadPriceOverrides, savePriceOverrides } from "../store/useCalculator";
import { ItemIcon } from "../components/ItemIcon";
import { RatingPriceDrawer } from "../components/RatingPriceDrawer";
import { formatDuration, formatISK } from "../domain/format";

const { Text } = Typography;

const columns: ColumnsType<CraftProfit> = [
  {
    title: "Предмет",
    dataIndex: "name",
    key: "name",
    render: (_: string, r: CraftProfit) => (
      <Space>
        <ItemIcon src={r.iconUrl} />
        <span>{r.name}</span>
        {r.kind === "reverse" && <Tag color="purple">реверс</Tag>}
      </Space>
    ),
  },
  {
    title: "Категорія",
    dataIndex: "categoryName",
    key: "categoryName",
    render: (_: string, r: CraftProfit) => (
      <Space direction="vertical" size={0}>
        <span>{r.categoryName}</span>
        <Text type="secondary" style={{ fontSize: 12 }}>{r.groupName}</Text>
      </Space>
    ),
  },
  {
    title: "Ціна продажу",
    dataIndex: "sellPrice",
    key: "sellPrice",
    align: "right",
    sorter: (a, b) => a.sellPrice - b.sellPrice,
    render: (_: number, r: CraftProfit) => (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span>
          {formatISK(r.sellPrice)} {r.sellIsOverride && <Tag color="blue" style={{ marginInlineEnd: 0 }}>своя</Tag>}
        </span>
        {r.sellIsOverride && (
          <Text type="secondary" style={{ fontSize: 11 }}>ринок: {formatISK(r.sellPriceMarket)}</Text>
        )}
      </div>
    ),
  },
  {
    title: "Вартість крафту",
    dataIndex: "craftCost",
    key: "craftCost",
    align: "right",
    sorter: (a, b) => a.craftCost - b.craftCost,
    render: (_: number, r: CraftProfit) => (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span>{formatISK(r.craftCost)}</span>
        {Math.round(r.craftCostMarket) !== Math.round(r.craftCost) && (
          <Text type="secondary" style={{ fontSize: 11 }}>за ринком: {formatISK(r.craftCostMarket)}</Text>
        )}
      </div>
    ),
  },
  {
    title: "Прибуток",
    dataIndex: "profit",
    key: "profit",
    align: "right",
    sorter: (a, b) => a.profit - b.profit,
    render: (v: number) => (
      <Text type={v >= 0 ? "success" : "danger"}>{formatISK(v)}</Text>
    ),
  },
  {
    title: "Маржа",
    dataIndex: "margin",
    key: "margin",
    align: "right",
    sorter: (a, b) => a.margin - b.margin,
    render: (v: number) => `${(v * 100).toFixed(1)}%`,
  },
  {
    title: "Час",
    dataIndex: "craftTime",
    key: "craftTime",
    align: "right",
    sorter: (a, b) => a.craftTime - b.craftTime,
    render: (v: number) => formatDuration(v),
  },
  {
    title: "ISK/год",
    dataIndex: "profitPerHour",
    key: "profitPerHour",
    align: "right",
    defaultSortOrder: "descend",
    sorter: (a, b) => a.profitPerHour - b.profitPerHour,
    render: (v: number) => formatISK(v),
  },
];

export function RatingPage() {
  const [data, setData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [priceOverrides, setPriceOverrides] = useState<Map<number, number>>(loadPriceOverrides);
  const [drawerItemId, setDrawerItemId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadGameData(reloadKey > 0)
      .then((d) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    savePriceOverrides(priceOverrides);
  }, [priceOverrides]);

  const setPriceOverride = useCallback((itemId: number, price: number | null) => {
    setPriceOverrides((prev) => {
      const next = new Map(prev);
      if (price == null) next.delete(itemId);
      else next.set(itemId, price);
      return next;
    });
  }, []);

  const resetPriceOverrides = useCallback(() => setPriceOverrides(new Map()), []);

  const rows = useMemo(() => {
    if (!data) return [];
    return rankCraftProfits({ data, priceOverrides, levels: new Map() });
  }, [data, priceOverrides]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" tip="Обчислення рейтингу…">
          <div style={{ padding: 40 }} />
        </Spin>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Не вдалося завантажити дані"
        description={error}
        action={
          <Button onClick={() => setReloadKey((k) => k + 1)} icon={<ReloadOutlined />}>
            Повторити
          </Button>
        }
        showIcon
      />
    );
  }

  return (
    <Card
      title="Топ-50 найприбутковіших для крафту"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => setReloadKey((k) => k + 1)}>
          Оновити дані
        </Button>
      }
    >
      <Text type="secondary">
        Вартість крафту рахується «до сировини» на максимальних скілах, із цінами блюпрінтів.
        Збережені (ваші) ціни мають пріоритет; ринкова (середньотижнева) показується поряд.
        Клік на рядок — редагувати ціни виробу, інгредієнтів і блюпрінтів.
      </Text>
      <Table<CraftProfit>
        style={{ marginTop: 16 }}
        rowKey="itemId"
        columns={columns}
        dataSource={rows}
        size="small"
        pagination={false}
        scroll={{ x: true }}
        onRow={(r) => ({
          style: { cursor: "pointer" },
          onClick: () => setDrawerItemId(r.itemId),
        })}
      />
      {data && (
        <RatingPriceDrawer
          open={drawerItemId != null}
          data={data}
          itemId={drawerItemId}
          priceOverrides={priceOverrides}
          onPriceChange={setPriceOverride}
          onResetPrices={resetPriceOverrides}
          onClose={() => setDrawerItemId(null)}
        />
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Перевірити компіляцію і збірку**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Ручна перевірка**

Run: `npm run dev`, відкрити `http://localhost:5173/rating`.
Expected:
- Колонки «Ціна продажу» і «Вартість крафту» показують суму; під ними з'являється ринкова, коли є override / коли вартість за ринком відрізняється.
- Клік на рядок відкриває drawer: редагування ціни продажу (з тегом «своя» в таблиці після зміни), список сировини й блюпрінтів із полями цін і ринковими підписами; прибуток/маржа/вартість перераховуються миттєво.
- Зміни переживають перезавантаження сторінки (localStorage) і видні на сторінці калькулятора.

- [ ] **Step 5: Commit**

```bash
git add src/store/useCalculator.ts src/pages/RatingPage.tsx
git commit -m "feat(ui): editable prices + price drawer on rating page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Підсумкова верифікація

- [ ] **Step 1: Повний прогін**

Run: `npm test && npm run typecheck && npm run build`
Expected: усі тести зелені, типи без помилок, збірка успішна.

- [ ] **Step 2: Оновити CLAUDE.md (документація моделі)**

У `src/`-нічого; у `CLAUDE.md` у розділ «Ціни» додати абзац:

```md
Ціна блюпрінта (`item_prices` за `blueprint.id`, напр. `60701000201`) враховується як per-job
розхідник у вартості крафту: `+blueprintPrice × attempts`, ділиться на `passRate` для реверсу
(аналогічно `manufacture_cost`). Невідома ціна блюпрінта трактується як 0. Знижка
`capComponentCostReduction` на ціну блюпрінта не діє.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document blueprint cost in craft calculation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** редагування ціни продукту (Task 7 drawer + колонка); редагування інгредієнтів (Task 6 drawer через SummaryPanel); пріоритет збережених цін + показ ринкової (rating.ts поля + колонки + SummaryPanel sub-line); вартість блюпрінта per-job по дереву (Tasks 2–4); невідома ціна = 0 (тести в Tasks 2–3); знижка cap не на блюпрінт (тест у Task 3); живий стан + persist + спільний із калькулятором (Task 7). Усе покрито.
- **Типи узгоджені:** `blueprintId`/`blueprintUnitPrice`/`blueprintPriceKnown`/`blueprintCost` однакові в `BuildNode`/`JobRow`; `totalBlueprintCost` у `TreeSummary`; `sellPriceMarket`/`sellIsOverride`/`craftCostMarket` у `CraftProfit`; `fullBuildSet` експорт із tree.ts і імпорт у drawer/тесті.
- **Без плейсхолдерів:** усі кроки з кодом містять повний код.
