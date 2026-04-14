import { useState, useEffect, useCallback, useRef } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  dist: number;
}

// 12 цветов круга Итена
// 0=Жёлтый, 1=Жёлто-оранжевый, 2=Оранжевый, 3=Красно-оранжевый,
// 4=Красный, 5=Красно-фиолетовый, 6=Фиолетовый, 7=Сине-фиолетовый,
// 8=Синий, 9=Сине-зелёный, 10=Зелёный, 11=Жёлто-зелёный
// Пары (через 6): 0↔6, 1↔7, 2↔8, 3↔9, 4↔10, 5↔11
const ITTEN_COLORS = [
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
const TRIADS: number[][] = [
  [0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11],
];
const TETRADS: number[][] = [
  [0, 3, 6, 9], [1, 4, 7, 10], [2, 5, 8, 11],
];

const getComplement = (id: number): number => (id + 6) % 12;

const getTriad = (id: number): number[] | null =>
  TRIADS.find((t) => t.includes(id)) ?? null;

const getTetrad = (id: number): number[] | null =>
  TETRADS.find((t) => t.includes(id)) ?? null;

const COLS = 5;
const ROWS = 5;
const CELL_SIZE = 62;
const GAP = 4;
const BOARD_W = COLS * CELL_SIZE + (COLS - 1) * GAP;
const BOARD_H = ROWS * CELL_SIZE + (ROWS - 1) * GAP;
const ANIM_DURATION = 400;
const STORAGE_KEY = "colorist_scores_v3";

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

const randColorId = () => Math.floor(Math.random() * 12);

const loadScores = (): ScoreEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const getBestScore = (): number => {
  const s = loadScores();
  return s.length > 0 ? s[0].score : 0;
};

const saveScore = (score: number) => {
  const scores = loadScores();
  scores.push({ score, date: new Date().toLocaleDateString("ru-RU") });
  scores.sort((a, b) => b.score - a.score);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 10)));
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const WHEEL_COUNT = ITTEN_COLORS.length; // 12

function ColorWheel({ litColorIds, size }: { litColorIds: Set<number>; size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 4;
  const r = R * 0.38; // толстые сегменты

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {ITTEN_COLORS.map((color, idx) => {
        const angleDeg = (360 / WHEEL_COUNT) * idx - 90;
        const rad = (angleDeg * Math.PI) / 180;
        const segAngle = (2 * Math.PI) / WHEEL_COUNT;
        const isLit = litColorIds.has(color.id);
        // Если есть активные — гасим все остальные; если нет — все яркие
        const hasFocus = litColorIds.size > 0;
        const opacity = hasFocus ? (isLit ? 1 : 0.1) : 0.85;

        // Сегмент-дуга
        const startRad = rad - segAngle / 2;
        const endRad = rad + segAngle / 2;

        const x1o = cx + R * Math.cos(startRad);
        const y1o = cy + R * Math.sin(startRad);
        const x2o = cx + R * Math.cos(endRad);
        const y2o = cy + R * Math.sin(endRad);
        const x1i = cx + r * Math.cos(startRad);
        const y1i = cy + r * Math.sin(startRad);
        const x2i = cx + r * Math.cos(endRad);
        const y2i = cy + r * Math.sin(endRad);

        const d = [
          `M ${x1i} ${y1i}`,
          `L ${x1o} ${y1o}`,
          `A ${R} ${R} 0 0 1 ${x2o} ${y2o}`,
          `L ${x2i} ${y2i}`,
          `A ${r} ${r} 0 0 0 ${x1i} ${y1i}`,
          "Z",
        ].join(" ");

        return (
          <path
            key={color.id}
            d={d}
            fill={color.hex}
            opacity={opacity}
            stroke={BG}
            strokeWidth={1.5}
            style={{
              transition: "opacity 0.25s ease, filter 0.25s ease",
              filter: isLit ? `drop-shadow(0 0 10px ${color.hex})` : undefined,
            }}
          />
        );
      })}
      {/* Центральное отверстие */}
      <circle cx={cx} cy={cy} r={r} fill={BG} />
    </svg>
  );
}

const BG = "#2A2A2A";
const CELL_EMPTY = "#363636";
const CELL_EMPTY_HOVER = "#404040";

export default function Index() {
  const [grid, setGrid] = useState<Grid>(emptyGrid());
  const [currentColorId, setCurrentColorId] = useState<number>(randColorId());
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(getBestScore());
  const [scoreAnim, setScoreAnim] = useState(false);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [flyingTile, setFlyingTile] = useState<FlyingTile | null>(null);
  const [poppingCells, setPoppingCells] = useState<Set<string>>(new Set());
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleIdRef = useRef(0);
  const [gameOver, setGameOver] = useState(false);
  const [view, setView] = useState<"game" | "scores">("game");
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores());
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [litColorIds, setLitColorIds] = useState<Set<number>>(new Set());

  const animFrameRef = useRef<number | null>(null);
  const flyStartRef = useRef<number>(0);

  // Квадрат летит снизу вверх.
  // Первый в пустом столбце → row 0 (верх).
  // Следующий → row 1 (под предыдущим). Стек растёт вниз.
  // Нельзя пролетать сквозь занятые: встаёт на строку НИЖЕ последней занятой сверху.
  const findTargetRow = useCallback((col: number, g: Grid): number => {
    // Считаем сколько занято подряд сверху
    let top = 0;
    while (top < ROWS && g[top][col] !== null) top++;
    // top — первая свободная строка сверху
    if (top >= ROWS) return -1; // столбец полон
    return top;
  }, []);

  const triggerScoreAnim = (pts: number) => {
    setLastPoints(pts);
    setScoreAnim(true);
    setTimeout(() => { setScoreAnim(false); setLastPoints(null); }, 700);
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

      const neighbors: { r: number; c: number; colorId: number }[] = [];
      for (const [dr, dc] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc]) {
          neighbors.push({ r: nr, c: nc, colorId: g[nr][nc]!.colorId });
        }
      }

      const neighborColorIds = neighbors.map((n) => n.colorId);

      let toRemove: [number, number][] = [];
      let points = 0;

      // Приоритет 1: тетрада (4 цвета через 3 позиции) — +100
      const tetrad = getTetrad(colorId);
      const tetradOthers = tetrad ? tetrad.filter((id) => id !== colorId) : [];
      if (tetrad && tetradOthers.every((id) => neighborColorIds.includes(id))) {
        toRemove.push([row, col]);
        for (const otherId of tetradOthers) {
          const neighbor = neighbors.find((n) => n.colorId === otherId)!;
          toRemove.push([neighbor.r, neighbor.c]);
        }
        points = 100;
      // Приоритет 2: триада — +5
      } else if (triad && triadOthers.every((id) => neighborColorIds.includes(id))) {
        toRemove.push([row, col]);
        for (const otherId of triadOthers) {
          const neighbor = neighbors.find((n) => n.colorId === otherId)!;
          toRemove.push([neighbor.r, neighbor.c]);
        }
        points = 5;
      // Приоритет 3: пара — +1
      } else {
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

      const seen = new Set<string>();
      toRemove = toRemove.filter(([r, c]) => {
        const k = `${r}-${c}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      setPoppingCells(new Set(toRemove.map(([r, c]) => `${r}-${c}`)));
      spawnParticles(toRemove, g);

      // Подсвечиваем исчезнувшие, остальные гаснут
      const removedColorIds = new Set(toRemove.map(([r, c]) => g[r][c]!.colorId));
      setLitColorIds(removedColorIds);
      setTimeout(() => setLitColorIds(new Set()), 900);

      setTimeout(() => {
        setGrid((prev) => {
          const next = prev.map((r) => [...r]) as Grid;
          toRemove.forEach(([r, c]) => { next[r][c] = null; });
          return next;
        });
        setPoppingCells(new Set());
        setScore((s) => s + points);
        triggerScoreAnim(points);
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
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [flyingTile, gameOver, grid, currentColorId, findTargetRow, checkAndPop]
  );

  useEffect(() => {
    if (!gameOver && !flyingTile) {
      const lastRowFull = grid[ROWS - 1].every((cell) => cell !== null);
      if (lastRowFull) {
        saveScore(score);
        const updated = loadScores();
        setScores(updated);
        setBestScore(updated[0]?.score ?? score);
        setGameOver(true);
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

  const currentColor = ITTEN_COLORS[currentColorId];

  return (
    <div
      className="min-h-screen font-sans flex flex-col items-center select-none"
      style={{ backgroundColor: BG }}
    >
      <div className="w-full max-w-xl px-3 flex-1 flex flex-col items-center">
        {view === "game" && (
          <div className="flex flex-col items-center gap-4 w-full pt-1">

            {/* Круг + очки поверх в углах */}
            {(() => {
              const wheelSize = BOARD_W * 0.92;
              const R = wheelSize / 2 - 4;
              const innerR = R * 0.38;
              const sqSize = innerR * 0.85;
              // Сколько срезает круг в верхних углах — отступ для очков
              const cornerPad = (BOARD_W - wheelSize) / 2 + 6;
              return (
                <div className="relative" style={{ width: BOARD_W, height: wheelSize }}>
                  {/* Круг по центру */}
                  <div className="absolute" style={{ left: (BOARD_W - wheelSize) / 2, top: 0 }}>
                    <ColorWheel litColorIds={litColorIds} size={wheelSize} />
                    {/* Квадрат в центре круга */}
                    <div
                      className="absolute rounded-sm"
                      style={{
                        width: sqSize,
                        height: sqSize,
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        backgroundColor: currentColor.hex,
                        transition: "background-color 0.25s ease, box-shadow 0.25s",
                        boxShadow: `0 2px 16px ${currentColor.hex}99`,
                      }}
                    />
                  </div>

                  {/* Очки — левый верхний угол */}
                  <div className="absolute" style={{ left: 0, top: 4 }}>
                    <div
                      className="font-mono font-medium text-white leading-none relative"
                      style={{
                        fontSize: 24,
                        transform: scoreAnim ? "scale(1.2)" : "scale(1)",
                        transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                        display: "inline-block",
                      }}
                    >
                      {score}
                      {lastPoints !== null && (
                        <span
                          key={score}
                          className="absolute font-mono font-medium pointer-events-none"
                          style={{
                            top: -2,
                            left: "100%",
                            marginLeft: 4,
                            fontSize: lastPoints >= 100 ? 18 : lastPoints >= 5 ? 14 : 11,
                            color: lastPoints >= 100 ? "#FFD700" : lastPoints >= 5 ? "#F7941D" : "#8DC63F",
                            animation: "float-up 0.7s ease-out forwards",
                            whiteSpace: "nowrap",
                          }}
                        >
                          +{lastPoints}
                        </span>
                      )}
                    </div>
                    <div className="font-mono" style={{ color: "#555", fontSize: 10 }}>очки</div>
                  </div>

                  {/* Рекорд — правый верхний угол */}
                  <div className="absolute text-right" style={{ right: 0, top: 4 }}>
                    <div className="font-mono font-medium leading-none" style={{ fontSize: 24, color: "#4a4a4a" }}>
                      {bestScore}
                    </div>
                    <div className="font-mono" style={{ color: "#555", fontSize: 10 }}>рекорд</div>
                  </div>
                </div>
              );
            })()}

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
                  const c = cell ? ITTEN_COLORS[cell.colorId] : null;
                  return (
                    <div
                      key={key}
                      onClick={() => handleColumnClick(ci)}
                      onMouseEnter={() => setHoverCol(ci)}
                      onMouseLeave={() => setHoverCol(null)}
                      className="absolute cursor-pointer rounded-sm"
                      style={{
                        left: ci * (CELL_SIZE + GAP),
                        top: ri * (CELL_SIZE + GAP),
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        backgroundColor: c ? c.hex : isHoverCol ? CELL_EMPTY_HOVER : CELL_EMPTY,
                        animation: isPopping
                          ? "pop 0.32s cubic-bezier(0.36,0.07,0.19,0.97) forwards"
                          : undefined,
                        transition: c ? undefined : "background-color 0.1s",
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

            {/* Ссылка внизу */}
            <a
              href="https://vk.ru/fotoklubpro"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono tracking-widest uppercase"
              style={{ fontSize: 11, color: "#555", letterSpacing: "0.15em", textDecoration: "none" }}
            >
              уроки фотографии
            </a>
          </div>
        )}

        {view === "scores" && (
          <div className="w-full animate-fade-in pt-10">
            <h2 className="font-mono text-xs uppercase tracking-widest mb-6" style={{ color: "#555" }}>
              Таблица рекордов
            </h2>
            {scores.length === 0 ? (
              <p className="font-mono text-sm text-center mt-12" style={{ color: "#555" }}>
                Пока нет результатов.<br />Сыграйте первую партию!
              </p>
            ) : (
              <div>
                {scores.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-3.5"
                    style={{ borderBottom: "1px solid #3a3a3a" }}
                  >
                    <div className="flex items-center gap-5">
                      <span className="font-mono text-xs w-4 text-right" style={{ color: "#555" }}>
                        {i + 1}
                      </span>
                      <span className="font-mono text-2xl font-medium text-white">
                        {entry.score}
                      </span>
                      <span className="font-mono text-xs" style={{ color: "#555" }}>
                        {pluralScore(entry.score)}
                      </span>
                    </div>
                    <span className="font-mono text-xs" style={{ color: "#555" }}>{entry.date}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setView("game")}
              className="mt-8 px-5 py-2.5 font-mono text-sm rounded-sm transition-colors"
              style={{ backgroundColor: "#444", color: "#fff" }}
            >
              Играть
            </button>
          </div>
        )}
      </div>

      {/* Nav внизу */}
      <nav className="flex gap-1 pb-6 pt-4">
        {(["game", "scores"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-3 py-1 rounded-sm text-xs font-mono transition-all"
            style={{
              backgroundColor: view === v ? "#444" : "transparent",
              color: view === v ? "#fff" : "#555",
            }}
          >
            {v === "game" ? "Игра" : "Рекорды"}
          </button>
        ))}
      </nav>

      {/* Game Over */}
      {gameOver && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-8 z-50 animate-fade-in"
          style={{ backgroundColor: "rgba(30,30,30,0.95)", backdropFilter: "blur(8px)" }}
        >
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#666" }}>
              Поле заполнено
            </p>
            <p className="font-mono text-8xl font-medium text-white leading-none">{score}</p>
            <p className="font-mono text-sm mt-2" style={{ color: "#666" }}>
              {pluralScore(score)}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={restartGame}
              className="px-6 py-3 font-mono text-sm rounded-sm transition-colors text-white"
              style={{ backgroundColor: "#444" }}
            >
              Снова
            </button>
            <button
              onClick={() => { setView("scores"); restartGame(); }}
              className="px-6 py-3 font-mono text-sm rounded-sm transition-colors"
              style={{ border: "1px solid #444", color: "#888" }}
            >
              Рекорды
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes float-up {
          0%   { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-40px); }
        }
      `}</style>
    </div>
  );
}