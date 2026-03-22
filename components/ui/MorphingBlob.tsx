"use client";

interface MorphingBlobProps {
  className?: string;
  color1?: string;
  color2?: string;
  size?: string;
  speed?: number;
}

export default function MorphingBlob({
  className = "",
  color1 = "rgba(45,106,79,0.35)",
  color2 = "rgba(245,158,11,0.15)",
  size = "60vw",
  speed = 12,
}: MorphingBlobProps) {
  return (
    <div
      aria-hidden="true"
      className={`absolute pointer-events-none select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(ellipse at 40% 50%, ${color1} 0%, ${color2} 45%, transparent 70%)`,
        filter: "blur(70px)",
        animation: `morphBlob ${speed}s ease-in-out infinite`,
        borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
        willChange: "border-radius",
      }}
    />
  );
}
