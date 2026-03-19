import { useCallback, useRef } from "react";

interface TiltOptions {
  max?: number;
  perspective?: number;
  scale?: number;
}

/**
 * Adds an interactive 3D tilt effect to any element.
 * Usage:
 *   const { tiltRef, onTiltMove, onTiltLeave } = useTilt();
 *   <div ref={tiltRef} onMouseMove={onTiltMove} onMouseLeave={onTiltLeave} style={{ transformStyle: "preserve-3d" }}>
 *     <div data-tilt-shine style={{ position:"absolute",inset:0,borderRadius:"inherit",pointerEvents:"none" }} />
 *   </div>
 */
export function useTilt({ max = 10, perspective = 900, scale = 1.03 }: TiltOptions = {}) {
  const tiltRef = useRef<HTMLDivElement>(null);

  const onTiltMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = tiltRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const rotX = -y * max * 2;
      const rotY = x * max * 2;
      el.style.transform = `perspective(${perspective}px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(${scale},${scale},${scale})`;
      el.style.transition = "transform 0.08s ease-out";
      const shine = el.querySelector("[data-tilt-shine]") as HTMLDivElement | null;
      if (shine) {
        shine.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.2) 0%, transparent 55%)`;
        shine.style.opacity = "1";
      }
    },
    [max, perspective, scale]
  );

  const onTiltLeave = useCallback(() => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)`;
    el.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    const shine = el.querySelector("[data-tilt-shine]") as HTMLDivElement | null;
    if (shine) shine.style.opacity = "0";
  }, [perspective]);

  return { tiltRef, onTiltMove, onTiltLeave };
}
