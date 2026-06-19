# EVE Echoes Manufacturing Calculator

Калькулятор ресурсів, вартості та часу для виробництва предметів у EVE Echoes.
Дані тягнуться наживо з [echoes.mobi API](https://echoes.mobi/api).

## Можливості

- Вибір будь-якого craftable-предмета зі списку (за замовчуванням — **Naglfar**).
- Рекурсивне дерево крафту з перемикачем **купити / крафтити** для кожного компонента.
- Ціна за одиницю (редагована), сума по матеріалу, підсумки по категоріях.
- Вартість і час кожного job, загальні підсумки.
- Слайдери рівнів індустрі-скілів (0-5) — миттєвий перерахунок кількостей, вартості й часу.
- Порівняння «зкрафтити vs купити готовий».

## Запуск

```bash
npm install
npm run dev       # дев-сервер
npm run build     # production-білд
npm run test      # юніт-тести доменної логіки
npm run typecheck # перевірка типів
```

## Структура

```
src/
  api/        фетчери ендпоінтів + типи, нормалізація, кеш у localStorage
  domain/     чисті функції: дерево крафту, рушій скілів, вартість, форматування (+ тести)
  components/ ItemSelector, SkillsPanel, CraftTree, SummaryPanel
  store/      useCalculator — стан і похідні (дерево, підсумки)
  App.tsx
```

Опис API та моделі даних — у [`CLAUDE.md`](./CLAUDE.md).
Дизайн — у [`docs/superpowers/specs/`](./docs/superpowers/specs/).

## Спільні ціни (Supabase)

Введені ціни зберігаються у спільній таблиці `prices` Supabase (без логіну).
Без env-змінних застосунок працює на localStorage.

1. Створіть безкоштовний проєкт на supabase.com.
2. SQL Editor → виконайте `supabase/schema.sql`.
3. Project Settings → API: скопіюйте `Project URL` та `anon public` ключ.
4. Локально: `.env.local` зі `VITE_SUPABASE_URL` і `VITE_SUPABASE_ANON_KEY`.
5. Для деплою: GitHub repo → Settings → Secrets and variables → Actions →
   Variables: додайте `VITE_SUPABASE_URL` і `VITE_SUPABASE_ANON_KEY`.
