"use client";

/**
 * ConfettiBurst — Explosion de particulas CSS puro, sin dependencias.
 *
 * Alternativa ligera a canvas-confetti (30kb+). 20 particulas con posicion
 * y color random. Se auto-destruye despues de la animacion.
 *
 * Uso imperativo (sin mount permanente):
 *   confettiBurst({ origin: "center" });
 *
 * Uso declarativo:
 *   <ConfettiBurst trigger={hasCompletedOrder} />
 *
 * Respeta reduced-motion.
 */

import { useEffect, useState } from "react";

const COLORS = [
  "var(--accent)",
  "var(--data-warning, #eab308)",
  "var(--data-error, #e11d48)",
  "var(--accent-soft)",
  "var(--text-primary)",
];

const PARTICLE_COUNT = 24;

interface Props {
  trigger: boolean;
  /** Donde explotar. "center" = centro pantalla, or coords. */
  origin?: { x: number; y: number } | "center";
  /** Ms del burst. Default 1800 */
  durationMs?: number;
  /** Callback al terminar */
  onComplete?: () => void;
}

interface Particle {
  tx: number;
  ty: number;
  color: string;
  size: number;
  delay: number;
  rotate: number;
}

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
    const angle = (360 / PARTICLE_COUNT) * i + Math.random() * 20;
    const distance = 100 + Math.random() * 140;
    return {
      tx: Math.cos((angle * Math.PI) / 180) * distance,
      ty: Math.sin((angle * Math.PI) / 180) * distance,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 6,
      delay: Math.random() * 60,
      rotate: Math.random() * 720,
    };
  });
}

export default function ConfettiBurst({ trigger, origin = "center", durationMs = 1800, onComplete }: Props) {
  const [active, setActive] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!trigger) return;
    // Particulas generadas en effect (no durante render) para respetar
    // react-hooks/purity y que Math.random no corra en SSR.
     
    setParticles(generateParticles());
    setActive(true);
    const timer = setTimeout(() => {
      setActive(false);
      onComplete?.();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [trigger, durationMs, onComplete]);

  if (!active) return null;

  const originStyle: React.CSSProperties =
    origin === "center"
      ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
      : { left: origin.x, top: origin.y };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[80] motion-reduce:hidden"
      style={originStyle}
    >
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-[2px] animate-[confettiBurst_1.2s_ease-out_forwards]"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            ["--tx" as string]: `${p.tx}px`,
            ["--ty" as string]: `${p.ty}px`,
            ["--rot" as string]: `${p.rotate}deg`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Imperative helper — monta un burst temporario en body.
 */
export function confettiBurst(opts?: { origin?: { x: number; y: number } }) {
  if (typeof document === "undefined") return;
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = "position:fixed;pointer-events:none;z-index:80;";
  if (opts?.origin) {
    container.style.left = `${opts.origin.x}px`;
    container.style.top = `${opts.origin.y}px`;
  } else {
    container.style.left = "50%";
    container.style.top = "50%";
    container.style.transform = "translate(-50%, -50%)";
  }
  document.body.appendChild(container);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (360 / PARTICLE_COUNT) * i + Math.random() * 20;
    const distance = 100 + Math.random() * 140;
    const tx = Math.cos((angle * Math.PI) / 180) * distance;
    const ty = Math.sin((angle * Math.PI) / 180) * distance;
    const color = COLORS[i % COLORS.length];
    const size = 6 + Math.random() * 6;
    const rotate = Math.random() * 720;
    const p = document.createElement("span");
    p.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${color};border-radius:2px;animation:confettiBurst 1.2s ease-out forwards;--tx:${tx}px;--ty:${ty}px;--rot:${rotate}deg;animation-delay:${Math.random() * 60}ms;`;
    container.appendChild(p);
  }

  setTimeout(() => container.remove(), 1800);
}
