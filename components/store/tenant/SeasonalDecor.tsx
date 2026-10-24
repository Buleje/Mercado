"use client";

/**
 * SeasonalDecor — detalle estacional 1-clic (Brandon 2026-06-26, Modo Creativo >
 * Automatización): cinta superior + partículas que caen, según la temporada.
 * NO toca los colores de la marca (no destructivo): solo agrega una capa decorativa
 * (pointer-events:none) y una cinta. Partículas en posiciones determinísticas para
 * no romper la hidratación. Sin emojis (regla DS) — formas/colores CSS.
 */
import { useId } from "react";

type Season = "none" | "navidad" | "fiestas_patrias" | "halloween";

interface Cfg { ribbon: string; from: string; to: string; ink: string; particle: string; alt?: string; greeting: string }
const CFG: Record<Exclude<Season, "none">, Cfg> = {
  navidad: { ribbon: "¡Felices Fiestas!", from: "#b91c1c", to: "#15803d", ink: "#ffffff", particle: "#ffffff", greeting: "Felices Fiestas" },
  fiestas_patrias: { ribbon: "¡Felices Fiestas Patrias!", from: "#d91023", to: "#9f0c1b", ink: "#ffffff", particle: "#ffffff", alt: "#ffd9dd", greeting: "Fiestas Patrias" },
  halloween: { ribbon: "Feliz Halloween", from: "#ea580c", to: "#1c1917", ink: "#ffffff", particle: "#fb923c", greeting: "Halloween" },
};

// 16 partículas en posiciones fijas (left%, tamaño px, duración s, delay s).
const P = [
  [4, 8, 9, 0], [11, 5, 12, 2], [18, 10, 8, 1], [26, 6, 11, 4], [33, 7, 10, 0.5], [41, 9, 13, 3],
  [49, 5, 9, 1.5], [57, 8, 11, 2.5], [64, 6, 10, 0.2], [71, 10, 12, 3.5], [78, 7, 8, 1.2], [85, 5, 13, 2.2],
  [92, 9, 10, 0.8], [15, 6, 14, 5], [60, 7, 9, 4.5], [38, 5, 12, 2.8],
] as const;

export default function SeasonalDecor({ season }: { season: Season }) {
  const id = useId().replace(/:/g, "");
  if (season === "none" || !CFG[season as Exclude<Season, "none">]) return null;
  const c = CFG[season as Exclude<Season, "none">];
  const anim = `fall_${id}`;

  return (
    <>
      <style>{`@keyframes ${anim}{0%{transform:translateY(-10vh) translateX(0);opacity:0}10%{opacity:.9}90%{opacity:.9}100%{transform:translateY(110vh) translateX(24px);opacity:0}}`}</style>

      {/* Cinta superior estacional */}
      <div className="w-full text-center" style={{ background: `linear-gradient(90deg, ${c.from}, ${c.to})`, color: c.ink }}>
        <p className="mx-auto max-w-5xl px-4 py-1.5 text-sm font-extrabold tracking-wide">{c.ribbon}</p>
      </div>

      {/* Capa de partículas — decorativa, no intercepta clicks */}
      <div className="pointer-events-none fixed inset-0 z-[5] overflow-hidden" aria-hidden>
        {P.map(([left, size, dur, delay], i) => (
          <span
            key={i}
            className="absolute top-0 rounded-full"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              background: c.alt && i % 2 ? c.alt : c.particle,
              opacity: 0.85,
              boxShadow: season === "navidad" ? "0 0 4px rgba(255,255,255,.7)" : undefined,
              animation: `${anim} ${dur}s linear ${delay}s infinite`,
            }}
          />
        ))}
      </div>
    </>
  );
}
