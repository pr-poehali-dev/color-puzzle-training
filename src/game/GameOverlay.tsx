import { useState } from "react";
import { ScoreEntry, pluralScore } from "./constants";

// DownloadButton — скачивает страницу как единый HTML-файл
function DownloadButton() {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const pageUrl = window.location.origin + window.location.pathname;
      const htmlResp = await fetch(pageUrl);
      let html = await htmlResp.text();

      const scriptMatches = [...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)];
      for (const m of scriptMatches) {
        const src = m[1];
        if (src.startsWith('http')) continue;
        const url = src.startsWith('/') ? window.location.origin + src : pageUrl + src;
        const resp = await fetch(url);
        const content = await resp.text();
        html = html.replace(m[0], `<script>${content}</script>`);
      }

      const linkMatches = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*\/?>/g)];
      for (const m of linkMatches) {
        const href = m[1];
        if (href.startsWith('http')) continue;
        const url = href.startsWith('/') ? window.location.origin + href : pageUrl + href;
        const resp = await fetch(url);
        const content = await resp.text();
        html = html.replace(m[0], `<style>${content}</style>`);
      }

      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'colorist-game.html';
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={loading}
      className="px-3 py-1 rounded-sm text-xs font-mono transition-all"
      style={{ color: loading ? "#333" : "#555" }}
      title="Скачать игру как HTML-файл"
    >
      {loading ? '...' : '↓ html'}
    </button>
  );
}

// ScoresView — таблица рекордов
interface ScoresViewProps {
  scores: ScoreEntry[];
  onPlay: () => void;
}

export function ScoresView({ scores, onPlay }: ScoresViewProps) {
  return (
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
        onClick={onPlay}
        className="mt-8 px-5 py-2.5 font-mono text-sm rounded-sm transition-colors"
        style={{ backgroundColor: "#444", color: "#fff" }}
      >
        Играть
      </button>
    </div>
  );
}

// BottomNav — навигация снизу
interface BottomNavProps {
  view: "game" | "scores";
  onSetView: (v: "game" | "scores") => void;
}

export function BottomNav({ view, onSetView }: BottomNavProps) {
  return (
    <nav className="flex gap-1 pb-6 pt-4 items-center">
      {(["game", "scores"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onSetView(v)}
          className="px-3 py-1 rounded-sm text-xs font-mono transition-all"
          style={{
            backgroundColor: view === v ? "#444" : "transparent",
            color: view === v ? "#fff" : "#555",
          }}
        >
          {v === "game" ? "Игра" : "Рекорды"}
        </button>
      ))}
      <DownloadButton />
    </nav>
  );
}

// GameOverModal — оверлей конца игры
interface GameOverModalProps {
  score: number;
  onRestart: () => void;
  onScores: () => void;
}

export function GameOverModal({ score, onRestart, onScores }: GameOverModalProps) {
  return (
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
          onClick={onRestart}
          className="px-6 py-3 font-mono text-sm rounded-sm transition-colors text-white"
          style={{ backgroundColor: "#444" }}
        >
          Снова
        </button>
        <button
          onClick={onScores}
          className="px-6 py-3 font-mono text-sm rounded-sm transition-colors"
          style={{ border: "1px solid #444", color: "#888" }}
        >
          Рекорды
        </button>
      </div>
    </div>
  );
}
