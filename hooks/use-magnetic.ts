import { useCallback, useRef } from "react";

/**
 * Magnetic button effect — the element gently "attracts" toward the cursor.
 * Usage:
 *   const { magnetRef, onMagnetMove, onMagnetLeave } = useMagnetic();
 *   <button ref={magnetRef} onMouseMove={onMagnetMove} onMouseLeave={onMagnetLeave}>
 */
export function useMagnetic(strength = 0.3) {
  const magnetRef = useRef<HTMLElement>(null);

  const onMagnetMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = magnetRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * strength;
      const y = (e.clientY - rect.top - rect.height / 2) * strength;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.transition = "transform 0.15s ease-out";
    },
    [strength]
  );

  const onMagnetLeave = useCallback(() => {
    const el = magnetRef.current;
    if (!el) return;
    el.style.transform = "translate(0px, 0px)";
    el.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
  }, []);

  return { magnetRef, onMagnetMove, onMagnetLeave };
}
