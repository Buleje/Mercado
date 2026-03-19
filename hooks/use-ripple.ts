import { useCallback } from "react";

/**
 * Adds a material-style ripple effect on click.
 * Usage:
 *   const createRipple = useRipple();
 *   <button onClick={createRipple} style={{ position: "relative", overflow: "hidden" }}>
 *
 * The button needs `position: relative` and `overflow: hidden`.
 * Make sure `@keyframes ripple` is defined in globals.css.
 */
export function useRipple(color = "rgba(255,255,255,0.35)") {
  const createRipple = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const d = Math.max(rect.width, rect.height) * 2.2;

      const ripple = document.createElement("span");
      ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        width: ${d}px;
        height: ${d}px;
        left: ${x - d / 2}px;
        top: ${y - d / 2}px;
        background: ${color};
        pointer-events: none;
        transform: scale(0);
        animation: ripple 0.6s ease-out forwards;
        z-index: 0;
      `;
      el.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    },
    [color]
  );

  return createRipple;
}
