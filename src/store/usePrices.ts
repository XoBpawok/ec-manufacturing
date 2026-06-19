import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "antd";
import { fetchPrices, upsertPrice, type PriceEntry } from "../api/prices";

export interface PricesState {
  priceOverrides: Map<number, number>;
  priceMeta: Map<number, PriceEntry>;
  pricesLoading: boolean;
  setPriceOverride: (itemId: number, price: number) => void;
}

const UPSERT_DEBOUNCE_MS = 500;

// Очікувано існує кілька незалежних інстансів usePrices() одночасно (сторінка калькулятора
// й сторінка рейтингу) — таблиця `prices` у Supabase є спільним джерелом правди; кожен інстанс
// підвантажує дані при монтуванні, тому стан синхронізується через сервер, а не між інстансами напряму.
export function usePrices(): PricesState {
  const [priceMeta, setPriceMeta] = useState<Map<number, PriceEntry>>(new Map());
  const [pricesLoading, setPricesLoading] = useState(true);
  const pendingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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
      for (const timer of pendingTimers.current.values()) clearTimeout(timer);
      pendingTimers.current.clear();
    };
  }, []);

  const setPriceOverride = useCallback((itemId: number, price: number) => {
    // оптимістичне оновлення — миттєво, синхронно
    const optimistic: PriceEntry = { price, updatedAt: new Date().toISOString() };
    setPriceMeta((prev) => new Map(prev).set(itemId, optimistic));

    // дебаунс мережевого запису в Supabase: InputNumber.onChange стріляє щоразу при наборі
    // символу, а таблиця prices — спільна, тож пишемо туди не частіше ніж раз на ~500мс на itemId
    const existing = pendingTimers.current.get(itemId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      pendingTimers.current.delete(itemId);
      upsertPrice(itemId, price)
        .then((entry) => {
          setPriceMeta((prev) => {
            const current = prev.get(itemId);
            // захист від запізнілої відповіді: не перезаписуємо новіший локальний стан старішим
            if (current && entry.updatedAt < current.updatedAt) return prev;
            return new Map(prev).set(itemId, entry);
          });
        })
        .catch(() => {
          void message.warning("Не вдалося зберегти ціну в базі — лишилась локально");
        });
    }, UPSERT_DEBOUNCE_MS);
    pendingTimers.current.set(itemId, timer);
  }, []);

  const priceOverrides = new Map<number, number>();
  for (const [id, e] of priceMeta) priceOverrides.set(id, e.price);

  return { priceOverrides, priceMeta, pricesLoading, setPriceOverride };
}
