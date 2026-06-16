# Ручне перевизначення ефективності матеріалів

## Проблема

Бонуси індустріальних структур корпорації знижують (або, для слабкого сетапу,
підвищують) кількість матеріалів на job. Цих даних немає в echoes.mobi API — вони
специфічні для конкретного гравця. Тому потрібна можливість задати фінальну
ефективність матеріалів вручну.

## Рішення

Опціональне глобальне поле **«Ефективність матеріалів, %»**, діапазон **50–150**.

Семантика — **заміна** (не стек поверх скілів):

- **Не задано (`null`)** → поточна поведінка: кількість матеріалів масштабується
  скілами, база = значення блюпрінта (задане для макс. скілів).
- **Задано = `V`** → значення блюпрінта вважаємо за 100%, скіли більше не
  впливають на матеріали:

  ```
  qty = ceil( blueprint_qty × V/100 ) × runs
  ```

  - `V = 100` → рівно блюпрінт (= макс. скіли)
  - `V = 50` → вдвічі менше матеріалів
  - `V = 150` → в 1.5× більше матеріалів

### Скоуп

- Перекриває **тільки кількість матеріалів** і тільки для `manufacture`-вузлів
  (як і скіли зараз; реверс споживає сирі `quantity × attempts`, ME його не чіпає).
- **Час job рахується як раніше** — скіли далі впливають на час через
  `effectiveTime`. Ручне ME часу не торкається.
- Вартість job не змінюється.

## Зміни в коді

1. **`src/domain/skills.ts`** — нова чиста функція
   `materialFactor(recipe, levels, skillByName, meOverride: number | null)`:
   повертає `meOverride/100`, якщо задано, інакше `skillEfficiencyFactor(...)`.
   `effectiveQuantity` приймає `meOverride` і використовує `materialFactor` замість
   прямого виклику `skillEfficiencyFactor`.
2. **`src/domain/tree.ts`** — `TreeParams.materialEfficiency: number | null`;
   проброс у гілку manufacture (`effectiveQuantity(...)`).
3. **`src/domain/optimize.ts`** — `OptimizeParams.materialEfficiency: number | null`;
   `perUnit` для manufacture використовує `materialFactor` замість
   `skillEfficiencyFactor` (build-vs-buy лишається коректним).
4. **`src/store/useCalculator.ts`** — стан `materialEfficiency: number | null` +
   сеттер `setMaterialEfficiency`; проброс у tree- та optimize-параметри.
5. **UI (`src/components/SkillsPanel.tsx`)** — `InputNumber` (min 50, max 150,
   суфікс `%`) з кнопкою очистити (`null`), зверху панелі (показуємо навіть коли
   скілів нема). Підказка: перекриває матеріали, але не час job.

## Тести (`src/domain/skills.test.ts`)

- `materialFactor(null)` дорівнює `skillEfficiencyFactor` (скіл-поведінка).
- `materialFactor(100)` → база блюпрінта (фактор 1.0, `effectiveQuantity` = qty).
- `materialFactor(50)` / `materialFactor(150)` → коректне масштабування.
- Округлення вгору в `effectiveQuantity` з override.

## Поза скоупом

- Окремі сутності-структури з рівнями (можливе майбутнє розширення).
- Бонус структур до часу job.
- Персист значення в localStorage (скіли теж не персистяться — лишаємо
  консистентно).
