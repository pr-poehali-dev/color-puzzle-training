// 12 цветов круга Итена
// 0=Жёлтый, 1=Жёлто-оранжевый, 2=Оранжевый, 3=Красно-оранжевый,
// 4=Красный, 5=Красно-фиолетовый, 6=Фиолетовый, 7=Сине-фиолетовый,
// 8=Синий, 9=Сине-зелёный, 10=Зелёный, 11=Жёлто-зелёный
// Пары (через 6): 0↔6, 1↔7, 2↔8, 3↔9, 4↔10, 5↔11
export const ITTEN_COLORS = [
  { id: 0,  name: "Жёлтый",           hex: "#F9E01B" },
  { id: 1,  name: "Жёлто-оранжевый",  hex: "#FDB827" },
  { id: 2,  name: "Оранжевый",        hex: "#F7941D" },
  { id: 3,  name: "Красно-оранжевый", hex: "#F05A23" },
  { id: 4,  name: "Красный",          hex: "#E8231A" },
  { id: 5,  name: "Красно-фиолет.",   hex: "#A6195A" },
  { id: 6,  name: "Фиолетовый",       hex: "#662D91" },
  { id: 7,  name: "Сине-фиолет.",     hex: "#2E3192" },
  { id: 8,  name: "Синий",            hex: "#0072BC" },
  { id: 9,  name: "Сине-зелёный",     hex: "#00A99D" },
  { id: 10, name: "Зелёный",          hex: "#009444" },
  { id: 11, name: "Жёлто-зелёный",    hex: "#8DC63F" },
];

// Триады (через 4): [0,4,8], [1,5,9], [2,6,10], [3,7,11]
// Тетрады (через 3): [0,3,6,9], [1,4,7,10], [2,5,8,11]
export const TRIADS: number[][] = [
  [0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11],
];
export const TETRADS: number[][] = [
  [0, 3, 6, 9], [1, 4, 7, 10], [2, 5, 8, 11],
];

export const COLS = 5;
export const ROWS = 5;
export const CELL_SIZE = 62;
export const GAP = 4;
export const BOARD_W = COLS * CELL_SIZE + (COLS - 1) * GAP;
export const BOARD_H = ROWS * CELL_SIZE + (ROWS - 1) * GAP;
export const ANIM_DURATION = 400;
export const STORAGE_KEY = "colorist_scores_v3";
export const BG = "#2A2A2A";
export const CELL_EMPTY = "#363636";
export const CELL_EMPTY_HOVER = "#404040";
export const WHEEL_COUNT = ITTEN_COLORS.length; // 12 (для геометрии колеса)

// Уровни: [порог очков, добавляемые id цветов]
export const COLOR_LEVELS: { threshold: number; ids: number[] }[] = [
  { threshold: 0,  ids: [0, 2, 4, 6, 8, 10] }, // старт: 6 основных
  { threshold: 10, ids: [1, 7] },               // +2 при 10 очках
  { threshold: 25, ids: [3, 9] },               // +2 при 25 очках
  { threshold: 40, ids: [5, 11] },              // +2 при 40 очках
];

export type Cell = { colorId: number } | null;
export type Grid = Cell[][];

export interface FlyingTile {
  col: number;
  colorId: number;
  targetRow: number;
  progress: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  dist: number;
}

export interface ScoreEntry {
  score: number;
  date: string;
}

export const getComplement = (id: number): number => (id + 6) % 12;

export const getTriad = (id: number): number[] | null =>
  TRIADS.find((t) => t.includes(id)) ?? null;

export const getTetrad = (id: number): number[] | null =>
  TETRADS.find((t) => t.includes(id)) ?? null;

export const getActiveColorIds = (score: number): number[] => {
  const ids: number[] = [];
  for (const level of COLOR_LEVELS) {
    if (score >= level.threshold) ids.push(...level.ids);
  }
  return ids;
};

export const randColorIdFromActive = (activeIds: number[], exclude?: number) => {
  const pool = activeIds.length > 1 && exclude !== undefined
    ? activeIds.filter((id) => id !== exclude)
    : activeIds;
  return pool[Math.floor(Math.random() * pool.length)];
};

export const emptyGrid = (): Grid =>
  Array.from({ length: ROWS }, () => Array(COLS).fill(null));

export const loadScores = (): ScoreEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

export const getBestScore = (): number => {
  const s = loadScores();
  return s.length > 0 ? s[0].score : 0;
};

export const saveScore = (score: number) => {
  const scores = loadScores();
  scores.push({ score, date: new Date().toLocaleDateString("ru-RU") });
  scores.sort((a, b) => b.score - a.score);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 10)));
};

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const pluralScore = (n: number) => {
  if (n === 1) return "очко";
  if (n >= 2 && n <= 4) return "очка";
  return "очков";
};
