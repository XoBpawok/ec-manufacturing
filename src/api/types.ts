// Нормалізовані доменні типи (після парсингу string→number з API).

export interface Material {
  id: number;
  name: string;
  type: string;
  quantity: number;
}

export interface Blueprint {
  itemId: number;
  name: string;
  categoryName: string;
  groupName: string;
  outputNumber: number;
  manufactureCost: number;
  manufactureTime: number; // секунди
  skills: string[]; // назви релевантних індустрі-скілів
  materials: Material[];
}

export interface Skill {
  name: string;
  efficiency: number[]; // % зниження кількості, індекс 0..4 = рівень 1..5
  time: number[]; // множник зниження часу, індекс 0..4 = рівень 1..5
}

/** Елемент для селектора — craftable-предмет (виводиться з блюпрінтів). */
export interface CraftableItem {
  id: number;
  name: string;
  groupName: string;
  categoryName: string;
}

export interface GameData {
  craftables: CraftableItem[];
  blueprintByItemId: Map<number, Blueprint>;
  priceByItemId: Map<number, number>; // estimated_price
  skillByName: Map<string, Skill>;
  fetchedAt: number;
}
