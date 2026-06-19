# Хостинг на GitHub Pages + спільні ціни в Supabase

## Мета

1. Захостити SPA на **GitHub Pages** (статичний хостинг, безкоштовно).
2. Перенести введені користувачем ціни (`priceOverrides`) з `localStorage` у
   **спільну глобальну** базу даних (Supabase), щоб усі відвідувачі бачили й
   редагували один набір цін, без логіну.
3. Показувати **свіжість** кожної спільної ціни кольоровим індикатором
   (зелений на 1–3 дні → плавно червоний на 15-й день).
4. Усюди, де є кастомна ціна, **поряд показувати ринкову** ціну (для порівняння).
5. **Прибрати скидання цін** повністю (ні глобального reset, ні поштучного
   повернення до ринкової). Ціну можна лише редагувати на інше значення.

## Поточний стан (контекст)

- Vite + React + TS SPA, без git-remote.
- `priceOverrides: Map<number, number>` — центральна структура, яку споживають
  `domain/tree.ts`, `domain/optimize.ts`, `domain/rating.ts`. **Інтерфейс
  зберігаємо незмінним** — доменний код не чіпаємо.
- Стан override-ів зараз дублюється: `useCalculator.ts` має свою копію
  (localStorage ключ `ec-manufacturing:priceOverrides:v1`), а `RatingPage.tsx`
  — **окрему** свою копію з того ж ключа. Централізуємо на одному джерелі.
- `SummaryPanel` уже приймає `marketPrices` й показує обидві ціни; має кнопку
  глобального reset (~рядок 230) — її видаляємо.
- Роутинг: `BrowserRouter` у `main.tsx`, маршрути `/` та `/rating`.

## Архітектура

### 1. База даних (Supabase)

Таблиця `prices`:

| колонка | тип | примітки |
|---|---|---|
| `item_id` | `bigint` | primary key |
| `price` | `double precision` | not null |
| `updated_at` | `timestamptz` | not null, default `now()` |

RLS увімкнено. Політики для ролі `anon`:
- `select` — `true` (усі читають)
- `insert` — `true`
- `update` — `true`

`delete` **не** дозволяємо (скидання прибрано — рядки не видаляються).

Upsert встановлює `updated_at = now()` явно при кожному записі (щоб
`on conflict do update` оновлював мітку).

### 2. Шар даних клієнта — `src/api/prices.ts`

Залежність: `@supabase/supabase-js`.

Клієнт створюється з env-змінних `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

API модуля:
- `pricesConfigured: boolean` — чи задані env-змінні.
- `fetchPrices(): Promise<PriceMap>` де
  `PriceMap = Map<number, { price: number; updatedAt: string }>`.
- `upsertPrice(itemId: number, price: number): Promise<{ updatedAt: string }>` —
  upsert із `updated_at = new Date().toISOString()`.

**Fallback на localStorage:** якщо `pricesConfigured === false` (env не задані —
dev без секретів, тести) або мережевий виклик кинув помилку, модуль працює на
`localStorage` під ключем `ec-manufacturing:priceOverrides:v1` (мітки часу при
fallback беруться як «зараз» або з паралельного ключа
`ec-manufacturing:priceOverridesMeta:v1`). Це гарантує, що dev, тести й офлайн
не ламаються.

### 3. Інтеграція в стан — `src/store/usePrices.ts` (новий хук)

Виносимо спільний стан цін в окремий хук `usePrices()`, щоб і
`CalculatorPage` (через `useCalculator`), і `RatingPage` користувались **одним**
джерелом (усуваємо дубляж).

`usePrices()` повертає:
- `priceOverrides: Map<number, number>` — для доменного коду (як зараз).
- `priceMeta: Map<number, { updatedAt: string }>` — для індикатора свіжості.
- `pricesLoading: boolean`.
- `setPriceOverride(itemId: number, price: number): void` — оптимістично оновлює
  локальні мапи + `upsertPrice` у Supabase; при помилці лишається локальний кеш
  і показується тихе попередження (antd `message.warning`).

На монтуванні: миттєво читаємо localStorage-кеш → `fetchPrices()` оновлює мапи
й перезаписує кеш. `setPriceOverride` **не приймає `null`** (скидання прибрано).

`useCalculator` використовує `usePrices()` всередині; з його публічного
інтерфейсу прибираємо `resetPriceOverrides`, а `setPriceOverride` звужуємо до
`(itemId: number, price: number)`.

### 4. Індикатор свіжості — `src/domain/freshness.ts`

Чиста функція (з тестами):

```ts
freshnessColor(updatedAt: string, now?: Date): string
```

- вік ≤ 3 дні → зелений (`#52c41a`)
- вік ≥ 15 днів → червоний (`#ff4d4f`)
- між 3 і 15 днями → лінійна інтерполяція RGB між зеленим і червоним

Допоміжне `freshnessLabel(updatedAt, now?)` → «оновлено N днів тому» / «сьогодні».

UI: кольорова крапка (`●`) + antd `Tooltip` з лейблом біля кожної спільної ціни
у:
- `CraftTree` (рядок матеріалу з override),
- `SummaryPanel` (список покупок),
- `RatingPage` (де редагуються ціни).

Усюди, де показано кастомну ціну, ринкова ціна показується поряд приглушеним
стилем (для `CraftTree`/`RatingPage` додати так само, як уже зроблено в
`SummaryPanel`).

### 5. Видалення скидання цін

- Прибрати кнопку глобального reset зі `SummaryPanel` (~рядок 230) і пов'язаний
  `priceOverrideCount`-disabled блок, якщо він лишається лише для reset.
- Прибрати `resetPriceOverrides` з `useCalculator` та всіх місць виклику.
- `setPriceOverride` більше не має гілки `price == null`.

## Деплой на GitHub Pages

1. **Роутер:** `BrowserRouter` → `HashRouter` у `main.tsx`. URL стають
   `…/#/` та `…/#/rating` — refresh і прямі посилання працюють на Pages без
   404-костилів.
2. **Vite:** `base: "./"` у `vite.config.ts` — відносні шляхи до ассетів, не
   залежить від назви репозиторію.
3. **Workflow** `.github/workflows/deploy.yml`: тригер `push` у `main` →
   `actions/checkout` → `setup-node` → `npm ci` → `npm run build` →
   `actions/upload-pages-artifact` (`dist`) → `actions/deploy-pages`.
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` передаються як GitHub
   **repository Variables** (публічні за дизайном — anon-ключ призначений для
   браузера; захист через RLS) у крок build через `env:`.
4. **Ручні одноразові кроки** (виконує користувач, надамо інструкцію/команди):
   - створити Supabase-проєкт, виконати SQL для таблиці + політик;
   - створити GitHub-репо, додати remote, `git push`;
   - Settings → Pages → Source = «GitHub Actions»;
   - Settings → Secrets and variables → Actions → Variables: додати дві змінні.

## Тести

- `freshness.test.ts` — `freshnessColor` на межах 0 / 3 / 9 / 15 / 30 днів і
  `freshnessLabel`.
- `prices.test.ts` — мок `@supabase/supabase-js`: мапінг `fetchPrices`,
  `upsertPrice` ставить `updated_at`; гілка localStorage-fallback при
  `pricesConfigured === false` та при кинутій помилці.
- Існуючі доменні тести (`tree`, `optimize`, `rating`) лишаються без змін —
  інтерфейс `priceOverrides: Map<number, number>` збережено.

## Поза скоупом

- Логін / per-user ціни.
- Історія/аудит змін цін.
- Захист від вандалізму понад RLS (rate limiting тощо).
- Кастомний домен для Pages.
