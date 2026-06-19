#!/usr/bin/env node
// Серверний снапшот даних echoes.mobi.
//
// echoes.mobi (через Cloudflare) БІЛЬШЕ НЕ віддає CORS-заголовки, тож браузерний
// SPA на github.io не може тягнути API напряму. Натомість цей скрипт виконується
// у середовищі без CORS (GitHub Actions / локально через Node) і зберігає сирі
// JSON-відповіді у public/data/*.json. Vite копіює public/ у dist/, тому застосунок
// вантажить ці файли same-origin (див. src/api/client.ts).
//
// Запуск:
//   node scripts/fetch-data.mjs              — завжди тягне свіже
//   node scripts/fetch-data.mjs --if-missing — пропустити, якщо всі файли вже є

import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "data");

// Cloudflare віддає 403 без браузерного User-Agent.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const BASE = "https://echoes.mobi/api";

// endpoint → ім'я файлу
const ENDPOINTS = {
  "/v2/item_blueprints": "item_blueprints.json",
  "/v2/item_reverse_engineering": "item_reverse_engineering.json",
  "/v2/item_prices": "item_prices.json",
  "/v2/industry_skills": "industry_skills.json",
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchEndpoint(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} → HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`GET ${path} → очікувався масив, отримано ${typeof data}`);
  }
  return data;
}

async function main() {
  const ifMissing = process.argv.includes("--if-missing");
  await mkdir(OUT_DIR, { recursive: true });

  if (ifMissing) {
    const present = await Promise.all(
      Object.values(ENDPOINTS).map((f) => exists(join(OUT_DIR, f))),
    );
    if (present.every(Boolean)) {
      console.log("fetch-data: усі файли на місці, пропускаю (--if-missing)");
      return;
    }
  }

  for (const [path, file] of Object.entries(ENDPOINTS)) {
    const data = await fetchEndpoint(path);
    await writeFile(join(OUT_DIR, file), JSON.stringify(data));
    console.log(`fetch-data: ${file} ← ${data.length} записів`);
  }
}

main().catch((err) => {
  console.error("fetch-data: помилка —", err.message);
  process.exit(1);
});
