const DAY_MS = 86_400_000;
const GREEN = { r: 0x52, g: 0xc4, b: 0x1a }; // #52c41a
const RED = { r: 0xff, g: 0x4d, b: 0x4f }; // #ff4d4f
const FRESH_DAYS = 3;
const STALE_DAYS = 15;

export function ageInDays(updatedAt: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(updatedAt).getTime()) / DAY_MS;
}

export function freshnessColor(updatedAt: string, now: Date = new Date()): string {
  const days = ageInDays(updatedAt, now);
  const t = Math.min(1, Math.max(0, (days - FRESH_DAYS) / (STALE_DAYS - FRESH_DAYS)));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(GREEN.r, RED.r)}, ${lerp(GREEN.g, RED.g)}, ${lerp(GREEN.b, RED.b)})`;
}

export function freshnessLabel(updatedAt: string, now: Date = new Date()): string {
  const days = Math.floor(ageInDays(updatedAt, now));
  if (days <= 0) return "оновлено сьогодні";
  if (days === 1) return "оновлено вчора";
  return `оновлено ${days} дн. тому`;
}
