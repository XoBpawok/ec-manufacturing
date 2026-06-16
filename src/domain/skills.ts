import type { Blueprint, Skill } from "../api/types";

export const MAX_SKILL_LEVEL = 5;

export type SkillLevels = Map<string, number>; // назва скіла → рівень 0..5

/**
 * Сумарне зниження кількості матеріалів (%) для набору скілів на заданих рівнях.
 * Адитивна модель: % від кожного скіла додаються. Рівень 0 → внесок 0.
 */
export function combineEfficiency(
  skillNames: string[],
  levels: SkillLevels,
  skillByName: Map<string, Skill>,
): number {
  let total = 0;
  for (const name of skillNames) {
    const skill = skillByName.get(name);
    if (!skill) continue;
    const level = levels.get(name) ?? MAX_SKILL_LEVEL;
    if (level <= 0) continue;
    const value = skill.efficiency[level - 1];
    if (typeof value === "number") total += value;
  }
  return total;
}

/**
 * Сумарний множник часу job для набору скілів на заданих рівнях.
 * Множники з поля `time` (від'ємні) додаються до 1: Π(1 + factor).
 */
export function combineTimeMultiplier(
  skillNames: string[],
  levels: SkillLevels,
  skillByName: Map<string, Skill>,
): number {
  let multiplier = 1;
  for (const name of skillNames) {
    const skill = skillByName.get(name);
    if (!skill) continue;
    const level = levels.get(name) ?? MAX_SKILL_LEVEL;
    if (level <= 0) continue;
    const factor = skill.time[level - 1];
    if (typeof factor === "number") multiplier *= 1 + factor;
  }
  return multiplier;
}

function maxLevels(skillNames: string[]): SkillLevels {
  return new Map(skillNames.map((n) => [n, MAX_SKILL_LEVEL]));
}

/**
 * Ефективна кількість матеріалу з урахуванням рівнів скілів.
 *
 * Кількість у блюпрінті задана для МАКСИМАЛЬНИХ скілів, тому масштабуємо
 * відносно максимуму:
 *   qty(levels) = ceil( qtyBp × (1 − effCur/100) / (1 − effMax/100) )
 * На рівні 5 усіх скілів повертає рівно qtyBp.
 */
export function effectiveQuantity(
  baseQuantity: number,
  blueprint: Blueprint,
  levels: SkillLevels,
  skillByName: Map<string, Skill>,
): number {
  const effCur = combineEfficiency(blueprint.skills, levels, skillByName);
  const effMax = combineEfficiency(blueprint.skills, maxLevels(blueprint.skills), skillByName);
  const denom = 1 - effMax / 100;
  if (denom <= 0) return Math.ceil(baseQuantity); // захист від ділення на ~0
  const factor = (1 - effCur / 100) / denom;
  return Math.ceil(baseQuantity * factor);
}

/**
 * Ефективний час job (секунди) з урахуванням рівнів скілів.
 * Час у блюпрінті — для максимальних скілів, тому масштабуємо так само.
 */
export function effectiveTime(
  blueprint: Blueprint,
  levels: SkillLevels,
  skillByName: Map<string, Skill>,
): number {
  const cur = combineTimeMultiplier(blueprint.skills, levels, skillByName);
  const max = combineTimeMultiplier(blueprint.skills, maxLevels(blueprint.skills), skillByName);
  if (max <= 0) return blueprint.manufactureTime;
  return blueprint.manufactureTime * (cur / max);
}
