import { useState, useEffect, useCallback, useRef } from "react";
import ColorWheel from "@/game/ColorWheel";
import GameBoard from "@/game/GameBoard";
import { ScoresView, BottomNav, GameOverModal } from "@/game/GameOverlay";
import {
  ITTEN_COLORS, COLOR_LEVELS,
  COLS, ROWS, CELL_SIZE, GAP, BOARD_W, BOARD_H, ANIM_DURATION, BG,
  Cell, Grid, FlyingTile, Particle, ScoreEntry,
  getComplement, getTriad, getTetrad,
  getActiveColorIds, randColorIdFromActive,
  emptyGrid, loadScores, getBestScore, saveScore, easeOutCubic, pluralScore,
} from "@/game/constants";

export default function Index() {
  const [grid, setGrid] = useState<Grid>(emptyGrid());
  const [score, setScore] = useState(0);
  const activeColorIds = getActiveColorIds(score);
  const [currentColorId, setCurrentColorId] = useState<number>(() => randColorIdFromActive(getActiveColorIds(0)));
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
  const [newColorsNotice, setNewColorsNotice] = useState<string | null>(null);
  const prevActiveLenRef = useRef(getActiveColorIds(0).length);
  const lastTwoColorsRef = useRef<number[]>([]); // последние 2 выпавших цвета

  const animFrameRef = useRef<number | null>(null);
  const flyStartRef = useRef<number>(0);

  // Квадрат летит снизу вверх.
  // Первый в пустом столбце → row 0 (верх).
  // Следующий → row 1 (под предыдущим). Стек растёт вниз.
  // Нельзя пролетать сквозь занятые: встаёт на строку НИЖЕ последней занятой сверху.
  const findTargetRow = useCallback((col: number, g: Grid): number => {
    let top = 0;
    while (top < ROWS && g[top][col] !== null) top++;
    if (top >= ROWS) return -1;
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
          // Не допускаем 3 подряд одинаковых
          const last2 = lastTwoColorsRef.current;
          const excludeId = last2.length === 2 && last2[0] === last2[1] ? last2[0] : undefined;
          const nextId = randColorIdFromActive(activeColorIds, excludeId);
          lastTwoColorsRef.current = [last2[last2.length - 1] ?? colorId, nextId].slice(-2);
          setCurrentColorId(nextId);
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [flyingTile, gameOver, grid, currentColorId, findTargetRow, checkAndPop, activeColorIds]
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

  // Уведомление при разблокировке новых цветов
  useEffect(() => {
    const newLen = activeColorIds.length;
    if (newLen > prevActiveLenRef.current) {
      const added = COLOR_LEVELS.find((l) => l.threshold === score);
      if (added) {
        const names = added.ids.map((id) => ITTEN_COLORS[id].name).join(" и ");
        setNewColorsNotice(`+2 новых цвета: ${names}!`);
        setTimeout(() => setNewColorsNotice(null), 5000);
      }
    }
    prevActiveLenRef.current = newLen;
  }, [score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const restartGame = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setGrid(emptyGrid());
    setCurrentColorId(randColorIdFromActive(getActiveColorIds(0)));
    setScore(0);
    setFlyingTile(null);
    setPoppingCells(new Set());
    setGameOver(false);
    setLastPoints(null);
    prevActiveLenRef.current = getActiveColorIds(0).length;
    lastTwoColorsRef.current = [];
  };

  const getFlyingY = (ft: FlyingTile) => {
    const p = easeOutCubic(ft.progress);
    const startY = BOARD_H + CELL_SIZE * 0.5;
    const endY = ft.targetRow * (CELL_SIZE + GAP);
    return startY + (endY - startY) * p;
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
              const cornerPad = (BOARD_W - wheelSize) / 2 + 6;
              void cornerPad;
              return (
                <div className="relative" style={{ width: BOARD_W, height: wheelSize }}>
                  {/* Круг по центру */}
                  <div className="absolute" style={{ left: (BOARD_W - wheelSize) / 2, top: 0 }}>
                    <ColorWheel litColorIds={litColorIds} activeColorIds={new Set(activeColorIds)} size={wheelSize} />
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

            {/* Уведомление о новых цветах */}
            {newColorsNotice && (
              <div
                className="font-mono text-xs text-center animate-fade-in"
                style={{ color: "#aaa", letterSpacing: "0.05em", marginTop: -8 }}
              >
                {newColorsNotice}
              </div>
            )}

            <GameBoard
              grid={grid}
              flyingTile={flyingTile}
              particles={particles}
              poppingCells={poppingCells}
              hoverCol={hoverCol}
              getFlyingY={getFlyingY}
              onColumnClick={handleColumnClick}
              onColumnHover={setHoverCol}
            />

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
          <ScoresView
            scores={scores}
            onPlay={() => setView("game")}
          />
        )}
      </div>

      <BottomNav view={view} onSetView={setView} />

      {gameOver && (
        <GameOverModal
          score={score}
          onRestart={restartGame}
          onScores={() => { setView("scores"); restartGame(); }}
        />
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
