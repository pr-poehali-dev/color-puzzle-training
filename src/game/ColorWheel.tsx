import { BG, ITTEN_COLORS, WHEEL_COUNT } from "./constants";

interface ColorWheelProps {
  litColorIds: Set<number>;
  activeColorIds: Set<number>;
  size: number;
}

export default function ColorWheel({ litColorIds, activeColorIds, size }: ColorWheelProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 4;
  const r = R * 0.38;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {ITTEN_COLORS.map((color, idx) => {
        const angleDeg = (360 / WHEEL_COUNT) * idx - 90;
        const rad = (angleDeg * Math.PI) / 180;
        const segAngle = (2 * Math.PI) / WHEEL_COUNT;
        const isLit = litColorIds.has(color.id);
        const isActive = activeColorIds.has(color.id);
        const hasFocus = litColorIds.size > 0;
        // Неактивные цвета — почти невидимы
        // Активные: подсвечены если lit, иначе обычные
        const opacity = !isActive ? 0.07 : hasFocus ? (isLit ? 1 : 0.2) : 0.85;

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
