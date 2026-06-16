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
| Prices | `/api/v2/item_prices` | 6151 предмет: `id`, `name`, `estimated_price`, `category_name`, `group_name` |
| Industry skills | `/api/v2/industry_skills` | 66 скілів: `name`, `efficiency`, `time` |
| Weekly avg (історія) | `/api/item_weekly_average_prices` | Часовий ряд цін по тижнях (`week`, `year`, `price`) — НЕ використовуємо для калькулятора |

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
Користувач може вручну перевизначити ціну будь-якого матеріалу.

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
