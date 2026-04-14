import { useState, useEffect, useCallback, useRef } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  dist: number;
}

// 6 цветов. Пары (комплементарные): 0↔3, 1↔4, 2↔5
// Триады: [0,2,4] = жёлтый+красный+синий, [1,3,5] = оранжевый+фиолетовый+зелёный
const ITTEN_COLORS = [
  { id: 0, name: "Жёлтый",     hex: "#F9E01B" },
  { id: 1, name: "Оранжевый",  hex: "#F7941D" },
  { id: 2, name: "Красный",    hex: "#E8231A" },
  { id: 3, name: "Фиолетовый", hex: "#662D91" },
  { id: 4, name: "Синий",      hex: "#0072BC" },
  { id: 5, name: "Зелёный",    hex: "#009444" },
];

const TRIADS: number[][] = [[0, 2, 4], [1, 3, 5]];

const getComplement = (id: number) => (id + 3) % 6;

const getTriad = (id: number): number[] | null => {
  return TRIADS.find((t) => t.includes(id)) ?? null;
};

const COLS = 4;
const ROWS = 8;
const CELL_SIZE = 72;
const GAP = 5;
const BOARD_W = COLS * CELL_SIZE + (COLS - 1) * GAP;
const BOARD_H = ROWS * CELL_SIZE + (ROWS - 1) * GAP;
const ANIM_DURATION = 400;
const STORAGE_KEY = "colorist_scores_v2";

type Cell = { colorId: number } | null;
type Grid = Cell[][];

interface FlyingTile {
  col: number;
  colorId: number;
  targetRow: number;
  progress: number;
}

interface ScoreEntry {
  score: number;
  date: string;
}

const emptyGrid = (): Grid =>
  Array.from({ length: ROWS }, () => Array(COLS).fill(null));

const randColorId = () => Math.floor(Math.random() * 6);

const loadScores = (): ScoreEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveScore = (score: number) => {
  const scores = loadScores();
  scores.push({ score, date: new Date().toLocaleDateString("ru-RU") });
  scores.sort((a, b) => b.score - a.score);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 10)));
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export default function Index() {
  const [grid, setGrid] = useState<Grid>(emptyGrid());
  const [currentColorId, setCurrentColorId] = useState<number>(randColorId());
  const [score, setScore] = useState(0);
  const [scoreAnim, setScoreAnim] = useState(false);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [flyingTile, setFlyingTile] = useState<FlyingTile | null>(null);
  const [poppingCells, setPoppingCells] = useState<Set<string>>(new Set());
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleIdRef = useRef(0);
  const [gameOver, setGameOver] = useState(false);
  const [view, setView] = useState<"game" | "scores">("game");
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores());
  const [moveCount, setMoveCount] = useState(0);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const flyStartRef = useRef<number>(0);

  const findTargetRow = useCallback((col: number, g: Grid): number => {
    for (let r = 0; r < ROWS; r++) {
      if (!g[r][col]) return r;
    }
    return -1;
  }, []);

  const triggerScoreAnim = (pts: number) => {
    setLastPoints(pts);
    setScoreAnim(true);
    setTimeout(() => { setScoreAnim(false); setLastPoints(null); }, 600);
  };

  const spawnParticles = useCallback((cells: [number, number][], g: Grid) => {
    const newParticles: Particle[] = [];
    cells.forEach(([r, c]) => {
      const cellColor = g[r][c]?.colorId ?? 0;
      const cx = c * (CELL_SIZE + GAP) + CELL_SIZE / 2;
      const cy = r * (CELL_SIZE + GAP) + CELL_SIZE / 2;
      for (let i = 0; i < 8; i++) {
        newParticles.push({
          id: ++particleIdRef.current,
          x: cx,
          y: cy,
          color: ITTEN_COLORS[cellColor].hex,
          angle: (360 / 8) * i + Math.random() * 15 - 7,
          dist: 30 + Math.random() * 35,
        });
      }
    });
    setParticles((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      const ids = new Set(newParticles.map((p) => p.id));
      setParticles((prev) => prev.filter((p) => !ids.has(p.id)));
    }, 600);
  }, []);

  const checkAndPop = useCallback(
    (g: Grid, row: number, col: number, colorId: number) => {
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      const triad = getTriad(colorId);
      const triadOthers = triad ? triad.filter((id) => id !== colorId) : [];

      // Ищем соседей по 4 направлениям
      const neighbors: { r: number; c: number; colorId: number }[] = [];
      for (const [dr, dc] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc]) {
          neighbors.push({ r: nr, c: nc, colorId: g[nr][nc]!.colorId });
        }
      }

      const neighborColorIds = neighbors.map((n) => n.colorId);

      // Проверяем триаду: нужны оба других цвета триады среди соседей
      let toRemove: [number, number][] = [];
      let points = 0;
      let isTriad = false;

      if (triad && triadOthers.every((id) => neighborColorIds.includes(id))) {
        // Нашли триаду! Берём по одному соседу каждого цвета
        toRemove.push([row, col]);
        for (const otherId of triadOthers) {
          const neighbor = neighbors.find((n) => n.colorId === otherId)!;
          toRemove.push([neighbor.r, neighbor.c]);
        }
        points = 5;
        isTriad = true;
      } else {
        // Проверяем комплементарную пару
        const complement = getComplement(colorId);
        for (const n of neighbors) {
          if (n.colorId === complement) {
            toRemove.push([row, col]);
            toRemove.push([n.r, n.c]);
            points = 1;
            break;
          }
        }
      }

      if (toRemove.length === 0) return;

      // Убираем дубликаты
      const seen = new Set<string>();
      toRemove = toRemove.filter(([r, c]) => {
        const k = `${r}-${c}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const popSet = new Set(toRemove.map(([r, c]) => `${r}-${c}`));
      setPoppingCells(popSet);
      spawnParticles(toRemove, g);

      setTimeout(() => {
        setGrid((prev) => {
          const next = prev.map((r) => [...r]) as Grid;
          toRemove.forEach(([r, c]) => { next[r][c] = null; });
          return next;
        });
        setPoppingCells(new Set());
        setScore((s) => s + points);
        triggerScoreAnim(points);
        void isTriad;
      }, 320);
    },
    [spawnParticles]
  );

  const handleColumnClick = useCallback(
    (col: number) => {
      if (flyingTile || gameOver) return;
      const targetRow = findTargetRow(col, grid);
      if (targetRow === -1) return;

      const colorId = currentColorId;
      flyStartRef.current = performance.now();
      setFlyingTile({ col, colorId, targetRow, progress: 0 });

      const animate = (now: number) => {
        const elapsed = now - flyStartRef.current;
        const progress = Math.min(elapsed / ANIM_DURATION, 1);
        setFlyingTile((ft) => ft ? { ...ft, progress } : null);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          setFlyingTile(null);
          setGrid((prev) => {
            const next = prev.map((r) => [...r]) as Grid;
            next[targetRow][col] = { colorId };
            checkAndPop(next, targetRow, col, colorId);
            return next;
          });
          setCurrentColorId(randColorId());
          setMoveCount((m) => m + 1);
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [flyingTile, gameOver, grid, currentColorId, findTargetRow, checkAndPop]
  );

  // Game over — последняя строка заполнена
  useEffect(() => {
    if (!gameOver && !flyingTile) {
      const lastRowFull = grid[ROWS - 1].every((cell) => cell !== null);
      if (lastRowFull) {
        setGameOver(true);
        saveScore(score);
        setScores(loadScores());
      }
    }
  }, [grid, flyingTile, gameOver, score]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const restartGame = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setGrid(emptyGrid());
    setCurrentColorId(randColorId());
    setScore(0);
    setMoveCount(0);
    setFlyingTile(null);
    setPoppingCells(new Set());
    setGameOver(false);
    setLastPoints(null);
  };

  const getFlyingY = (ft: FlyingTile) => {
    const p = easeOutCubic(ft.progress);
    const startY = BOARD_H + CELL_SIZE * 0.5;
    const endY = ft.targetRow * (CELL_SIZE + GAP);
    return startY + (endY - startY) * p;
  };

  const pluralScore = (n: number) => {
    if (n === 1) return "очко";
    if (n >= 2 && n <= 4) return "очка";
    return "очков";
  };

  return (
    <div
      className="min-h-screen font-sans flex flex-col items-center select-none"
      style={{ backgroundColor: "#E8E8E8" }}
    >
      {/* Header */}
      <header className="w-full max-w-xl px-6 pt-10 pb-2 flex items-end justify-between">
        <div>
          <h1 className="font-mono text-lg font-medium tracking-tight text-neutral-900 leading-none">
            Колорист
          </h1>
          <p className="text-xs text-neutral-400 font-mono mt-1">
            круг Итена · пары и триады
          </p>
        </div>
        <nav className="flex gap-0.5 border border-neutral-200 rounded p-0.5 bg-white/50">
          {(["game", "scores"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-sm text-xs font-mono transition-all ${
                view === v
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-400 hover:text-neutral-700"
              }`}
            >
              {v === "game" ? "Игра" : "Рекорды"}
            </button>
          ))}
        </nav>
      </header>

      <div className="w-full max-w-xl px-6 flex-1 flex flex-col items-center">
        {view === "game" && (
          <div className="flex flex-col items-center gap-5 w-full">
            {/* Score */}
            <div className="flex items-center gap-10 pt-4 relative">
              <div className="text-center">
                <div
                  className="font-mono text-5xl font-medium text-neutral-900"
                  style={{
                    transform: scoreAnim ? "scale(1.25)" : "scale(1)",
                    transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                    display: "inline-block",
                  }}
                >
                  {score}
                </div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">очки</div>
              </div>
              <div className="w-px h-8 bg-neutral-300" />
              <div className="text-center">
                <div className="font-mono text-5xl font-medium text-neutral-300">{moveCount}</div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">ходов</div>
              </div>

              {/* Floating +points label */}
              {lastPoints !== null && (
                <div
                  key={score}
                  className="absolute -top-2 left-0 font-mono font-medium pointer-events-none"
                  style={{
                    fontSize: lastPoints >= 5 ? 28 : 20,
                    color: lastPoints >= 5 ? "#F7941D" : "#009444",
                    animation: "float-up 0.6s ease-out forwards",
                  }}
                >
                  +{lastPoints}
                </div>
              )}
            </div>

            {/* Next color */}
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">
                следующий
              </span>
              <div
                className="rounded-sm"
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  backgroundColor: ITTEN_COLORS[currentColorId].hex,
                  transition: "background-color 0.3s ease, box-shadow 0.3s",
                  boxShadow: `0 4px 20px ${ITTEN_COLORS[currentColorId].hex}66`,
                }}
              />
            </div>

            {/* Board */}
            <div
              className="relative overflow-visible"
              style={{ width: BOARD_W, height: BOARD_H }}
            >
              {grid.map((row, ri) =>
                row.map((cell, ci) => {
                  const key = `${ri}-${ci}`;
                  const isPopping = poppingCells.has(key);
                  const isHoverCol = hoverCol === ci;
                  return (
                    <div
                      key={key}
                      onClick={() => handleColumnClick(ci)}
                      className="absolute cursor-pointer rounded-sm"
                      style={{
                        left: ci * (CELL_SIZE + GAP),
                        top: ri * (CELL_SIZE + GAP),
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        backgroundColor: cell
                          ? ITTEN_COLORS[cell.colorId].hex
                          : isHoverCol ? "#D0D0D0" : "#DADADA",
                        animation: isPopping
                          ? "pop 0.32s cubic-bezier(0.36,0.07,0.19,0.97) forwards"
                          : undefined,
                        transition: cell ? undefined : "background-color 0.1s",
                      }}
                    />
                  );
                })
              )}

              {/* Particles */}
              {particles.map((p) => {
                const rad = (p.angle * Math.PI) / 180;
                const tx = Math.sin(rad) * p.dist;
                const ty = -Math.cos(rad) * p.dist;
                return (
                  <div
                    key={p.id}
                    className="absolute pointer-events-none rounded-full"
                    style={{
                      left: p.x - 5,
                      top: p.y - 5,
                      width: 10,
                      height: 10,
                      backgroundColor: p.color,
                      animation: "particle-burst 0.5s cubic-bezier(0.2,0.8,0.4,1) forwards",
                      ["--tx" as string]: `${tx}px`,
                      ["--ty" as string]: `${ty}px`,
                      zIndex: 20,
                    }}
                  />
                );
              })}

              {/* Flying tile */}
              {flyingTile && (
                <div
                  className="absolute rounded-sm pointer-events-none"
                  style={{
                    left: flyingTile.col * (CELL_SIZE + GAP),
                    top: getFlyingY(flyingTile),
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: ITTEN_COLORS[flyingTile.colorId].hex,
                    boxShadow: `0 2px 20px ${ITTEN_COLORS[flyingTile.colorId].hex}77`,
                    zIndex: 10,
                  }}
                />
              )}
            </div>
          </div>
        )}

        {view === "scores" && (
          <div className="w-full animate-fade-in pt-6">
            <h2 className="font-mono text-xs text-neutral-400 uppercase tracking-widest mb-6">
              Таблица рекордов
            </h2>
            {scores.length === 0 ? (
              <p className="font-mono text-neutral-400 text-sm text-center mt-12">
                Пока нет результатов.<br />Сыграйте первую партию!
              </p>
            ) : (
              <div>
                {scores.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-3.5 border-b border-neutral-200"
                  >
                    <div className="flex items-center gap-5">
                      <span className="font-mono text-xs text-neutral-400 w-4 text-right">
                        {i + 1}
                      </span>
                      <span className="font-mono text-2xl font-medium text-neutral-900">
                        {entry.score}
                      </span>
                      <span className="font-mono text-xs text-neutral-400">
                        {pluralScore(entry.score)}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-neutral-400">{entry.date}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setView("game")}
              className="mt-8 px-5 py-2.5 bg-neutral-900 text-white font-mono text-sm rounded-sm hover:bg-neutral-700 transition-colors"
            >
              Играть
            </button>
          </div>
        )}
      </div>

      {/* Game Over */}
      {gameOver && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-8 z-50 animate-fade-in">
          <div className="text-center">
            <p className="font-mono text-xs text-neutral-400 uppercase tracking-widest mb-4">
              Поле заполнено
            </p>
            <p className="font-mono text-8xl font-medium text-neutral-900 leading-none">
              {score}
            </p>
            <p className="font-mono text-sm text-neutral-400 mt-2">
              {pluralScore(score)}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={restartGame}
              className="px-6 py-3 bg-neutral-900 text-white font-mono text-sm rounded-sm hover:bg-neutral-700 transition-colors"
            >
              Снова
            </button>
            <button
              onClick={() => { setView("scores"); restartGame(); }}
              className="px-6 py-3 border border-neutral-300 text-neutral-600 font-mono text-sm rounded-sm hover:border-neutral-500 transition-colors"
            >
              Рекорды
            </button>
          </div>
        </div>
      )}

      <footer className="py-5" />

      <style>{`
        @keyframes float-up {
          0%   { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-40px); }
        }
      `}</style>
    </div>
  );
}
