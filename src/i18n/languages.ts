import type { Locale } from "antd/es/locale";
import ukUA from "antd/locale/uk_UA";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import esES from "antd/locale/es_ES";
import deDE from "antd/locale/de_DE";
import frFR from "antd/locale/fr_FR";
import plPL from "antd/locale/pl_PL";
import ptPT from "antd/locale/pt_PT";
import jaJP from "antd/locale/ja_JP";
import itIT from "antd/locale/it_IT";
import koKR from "antd/locale/ko_KR";
import trTR from "antd/locale/tr_TR";

export interface LanguageMeta {
  code: string;
  // Endonym (name of the language in that language).
  nativeName: string;
  // ISO 3166-1 alpha-2 country code used to render an SVG flag (country-flag-icons).
  countryCode: string;
  antd: Locale;
}

// Ukrainian is intentionally first. Russian is deliberately excluded.
export const LANGUAGES: LanguageMeta[] = [
  { code: "uk", nativeName: "Українська", countryCode: "UA", antd: ukUA },
  { code: "en", nativeName: "English", countryCode: "GB", antd: enUS },
  { code: "zh", nativeName: "中文", countryCode: "CN", antd: zhCN },
  { code: "es", nativeName: "Español", countryCode: "ES", antd: esES },
  { code: "de", nativeName: "Deutsch", countryCode: "DE", antd: deDE },
  { code: "fr", nativeName: "Français", countryCode: "FR", antd: frFR },
  { code: "pl", nativeName: "Polski", countryCode: "PL", antd: plPL },
  { code: "pt", nativeName: "Português", countryCode: "PT", antd: ptPT },
  { code: "ja", nativeName: "日本語", countryCode: "JP", antd: jaJP },
  { code: "it", nativeName: "Italiano", countryCode: "IT", antd: itIT },
  { code: "ko", nativeName: "한국어", countryCode: "KR", antd: koKR },
  { code: "tr", nativeName: "Türkçe", countryCode: "TR", antd: trTR },
];

export const DEFAULT_LANGUAGE = "uk";

export function antdLocaleFor(code: string): Locale {
  return (LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]).antd;
}

// Pick the best supported language for an ordered list of browser locales
// (e.g. `navigator.languages` like ["en-US", "uk"]). Matches on the primary
// subtag, case-insensitively, and falls back to Ukrainian when nothing fits.
export function detectLanguage(candidates: readonly string[]): string {
  for (const candidate of candidates) {
    const primary = candidate.toLowerCase().split("-")[0];
    if (LANGUAGES.some((l) => l.code === primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}
