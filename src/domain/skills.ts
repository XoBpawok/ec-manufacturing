import type { Recipe, Skill } from "../api/types";

export const MAX_SKILL_LEVEL = 5;

export type SkillLevels = Map<string, number>; // skill name → level 0..5

/**
 * Total material-quantity reduction (%) for a set of skills at the given levels.
 * Additive model: the % of each skill is summed. Level 0 → no contribution.
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
    const level = effectiveSkillLevel(name, levels);
    if (level <= 0) continue;
    const value = skill.efficiency[level - 1];
    if (typeof value === "number") total += value;
  }
  return total;
}

/**
 * Total job-time multiplier for a set of skills at the given levels.
 * The `time` factors (negative) are added to 1: Π(1 + factor).
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
    const level = effectiveSkillLevel(name, levels);
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
 * Prerequisite for a skill tier, derived from its name ("Advanced X" / "Expert X").
 * In-game, the Advanced tier can only be trained once the base skill is at least
 * level 4, and the Expert tier only once Advanced is at level 5.
 */
export function skillPrerequisite(name: string): { name: string; minLevel: number } | null {
  if (name.startsWith("Expert ")) {
    return { name: `Advanced ${name.slice("Expert ".length)}`, minLevel: MAX_SKILL_LEVEL };
  }
  if (name.startsWith("Advanced ")) {
    return { name: name.slice("Advanced ".length), minLevel: 4 };
  }
  return null;
}

/**
 * Effective level of a skill: 0 if its prerequisite tier isn't met (the skill
 * couldn't actually be trained), otherwise the stored/defaulted level.
 */
export function effectiveSkillLevel(name: string, levels: SkillLevels): number {
  const prereq = skillPrerequisite(name);
  if (prereq && effectiveSkillLevel(prereq.name, levels) < prereq.minLevel) return 0;
  return levels.get(name) ?? MAX_SKILL_LEVEL;
}

/** Whether a skill's tier is unlocked (its prerequisite, if any, is satisfied). */
export function isSkillUnlocked(name: string, levels: SkillLevels): boolean {
  const prereq = skillPrerequisite(name);
  if (!prereq) return true;
  return effectiveSkillLevel(prereq.name, levels) >= prereq.minLevel;
}

/**
 * Continuous scaling factor for material quantity.
 *
 * If a manual override `meOverride` is given (%, where 100 = blueprint base),
 * skills no longer affect materials: factor = meOverride/100.
 * Otherwise the skill-dependent `skillEfficiencyFactor` is used.
 */
export function materialFactor(
  recipe: Recipe,
  levels: SkillLevels,
  skillByName: Map<string, Skill>,
  meOverride: number | null,
): number {
  if (meOverride != null) return meOverride / 100;
  return skillEfficiencyFactor(recipe, levels, skillByName);
}

/**
 * Effective material quantity accounting for skill levels.
 *
 * Blueprint quantities are given for MAX skills, so we scale relative to the
 * maximum:
 *   qty(levels) = ceil( qtyBp × (1 − effCur/100) / (1 − effMax/100) )
 * At level 5 of every skill it returns exactly qtyBp.
 *
 * `meOverride` (%, optional) overrides skills: blueprint base = 100%.
 */
export function effectiveQuantity(
  baseQuantity: number,
  recipe: Recipe,
  levels: SkillLevels,
  skillByName: Map<string, Skill>,
  meOverride: number | null = null,
): number {
  return Math.ceil(baseQuantity * materialFactor(recipe, levels, skillByName, meOverride));
}

/**
 * Continuous quantity scaling factor (without rounding).
 * Needed by the optimizer to compare costs. At max level = 1.
 */
export function skillEfficiencyFactor(
  recipe: Recipe,
  levels: SkillLevels,
  skillByName: Map<string, Skill>,
): number {
  const effCur = combineEfficiency(recipe.skills, levels, skillByName);
  const effMax = combineEfficiency(recipe.skills, maxLevels(recipe.skills), skillByName);
  const denom = 1 - effMax / 100;
  if (denom <= 0) return 1; // guard against division by ~0
  return (1 - effCur / 100) / denom;
}

/**
 * Effective job time (seconds) accounting for skill levels.
 * Blueprint time is for max skills, so we scale it the same way.
 */
export function effectiveTime(
  recipe: Recipe,
  levels: SkillLevels,
  skillByName: Map<string, Skill>,
): number {
  const cur = combineTimeMultiplier(recipe.skills, levels, skillByName);
  const max = combineTimeMultiplier(recipe.skills, maxLevels(recipe.skills), skillByName);
  if (max <= 0) return recipe.manufactureTime;
  return recipe.manufactureTime * (cur / max);
}
