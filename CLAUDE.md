# EVE Echoes Manufacturing Calculator

Розрахунок ресурсів, вартості та часу для побудови предметів у грі **EVE Echoes**.
Перший цільовий предмет — корабель **Naglfar**, але сторінка універсальна: можна вибрати будь-який craftable-предмет.

## Стек

- Vite + React + TypeScript
- Ant Design (UI)
- Жива загрузка даних з API echoes.mobi, кеш у `localStorage`

## Джерело даних: echoes.mobi API

API Platform (Symfony/Hydra). За замовчуванням віддає `text/csv`; для JSON слати заголовок `Accept: application/json`.
**Важливо:** запити вимагають браузерний `User-Agent` — без нього Cloudflare віддає `403`.
CORS дозволено (сервер віддзеркалює `Origin`), тому браузерний SPA може тягнути дані напряму.

Entrypoint: `https://echoes.mobi/api` (`Accept: application/json` дає мапу ресурс → URL).

### Ключові ендпоінти

| Ресурс | URL | Що віддає |
|---|---|---|
| Items | `/api/items` | Предмети (ПАГІНОВАНО 500/стор, `?page=N`): `id`, `name`, `category_name`, `group_name`, `weekly_average_price`, `icon_url` |
| Item categories | `/api/item_categories` | 38 категорій, кожна з `group_names` |
| Blueprints (рецепти) | `/api/v2/item_blueprints` | ≈1528 рецептів одним запитом (пагінація `?page` ігнорується — віддає все) |
| Prices | `/api/v2/item_prices` | 6151 предмет: `id`, `name`, `estimated_price`, `icon_id`, `category_name`, `group_name` |
| Reverse engineering | `/api/v2/item_reverse_engineering` | 1347 рецептів: та сама структура, що й блюпрінти, **плюс** `pass_rate` (ймовірність успіху) |
| Industry skills | `/api/v2/industry_skills` | 66 скілів: `name`, `efficiency`, `time` |
| Invention skills | `/api/v2/invention_skills` | Скіли реверсу: `name`, `rate` (бонус до pass_rate), `time` — поки НЕ використовуємо |
| Weekly avg (історія) | `/api/item_weekly_average_prices` | Часовий ряд цін по тижнях (`week`, `year`, `price`) — НЕ використовуємо для калькулятора |

Застосунок завантажує 4 ендпоінти: `item_blueprints`, `item_reverse_engineering`, `item_prices`, `industry_skills`.

### Два джерела рецептів (не перетинаються)

Предмет може вироблятися (`item_blueprints`) **або** реверс-інжинірингом (`item_reverse_engineering`), але **ніколи обома** — множини `item_id` не перетинаються (перевірено: 0 спільних). Тому в коді вони злиті в одну мапу `recipeByItemId` з полем `kind: 'manufacture' | 'reverse'`.

Реверс має `pass_rate` (напр. 0.25) — ймовірність успіху. Очікувана кількість спроб на один успіх = `1 / pass_rate`, тому матеріали, вартість job і час множаться на `attempts = runs / pass_rate`. Скіли реверсу (invention) поки моделюються як фіксований pass_rate з рецепту (припущення).

### Іконки

`item_prices` містить `icon_id` для всіх 6151 предметів (для матеріалів `icon_id == id`). URL: `https://echoes.mobi/public/icons/{icon_id}.png`. Будуємо мапу `iconByItemId`.

### Структура блюпрінта (`/api/v2/item_blueprints`)

```jsonc
{
  "id": "60701000201",
  "name": "Naglfar",
  "category_name": "Ship",
  "group_name": "Dreadnoughts",
  "output_number": "1",          // скільки штук виходить за один job
  "skill_level": "10",           // рівень рецепту (не плутати зі скілами гравця)
  "manufacture_cost": "2500000000",   // вартість job (ISK)
  "manufacture_time": "2400000",      // час job (секунди)
  "decryptor_amount": "35",
  "iconId": "10701000411",
  "item_id": "10701000201",      // = id предмета, який виробляється
  "skills": "Dreadnought Manufacture,Advanced Dreadnought Manufacture,...", // релевантні індустрі-скіли
  "materials": [
    { "id": 27011000000, "name": "Capital Ship Maintenance Bay", "type": "Capital Construction Components", "quantity": 5 },
    ...
  ]
}
```

### Рекурсивне дерево крафту

Матеріали блюпрінта можуть самі бути craftable-предметами (мати власний блюпрінт за своїм `item_id`).
Naglfar → 13 «Capital Construction Components» → кожен компонент має блюпрінт із мінералів (Tritanium, Pyerite…) та планетарних матеріалів.
Лист дерева — сирі матеріали без блюпрінта (мінерали, планетарка).

Звʼязок: `blueprint.item_id` дорівнює `item.id`. Мапа `blueprintByItemId` дозволяє визначити, чи матеріал craftable.

**Важливо:** `/api/items` пагінований (500/стор), і навіть Naglfar/Tritanium не на першій сторінці. Тому застосунок **не** залежить від `/api/items`: список craftable-предметів для селектора виводиться з блюпрінтів (кожен блюпрінт має `name`/`category_name`/`group_name`), а назви й типи матеріалів беруться з масиву `materials` батьківського блюпрінта. Завантажуються лише 3 ендпоінти: blueprints, prices, industry_skills.

## Ціни

`estimated_price` (з `/api/v2/item_prices`) **збігається** з `weekly_average_price` предмета там, де обидва присутні (перевірено: 81/81 на сторінці).
`estimated_price` — повніший (6151 предмет), тому це **єдине джерело ціни** в калькуляторі.
Користувач може вручну перевизначити ціну будь-якого матеріалу (override'и зберігаються в
`localStorage` під ключем `ec-manufacturing:priceOverrides:v1`, спільним для калькулятора й сторінки
рейтингу). Override має пріоритет над ринковою (середньотижневою) ціною; обидві показуються в UI.

Ціна блюпрінта (`item_prices` за `blueprint.id`, напр. `60701000201` = «Naglfar Blueprint») враховується
як per-job розхідник у вартості крафту: `+blueprintPrice × attempts`, ділиться на `passRate` для реверсу
(аналогічно `manufacture_cost`). Невідома ціна блюпрінта трактується як 0 (предмет не випадає з рейтингу).
Знижка `capComponentCostReduction` на ціну блюпрінта **не** діє. `Recipe.blueprintId` несе власний `id`
рецепту; ціни блюпрінтів живуть у тій же мапі `priceByItemId`, тож override блюпрінта працює тим самим механізмом.

## Скіли індустрії

Кожен скіл має `efficiency` (зниження кількості матеріалів, % по рівнях 1-5) та `time` (зниження часу job, множник по рівнях 1-5).

Приклад (`efficiency` / `time`):
```
Dreadnought Manufacture           4,8,12,16,20    0,-0.05,-0.1,-0.15,-0.2
Advanced Dreadnought Manufacture  3,6,9,12,15     0,-0.05,-0.1,-0.15,-0.2
Expert Dreadnought Manufacture    1,2,3,4,5       0,-0.05,-0.1,-0.15,-0.2
Capital Ship Manufacture          1,2,3,4,5       0,0,-0.03,-0.06,-0.1
Capital Ship Component Manufacture 6,12,18,24,30  -0.05,-0.1,-0.15,-0.2,-0.25
```

**Кількості в блюпрінті задані для МАКСИМАЛЬНИХ скілів (рівень 5) — найефективніший набір.**
Тому:
- база без скілів: `qty_base = qty_bp / (1 − Σeff_max/100)`
- при обраних рівнях: `qty(levels) = qty_bp × (1 − Σeff(levels)/100) / (1 − Σeff_max/100)`, округлення вгору
- зниження рівня скіла **збільшує** кількість матеріалів
- комбінування скілів **адитивне** (сума %) — припущення, винесене в окрему чисту функцію з тестами

`blueprint.skills` перелічує, які саме скіли впливають на цей рецепт.

## Поза скоупом (наразі)

Invention, reverse engineering, killmails, планетарка як окремий калькулятор, мультимовність (locale).

## Команди для дослідження API

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
curl -s -A "$UA" -H "Accept: application/json" "https://echoes.mobi/api/v2/item_blueprints"
```
