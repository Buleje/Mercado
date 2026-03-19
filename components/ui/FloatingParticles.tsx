"use client";

import { useMemo, useState, useEffect } from "react";

interface Particle {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
}

interface FloatingParticlesProps {
  count?: number;
  color?: string;
}

export default function FloatingParticles({ count = 24, color = "255,255,255" }: FloatingParticlesProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const particles = useMemo<Particle[]>(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: (i / count) * 100 + (Math.sin(i * 2.5) * 8),
      size: 2 + (i % 3) * 1.5,
      delay: (i * 0.4) % 10,
      duration: 12 + (i % 5) * 2.5,
      opacity: 0.08 + (i % 4) * 0.07,
    })), [count]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {mounted && particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            bottom: "-10px",
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: `rgba(${color}, ${p.opacity})`,
            animation: `floatUp ${p.duration}s ${p.delay}s ease-in infinite`,
          }}
        />
      ))}
    </div>
  );
}
