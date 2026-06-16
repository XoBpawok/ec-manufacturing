const numberFmt = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 });

/** Форматує число ISK з підписом валюти. */
export function formatISK(value: number): string {
  return `${numberFmt.format(Math.round(value))} ISK`;
}

/** Форматує ISK без округлення до цілого (до 2 знаків після коми). */
export function formatISKExact(value: number): string {
  return `${numberFmt.format(value)} ISK`;
}

/** Форматує кількість (цілі одиниці). */
export function formatQuantity(value: number): string {
  return numberFmt.format(value);
}

/** Форматує тривалість у секундах як, напр., "3д 12год 05хв". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0с";
  const s = Math.round(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}д`);
  if (hours) parts.push(`${hours}год`);
  if (mins) parts.push(`${mins}хв`);
  if (!days && !hours && secs) parts.push(`${secs}с`);
  return parts.join(" ") || "0с";
}
