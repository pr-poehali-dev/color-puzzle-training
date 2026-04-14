import { useState, useEffect, useCallback, useRef } from "react";

// 6 основных цветов — комплементарные пары: 0↔3, 1↔4, 2↔5
const ITTEN_COLORS = [
  { id: 0, name: "Жёлтый",    hex: "#F9E01B" },
  { id: 1, name: "Оранжевый", hex: "#F7941D" },
  { id: 2, name: "Красный",   hex: "#E8231A" },
  { id: 3, name: "Фиолетовый",hex: "#662D91" },
  { id: 4, name: "Синий",     hex: "#0072BC" },
  { id: 5, name: "Зелёный",   hex: "#009444" },
];

const getComplement = (id: number) => (id + 3) % 6;

const COLS = 5;
const ROWS = 8;
const CELL_SIZE = 52;
const GAP = 4;
const BOARD_W = COLS * CELL_SIZE + (COLS - 1) * GAP;
const BOARD_H = ROWS * CELL_SIZE + (ROWS - 1) * GAP;
const ANIM_DURATION = 380;
const STORAGE_KEY = "colorist_scores_v1";

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
  const [flyingTile, setFlyingTile] = useState<FlyingTile | null>(null);
  const [poppingCells, setPoppingCells] = useState<Set<string>>(new Set());
  const [gameOver, setGameOver] = useState(false);
  const [view, setView] = useState<"game" | "scores">("game");
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores());
  const [moveCount, setMoveCount] = useState(0);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const flyStartRef = useRef<number>(0);

  // Первая свободная строка сверху (цвет летит снизу вверх и остаётся наверху)
  const findTargetRow = useCallback((col: number, g: Grid): number => {
    for (let r = 0; r < ROWS; r++) {
      if (!g[r][col]) return r;
    }
    return -1;
  }, []);

  const triggerScoreAnim = () => {
    setScoreAnim(true);
    setTimeout(() => setScoreAnim(false), 350);
  };

  const checkAndPop = useCallback(
    (g: Grid, row: number, col: number, colorId: number) => {
      const complement = getComplement(colorId);
      const toRemove: [number, number][] = [];
      const directions = [
        [0, 1], [0, -1], [1, 0], [-1, 0],
      ];

      for (const [dr, dc] of directions) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          if (g[nr][nc]?.colorId === complement) {
            toRemove.push([nr, nc]);
            toRemove.push([row, col]);
          }
        }
      }

      if (toRemove.length === 0) return;

      const popKey = (r: number, c: number) => `${r}-${c}`;
      const popSet = new Set(toRemove.map(([r, c]) => popKey(r, c)));
      setPoppingCells(popSet);

      setTimeout(() => {
        setGrid((prev) => {
          const next = prev.map((r) => [...r]) as Grid;
          toRemove.forEach(([r, c]) => { next[r][c] = null; });
          return next;
        });
        setPoppingCells(new Set());
        const pairs = Math.floor(toRemove.length / 2);
        setScore((s) => s + pairs);
        triggerScoreAnim();
      }, 320);
    },
    []
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

  useEffect(() => {
    if (!gameOver && !flyingTile && grid[0].every((cell) => cell !== null)) {
      setGameOver(true);
      saveScore(score);
      setScores(loadScores());
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
  };

  const getFlyingY = (ft: FlyingTile) => {
    const p = easeOutCubic(ft.progress);
    const startY = BOARD_H + CELL_SIZE * 0.5; // ниже поля
    const endY = ft.targetRow * (CELL_SIZE + GAP); // целевая строка сверху
    return startY + (endY - startY) * p;
  };

  const pluralScore = (n: number) => {
    if (n === 1) return "очко";
    if (n >= 2 && n <= 4) return "очка";
    return "очков";
  };

  return (
    <div className="min-h-screen font-sans flex flex-col items-center select-none" style={{ backgroundColor: "#E8E8E8" }}>
      {/* Header */}
      <header className="w-full max-w-xl px-6 pt-10 pb-2 flex items-end justify-between">
        <div>
          <h1 className="font-mono text-lg font-medium tracking-tight text-neutral-900 leading-none">
            Колорист
          </h1>
          <p className="text-xs text-neutral-400 font-mono mt-1">круг Итена · комплементарные пары</p>
        </div>
        <nav className="flex gap-0.5 border border-neutral-100 rounded p-0.5">
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
            <div className="flex items-center gap-10 pt-4">
              <div className="text-center">
                <div
                  className="font-mono text-5xl font-medium text-neutral-900"
                  style={{
                    transform: scoreAnim ? "scale(1.3)" : "scale(1)",
                    transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                    display: "inline-block",
                  }}
                >
                  {score}
                </div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">очки</div>
              </div>
              <div className="w-px h-8 bg-neutral-100" />
              <div className="text-center">
                <div className="font-mono text-5xl font-medium text-neutral-200">{moveCount}</div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">ходов</div>
              </div>
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
                  boxShadow: `0 4px 18px ${ITTEN_COLORS[currentColorId].hex}55`,
                }}
              />
            </div>

            {/* Board */}
            <div className="relative" style={{ width: BOARD_W, height: BOARD_H }}>
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
                        transition: "background-color 0.15s",
                      }}
                    />
                  );
                })
              )}

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
                    boxShadow: `0 2px 16px ${ITTEN_COLORS[flyingTile.colorId].hex}66`,
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
              <p className="font-mono text-neutral-300 text-sm text-center mt-12">
                Пока нет результатов.<br/>Сыграйте первую партию!
              </p>
            ) : (
              <div>
                {scores.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-3.5 border-b border-neutral-100"
                  >
                    <div className="flex items-center gap-5">
                      <span className="font-mono text-xs text-neutral-300 w-4 text-right">
                        {i + 1}
                      </span>
                      <span className="font-mono text-2xl font-medium text-neutral-900">
                        {entry.score}
                      </span>
                      <span className="font-mono text-xs text-neutral-400">
                        {pluralScore(entry.score)}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-neutral-300">{entry.date}</span>
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
        <div className="fixed inset-0 bg-white/92 backdrop-blur-sm flex flex-col items-center justify-center gap-8 z-50 animate-fade-in">
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
          <div
            className="flex gap-1.5"
            style={{ width: BOARD_W }}
          >
            {ITTEN_COLORS.slice(0, COLS).map((c) => (
              <div
                key={c.id}
                className="rounded-sm"
                style={{ width: CELL_SIZE, height: 6, backgroundColor: c.hex }}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={restartGame}
              className="px-6 py-3 bg-neutral-900 text-white font-mono text-sm rounded-sm hover:bg-neutral-700 transition-colors"
            >
              Снова
            </button>
            <button
              onClick={() => {
                setView("scores");
                restartGame();
              }}
              className="px-6 py-3 border border-neutral-200 text-neutral-600 font-mono text-sm rounded-sm hover:border-neutral-400 transition-colors"
            >
              Рекорды
            </button>
          </div>
        </div>
      )}

      <footer className="py-5" />
    </div>
  );
}